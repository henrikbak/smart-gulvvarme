'use strict';

import type { components } from './api-schema';

/** Wire types, straight from `docs/openapi.json` via `npm run gen:types`. */
export type Building = components['schemas']['Building'];
export type Room = components['schemas']['Room'];
export type Sensor = components['schemas']['Sensor'];
export type RoomUpdate = components['schemas']['RoomUpdate'];
export type ManualPower = components['schemas']['ManualPower'];

export type HvacMode = 'heat' | 'off';
export type HvacAction = 'heating' | 'idle' | 'off';
export type PresetMode = 'none' | 'low' | 'medium' | 'high';

/**
 * The fields of `RoomUpdate`, listed at runtime.
 *
 * `RoomUpdate` is `additionalProperties: false`, so the API rejects an unknown
 * field with 400 rather than ignoring it. Checking locally against this list
 * turns a programming mistake into a clear error before it reaches the network.
 */
export const WRITABLE_ROOM_FIELDS: ReadonlyArray<keyof RoomUpdate> = [
  'name',
  'target_temperature',
  'preset_mode',
  'hvac_mode',
  'manual_power',
  'sensor_id',
];

/** What the poller hands to a room device on each tick. */
export interface RoomState {
  id: string;
  buildingId: string;
  name: string | null;
  measureTemperature: number | null;
  measureHumidity: number | null;
  targetTemperature: number | null;
  minTemp: number;
  maxTemp: number;
  onoff: boolean;
  isHeating: boolean;
  heatingPower: number | null;
  presetMode: PresetMode | null;
  presetModes: PresetMode[];
  manualPowerEnabled: boolean;
  batteryPercent: number | null;
  signalStrength: number | null;
  sensorId: string | null;
  /** True when a sensor is assigned but has not reported recently. */
  sensorStale: boolean;
  /** True when no sensor is assigned at all - a different problem from stale. */
  sensorMissing: boolean;
}

/** What the poller hands to a building device on each tick. */
export interface BuildingState {
  id: string;
  /** Display name, already de-emailed. See `mapper.buildingDisplayName`. */
  name: string;
  /**
   * `null` means no gateway has ever reported, which is not the same as
   * offline. The two lead to different UI: unavailable vs. a warning.
   */
  available: boolean | null;
  lastSeen: string | null;
  outdoorTemperature: number | null;
  windStrength: number | null;
  windAngle: number | null;
  cloudCoverage: number | null;
}
