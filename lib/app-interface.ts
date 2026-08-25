'use strict';

import type { SmartGulvvarmeApi } from './api';
import type { Poller } from './poller';

/**
 * What the drivers and devices need from the app instance.
 *
 * `app.ts` uses `module.exports = class`, the pattern Athom's own TypeScript
 * templates use, which exports no type. Declaring the surface here keeps the
 * drivers typed without importing the app itself, and avoids a cycle.
 */
export interface SmartGulvvarmeAppLike {
  getPoller(): Poller;
  getApi(): SmartGulvvarmeApi | null;
  getApiKey(): string;
  setApiKey(apiKey: string): void;
  hasApiKey(): boolean;
  createApiFor(apiKey: string): SmartGulvvarmeApi;
}
