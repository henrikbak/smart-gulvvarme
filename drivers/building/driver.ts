'use strict';

import Homey from 'homey';

import { SmartGulvvarmeApi } from '../../lib/api';
import type { SmartGulvvarmeAppLike } from '../../lib/app-interface';
import { InvalidKeyError, MissingKeyError } from '../../lib/errors';
import { buildingDisplayName } from '../../lib/mapper';

interface KeyResult {
  ok: boolean;
  error?: string;
  buildingCount?: number;
}

module.exports = class BuildingDriver extends Homey.Driver {

  private get app(): SmartGulvvarmeAppLike {
    return this.homey.app as unknown as SmartGulvvarmeAppLike;
  }

  async onInit(): Promise<void> {
    this.log('Building driver initialized');
  }

  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    this.registerKeyHandlers(session, 'pair');
    session.setHandler('list_devices', async () => this.listDevices());
  }

  async onRepair(session: Homey.Driver.PairSession): Promise<void> {
    this.registerKeyHandlers(session, 'repair');
  }

  private registerKeyHandlers(session: Homey.Driver.PairSession, mode: 'pair' | 'repair'): void {
    session.setHandler('pair_mode', async () => mode);

    // Lets the view skip straight past itself when a working key is already set.
    session.setHandler('has_key', async () => this.app.hasApiKey());

    session.setHandler('validate_key', async (apiKey: unknown): Promise<KeyResult> => {
      if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        return { ok: false, error: this.homey.__('pair.errors.empty') };
      }

      try {
        const buildings = await new SmartGulvvarmeApi({ apiKey: apiKey.trim() }).validateKey();
        this.app.setApiKey(apiKey);
        return { ok: true, buildingCount: buildings.length };
      } catch (err) {
        if (err instanceof InvalidKeyError) {
          return { ok: false, error: this.homey.__('pair.errors.invalidKey') };
        }
        if (err instanceof MissingKeyError) {
          return { ok: false, error: this.homey.__('pair.errors.empty') };
        }
        return { ok: false, error: this.homey.__('pair.errors.unreachable') };
      }
    });
  }

  private async listDevices(): Promise<Array<{
    name: string;
    data: { buildingId: string };
    settings: { building_id: string; last_seen: string };
  }>> {
    const api = this.app.getApi();
    if (api === null) throw new Error(this.homey.__('pair.errors.empty'));

    return (await api.listBuildings()).map((building) => ({
      // buildingDisplayName keeps the account's email address out of the UI.
      name: buildingDisplayName(building),
      data: { buildingId: building.id },
      settings: { building_id: building.id, last_seen: building.last_seen ?? '-' },
    }));
  }

};
