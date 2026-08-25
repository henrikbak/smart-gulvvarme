'use strict';

import Homey from 'homey';

import type { SmartGulvvarmeAppLike } from '../../lib/app-interface';
import type { OutageReason } from '../../lib/poller';
import type { BuildingState } from '../../lib/types';

interface BuildingDeviceData {
  buildingId: string;
}

module.exports = class BuildingDevice extends Homey.Device {

  private buildingId!: string;

  private onBuilding!: (state: BuildingState) => void;

  private onOutage!: (reason: OutageReason, message: string) => void;

  private onRecovered!: () => void;

  private get app(): SmartGulvvarmeAppLike {
    return this.homey.app as unknown as SmartGulvvarmeAppLike;
  }

  async onInit(): Promise<void> {
    this.buildingId = (this.getData() as BuildingDeviceData).buildingId;

    this.subscribe();
    this.setUnavailable(this.homey.__('device.waiting')).catch(this.error);
    this.app.getPoller().refresh().catch(this.error);
  }

  async onUninit(): Promise<void> {
    this.unsubscribe();
  }

  async onDeleted(): Promise<void> {
    this.unsubscribe();
  }

  isOnline(): boolean {
    return this.getCapabilityValue('alarm_connectivity') !== true;
  }

  private subscribe(): void {
    const poller = this.app.getPoller();

    this.onBuilding = (state) => {
      if (state.id !== this.buildingId) return;
      this.applyState(state);
    };

    this.onOutage = (reason) => {
      const message = reason === 'auth'
        ? this.homey.__('device.authProblem')
        : this.homey.__('device.unreachable');
      this.setUnavailable(message).catch(this.error);
    };

    this.onRecovered = () => {
      this.setAvailable().catch(this.error);
    };

    poller.on('building', this.onBuilding);
    poller.on('outage', this.onOutage);
    poller.on('recovered', this.onRecovered);
    poller.subscribe(`building:${this.buildingId}`);
  }

  private unsubscribe(): void {
    const poller = this.app.getPoller();
    poller.off('building', this.onBuilding);
    poller.off('outage', this.onOutage);
    poller.off('recovered', this.onRecovered);
    poller.unsubscribe(`building:${this.buildingId}`);
  }

  private applyState(state: BuildingState): void {
    // The building device stays available even when the gateway is down - being
    // able to see that it is down is the point of this device.
    this.setAvailable().catch(this.error);

    this.set('alarm_connectivity', state.available === false);
    this.set('measure_temperature', state.outdoorTemperature);
    this.set('measure_wind_strength', state.windStrength);
    this.set('measure_wind_angle', state.windAngle);
    this.set('cloud_coverage', state.cloudCoverage);

    if (state.available === null) {
      this.setWarning(this.homey.__('device.gatewayNeverSeen')).catch(() => {});
    } else {
      this.unsetWarning().catch(() => {});
    }

    const lastSeen = state.lastSeen ?? '-';
    if (this.getSetting('last_seen') !== lastSeen) {
      this.setSettings({ last_seen: lastSeen }).catch(this.error);
    }
  }

  /** Write a capability value, logging rather than propagating a failure. */
  private set(capability: string, value: unknown): void {
    if (!this.hasCapability(capability)) return;
    if (this.getCapabilityValue(capability) === value) return;
    this.setCapabilityValue(capability, value).catch((err) => {
      this.error(`Failed to set ${capability}:`, err);
    });
  }

};
