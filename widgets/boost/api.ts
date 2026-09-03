'use strict';

import {
  type WidgetApiRequest,
  numberFromBody,
  roomIdsFromBody,
} from '../../lib/widget-api';

module.exports = {
  async getState({ homey }: WidgetApiRequest) {
    return homey.app.getWidgetState();
  },

  /**
   * Raise the setpoint for a while.
   *
   * The device already knows how to put the old setpoint back afterwards - the
   * Flow card uses the same call - so the widget only has to ask.
   */
  async boost({ homey, body }: WidgetApiRequest) {
    const device = homey.app.getRoomDevice(roomIdsFromBody(body));
    if (device === null) throw new Error('room_not_paired');

    await device.boost(numberFromBody(body, 'temperature'), numberFromBody(body, 'minutes'));
    return { ok: true };
  },
};
