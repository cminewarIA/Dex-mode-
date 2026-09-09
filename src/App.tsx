import React, { useState, useRef } from 'react';
import { 
  Tv, 
  HardDrive, 
  Workflow, 
  Radio, 
  ExternalLink, 
  Sparkles, 
  CheckCircle2, 
  HelpCircle,
  Download
} from 'lucide-react';
import { KioskScreen } from './components/KioskScreen';
import { DeviceSimulator } from './components/DeviceSimulator';
import { IsoBuilderPanel } from './components/IsoBuilderPanel';
import { ArchitectureDocs } from './components/ArchitectureDocs';
import { ConnectedDeviceInfo } from './types';
import { DEVICE_PROFILES } from './data/deviceProfiles';

export default function App() {
  const [activeTab, setActiveTab] = useState<'kiosk' | 'builder' | 'architecture'>('kiosk');
  const [connectedDevice, setConnectedDevice] = useState<ConnectedDeviceInfo | null>(null);
  const [isRealCaptureActive, setIsRealCaptureActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Connect device handler
  const handleConnectDevice = (deviceInfo: ConnectedDeviceInfo) => {
    setConnectedDevice(deviceInfo);
  };

  // Disconnect handler
  const handleDisconnect = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsRealCaptureActive(false);
    setConnectedDevice(null);
  };

  // Real UVC capture (HDMI capture card / Webcam)
  const handleStartRealCapture = async () => {
    if (isRealCaptureActive) {
      handleDisconnect();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60 }
        },
        audio: true
      });

      mediaStreamRef.current = stream;
      setIsRealCaptureActive(true);

      const switchProfile = DEVICE_PROFILES.find((p) => p.id === 'nintendo-switch') || DEVICE_PROFILES[1];

      setConnectedDevice({
        profile: switchProfile,
        connectedAt: new Date(),
        deviceName: 'Capturadora HDMI UVC (Señal en Directo)',
        sourceType: 'real-uvc',
        resolution: '1920x1080',
        fps: 60
      });

      // Switch view to kiosk
      setActiveTab('kiosk');

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.warn('Could not access camera/UVC device:', err);
      alert('Para probar la capturadora real, autoriza el permiso de cámara/vídeo en tu navegador. Puedes conectar una capturadora HDMI USB (Nintendo Switch o consola) para verla en vivo.');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Navigation Header */}
      <header className="border-b border-neutral-800/80 bg-neutral-900/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-600/20 text-white font-bold">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-tight">
                  CastStation OS
                </h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                  Ventoy Live ISO
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 hidden sm:block">
                Estación Kiosk de Proyección Automática (DeX, Android, Switch, Ubuntu Touch)
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1.5 bg-neutral-950/70 p-1 rounded-xl border border-neutral-800 text-xs">
            <button
              onClick={() => setActiveTab('kiosk')}
              className={`px-3.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'kiosk'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Pantalla Kiosk</span>
              {connectedDevice && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-1" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('builder')}
              className={`px-3.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'builder'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Generador de ISO</span>
            </button>

            <button
              onClick={() => setActiveTab('architecture')}
              className={`px-3.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'architecture'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Workflow className="w-3.5 h-3.5" />
              <span>Arquitectura</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'kiosk' && (
          <div className="space-y-6">
            {/* The Live Interactive Kiosk Screen */}
            <KioskScreen
              connectedDevice={connectedDevice}
              onDisconnect={handleDisconnect}
              onStartRealCapture={handleStartRealCapture}
              isRealCaptureActive={isRealCaptureActive}
              videoRef={videoRef}
            />

            {/* Hardware & Simulation Switchboard */}
            <DeviceSimulator
              onConnectDevice={handleConnectDevice}
              onDisconnect={handleDisconnect}
              connectedDevice={connectedDevice}
              onStartRealCapture={handleStartRealCapture}
              isRealCaptureActive={isRealCaptureActive}
            />
          </div>
        )}

        {activeTab === 'builder' && <IsoBuilderPanel />}

        {activeTab === 'architecture' && <ArchitectureDocs />}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-800/80 bg-neutral-950/70 py-6 text-center text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            CastStation OS • Sistema de Proyección Kiosk con Wayland Cage y PipeWire
          </span>
          <div className="flex items-center gap-4 text-neutral-400 font-mono text-[11px]">
            <span>Compatible con Ventoy USB</span>
            <span>Kernel Linux 6.x</span>
            <span>GPL / Código Abierto</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
