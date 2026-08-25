'use strict';

import Homey from 'homey';

import type { SmartGulvvarmeAppLike } from '../../lib/app-interface';
import { SmartGulvvarmeApi } from '../../lib/api';
import { InvalidKeyError, MissingKeyError } from '../../lib/errors';
import { buildingDisplayName } from '../../lib/mapper';

interface RoomDeviceData {
  buildingId: string;
  roomId: string;
}

interface PairListDevice {
  name: string;
  data: RoomDeviceData;
  settings: { sensor_id: string; building_id: string; room_id: string };
}

/** What the pair view gets back when a key is submitted. */
interface KeyResult {
  ok: boolean;
  error?: string;
  buildingCount?: number;
}

module.exports = class RoomDriver extends Homey.Driver {

  private get app(): SmartGulvvarmeAppLike {
    return this.homey.app as unknown as SmartGulvvarmeAppLike;
  }

  async onInit(): Promise<void> {
    this.log('Room driver initialized');
  }

  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    this.registerKeyHandlers(session, 'pair');

    session.setHandler('list_devices', async () => this.listDevices());
  }

  /**
   * Repair reuses the same key view, so an expired key can be replaced without
   * deleting devices - which would lose their Insights history and break every
   * Flow that references them.
   */
  async onRepair(session: Homey.Driver.PairSession): Promise<void> {
    this.registerKeyHandlers(session, 'repair');
  }

  private registerKeyHandlers(session: Homey.Driver.PairSession, mode: 'pair' | 'repair'): void {
    // The view shares both flows but ends differently: pairing moves on to the
    // device list, repair just closes.
    session.setHandler('pair_mode', async () => mode);

    // Lets the view skip straight past itself when a working key is already set.
    session.setHandler('has_key', async () => this.app.hasApiKey());

    session.setHandler('validate_key', async (apiKey: unknown): Promise<KeyResult> => {
      if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        return { ok: false, error: this.homey.__('pair.errors.empty') };
      }

      const api = new SmartGulvvarmeApi({ apiKey: apiKey.trim() });

      try {
        const buildings = await api.validateKey();
        // Only persist once the key has actually been accepted.
        this.app.setApiKey(apiKey);
        return { ok: true, buildingCount: buildings.length };
      } catch (err) {
        return { ok: false, error: this.describeKeyError(err) };
      }
    });
  }

  /**
   * Turn a failure into something the user can act on.
   *
   * A rejected key and an unreachable server look nothing alike to the user, so
   * they must not share a message.
   */
  private describeKeyError(err: unknown): string {
    if (err instanceof InvalidKeyError) return this.homey.__('pair.errors.invalidKey');
    if (err instanceof MissingKeyError) return this.homey.__('pair.errors.empty');
    return this.homey.__('pair.errors.unreachable');
  }

  private async listDevices(): Promise<PairListDevice[]> {
    const api = this.app.getApi();
    if (api === null) throw new Error(this.homey.__('pair.errors.empty'));

    const devices: PairListDevice[] = [];

    for (const building of await api.listBuildings()) {
      const rooms = await api.listRooms(building.id);

      for (const room of rooms) {
        // Rooms with no sensor still pair - they can be controlled, they just
        // report no temperature - but the name says so, so it is not a surprise.
        const hasSensor = Boolean(room.sensor ?? room.sensor_id);
        const base = room.name?.trim() || this.homey.__('pair.unnamedRoom');
        const suffix = hasSensor ? '' : ` (${this.homey.__('pair.noSensor')})`;

        devices.push({
          // Homey filters out already-paired devices by `data`, so ids go there.
          data: { buildingId: building.id, roomId: room.id },
          name: `${base}${suffix}`,
          settings: {
            sensor_id: room.sensor?.id ?? room.sensor_id ?? '-',
            building_id: building.id,
            room_id: room.id,
          },
        });
      }

      this.log(`Found ${rooms.length} rooms in ${buildingDisplayName(building)}`);
    }

    return devices;
  }

};
