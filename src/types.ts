export type DeviceCategory = 'samsung-dex' | 'android-scrcpy' | 'android-wireless' | 'ubuntu-touch';

export interface DeviceProfile {
  id: DeviceCategory;
  name: string;
  subtitle: string;
  badge: string;
  connectionMethod: 'USB-C (ADB/Scrcpy)' | 'Wi-Fi (ADB TCP/IP)' | 'Wayland / Network';
  description: string;
  detectionRule: string;
  launchCommand: string;
  optimalResolution: string;
  targetFramerate: string;
  latencyExpectation: string;
  icon: string;
  color: string;
  accentHex: string;
  features: string[];
}

export type KioskState = 'waiting' | 'detecting' | 'projecting';

export interface ConnectedDeviceInfo {
  profile: DeviceProfile;
  connectedAt: Date;
  deviceName: string;
  sourceType: 'simulated' | 'webusb';
  resolution: string;
  fps: number;
}
