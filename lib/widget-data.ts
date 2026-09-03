'use strict';

import type { PresetMode } from './types';

/**
 * What the widgets read out of the paired devices.
 *
 * Widgets deliberately do not go to the API themselves. The devices already
 * hold the newest values the poller produced, so reading them costs nothing and
 * cannot disagree with what the rest of Homey shows.
 */

/** The part of a Homey device this module touches. */
export interface DeviceLike {
  getName(): string;
  getData(): unknown;
  getAvailable(): boolean;
  hasCapability(capabilityId: string): boolean;
  getCapabilityValue(capabilityId: string): unknown;
  getCapabilityOptions(capabilityId: string): unknown;
  getSetting(key: string): unknown;
}

export interface RoomIds {
  buildingId: string;
  roomId: string;
}

export interface RoomView extends RoomIds {
  name: string;
  available: boolean;
  measureTemperature: number | null;
  targetTemperature: number | null;
  measureHumidity: number | null;
  /** The range the room itself allows, which can be narrower than the driver's. */
  minTemperature: number;
  maxTemperature: number;
  temperatureStep: number;
  onoff: boolean;
  isHeating: boolean;
  heatingPower: number;
  presetMode: PresetMode | null;
  batteryPercent: number | null;
  signalStrength: number | null;
  /** The room's own sensor has stopped reporting. */
  sensorOffline: boolean;
}

export interface BuildingView {
  buildingId: string;
  name: string;
  online: boolean;
  outdoorTemperature: number | null;
  windStrength: number | null;
  windAngle: number | null;
  cloudCoverage: number | null;
  /** Newest gateway heartbeat, as the API reported it. Most useful when down. */
  lastSeen: string | null;
}

const PRESETS: readonly PresetMode[] = ['none', 'low', 'medium', 'high'];

/** Matches `drivers/room/driver.compose.json`, for a device that has no options set. */
const DEFAULT_RANGE = { min: 7, max: 35, step: 0.5 };

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function capability(device: DeviceLike, id: string): unknown {
  return device.hasCapability(id) ? device.getCapabilityValue(id) : null;
}

function num(device: DeviceLike, id: string): number | null {
  return numberOrNull(capability(device, id));
}

/** The `{ buildingId, roomId }` a room device was paired with, if it looks right. */
export function roomIdsOf(device: DeviceLike): RoomIds | null {
  const data = device.getData();
  if (typeof data !== 'object' || data === null) return null;
  const { buildingId, roomId } = data as Partial<RoomIds>;
  if (typeof buildingId !== 'string' || typeof roomId !== 'string') return null;
  return { buildingId, roomId };
}

function buildingIdOf(device: DeviceLike): string | null {
  const data = device.getData();
  if (typeof data !== 'object' || data === null) return null;
  const { buildingId } = data as { buildingId?: unknown };
  return typeof buildingId === 'string' ? buildingId : null;
}

/** The setpoint range, as the device currently advertises it. */
function temperatureRange(device: DeviceLike): { min: number; max: number; step: number } {
  const options = device.hasCapability('target_temperature')
    ? device.getCapabilityOptions('target_temperature')
    : null;

  if (typeof options !== 'object' || options === null) return DEFAULT_RANGE;

  const { min, max, step } = options as { min?: unknown; max?: unknown; step?: unknown };
  return {
    min: numberOrNull(min) ?? DEFAULT_RANGE.min,
    max: numberOrNull(max) ?? DEFAULT_RANGE.max,
    step: numberOrNull(step) ?? DEFAULT_RANGE.step,
  };
}

export function toRoomView(device: DeviceLike): RoomView | null {
  const ids = roomIdsOf(device);
  if (ids === null) return null;

  const preset = capability(device, 'preset_mode');
  const range = temperatureRange(device);

  return {
    ...ids,
    name: device.getName(),
    available: device.getAvailable(),
    measureTemperature: num(device, 'measure_temperature'),
    targetTemperature: num(device, 'target_temperature'),
    measureHumidity: num(device, 'measure_humidity'),
    minTemperature: range.min,
    maxTemperature: range.max,
    temperatureStep: range.step,
    onoff: capability(device, 'onoff') === true,
    isHeating: capability(device, 'is_heating') === true,
    // A room with no reading yet is drawing no heat, which is what 0 says.
    heatingPower: num(device, 'heating_power') ?? 0,
    presetMode: PRESETS.includes(preset as PresetMode) ? (preset as PresetMode) : null,
    batteryPercent: num(device, 'measure_battery'),
    signalStrength: num(device, 'measure_signal_strength'),
    sensorOffline: capability(device, 'alarm_connectivity') === true,
  };
}

/** The building device parks the newest heartbeat in a settings label. */
function lastSeenOf(device: DeviceLike): string | null {
  const value = device.getSetting('last_seen');
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  // The device writes '-' when nothing has ever reported.
  return trimmed === '' || trimmed === '-' ? null : trimmed;
}

export function toBuildingView(device: DeviceLike): BuildingView | null {
  const buildingId = buildingIdOf(device);
  if (buildingId === null) return null;

  return {
    buildingId,
    name: device.getName(),
    // The building device raises this alarm when the gateway stops reporting.
    online: capability(device, 'alarm_connectivity') !== true,
    outdoorTemperature: num(device, 'measure_temperature'),
    windStrength: num(device, 'measure_wind_strength'),
    windAngle: num(device, 'measure_wind_angle'),
    cloudCoverage: num(device, 'cloud_coverage'),
    lastSeen: lastSeenOf(device),
  };
}

/** Room views for every paired room, hardest-working room first. */
export function roomViews(devices: readonly DeviceLike[]): RoomView[] {
  const views: RoomView[] = [];
  for (const device of devices) {
    const view = toRoomView(device);
    if (view !== null) views.push(view);
  }
  return views;
}

export function buildingViews(devices: readonly DeviceLike[]): BuildingView[] {
  const views: BuildingView[] = [];
  for (const device of devices) {
    const view = toBuildingView(device);
    if (view !== null) views.push(view);
  }
  return views;
}

export type RoomSort = 'name' | 'power';

/**
 * Order rooms for display.
 *
 * `power` puts the rooms actually calling for heat at the top, which is the
 * question the heat strip exists to answer; ties fall back to the name so the
 * list never reshuffles between two equal rooms.
 */
export function sortRooms(views: RoomView[], sort: RoomSort): RoomView[] {
  const byName = (a: RoomView, b: RoomView): number => a.name.localeCompare(b.name);
  if (sort === 'name') return [...views].sort(byName);
  return [...views].sort((a, b) => (b.heatingPower - a.heatingPower) || byName(a, b));
}

/** Find the paired device for a room, or null when it is no longer paired. */
export function findRoomDevice<T extends DeviceLike>(
  devices: readonly T[],
  ids: RoomIds,
): T | null {
  for (const device of devices) {
    const candidate = roomIdsOf(device);
    if (candidate?.buildingId === ids.buildingId && candidate.roomId === ids.roomId) {
      return device;
    }
  }
  return null;
}
