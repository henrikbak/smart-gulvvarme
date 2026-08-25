'use strict';

/**
 * The app's Web API, consumed only by the settings page.
 *
 * The page never sees the key itself - it can set one, ask whether one is set,
 * and ask whether it works.
 */

interface ApiArgs {
  homey: {
    app: {
      hasApiKey(): boolean;
      setApiKey(apiKey: string): void;
      testConnection(): Promise<unknown>;
    };
  };
  body?: unknown;
}

module.exports = {

  async getStatus({ homey }: ApiArgs) {
    return { hasKey: homey.app.hasApiKey() };
  },

  async setKey({ homey, body }: ApiArgs) {
    const apiKey = (body as { apiKey?: unknown } | undefined)?.apiKey;
    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      throw new Error('empty');
    }
    homey.app.setApiKey(apiKey);
    return { ok: true };
  },

  async testConnection({ homey }: ApiArgs) {
    return homey.app.testConnection();
  },

};
