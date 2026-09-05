'use strict';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { DeviceLike } from '../lib/widget-data';
import {
  buildingViews,
  findRoomDevice,
  roomIdsOf,
  roomViews,
  sortRooms,
  toBuildingView,
  toRoomView,
} from '../lib/widget-data';

interface FakeOptions {
  name?: string;
  data?: unknown;
  available?: boolean;
  capabilities?: Record<string, unknown>;
  options?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

function fakeDevice({
  name = 'Room',
  data = { buildingId: 'b1', roomId: 'r1' },
  available = true,
  capabilities = {},
  options = {},
  settings = {},
}: FakeOptions = {}): DeviceLike {
  return {
    getName: () => name,
    getData: () => data,
    getAvailable: () => available,
    hasCapability: (id: string) => id in capabilities,
    getCapabilityValue: (id: string) => capabilities[id],
    getCapabilityOptions: (id: string) => options[id],
    getSetting: (key: string) => settings[key],
  };
}

test('a room view reads what the poller left on the device', () => {
  const view = toRoomView(fakeDevice({
    name: 'Badeværelse',
    capabilities: {
      measure_temperature: 23.8,
      target_temperature: 24,
      measure_humidity: 54,
      onoff: true,
      is_heating: true,
      heating_power: 45,
      preset_mode: 'high',
      measure_battery: 82,
      alarm_connectivity: false,
    },
  }));

  assert.equal(view?.name, 'Badeværelse');
  assert.equal(view?.buildingId, 'b1');
  assert.equal(view?.measureTemperature, 23.8);
  assert.equal(view?.isHeating, true);
  assert.equal(view?.heatingPower, 45);
  assert.equal(view?.presetMode, 'high');
  assert.equal(view?.sensorOffline, false);
});

test('a room with nothing reported yet is drawing no heat', () => {
  // A missing capability must read as 0 rather than null: the strip draws a
  // bar from it, and a null would render as an empty gap instead of an
  // honest "nothing".
  const view = toRoomView(fakeDevice());
  assert.equal(view?.heatingPower, 0);
  assert.equal(view?.measureTemperature, null);
  assert.equal(view?.presetMode, null);
});

test('an unknown preset is not passed through', () => {
  const view = toRoomView(fakeDevice({ capabilities: { preset_mode: 'scorching' } }));
  assert.equal(view?.presetMode, null);
});

test('the setpoint range comes from the device, falling back to the driver', () => {
  const narrowed = toRoomView(fakeDevice({
    capabilities: { target_temperature: 20 },
    options: { target_temperature: { min: 15, max: 25, step: 1 } },
  }));
  assert.equal(narrowed?.minTemperature, 15);
  assert.equal(narrowed?.maxTemperature, 25);
  assert.equal(narrowed?.temperatureStep, 1);

  const plain = toRoomView(fakeDevice({ capabilities: { target_temperature: 20 } }));
  assert.equal(plain?.minTemperature, 7);
  assert.equal(plain?.maxTemperature, 35);
  assert.equal(plain?.temperatureStep, 0.5);
});

test('a device paired without room ids is skipped rather than half-rendered', () => {
  assert.equal(roomIdsOf(fakeDevice({ data: { buildingId: 'b1' } })), null);
  assert.equal(roomIdsOf(fakeDevice({ data: null })), null);
  assert.equal(toRoomView(fakeDevice({ data: {} })), null);
  assert.equal(roomViews([fakeDevice({ data: {} }), fakeDevice()]).length, 1);
});

test('the gateway heartbeat is read, and its "nothing yet" marker is not', () => {
  const seen = toBuildingView(fakeDevice({
    data: { buildingId: 'b1' },
    settings: { last_seen: '2026-09-03T12:04:00Z' },
  }));
  assert.equal(seen?.lastSeen, '2026-09-03T12:04:00Z');

  // The device writes '-' when no gateway has ever reported.
  const never = toBuildingView(fakeDevice({
    data: { buildingId: 'b1' },
    settings: { last_seen: '-' },
  }));
  assert.equal(never?.lastSeen, null);
  assert.equal(toBuildingView(fakeDevice({ data: { buildingId: 'b1' } }))?.lastSeen, null);
});

test('the building is online until it raises the alarm', () => {
  const up = toBuildingView(fakeDevice({ data: { buildingId: 'b1' } }));
  assert.equal(up?.online, true);

  const down = toBuildingView(fakeDevice({
    data: { buildingId: 'b1' },
    capabilities: { alarm_connectivity: true },
  }));
  assert.equal(down?.online, false);
  assert.equal(buildingViews([fakeDevice({ data: {} })]).length, 0);
});

test('sorting by power puts the rooms calling for heat first', () => {
  const rooms = roomViews([
    fakeDevice({ name: 'Kontor', data: { buildingId: 'b1', roomId: 'r1' }, capabilities: { heating_power: 0 } }),
    fakeDevice({ name: 'Stue', data: { buildingId: 'b1', roomId: 'r2' }, capabilities: { heating_power: 68 } }),
    fakeDevice({ name: 'Bad', data: { buildingId: 'b1', roomId: 'r3' }, capabilities: { heating_power: 45 } }),
  ]);

  assert.deepEqual(sortRooms(rooms, 'power').map((room) => room.name), ['Stue', 'Bad', 'Kontor']);
  assert.deepEqual(sortRooms(rooms, 'name').map((room) => room.name), ['Bad', 'Kontor', 'Stue']);
});

test('equal rooms keep a stable order instead of reshuffling each poll', () => {
  const rooms = roomViews([
    fakeDevice({ name: 'Stue', data: { buildingId: 'b1', roomId: 'r1' } }),
    fakeDevice({ name: 'Bad', data: { buildingId: 'b1', roomId: 'r2' } }),
  ]);
  assert.deepEqual(sortRooms(rooms, 'power').map((room) => room.name), ['Bad', 'Stue']);
});

test('a room is matched on both ids, so two buildings cannot collide', () => {
  const first = fakeDevice({ data: { buildingId: 'b1', roomId: 'shared' } });
  const second = fakeDevice({ data: { buildingId: 'b2', roomId: 'shared' } });
  const devices = [first, second];

  assert.equal(findRoomDevice(devices, { buildingId: 'b2', roomId: 'shared' }), second);
  assert.equal(findRoomDevice(devices, { buildingId: 'b3', roomId: 'shared' }), null);
});
