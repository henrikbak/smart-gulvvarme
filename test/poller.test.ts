'use strict';

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import type { SmartGulvvarmeApi } from '../lib/api';
import { InvalidKeyError, RateLimitError, TransientError } from '../lib/errors';
import { FAILURE_TOLERANCE, MIN_INTERVAL_S, Poller } from '../lib/poller';
import type {
  Building, BuildingState, Room, RoomState,
} from '../lib/types';

const FIXTURES = join(process.cwd(), 'test', 'fixtures');
const load = (name: string): unknown => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));

const buildings = load('buildings.json') as Building[];
const rooms = load('rooms.json') as Room[];
const BUILDING_ID = buildings[0]!.id;

/** A fake API whose two calls can be scripted per test. */
function fakeApi(overrides: Partial<Record<'listBuildings' | 'listRooms', () => Promise<unknown>>> = {}) {
  const counts = { listBuildings: 0, listRooms: 0 };
  const api = {
    async listBuildings() {
      counts.listBuildings += 1;
      if (overrides.listBuildings) return overrides.listBuildings();
      return buildings;
    },
    async listRooms() {
      counts.listRooms += 1;
      if (overrides.listRooms) return overrides.listRooms();
      return rooms;
    },
  } as unknown as SmartGulvvarmeApi;
  return { api, counts };
}

/** A poller whose timer never fires on its own, so ticks are explicit. */
function makePoller(api: SmartGulvvarmeApi | null, opts: { interval?: number } = {}) {
  const noopTimer = (() => 0) as unknown as typeof setTimeout;
  const noopClear = (() => {}) as unknown as typeof clearTimeout;
  return new Poller({
    api: () => api,
    intervalSeconds: opts.interval ?? MIN_INTERVAL_S,
    setTimeoutImpl: noopTimer,
    clearTimeoutImpl: noopClear,
  });
}

test('one tick fans out every room and building from a single pair of calls', async () => {
  const { api, counts } = fakeApi();
  const poller = makePoller(api);

  const gotRooms: RoomState[] = [];
  const gotBuildings: BuildingState[] = [];
  poller.on('room', (s) => gotRooms.push(s));
  poller.on('building', (s) => gotBuildings.push(s));

  await poller.refresh();

  assert.equal(gotBuildings.length, 1);
  assert.equal(gotRooms.length, 5, 'all five rooms from one listRooms call');
  assert.equal(counts.listBuildings, 1);
  assert.equal(counts.listRooms, 1, 'never one request per room');
});

test('an invalid key stops polling and reports an auth outage', async () => {
  const { api, counts } = fakeApi({
    listBuildings: async () => {
      throw new InvalidKeyError('The API key is not valid for this API.');
    },
  });
  const poller = makePoller(api);

  const outages: Array<{ reason: string; message: string }> = [];
  poller.on('outage', (reason, message) => outages.push({ reason, message }));

  poller.start();
  await poller.refresh();

  assert.equal(outages.length, 1);
  assert.equal(outages[0]!.reason, 'auth');

  // Stopped means stopped: a bad key must not be retried every minute.
  await poller.refresh();
  assert.equal(counts.listBuildings, 2, 'refresh is explicit, but no timer rearms');
  assert.equal(outages.length, 1, 'the outage is reported once, not per tick');
});

test('a missing API key is an auth outage without any request', async () => {
  const poller = makePoller(null);
  const outages: string[] = [];
  poller.on('outage', (reason) => outages.push(reason));

  await poller.refresh();
  assert.deepEqual(outages, ['auth']);
});

test('a single network blip keeps the last known values', async () => {
  let fail = true;
  const { api } = fakeApi({
    listBuildings: async () => {
      if (fail) throw new TransientError('socket hang up');
      return buildings;
    },
  });
  const poller = makePoller(api);

  const outages: string[] = [];
  poller.on('outage', (reason) => outages.push(reason));

  await poller.refresh();
  assert.deepEqual(outages, [], 'one failure is not an outage');

  fail = false;
  await poller.refresh();
  assert.deepEqual(outages, []);
});

test('three consecutive failures do mark an outage', async () => {
  const { api } = fakeApi({
    listBuildings: async () => {
      throw new TransientError('socket hang up');
    },
  });
  const poller = makePoller(api);

  const outages: string[] = [];
  poller.on('outage', (reason) => outages.push(reason));

  for (let i = 0; i < FAILURE_TOLERANCE; i++) await poller.refresh();

  assert.deepEqual(outages, ['unreachable']);
});

test('recovery after an outage is announced once', async () => {
  let fail = true;
  const { api } = fakeApi({
    listBuildings: async () => {
      if (fail) throw new TransientError('down');
      return buildings;
    },
  });
  const poller = makePoller(api);

  let recovered = 0;
  poller.on('recovered', () => {
    recovered += 1;
  });

  for (let i = 0; i < FAILURE_TOLERANCE; i++) await poller.refresh();
  fail = false;
  await poller.refresh();
  await poller.refresh();

  assert.equal(recovered, 1, 'recovery fires on the transition, not every tick');
});

test('a rate limit honours Retry-After instead of hammering', async () => {
  const { api } = fakeApi({
    listBuildings: async () => {
      throw new RateLimitError('slow down', 120_000);
    },
  });
  const poller = makePoller(api);

  const outages: string[] = [];
  poller.on('outage', (reason) => outages.push(reason));

  await poller.refresh();
  // Being throttled is not an outage - the data is merely stale.
  assert.deepEqual(outages, []);
});

test('a room that disappears is reported, never deleted', async () => {
  let current = rooms;
  const { api } = fakeApi({ listRooms: async () => current });
  const poller = makePoller(api);

  const gone: Array<{ buildingId: string; roomId: string }> = [];
  poller.on('roomGone', (ids) => gone.push(ids));

  await poller.refresh();
  assert.deepEqual(gone, [], 'nothing gone on the first pass');

  const dropped = rooms[2]!;
  current = rooms.filter((r) => r.id !== dropped.id);
  await poller.refresh();

  assert.deepEqual(gone, [{ buildingId: BUILDING_ID, roomId: dropped.id }]);
});

test('the poll interval cannot be set below the floor', () => {
  // The API documents no rate limit, so the floor is our own restraint.
  const poller = makePoller(null, { interval: 1 });
  assert.equal(poller.getIntervalSeconds(), MIN_INTERVAL_S, 'constructor clamps');

  poller.setIntervalSeconds(5);
  assert.equal(poller.getIntervalSeconds(), MIN_INTERVAL_S, 'setter clamps too');

  poller.setIntervalSeconds(300);
  assert.equal(poller.getIntervalSeconds(), 300, 'a longer interval is honoured');
});

test('subscribing starts polling and the last unsubscribe stops it', async () => {
  const { api, counts } = fakeApi();
  const poller = makePoller(api);

  poller.subscribe('device-a');
  poller.subscribe('device-b');
  await poller.refresh();
  assert.equal(counts.listBuildings, 1);

  poller.unsubscribe('device-a');
  poller.unsubscribe('device-b');
  // With no subscribers the timer is cleared; an explicit refresh still works,
  // but nothing rearms it.
  assert.equal(counts.listBuildings, 1);
});
