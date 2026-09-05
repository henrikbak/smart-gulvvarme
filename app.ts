'use strict';

import Homey from 'homey';

import { SmartGulvvarmeApi, redact } from './lib/api';
import { InvalidKeyError, MissingKeyError } from './lib/errors';
import { buildingDisplayName } from './lib/mapper';
import { DEFAULT_INTERVAL_S, MIN_INTERVAL_S, Poller } from './lib/poller';
import type { PresetMode } from './lib/types';
import { WIDGET_STATE_EVENT, type WidgetState } from './lib/widget-api';
import {
  type BuildingView,
  type DeviceLike,
  type RoomIds,
  type RoomView,
  buildingViews,
  findRoomDevice,
  roomViews,
} from './lib/widget-data';

/** The parts of the room device the Flow cards reach into. */
interface RoomDeviceLike {
  isHeatingNow(): boolean;
  heatingPowerNow(): number;
  presetModeNow(): string | null;
  setTargetTemperature(temperature: number): Promise<void>;
  setPresetMode(preset: PresetMode): Promise<void>;
  boost(temperature: number, minutes: number): Promise<void>;
  setManualPower(percent: number): Promise<void>;
  clearManualPower(): Promise<void>;
}

interface BuildingDeviceLike {
  isOnline(): boolean;
}

export const SETTING_API_KEY = 'apiKey';
export const SETTING_POLL_INTERVAL = 'pollIntervalSeconds';

