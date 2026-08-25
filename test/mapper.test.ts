'use strict';

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  BUILDING_FALLBACK_NAME,
  buildingDisplayName,
  deriveIsHeating,
  isSensorStale,
  toBuildingState,
  toRoomState,
} from '../lib/mapper';
import type { Building, Room } from '../lib/types';

const FIXTURES = join(process.cwd(), 'test', 'fixtures');
const load = (name: string): unknown => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));

const buildings = load('buildings.json') as Building[];
const rooms = load('rooms.json') as Room[];
const building = buildings[0]!;
const bathroom = rooms[0]!;

test('the building name never leaks an email address', () => {
  // Production returns the account's email in this field.
  assert.equal(building.name, 'user@example.com');
  assert.equal(buildingDisplayName(building), BUILDING_FALLBACK_NAME);
});

test('a real building name is kept', () => {
  assert.equal(buildingDisplayName({ name: 'Sommerhus' }), 'Sommerhus');
});

test('a blank or absent building name falls back', () => {
  assert.equal(buildingDisplayName({ name: '   ' }), BUILDING_FALLBACK_NAME);
  assert.equal(buildingDisplayName({ name: null }), BUILDING_FALLBACK_NAME);
  assert.equal(buildingDisplayName({}), BUILDING_FALLBACK_NAME);
});

test('available:null is preserved, never coerced to false', () => {
  // null means no gateway has ever reported; false means one stopped. The
  // device layer treats them differently, so the distinction has to survive.
  const never = toBuildingState({ ...building, available: null });
  assert.equal(never.available, null);

  const stopped = toBuildingState({ ...building, available: false });
  assert.equal(stopped.available, false);

  assert.equal(toBuildingState(building).available, true);
});

test('missing weather does not throw', () => {
  const state = toBuildingState({ id: 'b1' });
  assert.equal(state.outdoorTemperature, null);
  assert.equal(state.windStrength, null);
  assert.equal(state.windAngle, null);
  assert.equal(state.cloudCoverage, null);
});

test('weather is mapped from the real payload', () => {
  const state = toBuildingState(building);
  assert.equal(state.outdoorTemperature, 17.6);
  assert.equal(state.windStrength, 10.2);
  assert.equal(state.windAngle, 135);
  assert.equal(state.cloudCoverage, 11);
});

test('power is a duty cycle rendered as a percentage', () => {
  // 0.15 of the time the valve is open -> 15 %. Never watts.
  assert.equal(bathroom.power, 0.15);
  assert.equal(toRoomState(building.id, bathroom).heatingPower, 15);
});

test('the real rooms map to sane state', () => {
  const state = toRoomState(building.id, bathroom);
  assert.equal(state.name, 'Badeværelse');
  assert.equal(state.measureTemperature, 23.3);
  assert.equal(state.measureHumidity, 50.2);
  assert.equal(state.targetTemperature, 21);
  assert.equal(state.minTemp, 7);
  assert.equal(state.maxTemp, 35);
  assert.equal(state.onoff, true);
  assert.equal(state.presetMode, 'high');
  assert.equal(state.batteryPercent, 100);
  assert.equal(state.signalStrength, -89);
  assert.equal(state.manualPowerEnabled, false);
});

test('hvac_mode "off" maps to onoff false', () => {
  const state = toRoomState(building.id, { ...bathroom, hvac_mode: 'off' });
  assert.equal(state.onoff, false);
  assert.equal(state.isHeating, false);
});

test('isHeating requires actual power, not just hvac_action', () => {
  // Production reported hvac_action "heating" on every room while sitting 2-7 C
  // above setpoint. Trusting the field alone would pin the capability to true.
  assert.equal(deriveIsHeating({ hvac_mode: 'heat', hvac_action: 'heating', power: 0.15 }), true);
  assert.equal(deriveIsHeating({ hvac_mode: 'heat', hvac_action: 'heating', power: 0 }), false);
  assert.equal(deriveIsHeating({ hvac_mode: 'heat', hvac_action: 'idle', power: 0.1 }), false);
  assert.equal(deriveIsHeating({ hvac_mode: 'off', hvac_action: 'off', power: 0 }), false);
});

test('isHeating falls back to hvac_action when power is absent', () => {
  assert.equal(deriveIsHeating({ hvac_mode: 'heat', hvac_action: 'heating' }), true);
  assert.equal(deriveIsHeating({ hvac_mode: 'heat', hvac_action: 'idle' }), false);
});

test('nullable readings become null, not zero', () => {
  // 0 C and "no reading" must not collapse into the same value.
  const state = toRoomState(building.id, {
    ...bathroom,
    current_temperature: null,
    current_humidity: null,
    target_temperature: null,
    power: null,
  });
  assert.equal(state.measureTemperature, null);
  assert.equal(state.measureHumidity, null);
  assert.equal(state.targetTemperature, null);
  assert.equal(state.heatingPower, null);
});

test('a genuine zero reading survives', () => {
  const state = toRoomState(building.id, { ...bathroom, current_temperature: 0, power: 0 });
  assert.equal(state.measureTemperature, 0);
  assert.equal(state.heatingPower, 0);
});

test('a room with no sensor is flagged missing, not stale', () => {
  const state = toRoomState(building.id, {
    ...bathroom,
    sensor: null,
    sensor_id: null,
  });
  assert.equal(state.sensorMissing, true);
  assert.equal(state.sensorStale, false);
  assert.equal(state.batteryPercent, null);
});

test('a sensor quiet for over two hours is stale', () => {
  const reportedAt = '2026-08-25T12:00:00.000Z';
  const room = { ...bathroom, sensor: { ...bathroom.sensor!, timestamp: reportedAt } };
  const at = (offsetMs: number) => Date.parse(reportedAt) + offsetMs;

  assert.equal(isSensorStale(room, at(60 * 60 * 1000)), false, '1 h is fine');
  assert.equal(isSensorStale(room, at(3 * 60 * 60 * 1000)), true, '3 h is stale');
});

test('preset modes come from the room, not a hardcoded list', () => {
  const state = toRoomState(building.id, { ...bathroom, preset_modes: ['none', 'high'] });
  assert.deepEqual(state.presetModes, ['none', 'high']);
});
