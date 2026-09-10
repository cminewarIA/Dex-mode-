import React, { useState, useEffect, useRef } from 'react';
import { 
  Tv, 
  Radio, 
  CheckCircle2, 
  AlertCircle, 
  Maximize2, 
  Minimize2, 
  Volume2, 
  VolumeX, 
  PowerOff, 
  Cpu, 
  Activity, 
  Sparkles,
  Layers,
  Monitor,
  Zap,
  RotateCcw,
  Camera
} from 'lucide-react';
import { ConnectedDeviceInfo } from '../types';

interface KioskScreenProps {
  connectedDevice: ConnectedDeviceInfo | null;
  onDisconnect: () => void;
  onStartRealCapture: () => void;
  isRealCaptureActive: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export const KioskScreen: React.FC<KioskScreenProps> = ({
  connectedDevice,
  onDisconnect,
  onStartRealCapture,
  isRealCaptureActive,
  videoRef
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [audioLevel, setAudioLevel] = useState(65);
  const containerRef = useRef<HTMLDivElement>(null);

  // Clock ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-hide HUD after 4 seconds of inactivity when projecting
  useEffect(() => {
    if (!connectedDevice) return;
    const timeout = setTimeout(() => setHudVisible(false), 4000);
    return () => clearTimeout(timeout);
  }, [connectedDevice, hudVisible]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <div 
      ref={containerRef}
      id="kiosk-container"
      onMouseMove={() => setHudVisible(true)}
      className="relative w-full aspect-video bg-neutral-950 text-neutral-100 rounded-xl overflow-hidden border border-neutral-800 shadow-2xl flex flex-col select-none"
    >
      {/* Top Status Bar (Always visible in Standby, auto-hides in projection) */}
      <div 
        className={`absolute top-0 left-0 right-0 z-30 px-6 py-3 flex items-center justify-between backdrop-blur-md bg-neutral-950/70 border-b border-neutral-800/60 transition-opacity duration-300 ${
          connectedDevice && !hudVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold tracking-wider uppercase text-neutral-300">
              CastStation OS
            </span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 font-mono">
            v1.0 (Live Ventoy)
          </span>
          <span className="text-xs text-neutral-500 hidden sm:inline">
            Wayland / Cage Kiosk Mode
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>PipeWire: 48kHz</span>
          </div>
          <div className="text-xs font-mono font-medium text-neutral-300">
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 transition-colors"
            title="Pantalla Completa"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Screen Content */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {!connectedDevice ? (
          /* ================= STANDBY WAITING SCREEN ================= */
          <div className="relative w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950">
            
            {/* Ambient Background Grid / Radar */}
            <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-25" />
            
            {/* Concentric Signal Rings */}
            <div className="relative mb-6">
              <div className="absolute -inset-8 rounded-full border border-blue-500/10 animate-ping" style={{ animationDuration: '3s' }} />
              <div className="absolute -inset-16 rounded-full border border-indigo-500/5 animate-pulse" />
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-neutral-900 to-neutral-800 border border-neutral-700 shadow-xl flex items-center justify-center relative z-10">
                <Radio className="w-10 h-10 text-blue-400 animate-pulse" />
              </div>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">
              Esperando Conexión de Dispositivo
            </h2>
            <p className="text-sm sm:text-base text-neutral-400 max-w-lg mb-8 leading-relaxed">
              Conecte su terminal por <strong className="text-neutral-200">USB-C</strong> (Samsung DeX / Android) o sincronice mediante <strong className="text-neutral-200">Wi-Fi (ADB TCP/IP)</strong>. El sistema proyectará automáticamente la interfaz de escritorio a pantalla completa.
            </p>

            {/* Listening Subsystems Status Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl mb-6">
              <div className="p-3.5 rounded-xl bg-neutral-900/80 border border-neutral-800 flex items-center gap-3 text-left">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-neutral-200">ADB / Scrcpy Daemon</div>
                  <div className="text-[11px] text-neutral-500">USB Vendor 04e8 / Android</div>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-400 ml-auto" />
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-900/80 border border-neutral-800 flex items-center gap-3 text-left">
                <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400">
                  <Tv className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-neutral-200">Wi-Fi TCP/IP Daemon</div>
                  <div className="text-[11px] text-neutral-500">Escuchando Puerto 5555</div>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-400 ml-auto" />
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-900/80 border border-neutral-800 flex items-center gap-3 text-left">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-neutral-200">Wayland Cage Engine</div>
                  <div className="text-[11px] text-neutral-500">Auto-Fullscreen Kiosk</div>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-400 ml-auto" />
              </div>
            </div>

            {/* Quick Test Option for physical camera */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={onStartRealCapture}
                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-neutral-700 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Camera className="w-4 h-4 text-blue-400" />
                <span>Probar Entrada de Cámara/Vídeo Local</span>
              </button>
            </div>
          </div>
        ) : (
          /* ================= ACTIVE PROJECTION SCREEN ================= */
          <div className="relative w-full h-full bg-black flex items-center justify-center">
            {/* If Real UVC Capture was initiated */}
            {connectedDevice.sourceType === 'real-uvc' ? (
              <div className="w-full h-full flex items-center justify-center bg-black relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted={isMuted}
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-4 left-4 z-20 px-3 py-1 rounded bg-black/60 backdrop-blur-md text-[11px] text-emerald-400 border border-emerald-500/30 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>SEÑAL UVC EN DIRECTO (1080p60)</span>
                </div>
              </div>
            ) : (
              /* Simulated Interface for the connected device */
              <div className="w-full h-full flex flex-col relative overflow-hidden">
                {connectedDevice.profile.id === 'samsung-dex' && (
                  <SamsungDexSimulator />
                )}
                {connectedDevice.profile.id === 'android-wireless' && (
                  <AndroidWirelessSimulator />
                )}
                {connectedDevice.profile.id === 'android-scrcpy' && (
                  <AndroidDesktopSimulator />
                )}
                {connectedDevice.profile.id === 'ubuntu-touch' && (
                  <UbuntuTouchSimulator />
                )}
              </div>
            )}

            {/* Floating Minimalist Projection HUD (appears on hover) */}
            <div 
              className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-40 px-5 py-2.5 rounded-2xl bg-neutral-950/80 backdrop-blur-xl border border-neutral-800/90 shadow-2xl flex items-center gap-4 transition-all duration-300 ${
                hudVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
              }`}
            >
              <div className="flex items-center gap-2 border-r border-neutral-800 pr-3">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs font-semibold text-white">
                  {connectedDevice.profile.name}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                  {connectedDevice.resolution}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>{connectedDevice.profile.latencyExpectation}</span>
              </div>

              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-300 transition-colors"
                title={isMuted ? 'Activar Sonido' : 'Silenciar'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-neutral-200" />}
              </button>

              <button
                onClick={toggleFullscreen}
                className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-300 transition-colors"
                title="Pantalla Completa"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>

              <button
                onClick={onDisconnect}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-medium border border-red-500/30 transition-colors cursor-pointer"
                title="Desconectar y volver a espera"
              >
                <PowerOff className="w-3.5 h-3.5" />
                <span>Desconectar</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Information Ticker (Standby only) */}
      {!connectedDevice && (
        <div className="px-6 py-2.5 bg-neutral-950/80 border-t border-neutral-900 flex items-center justify-between text-xs text-neutral-500 font-mono">
          <div className="flex items-center gap-4">
            <span>Kernel: Linux 6.6-amd64</span>
            <span className="hidden sm:inline">Compositor: cage-wayland</span>
            <span className="hidden md:inline">Audio: pipewire-pulse 1.0</span>
          </div>
          <div>Modo: Estación Kiosk Zero-Latency</div>
        </div>
      )}
    </div>
  );
};

/* ==========================================================================
   SIMULATED DESKTOPS (Realistic environments for testing without hardware)
   ========================================================================== */

function SamsungDexSimulator() {
  return (
    <div className="w-full h-full bg-[#0a1128] text-white flex flex-col justify-between p-4 relative overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/40 via-[#0a1128] to-[#040817]">
      {/* Desktop Icons */}
      <div className="grid grid-cols-1 gap-4 w-20">
        <div className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-white/10 cursor-pointer">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg">
            <Monitor className="w-6 h-6 text-white" />
          </div>
          <span className="text-[11px] text-neutral-200">Samsung Internet</span>
        </div>

        <div className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-white/10 cursor-pointer">
          <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg">
            <Layers className="w-6 h-6 text-white" />
          </div>
          <span className="text-[11px] text-neutral-200">Archivos</span>
        </div>

        <div className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-white/10 cursor-pointer">
          <div className="w-12 h-12 rounded-xl bg-rose-600 flex items-center justify-center shadow-lg">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <span className="text-[11px] text-neutral-200">Galería</span>
        </div>
      </div>

      {/* Floating Sample Window */}
      <div className="absolute top-12 left-32 w-[60%] h-[68%] rounded-xl bg-neutral-900/90 backdrop-blur-xl border border-white/10 shadow-2xl flex flex-col overflow-hidden">
        <div className="px-4 py-2 bg-neutral-800/80 border-b border-white/5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="font-medium text-neutral-200">Samsung DeX Hub • Flujo de Trabajo Activo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
          </div>
        </div>
        <div className="p-6 flex-1 flex flex-col justify-center items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center mb-3">
            <Zap className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">Samsung DeX Conectado en CastStation</h3>
          <p className="text-xs text-neutral-400 max-w-md mb-4">
            Proyección de escritorio One UI ejecutada con resolución nativa. Teclado y ratón capturados mediante protocolo Scrcpy UHID sin retraso perceptible.
          </p>
          <div className="flex gap-2">
            <span className="px-2.5 py-1 rounded bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[11px]">Audio PipeWire Activo</span>
            <span className="px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px]">Hardware Decoder: H.265 60 FPS</span>
          </div>
        </div>
      </div>

      {/* DeX Taskbar */}
      <div className="h-12 w-full rounded-xl bg-black/60 backdrop-blur-xl border border-white/10 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm text-white">
            ⋮⋮⋮
          </button>
          <div className="h-4 w-px bg-white/20" />
          <div className="text-xs font-medium text-neutral-300">Samsung Galaxy S24 Ultra (DeX Mode)</div>
        </div>

        <div className="flex items-center gap-4 text-xs text-neutral-300">
          <span>Wi-Fi 6E</span>
          <span>100% ⚡</span>
          <span>ESP</span>
        </div>
      </div>
    </div>
  );
}

function AndroidWirelessSimulator() {
  return (
    <div className="w-full h-full bg-gradient-to-br from-[#0c0f1d] via-[#111827] to-[#0a0d18] text-white flex flex-col justify-between p-6 select-none">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-violet-500/20 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-violet-600/30 border border-violet-500/40 flex items-center justify-center font-bold text-xs text-violet-300">
            Wi-Fi
          </div>
          <span className="text-xs font-semibold text-neutral-200">Android / DeX Wireless</span>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-neutral-400">
          <span className="text-violet-400">📶 5 GHz (1920x1080 @ 60 FPS)</span>
          <span>Códec: H.265 (HEVC)</span>
          <span className="text-emerald-400 font-bold">Latencia: ~35ms</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="my-auto max-w-lg mx-auto text-center p-8 rounded-2xl bg-violet-950/20 border border-violet-500/30 shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-violet-500/20 border border-violet-500/30 text-violet-400 flex items-center justify-center mx-auto mb-4">
          <Zap className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-bold text-white mb-2">Transmisión Inalámbrica Activa</h3>
        <p className="text-xs text-neutral-400 mb-4 leading-relaxed">
          Enlace TCP/IP de alta velocidad establecido mediante ADB. Teclado y ratón nativos vinculados por hardware UHID.
        </p>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-mono text-emerald-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Buffer: 0 fotogramas acumulados</span>
        </div>
      </div>

      {/* Bottom Controls Bar */}
      <div className="flex items-center justify-between border-t border-violet-500/20 pt-3 text-xs text-neutral-400">
        <div className="flex items-center gap-4">
          <span className="text-neutral-400">Sincronización de portapapeles activa</span>
        </div>
        <div className="text-[11px] text-violet-400 font-mono">
          scrcpy --tcpip --video-codec=h265 --keyboard=uhid --mouse=uhid
        </div>
      </div>
    </div>
  );
}

function AndroidDesktopSimulator() {
  return (
    <div className="w-full h-full bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 text-white flex flex-col justify-between p-6">
      <div className="flex items-center justify-between text-xs text-neutral-400">
        <span>Android Desktop Mode (Freeform Windows)</span>
        <div className="flex items-center gap-3">
          <span>5G Ultra</span>
          <span>100%</span>
        </div>
      </div>

      <div className="my-auto max-w-lg mx-auto text-center p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3">
          <Zap className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-white mb-1">Android Scrcpy Stream</h3>
        <p className="text-xs text-neutral-400 mb-3">
          Transmisión fluida con soporte de ventanas libres y control táctil/ratón directo.
        </p>
        <span className="text-[11px] font-mono text-emerald-400">Códec: H.264 • Buffer: 0 marcos</span>
      </div>

      <div className="h-10 rounded-lg bg-neutral-900 border border-neutral-800 px-4 flex items-center justify-between text-xs text-neutral-400">
        <div className="flex gap-4">
          <span>◀ Volver</span>
          <span>● Inicio</span>
          <span>◼ Recientes</span>
        </div>
        <span>Scrcpy v2.4</span>
      </div>
    </div>
  );
}

function UbuntuTouchSimulator() {
  return (
    <div className="w-full h-full bg-[#3c3b37] text-white flex flex-col justify-between p-4 relative">
      <div className="flex items-center justify-between text-xs text-neutral-300 border-b border-neutral-700 pb-2">
        <span className="font-bold text-orange-400">Lomiri Convergence</span>
        <span>Ubuntu Touch (Focal 20.04 ARM64)</span>
      </div>

      <div className="my-auto max-w-md mx-auto text-center p-6 rounded-xl bg-neutral-800/80 border border-neutral-700">
        <h4 className="text-sm font-bold text-white mb-1">Entorno de Escritorio Lomiri Activo</h4>
        <p className="text-xs text-neutral-300">
          Modo convergencia activado vía conexión USB/Ethernet con sesión Wayland nativa.
        </p>
      </div>

      <div className="text-[11px] text-neutral-400 flex justify-between">
        <span>PinePhone Pro / Volla Phone</span>
        <span>Wayland IPC: cage</span>
      </div>
    </div>
  );
}
