'use strict';

import {
  ApiError,
  ApiErrorCode,
  InvalidKeyError,
  MissingKeyError,
  NotFoundError,
  RateLimitError,
  TransientError,
  ValidationError,
  WriteDeniedError,
} from './errors';
import {
  Building, Room, RoomUpdate, WRITABLE_ROOM_FIELDS,
} from './types';

export const DEFAULT_BASE_URL = 'https://api.smart-gulvvarme.dk/v1';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 500;

/** Minimal logger, satisfied by both Homey.App and console. */
export interface Logger {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface ApiOptions {
  apiKey: string;
  logger?: Logger;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Base retry delay. Lowered in tests so the retry path runs instantly. */
  backoffBaseMs?: number;
}

/** Whether the failing call was reading or writing - decides what a 403 means. */
type Intent = 'read' | 'write';

interface ErrorBody {
  error?: { code?: ApiErrorCode; message?: string };
}

/**
 * Pause between retries.
 *
 * A global timer rather than a Homey-managed one, because this module has no
 * Homey instance. It is safe to leave unmanaged: it always resolves, and the
 * total backoff across all attempts is bounded by BACKOFF_BASE_MS, so the
 * longest it can outlive a shutdown is a couple of seconds. It must not be
 * unref'd - the retry would then be abandoned whenever nothing else happens to
 * be keeping the event loop alive.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    // eslint-disable-next-line homey-app/global-timers
    setTimeout(resolve, ms);
  });
}

/**
 * Client for the Smart Gulvvarme API.
 *
 * This is the only file that knows the vendor's wire format. Everything else in
 * the app works against `lib/types.ts` and the errors in `lib/errors.ts`.
 */
export class SmartGulvvarmeApi {
  private readonly apiKey: string;

  private readonly baseUrl: string;

  private readonly logger: Logger;

  private readonly fetchImpl: typeof fetch;

  private readonly backoffBaseMs: number;

  constructor({
    apiKey, logger, baseUrl, fetchImpl, backoffBaseMs,
  }: ApiOptions) {
    this.backoffBaseMs = backoffBaseMs ?? BACKOFF_BASE_MS;
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.logger = logger ?? { log: () => {}, error: () => {} };
    this.fetchImpl = fetchImpl ?? globalThis.fetch;
  }

  /**
   * Check that the key works, and report what it can reach.
   *
   * Used by pairing, repair and the settings page so all three agree on what
   * "a working key" means. `canWrite` is not exposed by the API directly, so it
   * stays unknown until a write is actually attempted.
   */
  async validateKey(): Promise<Building[]> {
    return this.listBuildings();
  }

  async listBuildings(): Promise<Building[]> {
    return this.request<Building[]>('GET', '/buildings', 'read');
  }

  async getBuilding(buildingId: string): Promise<Building> {
    return this.request<Building>('GET', `/buildings/${encodeURIComponent(buildingId)}`, 'read');
  }

  async listRooms(buildingId: string): Promise<Room[]> {
    return this.request<Room[]>(
      'GET',
      `/buildings/${encodeURIComponent(buildingId)}/rooms`,
      'read',
    );
  }

  async getRoom(buildingId: string, roomId: string): Promise<Room> {
    return this.request<Room>(
      'GET',
      `/buildings/${encodeURIComponent(buildingId)}/rooms/${encodeURIComponent(roomId)}`,
      'read',
    );
  }

  /**
   * Update a room. Returns the updated room, which the caller should apply
   * immediately rather than waiting for the next poll.
   */
  async updateRoom(buildingId: string, roomId: string, patch: RoomUpdate): Promise<Room> {
    const keys = Object.keys(patch) as Array<keyof RoomUpdate>;
    if (keys.length === 0) {
      throw new ValidationError('Nothing to update.');
    }
    // The API is additionalProperties:false and answers an unknown field with a
    // 400. Catching it here gives a clearer error than a round-trip does.
    const unknown = keys.filter((key) => !WRITABLE_ROOM_FIELDS.includes(key));
    if (unknown.length > 0) {
      throw new ValidationError(`These fields are not writable: ${unknown.join(', ')}`);
    }

    return this.request<Room>(
      'PATCH',
      `/buildings/${encodeURIComponent(buildingId)}/rooms/${encodeURIComponent(roomId)}`,
      'write',
      patch,
    );
  }

  private async request<T>(
    method: string,
    path: string,
    intent: Intent,
    body?: unknown,
  ): Promise<T> {
    let lastError: Error = new TransientError('Request never ran.');

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await this.attempt<T>(method, path, intent, body);
      } catch (err) {
        lastError = err as Error;

        // 4xx never becomes right by asking again - a bad key stays bad, and a
        // rejected body stays rejected. Only 5xx and transport faults retry.
        if (!(err instanceof TransientError)) throw err;

        if (attempt < MAX_ATTEMPTS) {
          const jitter = Math.random() * this.backoffBaseMs;
          await sleep(this.backoffBaseMs * 2 ** (attempt - 1) + jitter);
        }
      }
    }

    throw lastError;
  }

  private async attempt<T>(
    method: string,
    path: string,
    intent: Intent,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let res: Response;

    try {
      res = await this.fetchImpl(url, {
        method,
        headers: {
          'x-api-key': this.apiKey,
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // Never let the error carry the request options - they hold the key.
      const reason = err instanceof Error ? err.message : String(err);
      throw new TransientError(`${method} ${path} failed: ${reason}`);
    }

    if (res.ok) {
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    }

    throw await this.toError(res, method, path, intent);
  }

  private async toError(
    res: Response,
    method: string,
    path: string,
    intent: Intent,
  ): Promise<Error> {
    let code: ApiErrorCode | undefined;
    let message = '';

    try {
      const parsed = (await res.json()) as ErrorBody;
      code = parsed.error?.code;
      message = parsed.error?.message ?? '';
    } catch {
      // A non-JSON body (a proxy error page, say) leaves us with the status.
    }

    const detail = message || `${method} ${path} returned ${res.status}`;

    switch (code) {
      case 'unauthenticated':
        return new MissingKeyError(detail);

      case 'permission_denied':
        // The API answers both "this key is not valid" and "this key may not
        // write" with 403 permission_denied. Which one it is depends on what we
        // were doing: reads only fail this way for a bad key, and a write only
        // reaches the permission check once the key itself was accepted.
        return intent === 'write' ? new WriteDeniedError(detail) : new InvalidKeyError(detail);

      case 'not_found':
        return new NotFoundError(detail);

      case 'invalid_argument':
        return new ValidationError(detail);

      case 'internal':
        return new TransientError(detail);

      default:
        break;
    }

    if (res.status === 429) {
      const header = res.headers.get('retry-after');
      const seconds = header === null ? Number.NaN : Number(header);
      return new RateLimitError(detail, Number.isFinite(seconds) ? seconds * 1000 : null);
    }
    if (res.status >= 500) return new TransientError(detail);
    if (res.status === 401) return new MissingKeyError(detail);
    if (res.status === 403) {
      return intent === 'write' ? new WriteDeniedError(detail) : new InvalidKeyError(detail);
    }
    if (res.status === 404) return new NotFoundError(detail);

    return new ApiError(detail, res.status);
  }
}

/**
 * Replace anything that looks like an API key with a placeholder.
 *
 * Every log line and error message that might have touched a request goes
 * through this, so a key can never reach the Homey log or an app crash report.
 */
export function redact(value: string): string {
  return value.replace(/sgv_[a-z]+_[A-Za-z0-9_-]+/g, 'sgv_***');
}
