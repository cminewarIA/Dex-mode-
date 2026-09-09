import React, { useState } from 'react';
import { 
  Smartphone, 
  Gamepad2, 
  Tablet, 
  Terminal, 
  Camera, 
  Usb, 
  Sparkles, 
  Radio, 
  Check,
  AlertTriangle
} from 'lucide-react';
import { DEVICE_PROFILES } from '../data/deviceProfiles';
import { ConnectedDeviceInfo, DeviceCategory } from '../types';

interface DeviceSimulatorProps {
  onConnectDevice: (deviceInfo: ConnectedDeviceInfo) => void;
  onDisconnect: () => void;
  connectedDevice: ConnectedDeviceInfo | null;
  onStartRealCapture: () => void;
  isRealCaptureActive: boolean;
}

export const DeviceSimulator: React.FC<DeviceSimulatorProps> = ({
  onConnectDevice,
  onDisconnect,
  connectedDevice,
  onStartRealCapture,
  isRealCaptureActive
}) => {
  const [webUsbStatus, setWebUsbStatus] = useState<string | null>(null);

  const handleSimulateDevice = (id: DeviceCategory) => {
    const profile = DEVICE_PROFILES.find((p) => p.id === id);
    if (!profile) return;

    onConnectDevice({
      profile,
      connectedAt: new Date(),
      deviceName: profile.name,
      sourceType: 'simulated',
      resolution: profile.optimalResolution,
      fps: 60
    });
  };

  // Optional real WebUSB discovery test (standard browser feature)
  const handleTestWebUSB = async () => {
    if (!('usb' in navigator)) {
      setWebUsbStatus('WebUSB no está soportado en este navegador (requiere Chrome/Edge/Brave).');
      return;
    }

    try {
      setWebUsbStatus('Buscando dispositivos USB conectados...');
      // @ts-expect-error WebUSB API
      const device = await navigator.usb.requestDevice({
        filters: [
          { vendorId: 0x04e8 }, // Samsung
          { vendorId: 0x18d1 }, // Google
          { vendorId: 0x2717 }, // Xiaomi
        ]
      });

      if (device) {
        setWebUsbStatus(`¡Dispositivo detectado! ${device.productName || 'Android'} (Vendor: 0x${device.vendorId.toString(16)})`);
        // Trigger simulation for Samsung or generic Android
        if (device.vendorId === 0x04e8) {
          handleSimulateDevice('samsung-dex');
        } else {
          handleSimulateDevice('android-scrcpy');
        }
      }
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name !== 'NotFoundError') {
        setWebUsbStatus(`Aviso: ${error.message || 'No se seleccionó ningún dispositivo'}`);
      } else {
        setWebUsbStatus('Selección cancelada.');
      }
    }
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-bold text-white">
              Simulador de Conexión y Pruebas en Vivo
            </h3>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Prueba cómo reacciona la estación ante la inserción de periféricos o prueba tu hardware real conectado.
          </p>
        </div>

        {connectedDevice && (
          <button
            onClick={onDisconnect}
            className="px-4 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-semibold border border-red-500/40 transition-colors self-start sm:self-center"
          >
            Desconectar Dispositivo Activo
          </button>
        )}
      </div>

      {/* Hardware Testing Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6 p-4 rounded-xl bg-neutral-950/60 border border-neutral-800/80">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-500/10 text-red-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">Capturadora HDMI UVC Real</div>
              <div className="text-[11px] text-neutral-400">Prueba tu Switch o consola con tu capturadora USB</div>
            </div>
          </div>
          <button
            onClick={onStartRealCapture}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isRealCaptureActive 
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' 
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
            }`}
          >
            {isRealCaptureActive ? 'Detener UVC' : 'Probar UVC'}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-t md:border-t-0 md:border-l border-neutral-800/80 pt-3 md:pt-0 md:pl-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
              <Usb className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">Detector WebUSB Físico</div>
              <div className="text-[11px] text-neutral-400">Detecta móviles Samsung o Android conectados</div>
            </div>
          </div>
          <button
            onClick={handleTestWebUSB}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-neutral-700 transition-colors"
          >
            Escanear USB
          </button>
        </div>
      </div>

      {webUsbStatus && (
        <div className="mb-6 px-4 py-2.5 rounded-xl bg-blue-950/40 border border-blue-800/40 text-xs text-blue-300 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
          <span>{webUsbStatus}</span>
        </div>
      )}

      {/* Device Quick Connect Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {DEVICE_PROFILES.map((profile) => {
          const isConnected = connectedDevice?.profile.id === profile.id;
          
          return (
            <div
              key={profile.id}
              className={`relative rounded-xl p-4 transition-all duration-200 border flex flex-col justify-between text-left ${
                isConnected
                  ? 'bg-neutral-800/90 border-blue-500 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500'
                  : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/40'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${profile.color} text-white shadow-md`}>
                    {profile.id === 'samsung-dex' && <Smartphone className="w-5 h-5" />}
                    {profile.id === 'nintendo-switch' && <Gamepad2 className="w-5 h-5" />}
                    {profile.id === 'android-scrcpy' && <Tablet className="w-5 h-5" />}
                    {profile.id === 'ubuntu-touch' && <Terminal className="w-5 h-5" />}
                  </div>
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-neutral-800 text-neutral-300">
                    {profile.badge}
                  </span>
                </div>

                <h4 className="text-sm font-bold text-white mb-0.5">
                  {profile.name}
                </h4>
                <p className="text-[11px] text-neutral-400 mb-3 line-clamp-2">
                  {profile.description}
                </p>

                <div className="space-y-1 text-[11px] text-neutral-400 border-t border-neutral-800/80 pt-2 mb-4">
                  <div className="flex justify-between">
                    <span>Método:</span>
                    <span className="text-neutral-200 font-mono">{profile.connectionMethod}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Objetivo:</span>
                    <span className="text-neutral-200 font-mono">{profile.targetFramerate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Latencia:</span>
                    <span className="text-emerald-400 font-mono">{profile.latencyExpectation}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleSimulateDevice(profile.id)}
                className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  isConnected
                    ? 'bg-emerald-600 text-white'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
                }`}
              >
                {isConnected ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Conectado (Activo)</span>
                  </>
                ) : (
                  <span>Simular Conexión</span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
