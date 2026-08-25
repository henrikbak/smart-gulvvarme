'use strict';

import type {
  Building,
  BuildingState,
  HvacAction,
  PresetMode,
  Room,
  RoomState,
} from './types';

/** A sensor quiet for longer than this is treated as offline. */
export const SENSOR_STALE_MS = 2 * 60 * 60 * 1000;

/** Fallback name for a building whose `name` is unusable. */
export const BUILDING_FALLBACK_NAME = 'Smart Gulvvarme';

const PRESET_MODES: readonly PresetMode[] = ['none', 'low', 'medium', 'high'];

function isPresetMode(value: unknown): value is PresetMode {
  return typeof value === 'string' && (PRESET_MODES as readonly string[]).includes(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Pick a name to show for a building.
 *
 * In practice the API returns the account's email address here, which must
 * never surface in the Homey UI. Anything email-shaped, blank, or absent falls
 * back to the app name.
 */
export function buildingDisplayName(building: Pick<Building, 'name'>): string {
  const name = building.name?.trim();
  if (!name) return BUILDING_FALLBACK_NAME;
  if (name.includes('@')) return BUILDING_FALLBACK_NAME;
  return name;
}

/**
 * Is the room calling for heat right now?
 *
 * `hvac_action` is the documented source, but production has been observed
 * reporting `heating` for every room even when the temperature sits well above
 * the setpoint, with `power` down at 0.05. So a room only counts as heating
 * when `hvac_action` says so *and* some power is actually being applied -
 * otherwise the capability would be stuck on `true` and useless as a trigger.
 */
export function deriveIsHeating(room: Pick<Room, 'hvac_action' | 'hvac_mode' | 'power'>): boolean {
  if (room.hvac_mode === 'off') return false;
  const action = room.hvac_action as HvacAction | undefined;
  if (action === 'off' || action === 'idle') return false;
  const power = numberOrNull(room.power);
  if (power === null) return action === 'heating';
  return power > 0;
}

/** Is the room's sensor quiet for long enough to call it offline? */
export function isSensorStale(room: Pick<Room, 'sensor'>, now: number = Date.now()): boolean {
  const timestamp = room.sensor?.timestamp;
  if (!timestamp) return false;
  const reportedAt = Date.parse(timestamp);
  if (Number.isNaN(reportedAt)) return false;
  return now - reportedAt > SENSOR_STALE_MS;
}

/** Wire `Room` to the shape the device layer consumes. */
export function toRoomState(buildingId: string, room: Room, now: number = Date.now()): RoomState {
  const sensor = room.sensor ?? null;
  const power = numberOrNull(room.power);
  const presetModes = Array.isArray(room.preset_modes)
    ? room.preset_modes.filter(isPresetMode)
    : [];

  return {
    id: room.id,
    buildingId,
    name: room.name ?? null,
    measureTemperature: numberOrNull(room.current_temperature),
    measureHumidity: numberOrNull(room.current_humidity),
    targetTemperature: numberOrNull(room.target_temperature),
    minTemp: numberOrNull(room.min_temp) ?? 7,
    maxTemp: numberOrNull(room.max_temp) ?? 35,
    onoff: room.hvac_mode !== 'off',
    isHeating: deriveIsHeating(room),
    // `power` is a duty cycle from 0 to 1 - the share of the time the valve is
    // held open - not watts. It is shown as a percentage, never as measure_power.
    heatingPower: power === null ? null : Math.round(power * 100),
    presetMode: isPresetMode(room.preset_mode) ? room.preset_mode : null,
    presetModes: presetModes.length > 0 ? presetModes : [...PRESET_MODES],
    manualPowerEnabled: room.manual_power?.enabled === true,
    batteryPercent: numberOrNull(sensor?.batt),
    signalStrength: numberOrNull(sensor?.rssi),
    sensorId: sensor?.id ?? room.sensor_id ?? null,
    sensorStale: isSensorStale(room, now),
    sensorMissing: sensor === null && !room.sensor_id,
  };
}

/** Wire `Building` to the shape the device layer consumes. */
export function toBuildingState(building: Building): BuildingState {
  const weather = building.weather ?? null;
  const wind = weather?.wind ?? null;

  return {
    id: building.id,
    name: buildingDisplayName(building),
    // Kept as a tri-state on purpose: `null` (never reported) and `false`
    // (stopped reporting) call for different handling in the device layer.
    available: typeof building.available === 'boolean' ? building.available : null,
    lastSeen: building.last_seen ?? null,
    outdoorTemperature: numberOrNull(weather?.temperature),
    windStrength: numberOrNull(wind?.speed),
    windAngle: numberOrNull(wind?.direction),
    cloudCoverage: numberOrNull(weather?.cloud_coverage),
  };
}
