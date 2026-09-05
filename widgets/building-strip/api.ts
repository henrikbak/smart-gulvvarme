'use strict';

import type { WidgetApiRequest } from '../../lib/widget-api';

module.exports = {
  async getState({ homey }: WidgetApiRequest) {
    return homey.app.getWidgetState();
  },
};
