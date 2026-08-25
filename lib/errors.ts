'use strict';

/** Error codes the API returns in `{ error: { code, message } }`. */
export type ApiErrorCode =
  | 'invalid_argument'
  | 'unauthenticated'
  | 'permission_denied'
  | 'not_found'
  | 'internal';

/** Base class for everything this app throws at the Homey layer. */
export class SmartGulvvarmeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** No API key is configured yet. HTTP 401 / `unauthenticated`. */
export class MissingKeyError extends SmartGulvvarmeError {}

/**
 * The configured API key is not accepted.
 *
 * The API answers a bad key with 403 `permission_denied`, not 401 - 401 is only
 * for a completely absent header. Because the same 403 also covers a key that
 * lacks `buildings:write`, the two are told apart by whether the failing call
 * was a read or a write. See `WriteDeniedError`.
 */
export class InvalidKeyError extends SmartGulvvarmeError {}

/** The key is valid for reading but lacks the `buildings:write` permission. */
export class WriteDeniedError extends SmartGulvvarmeError {}

/**
 * The building or room does not exist *or* is not covered by the key.
 *
 * The API deliberately returns 404 rather than 403 for resources outside the
 * key's scope, so ids cannot be discovered by probing. A 404 is therefore never
 * proof that something was deleted, and must not cause a device to be removed.
 */
export class NotFoundError extends SmartGulvvarmeError {}

/** The request body was rejected. `message` comes from the server and is user-readable. */
export class ValidationError extends SmartGulvvarmeError {}

/** Too many requests. `retryAfterMs` is set when the server said how long to wait. */
export class RateLimitError extends SmartGulvvarmeError {
  readonly retryAfterMs: number | null;

  constructor(message: string, retryAfterMs: number | null = null) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}

/** A 5xx, a timeout, or a transport failure - the retryable kind. */
export class TransientError extends SmartGulvvarmeError {}

/** Anything else the API returned that we have no specific class for. */
export class ApiError extends SmartGulvvarmeError {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** True for the errors that mean "stop polling until the key changes". */
export function isAuthError(err: unknown): err is MissingKeyError | InvalidKeyError {
  return err instanceof MissingKeyError || err instanceof InvalidKeyError;
}
