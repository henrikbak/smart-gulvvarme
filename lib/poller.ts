'use strict';

import { EventEmitter } from 'node:events';

import type { Logger, SmartGulvvarmeApi } from './api';
import { RateLimitError, isAuthError } from './errors';
import { toBuildingState, toRoomState } from './mapper';
import type { BuildingState, RoomState } from './types';

export const DEFAULT_INTERVAL_S = 60;
export const MIN_INTERVAL_S = 30;
const MAX_BACKOFF_MS = 10 * 60 * 1000;
/** How many consecutive failed ticks before devices are called unavailable. */
export const FAILURE_TOLERANCE = 3;

export interface PollerOptions {
  api: () => SmartGulvvarmeApi | null;
  logger?: Logger;
  intervalSeconds?: number;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
}

/** Why every device should be marked unavailable. */
export type OutageReason = 'auth' | 'unreachable';

export interface PollerEvents {
  room: (state: RoomState) => void;
  building: (state: BuildingState) => void;
  /** A room the API no longer returns. Never a reason to delete the device. */
  roomGone: (ids: { buildingId: string; roomId: string }) => void;
  outage: (reason: OutageReason, message: string) => void;
  recovered: () => void;
  /**
   * One poll finished, successfully or not.
   *
   * Devices have already applied their new values by the time this fires, so a
   * listener that reads device state - the widget bridge does - sees the tick's
   * result rather than the previous one.
   */
  tick: () => void;
}

/**
 * Polls the API on a single timer and fans the result out to every device.
 *
 * One tick costs one `GET /buildings` plus one `GET /buildings/{id}/rooms` per
 * building, regardless of how many rooms are paired - the rooms endpoint
 * returns them all, sensor readings included. Polling per device would multiply
 * that by the room count for no extra information.
 */
export class Poller extends EventEmitter {
  private readonly getApi: () => SmartGulvvarmeApi | null;

  private readonly logger: Logger;

  private readonly setTimeoutImpl: typeof setTimeout;

  private readonly clearTimeoutImpl: typeof clearTimeout;

  private intervalMs: number;

  /** Extra delay layered on top of the interval after a rate limit. */
  private backoffMs = 0;

  private consecutiveFailures = 0;

  private inOutage = false;

  private timer: ReturnType<typeof setTimeout> | null = null;

  private running = false;

  private ticking = false;

  private readonly subscribers = new Set<string>();

  private readonly knownRoomIds = new Map<string, Set<string>>();

  constructor({
    api,
    logger,
    intervalSeconds = DEFAULT_INTERVAL_S,
    setTimeoutImpl,
    clearTimeoutImpl,
  }: PollerOptions) {
    super();
    this.getApi = api;
    this.logger = logger ?? { log: () => {}, error: () => {} };
    this.intervalMs = Math.max(intervalSeconds, MIN_INTERVAL_S) * 1000;
    this.setTimeoutImpl = setTimeoutImpl ?? setTimeout;
    this.clearTimeoutImpl = clearTimeoutImpl ?? clearTimeout;
  }

  /**
   * Register a device. Polling starts with the first subscriber and stops with
   * the last, so an app with no paired devices makes no requests at all.
   */
  subscribe(deviceId: string): void {
    this.subscribers.add(deviceId);
    if (!this.running) this.start();
  }

  unsubscribe(deviceId: string): void {
    this.subscribers.delete(deviceId);
    if (this.subscribers.size === 0) this.stop();
  }

  /** The interval actually in use, after the floor has been applied. */
  getIntervalSeconds(): number {
    return this.intervalMs / 1000;
  }

  setIntervalSeconds(seconds: number): void {
    this.intervalMs = Math.max(seconds, MIN_INTERVAL_S) * 1000;
    if (this.running) this.schedule(0);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule(0);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      this.clearTimeoutImpl(this.timer);
      this.timer = null;
    }
  }

  /** Poll now, outside the schedule. Used after a write or a key change. */
  async refresh(): Promise<void> {
    await this.tick();
  }

  private schedule(delayMs: number): void {
    if (this.timer !== null) this.clearTimeoutImpl(this.timer);
    if (!this.running) return;
    this.timer = this.setTimeoutImpl(() => {
      // tick() swallows and classifies every failure itself, so there is
      // nothing left for a caller to handle - but say so explicitly.
      this.tick().catch((err) => this.logger.error('Unexpected poll error:', err));
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;

    try {
      const api = this.getApi();
      if (api === null) {
        this.enterOutage('auth', 'No API key configured.');
        return;
      }

      const buildings = await api.listBuildings();
      for (const building of buildings) {
        this.emit('building', toBuildingState(building));

        const rooms = await api.listRooms(building.id);
        const seen = new Set<string>();
        for (const room of rooms) {
          seen.add(room.id);
          this.emit('room', toRoomState(building.id, room));
        }
        this.reportGoneRooms(building.id, seen);
      }

      this.onSuccess();
    } catch (err) {
      this.onFailure(err);
    } finally {
      this.ticking = false;
      // Fires even on a failed tick: an outage changes what a widget should
      // show just as much as new readings do.
      this.emit('tick');
      this.schedule(this.intervalMs + this.backoffMs);
    }
  }

  /**
   * A room that vanished from the listing. The API returns 404 for rooms
   * outside the key's scope as well as for deleted ones, so this only ever
   * marks a device unavailable - it must never delete one.
   */
  private reportGoneRooms(buildingId: string, seen: Set<string>): void {
    const previous = this.knownRoomIds.get(buildingId);
    if (previous) {
      for (const roomId of previous) {
        if (!seen.has(roomId)) this.emit('roomGone', { buildingId, roomId });
      }
    }
    this.knownRoomIds.set(buildingId, seen);
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.backoffMs = 0;
    if (this.inOutage) {
      this.inOutage = false;
      this.emit('recovered');
    }
  }

  private onFailure(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);

    // A key problem will not fix itself on the next tick. Stop asking, and wait
    // for the key to change - app.ts restarts the poller when it does.
    if (isAuthError(err)) {
      this.logger.error('Polling stopped:', message);
      this.stop();
      this.enterOutage('auth', message);
      return;
    }

    if (err instanceof RateLimitError) {
      const wait = err.retryAfterMs ?? Math.max(this.backoffMs * 2, this.intervalMs);
      this.backoffMs = Math.min(wait, MAX_BACKOFF_MS);
      this.logger.error(`Rate limited, backing off ${Math.round(this.backoffMs / 1000)}s`);
      return;
    }

    this.consecutiveFailures += 1;
    this.logger.error(`Poll failed (${this.consecutiveFailures}/${FAILURE_TOLERANCE}):`, message);

    // One dropped request is not an outage. Keep the last known values until
    // the failures stack up, so a brief blip does not grey out the whole house.
    if (this.consecutiveFailures >= FAILURE_TOLERANCE) {
      this.enterOutage('unreachable', message);
    }
  }

  private enterOutage(reason: OutageReason, message: string): void {
    if (this.inOutage) return;
    this.inOutage = true;
    this.emit('outage', reason, message);
  }
}
