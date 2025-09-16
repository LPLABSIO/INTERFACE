/**
 * @shared/device-manager
 * iOS Device Management Module
 */

const DeviceManager = require('./DeviceManager');
const DeviceDiscovery = require('./DeviceDiscovery');

module.exports = {
  DeviceManager,
  DeviceDiscovery,

  // Export singleton instances for convenience
  deviceManager: DeviceManager,
  deviceDiscovery: DeviceDiscovery
};