'use strict';

import type { PresetMode } from './types';
import type { BuildingView, RoomIds, RoomView } from './widget-data';

/**
 * The contract between the app and its dashboard widgets.
 *
 * Each widget's `api.ts` is loaded by Homey with the app instance on
 * `homey.app`. `app.ts` uses `module.exports = class`, which exports no type,
 * so - as with `app-interface.ts` for the drivers - the surface the widgets
 * actually use is declared here.
 */

/** What a widget is handed on load, and again after every poll. */
export interface WidgetState {
  hasKey: boolean;
  rooms: RoomView[];
  buildings: BuildingView[];
}

/**
 * The realtime event the widgets listen for.
 *
 * Kept in step with the `Homey.on(...)` call in each widget's `index.html`,
 * which cannot import from here.
 */
export const WIDGET_STATE_EVENT = 'state';

/** The room device methods a widget is allowed to reach. */
export interface WidgetRoomDevice {
  setTargetTemperature(temperature: number): Promise<void>;
  setPresetMode(preset: PresetMode): Promise<void>;
  boost(temperature: number, minutes: number): Promise<void>;
}

export interface WidgetApp {
  getWidgetState(): WidgetState;
  getRoomViews(): RoomView[];
  getBuildingViews(): BuildingView[];
  getRoomDevice(ids: RoomIds): WidgetRoomDevice | null;
}

export interface WidgetApiRequest {
  homey: { app: WidgetApp };
  query: Record<string, string>;
  params: Record<string, string>;
  body: Record<string, unknown>;
}

/** Read `{ buildingId, roomId }` out of a widget request body. */
export function roomIdsFromBody(body: Record<string, unknown>): RoomIds {
  const { buildingId, roomId } = body;
  if (typeof buildingId !== 'string' || typeof roomId !== 'string') {
    throw new Error('missing_room');
  }
  return { buildingId, roomId };
}

/** Read a finite number out of a widget request body. */
export function numberFromBody(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`missing_${key}`);
  }
  return value;
}
