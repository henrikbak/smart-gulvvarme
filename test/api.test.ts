'use strict';

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { SmartGulvvarmeApi, redact } from '../lib/api';
import {
  InvalidKeyError,
  MissingKeyError,
  NotFoundError,
  RateLimitError,
  TransientError,
  ValidationError,
  WriteDeniedError,
} from '../lib/errors';

// Resolved from the project root, not __dirname: tests run from .homeybuild/ but
// the fixtures stay in the source tree.
const FIXTURES = join(process.cwd(), 'test', 'fixtures');
const load = (name: string): unknown => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));

const buildings = load('buildings.json') as Array<{ id: string }>;
const rooms = load('rooms.json') as Array<{ id: string }>;
const errors = load('errors.json') as Record<
  string,
  { status: number; body: unknown }
>;

const API_KEY = 'sgv_live_TESTKEY_abcdefghijklmnop';
const BUILDING_ID = buildings[0]!.id;
const ROOM_ID = rooms[0]!.id;

interface Call {
  url: string;
  init: RequestInit;
}

/** A fetch stub that records calls and replays queued responses. */
function stubFetch(queue: Array<{ status: number; body: unknown; headers?: Record<string, string> }>) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = queue.shift();
    if (!next) throw new Error('fetch stub ran out of queued responses');
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { 'content-type': 'application/json', ...(next.headers ?? {}) },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

// backoffBaseMs: 0 exercises the retry path without the wall-clock wait.
const makeApi = (impl: typeof fetch) => new SmartGulvvarmeApi({
  apiKey: API_KEY,
  fetchImpl: impl,
  backoffBaseMs: 0,
});

test('sends the key in the x-api-key header', async () => {
  const { impl, calls } = stubFetch([{ status: 200, body: buildings }]);
  await makeApi(impl).listBuildings();

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://api.smart-gulvvarme.dk/v1/buildings');
  const headers = calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers['x-api-key'], API_KEY);
});

test('parses the real buildings and rooms payloads', async () => {
  const { impl } = stubFetch([
    { status: 200, body: buildings },
    { status: 200, body: rooms },
  ]);
  const api = makeApi(impl);

  const gotBuildings = await api.listBuildings();
  assert.equal(gotBuildings.length, 1);

  const gotRooms = await api.listRooms(BUILDING_ID);
  assert.equal(gotRooms.length, 5);
  assert.equal(gotRooms[0]!.name, 'Badeværelse');
});

test('a missing key (401 unauthenticated) is a MissingKeyError', async () => {
  const { impl } = stubFetch([errors.missing_key!]);
  await assert.rejects(makeApi(impl).listBuildings(), MissingKeyError);
});

test('an invalid key on a read (403 permission_denied) is an InvalidKeyError', async () => {
  // The API answers a bad key with 403, not 401. On a read that can only mean
  // the key itself is rejected.
  const { impl } = stubFetch([errors.invalid_key!]);
  await assert.rejects(makeApi(impl).listBuildings(), InvalidKeyError);
});

test('the same 403 on a write is a WriteDeniedError, not an InvalidKeyError', async () => {
  // Identical status and code as the test above - only the intent differs.
  const { impl } = stubFetch([errors.invalid_key!]);
  await assert.rejects(
    makeApi(impl).updateRoom(BUILDING_ID, ROOM_ID, { target_temperature: 21 }),
    WriteDeniedError,
  );
});

test('404 is a NotFoundError, which never means "deleted"', async () => {
  const { impl } = stubFetch([errors.not_found!]);
  await assert.rejects(makeApi(impl).listRooms('does-not-exist'), NotFoundError);
});

test('an out-of-range setpoint surfaces the server message verbatim', async () => {
  const { impl } = stubFetch([errors.out_of_range!]);
  await assert.rejects(
    makeApi(impl).updateRoom(BUILDING_ID, ROOM_ID, { target_temperature: 99 }),
    (err: unknown) => {
      assert.ok(err instanceof ValidationError);
      assert.equal(err.message, 'target_temperature must be between 7 and 35.');
      return true;
    },
  );
});

test('an unwritable field is rejected locally, without a request', async () => {
  const { impl, calls } = stubFetch([]);
  await assert.rejects(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    makeApi(impl).updateRoom(BUILDING_ID, ROOM_ID, { bogus: 1 } as any),
    ValidationError,
  );
  assert.equal(calls.length, 0, 'should not reach the network');
});

test('an empty patch is rejected before hitting the network', async () => {
  const { impl, calls } = stubFetch([]);
  await assert.rejects(makeApi(impl).updateRoom(BUILDING_ID, ROOM_ID, {}), ValidationError);
  assert.equal(calls.length, 0);
});

test('4xx is never retried', async () => {
  const { impl, calls } = stubFetch([errors.invalid_key!, errors.invalid_key!, errors.invalid_key!]);
  await assert.rejects(makeApi(impl).listBuildings(), InvalidKeyError);
  assert.equal(calls.length, 1, 'a bad key does not become good by asking again');
});

test('5xx is retried and can succeed', async () => {
  const { impl, calls } = stubFetch([
    { status: 500, body: { error: { code: 'internal', message: 'boom' } } },
    { status: 200, body: buildings },
  ]);
  const got = await makeApi(impl).listBuildings();
  assert.equal(calls.length, 2);
  assert.equal(got.length, 1);
});

test('5xx that never recovers gives up as a TransientError', async () => {
  const body = { error: { code: 'internal', message: 'boom' } };
  const { impl, calls } = stubFetch([
    { status: 500, body },
    { status: 500, body },
    { status: 500, body },
  ]);
  await assert.rejects(makeApi(impl).listBuildings(), TransientError);
  assert.equal(calls.length, 3, 'three attempts, then stop');
});

test('429 carries Retry-After through as milliseconds', async () => {
  const { impl } = stubFetch([
    { status: 429, body: { error: { message: 'slow down' } }, headers: { 'retry-after': '30' } },
  ]);
  await assert.rejects(makeApi(impl).listBuildings(), (err: unknown) => {
    assert.ok(err instanceof RateLimitError);
    assert.equal(err.retryAfterMs, 30_000);
    return true;
  });
});

test('a transport failure is transient and never leaks the key', async () => {
  const impl = (async () => {
    throw new Error(`connect ECONNREFUSED (x-api-key: ${API_KEY})`);
  }) as unknown as typeof fetch;

  await assert.rejects(makeApi(impl).listBuildings(), (err: unknown) => {
    assert.ok(err instanceof TransientError);
    assert.ok(!redact(err.message).includes(API_KEY), 'redact() must strip the key');
    return true;
  });
});

test('redact() strips keys from arbitrary text', () => {
  assert.equal(redact(`header x-api-key: ${API_KEY} end`), 'header x-api-key: sgv_*** end');
  assert.equal(redact('nothing to hide'), 'nothing to hide');
});
