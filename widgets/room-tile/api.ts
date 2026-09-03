'use strict';

import type { PresetMode } from '../../lib/types';
import {
  type WidgetApiRequest,
  numberFromBody,
  roomIdsFromBody,
} from '../../lib/widget-api';

const PRESETS: readonly PresetMode[] = ['none', 'low', 'medium', 'high'];

/**
 * Writes go through the room device, never through the API client.
 *
 * The device owns the write debounce and the optimistic window that keep the
 * setpoint from bouncing; a second write path would lose both.
 */
function device({ homey, body }: WidgetApiRequest) {
  const found = homey.app.getRoomDevice(roomIdsFromBody(body));
  if (found === null) throw new Error('room_not_paired');
  return found;
}

module.exports = {
  async getState({ homey }: WidgetApiRequest) {
    return homey.app.getWidgetState();
  },

  async setTarget(request: WidgetApiRequest) {
    await device(request).setTargetTemperature(numberFromBody(request.body, 'temperature'));
    return { ok: true };
  },

  async setPreset(request: WidgetApiRequest) {
    const { preset } = request.body;
    if (typeof preset !== 'string' || !PRESETS.includes(preset as PresetMode)) {
      throw new Error('bad_preset');
    }
    await device(request).setPresetMode(preset as PresetMode);
    return { ok: true };
  },
};