module.exports = class SmartGulvvarmeApp extends Homey.App {

  private api: SmartGulvvarmeApi | null = null;

  private poller!: Poller;

  async onInit(): Promise<void> {
    this.buildApi();

    this.poller = new Poller({
      api: () => this.api,
      logger: {
        log: (...args: unknown[]) => this.log(...args.map(this.scrub)),
        error: (...args: unknown[]) => this.error(...args.map(this.scrub)),
      },
      intervalSeconds: this.getPollInterval(),
    });

    // A new key should take effect immediately, without the user restarting the
    // app or re-pairing anything.
    this.homey.settings.on('set', (key: string) => {
      if (key === SETTING_API_KEY) {
        this.log('API key changed, reconnecting');
        this.buildApi();
        this.poller.start();
        this.poller.refresh().catch((err) => this.error(err));
      }
      if (key === SETTING_POLL_INTERVAL) {
        this.poller.setIntervalSeconds(this.getPollInterval());
      }
    });

    this.registerFlowCards();
    this.registerWidgets();

    this.log('Smart Gulvvarme has been initialized');
  }

  /**
   * Flow cards that act on a device delegate straight to it, so the rules about
   * debouncing, optimistic updates and error messages live in one place.
   */
  private registerFlowCards(): void {
    const { flow } = this.homey;

    flow.getConditionCard('is_heating').registerRunListener(
      async ({ device }: { device: RoomDeviceLike }) => device.isHeatingNow(),
    );

    flow.getConditionCard('preset_is').registerRunListener(
      async ({ device, preset }: { device: RoomDeviceLike; preset: string }) => device.presetModeNow() === preset,
    );

    flow.getConditionCard('heating_power_above').registerRunListener(
      async ({ device, percent }: { device: RoomDeviceLike; percent: number }) => device.heatingPowerNow() > percent,
    );

    flow.getConditionCard('building_online').registerRunListener(
      async ({ device }: { device: BuildingDeviceLike }) => device.isOnline(),
    );

    flow.getActionCard('set_target_temperature').registerRunListener(
      async ({ device, temperature }: { device: RoomDeviceLike; temperature: number }) => device.setTargetTemperature(temperature),
    );

    flow.getActionCard('set_preset').registerRunListener(
      async ({ device, preset }: { device: RoomDeviceLike; preset: PresetMode }) => device.setPresetMode(preset),
    );

    flow.getActionCard('boost').registerRunListener(
      async ({ device, temperature, minutes }: {
        device: RoomDeviceLike; temperature: number; minutes: number;
      }) => device.boost(temperature, minutes),
    );

    flow.getActionCard('set_manual_power').registerRunListener(
      async ({ device, percent }: { device: RoomDeviceLike; percent: number }) => device.setManualPower(percent),
    );

    flow.getActionCard('clear_manual_power').registerRunListener(
      async ({ device }: { device: RoomDeviceLike }) => device.clearManualPower(),
    );

    flow.getActionCard('refresh').registerRunListener(async () => {
      await this.poller.refresh();
    });
  }

  // -- Widgets ---------------------------------------------------------------

  /**
   * Wire the dashboard widgets up to the poller.
   *
   * Widgets never call the Smart Gulvvarme API. The devices already carry the
   * newest values, so one realtime event per poll keeps every open widget in
   * step at no extra cost against the upstream rate limit.
   */
  private registerWidgets(): void {
    this.poller.on('tick', () => {
      this.homey.api.realtime(WIDGET_STATE_EVENT, this.getWidgetState());
    });

    // A room the widget can name is a room that is still paired, so the stored
    // selection is checked against the devices rather than against the API.
    for (const widgetId of ['room-tile', 'boost']) {
      this.homey.dashboards
        .getWidget(widgetId)
        .registerSettingAutocompleteListener('room', async (query: string) => this.roomChoices(query));
    }

    this.homey.dashboards
      .getWidget('building-strip')
      .registerSettingAutocompleteListener('building', async (query: string) => this.buildingChoices(query));
  }

  private roomChoices(query: string): Array<RoomIds & { name: string; description: string }> {
    const buildings = this.getBuildingViews();
    const nameOf = (buildingId: string): string => buildings.find(
      (building) => building.buildingId === buildingId,
    )?.name ?? '';

    return this.getRoomViews()
      .filter((room) => room.name.toLowerCase().includes(query.toLowerCase()))
      .map((room) => ({
        name: room.name,
        description: nameOf(room.buildingId),
        buildingId: room.buildingId,
        roomId: room.roomId,
      }));
  }

  private buildingChoices(query: string): Array<{ name: string; buildingId: string }> {
    return this.getBuildingViews()
      .filter((building) => building.name.toLowerCase().includes(query.toLowerCase()))
      .map((building) => ({ name: building.name, buildingId: building.buildingId }));
  }

  /** Everything the widgets render, read straight off the paired devices. */
  getWidgetState(): WidgetState {
    return {
      hasKey: this.hasApiKey(),
      rooms: this.getRoomViews(),
      buildings: this.getBuildingViews(),
    };
  }

  getRoomViews(): RoomView[] {
    return roomViews(this.roomDevices());
  }

  getBuildingViews(): BuildingView[] {
    return buildingViews(this.buildingDevices());
  }

  /**
   * The device behind a room, for a widget that writes.
   *
   * Widgets go through the device for the same reason the Flow cards do: the
   * debounce and the optimistic window that stop the setpoint bouncing live
   * there, and a second write path would lose both.
   */
  getRoomDevice(ids: RoomIds): RoomDeviceLike | null {
    const device = findRoomDevice(this.roomDevices(), ids);
    return device === null ? null : (device as unknown as RoomDeviceLike);
  }

  private roomDevices(): DeviceLike[] {
    return this.homey.drivers.getDriver('room').getDevices();
  }

  private buildingDevices(): DeviceLike[] {
    return this.homey.drivers.getDriver('building').getDevices();
  }

  /** The shared poller. Devices subscribe in onInit and unsubscribe in onUninit. */
  getPoller(): Poller {
    return this.poller;
  }

  /** The shared client, or null when no key is configured. */
  getApi(): SmartGulvvarmeApi | null {
    return this.api;
  }

  getApiKey(): string {
    const key = this.homey.settings.get(SETTING_API_KEY);
    return typeof key === 'string' ? key.trim() : '';
  }

  /**
   * Store a key. Callers must have validated it first - pairing, repair and the
   * settings page all do so through `SmartGulvvarmeApi.validateKey()`.
   */
  setApiKey(apiKey: string): void {
    this.homey.settings.set(SETTING_API_KEY, apiKey.trim());
  }

  hasApiKey(): boolean {
    return this.getApiKey().length > 0;
  }

  /** Build a client against an arbitrary key, for validating one before saving. */
  createApiFor(apiKey: string): SmartGulvvarmeApi {
    return new SmartGulvvarmeApi({
      apiKey,
      logger: { log: () => {}, error: () => {} },
    });
  }

  private getPollInterval(): number {
    const raw = this.homey.settings.get(SETTING_POLL_INTERVAL);
    const seconds = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_INTERVAL_S;
    return Math.max(seconds, MIN_INTERVAL_S);
  }

  private buildApi(): void {
    const apiKey = this.getApiKey();
    this.api = apiKey.length === 0 ? null : this.createApiFor(apiKey);
  }

  /**
   * Backs the "Test connection" button on the settings page.
   *
   * Reports what the stored key can actually reach, so a user can tell an
   * accepted-but-empty key from a rejected one.
   */
  async testConnection(): Promise<{
    ok: boolean;
    error?: string;
    buildings?: Array<{ id: string; name: string; available: boolean | null }>;
  }> {
    const { api } = this;
    if (api === null) return { ok: false, error: 'no_key' };

    try {
      const buildings = await api.validateKey();
      return {
        ok: true,
        buildings: buildings.map((building) => ({
          id: building.id,
          // Never echo the raw name back: it is the account's email address.
          name: buildingDisplayName(building),
          available: typeof building.available === 'boolean' ? building.available : null,
        })),
      };
    } catch (err) {
      if (err instanceof InvalidKeyError) return { ok: false, error: 'invalid_key' };
      if (err instanceof MissingKeyError) return { ok: false, error: 'no_key' };
      return { ok: false, error: 'unreachable' };
    }
  }

  /** Last line of defence against a key reaching the Homey log. */
  private scrub = (value: unknown): unknown => (typeof value === 'string' ? redact(value) : value);

};
