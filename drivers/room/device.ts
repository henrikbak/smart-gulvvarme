'use strict';

import Homey from 'homey';

import type { SmartGulvvarmeAppLike } from '../../lib/app-interface';
import {
  NotFoundError,
  ValidationError,
  WriteDeniedError,
} from '../../lib/errors';
import type { OutageReason } from '../../lib/poller';
import type {
  BuildingState, PresetMode, RoomState, RoomUpdate,
} from '../../lib/types';
import { toRoomState } from '../../lib/mapper';

/** How long to collect slider movement before writing. */
const WRITE_DEBOUNCE_MS = 500;

/**
 * How long a local write shadows incoming poll data.
 *
 * The heating engine recalculates after a change, so a poll that started before
 * the write still carries the old setpoint. Without this the slider visibly
 * snaps back before settling.
 */
const OPTIMISTIC_WINDOW_MS = 10_000;

interface RoomDeviceData {
  buildingId: string;
  roomId: string;
}

module.exports = class RoomDevice extends Homey.Device {

  private buildingId!: string;

  private roomId!: string;

  private pendingPatch: RoomUpdate = {};

  private writeTimer: NodeJS.Timeout | null = null;

  private lastWriteAt = 0;

  private boostTimer: NodeJS.Timeout | null = null;

  private targetBeforeBoost: number | null = null;

  private onRoom!: (state: RoomState) => void;

  private onBuilding!: (state: BuildingState) => void;

  private onRoomGone!: (ids: RoomDeviceData) => void;

  private onOutage!: (reason: OutageReason, message: string) => void;

  private onRecovered!: () => void;

  /** Previous values, used to fire triggers only on an actual change. */
  private previous: { isHeating: boolean | null; preset: string | null; target: number | null } = {
    isHeating: null,
    preset: null,
    target: null,
  };

  private get app(): SmartGulvvarmeAppLike {
    return this.homey.app as unknown as SmartGulvvarmeAppLike;
  }

  async onInit(): Promise<void> {
    const data = this.getData() as RoomDeviceData;
    this.buildingId = data.buildingId;
    this.roomId = data.roomId;

    this.registerCapabilityListener('target_temperature', (value: number) => this.queueWrite({ target_temperature: value }));

    this.registerCapabilityListener('onoff', (value: boolean) => this.queueWrite({ hvac_mode: value ? 'heat' : 'off' }));

    this.registerCapabilityListener('preset_mode', (value: PresetMode) => this.queueWrite({ preset_mode: value }));

    this.subscribe();
    this.setUnavailable(this.homey.__('device.waiting')).catch(this.error);
    this.app.getPoller().refresh().catch(this.error);
  }

  async onUninit(): Promise<void> {
    this.unsubscribe();
    this.clearTimers();
  }

  async onDeleted(): Promise<void> {
    this.unsubscribe();
    this.clearTimers();
  }

  // -- Flow card entry points ------------------------------------------------

  /** Raise the setpoint for a while, then put back what was there before. */
  async boost(temperature: number, minutes: number): Promise<void> {
    if (this.targetBeforeBoost === null) {
      const current = this.getCapabilityValue('target_temperature');
      this.targetBeforeBoost = typeof current === 'number' ? current : null;
    }
    if (this.boostTimer !== null) this.homey.clearTimeout(this.boostTimer);

    await this.write({ target_temperature: temperature });

    this.boostTimer = this.homey.setTimeout(() => {
      this.boostTimer = null;
      const restore = this.targetBeforeBoost;
      this.targetBeforeBoost = null;
      if (restore === null) return;
      this.write({ target_temperature: restore }).catch(this.error);
    }, minutes * 60 * 1000);
  }

  async setManualPower(percent: number): Promise<void> {
    await this.write({ manual_power: { enabled: true, power: percent / 100 } });
  }

  async clearManualPower(): Promise<void> {
    await this.write({ manual_power: { enabled: false } });
  }

  async setPresetMode(preset: PresetMode): Promise<void> {
    await this.write({ preset_mode: preset });
  }

  async setTargetTemperature(temperature: number): Promise<void> {
    await this.write({ target_temperature: temperature });
  }

  async setPower(on: boolean): Promise<void> {
    await this.write({ hvac_mode: on ? 'heat' : 'off' });
  }

  isHeatingNow(): boolean {
    return this.getCapabilityValue('is_heating') === true;
  }

  heatingPowerNow(): number {
    const value = this.getCapabilityValue('heating_power');
    return typeof value === 'number' ? value : 0;
  }

  presetModeNow(): string | null {
    const value = this.getCapabilityValue('preset_mode');
    return typeof value === 'string' ? value : null;
  }

  // -- Writing ---------------------------------------------------------------

  /**
   * Collect rapid changes into one request.
   *
   * Dragging the temperature slider emits a value per step; without this each
   * one would become its own PATCH.
   */
  private queueWrite(patch: RoomUpdate): Promise<void> {
    this.pendingPatch = { ...this.pendingPatch, ...patch };

    if (this.writeTimer !== null) this.homey.clearTimeout(this.writeTimer);

    return new Promise<void>((resolve, reject) => {
      this.writeTimer = this.homey.setTimeout(() => {
        this.writeTimer = null;
        const patchToSend = this.pendingPatch;
        this.pendingPatch = {};
        this.write(patchToSend).then(resolve, reject);
      }, WRITE_DEBOUNCE_MS);
    });
  }

  private async write(patch: RoomUpdate): Promise<void> {
    const api = this.app.getApi();
    if (api === null) throw new Error(this.homey.__('device.noKey'));

    try {
      const updated = await api.updateRoom(this.buildingId, this.roomId, patch);
      this.lastWriteAt = Date.now();
      // The response is the updated room, so there is no reason to wait a whole
      // poll interval to show the result.
      this.applyState(toRoomState(this.buildingId, updated), { fromWrite: true });
      await this.unsetWarning().catch(() => {});
    } catch (err) {
      throw await this.explainWriteError(err);
    }
  }

  private async explainWriteError(err: unknown): Promise<Error> {
    if (err instanceof WriteDeniedError) {
      // Distinct from an invalid key: reads still work, so the devices stay up.
      await this.setWarning(this.homey.__('device.noWriteAccess')).catch(() => {});
      return new Error(this.homey.__('device.noWriteAccess'));
    }
    if (err instanceof ValidationError) {
      // The server's own message is already user-readable ("target_temperature
      // must be between 7 and 35."), so it beats anything generic.
      return new Error(err.message);
    }
    if (err instanceof NotFoundError) {
      return new Error(this.homey.__('device.gone'));
    }
    return err instanceof Error ? err : new Error(String(err));
  }

  // -- Polling ---------------------------------------------------------------

  private subscribe(): void {
    const poller = this.app.getPoller();

    this.onRoom = (state) => {
      if (state.buildingId !== this.buildingId || state.id !== this.roomId) return;
      this.applyState(state, { fromWrite: false });
    };

    this.onBuilding = (state) => {
      if (state.id !== this.buildingId) return;
      this.applyBuildingAvailability(state);
    };

    this.onRoomGone = ({ buildingId, roomId }) => {
      if (buildingId !== this.buildingId || roomId !== this.roomId) return;
      // A 404 also covers "outside this key's scope", so the device is only
      // parked, never removed.
      this.setUnavailable(this.homey.__('device.gone')).catch(this.error);
    };

    this.onOutage = (reason) => {
      const message = reason === 'auth'
        ? this.homey.__('device.authProblem')
        : this.homey.__('device.unreachable');
      this.setUnavailable(message).catch(this.error);
    };

    this.onRecovered = () => {
      this.setAvailable().catch(this.error);
    };

    poller.on('room', this.onRoom);
    poller.on('building', this.onBuilding);
    poller.on('roomGone', this.onRoomGone);
    poller.on('outage', this.onOutage);
    poller.on('recovered', this.onRecovered);
    poller.subscribe(`room:${this.roomId}`);
  }

  private unsubscribe(): void {
    const poller = this.app.getPoller();
    poller.off('room', this.onRoom);
    poller.off('building', this.onBuilding);
    poller.off('roomGone', this.onRoomGone);
    poller.off('outage', this.onOutage);
    poller.off('recovered', this.onRecovered);
    poller.unsubscribe(`room:${this.roomId}`);
  }

  private clearTimers(): void {
    if (this.writeTimer !== null) this.homey.clearTimeout(this.writeTimer);
    if (this.boostTimer !== null) this.homey.clearTimeout(this.boostTimer);
    this.writeTimer = null;
    this.boostTimer = null;
  }

  private applyBuildingAvailability(state: BuildingState): void {
    if (state.available === false) {
      const since = state.lastSeen ?? '';
      this.setUnavailable(this.homey.__('device.gatewayOffline', { since })).catch(this.error);
      return;
    }

    if (state.available === null) {
      // Never reported is not the same as stopped reporting: the room may still
      // be controllable, so warn rather than disable it.
      this.setWarning(this.homey.__('device.gatewayNeverSeen')).catch(() => {});
      return;
    }

    this.setAvailable().catch(this.error);
  }

  private applyState(state: RoomState, { fromWrite }: { fromWrite: boolean }): void {
    // A poll that overlapped a write still carries pre-write values. Ignore it
    // briefly so the UI does not bounce.
    if (!fromWrite && Date.now() - this.lastWriteAt < OPTIMISTIC_WINDOW_MS) return;

    this.setAvailable().catch(this.error);
    this.fireTriggers(state, fromWrite);

    this.applyRange(state);

    this.set('measure_temperature', state.measureTemperature);
    this.set('measure_humidity', state.measureHumidity);
    this.set('target_temperature', state.targetTemperature);
    this.set('onoff', state.onoff);
    this.set('is_heating', state.isHeating);
    this.set('heating_power', state.heatingPower);
    this.set('preset_mode', state.presetMode);
    this.set('measure_battery', state.batteryPercent);
    this.set('alarm_battery', state.batteryPercent === null ? null : state.batteryPercent < 15);
    this.set('measure_signal_strength', state.signalStrength);
    this.set('alarm_connectivity', state.sensorStale);

    if (state.sensorMissing) {
      this.setWarning(this.homey.__('device.noSensor')).catch(() => {});
    } else {
      this.unsetWarning().catch(() => {});
    }

    if (state.sensorId !== null && this.getSetting('sensor_id') !== state.sensorId) {
      this.setSettings({ sensor_id: state.sensorId }).catch(this.error);
    }
  }

  /**
   * Fire the app's own triggers on real transitions.
   *
   * The first poll after start-up only seeds the baseline: without that guard
   * every Flow would run once each time the app restarts.
   */
  private fireTriggers(state: RoomState, fromWrite: boolean): void {
    const { flow } = this.homey;
    const first = this.previous.isHeating === null;

    if (!first && state.isHeating !== this.previous.isHeating) {
      const card = state.isHeating ? 'heating_started' : 'heating_stopped';
      flow.getDeviceTriggerCard(card).trigger(this, {}, {}).catch(this.error);
    }

    if (!first && state.presetMode !== this.previous.preset && state.presetMode !== null) {
      flow.getDeviceTriggerCard('preset_changed')
        .trigger(this, { preset: state.presetMode }, {})
        .catch(this.error);
    }

    // Only a change we did not make counts as external - that is the whole
    // point of the card, which exists to surface manual overrides.
    if (!first && !fromWrite
      && state.targetTemperature !== null
      && state.targetTemperature !== this.previous.target) {
      flow.getDeviceTriggerCard('target_changed_externally')
        .trigger(this, { temperature: state.targetTemperature }, {})
        .catch(this.error);
    }

    this.previous = {
      isHeating: state.isHeating,
      preset: state.presetMode,
      target: state.targetTemperature,
    };
  }

  /** Keep the slider bounds in step with what the room reports. */
  private applyRange(state: RoomState): void {
    const options = this.getCapabilityOptions('target_temperature') as
      | { min?: number; max?: number }
      | undefined;

    if (options?.min === state.minTemp && options?.max === state.maxTemp) return;

    this.setCapabilityOptions('target_temperature', {
      ...options,
      min: state.minTemp,
      max: state.maxTemp,
    }).catch(this.error);
  }

  /**
   * Write a capability value, swallowing failures.
   *
   * Returns void rather than a promise: one capability failing to write is
   * logged, never propagated, so a single bad value cannot abort the rest of
   * the update.
   */
  private set(capability: string, value: unknown): void {
    if (!this.hasCapability(capability)) return;
    if (this.getCapabilityValue(capability) === value) return;
    this.setCapabilityValue(capability, value).catch((err) => {
      this.error(`Failed to set ${capability}:`, err);
    });
  }

};
