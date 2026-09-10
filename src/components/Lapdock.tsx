import React, { useState, useEffect, useRef } from 'react';
import { 
  BatteryCharging, 
  Tv, 
  Volume2, 
  VolumeX, 
  Sun, 
  Sliders, 
  Maximize, 
  Minimize, 
  Usb, 
  HardDrive, 
  Download, 
  Check, 
  X, 
  ShieldCheck,
  ChevronRight,
  Monitor,
  Smartphone,
  Gamepad2,
  Sparkles,
  Wifi,
  Laptop
} from 'lucide-react';
import { ISO_CONFIG_FILES } from '../data/isoScripts';
import { DexDesktop } from './DexDesktop';
import { SwitchHome } from './SwitchHome';
import { UbuntuTouchHome } from './UbuntuTouchHome';

interface LapdockProps {
  onFullscreenToggle?: () => void;
}

type DeviceMode = 'dex' | 'switch' | 'ubuntu' | 'hdmi';

export const Lapdock: React.FC<LapdockProps> = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('dex');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectingStep, setConnectingStep] = useState(0);
  const [inputSource, setInputSource] = useState<'usbc-1' | 'usbc-2' | 'hdmi'>('usbc-1');
  const [osdOpen, setOsdOpen] = useState(false);
  const [brightness, setBrightness] = useState(85);
  const [volume, setVolume] = useState(70);
  const [isMuted, setIsMuted] = useState(false);
  const [batteryLevel] = useState(98);
  const [chargeExternalDevice, setChargeExternalDevice] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showIsoModal, setShowIsoModal] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [activeIsoTab, setActiveIsoTab] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const lapdockContainerRef = useRef<HTMLDivElement | null>(null);

  // Monitor fullscreen change events
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Keyboard shortcuts (Fn keys equivalent in Lapdock)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (osdOpen) setOsdOpen(false);
        if (showIsoModal) setShowIsoModal(false);
      }
      if (e.key === 'F2' || (e.altKey && e.key.toLowerCase() === 'o')) {
        setOsdOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [osdOpen, showIsoModal]);

  // Simulated handshake connection sequence
  const startConnecting = (mode: DeviceMode) => {
    setDeviceMode(mode);
    setIsConnecting(true);
    setConnectingStep(1);

    setTimeout(() => {
      setConnectingStep(2);
      setTimeout(() => {
        setConnectingStep(3);
        setTimeout(() => {
          setIsConnecting(false);
          setIsConnected(true);
        }, 600);
      }, 700);
    }, 700);
  };

  // Connect real hardware input (UVC HDMI capture card or phone video stream)
  const connectRealDevice = async () => {
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60 }
        },
        audio: true
      });

      mediaStreamRef.current = stream;
      setDeviceMode('hdmi');
      setIsConnected(true);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 50);
    } catch (err) {
      console.warn('Media connection error, launching DeX simulation mode:', err);
      startConnecting('dex');
    }
  };

  const disconnectDevice = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
  };

  const toggleFullscreen = () => {
    if (!lapdockContainerRef.current) return;
    if (!document.fullscreenElement) {
      lapdockContainerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleDownloadVentoyScript = () => {
    const scriptFile = ISO_CONFIG_FILES[0];
    const blob = new Blob([scriptFile.content], { type: 'application/x-sh;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'build-lapdock-iso.sh';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div 
      ref={lapdockContainerRef}
      className="relative w-screen h-screen overflow-hidden bg-[#070a12] text-neutral-200 select-none flex flex-col font-sans"
      style={{
        filter: `brightness(${brightness}%)`
      }}
    >
      {/* =========================================================================
          CONNECTING HANDSHAKE OVERLAY (Authentic DisplayPort / USB negotiation)
         ========================================================================= */}
      {isConnecting && (
        <div className="fixed inset-0 z-50 bg-[#070a12] flex flex-col items-center justify-center p-6 select-none">
          {/* Subtle concentric rings */}
          <div className="absolute w-80 h-80 rounded-full border border-sky-500/20 animate-ping pointer-events-none" />
          <div className="absolute w-60 h-60 rounded-full border border-emerald-500/20 animate-pulse pointer-events-none" />

          <div className="relative z-10 max-w-sm w-full bg-[#0d1322] border border-sky-500/30 rounded-3xl p-8 shadow-2xl shadow-sky-900/40 text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center mb-6 text-sky-400">
              {deviceMode === 'dex' && <Smartphone className="w-8 h-8 animate-bounce" />}
              {deviceMode === 'switch' && <Gamepad2 className="w-8 h-8 animate-bounce" />}
              {deviceMode === 'ubuntu' && <Laptop className="w-8 h-8 animate-bounce" />}
              {deviceMode === 'hdmi' && <Tv className="w-8 h-8 animate-bounce" />}
            </div>

            <h3 className="text-lg font-bold text-white mb-2">
              {deviceMode === 'dex' && "Negociando Samsung DeX"}
              {deviceMode === 'switch' && "Sincronizando Nintendo Switch"}
              {deviceMode === 'ubuntu' && "Iniciando Ubuntu Touch"}
              {deviceMode === 'hdmi' && "Sincronizando Entrada HDMI"}
            </h3>

            {/* Step messages */}
            <div className="text-xs text-sky-300/80 font-mono mb-6 h-6 flex items-center justify-center">
              {connectingStep === 1 && "Detectando DisplayPort Alt Mode USB-C..."}
              {connectingStep === 2 && "Estableciendo sincronización de píxel a 1080p @ 60Hz..."}
              {connectingStep === 3 && "¡Enlace verificado! Desplegando interfaz..."}
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-sky-500 to-emerald-400 h-full transition-all duration-300"
                style={{ width: connectingStep === 1 ? '35%' : connectingStep === 2 ? '75%' : '100%' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          STATE 1: REAL OR ACTIVE DEVICE PROJECTION (Full-bleed screen, no chrome)
         ========================================================================= */}
      {isConnected ? (
        <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
          {/* Incoming Real Video Feed if hardware stream exists */}
          {mediaStreamRef.current && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={isMuted}
              className="w-full h-full object-contain bg-black"
            />
          )}

          {/* Interactive Simulated Environments */}
          {!mediaStreamRef.current && (
            <>
              {deviceMode === 'dex' && (
                <DexDesktop
                  onDisconnect={disconnectDevice}
                  onOpenOsd={() => setOsdOpen(true)}
                  deviceName="Samsung Galaxy S24 (DeX)"
                  isWifi={inputSource === 'usbc-2'}
                />
              )}
              {deviceMode === 'switch' && (
                <SwitchHome
                  onDisconnect={disconnectDevice}
                  onOpenOsd={() => setOsdOpen(true)}
                />
              )}
              {deviceMode === 'ubuntu' && (
                <UbuntuTouchHome
                  onDisconnect={disconnectDevice}
                  onOpenOsd={() => setOsdOpen(true)}
                />
              )}
              {deviceMode === 'hdmi' && (
                <div className="w-full h-full bg-black flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-20 h-20 rounded-3xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-6 text-emerald-400 shadow-2xl">
                    <Tv className="w-10 h-10" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">Entrada HDMI Activa</h2>
                  <p className="text-xs text-neutral-400 max-w-md mb-6 leading-relaxed">
                    Recibiendo señal de vídeo directa a 1920x1080 @ 60 FPS sin procesamiento intermedio.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setOsdOpen(true)}
                      className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-white transition-colors cursor-pointer"
                    >
                      Ajustes OSD
                    </button>
                    <button
                      onClick={disconnectDevice}
                      className="px-4 py-2 rounded-xl bg-red-600/30 hover:bg-red-600/50 text-xs font-semibold text-red-300 border border-red-500/30 transition-colors cursor-pointer"
                    >
                      Desconectar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Top Quick Mode-Switcher Pill (Hover to reveal) */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 opacity-20 hover:opacity-100 transition-opacity bg-neutral-950/80 backdrop-blur-md border border-neutral-800 rounded-full px-4 py-1.5 flex items-center gap-2 text-xs shadow-xl">
            <span className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider mr-1">Dispositivo:</span>
            <button
              onClick={() => { mediaStreamRef.current = null; setDeviceMode('dex'); }}
              className={`px-2.5 py-0.5 rounded-full font-medium transition-colors cursor-pointer ${deviceMode === 'dex' && !mediaStreamRef.current ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white'}`}
            >
              Samsung DeX
            </button>
            <button
              onClick={() => { mediaStreamRef.current = null; setDeviceMode('switch'); }}
              className={`px-2.5 py-0.5 rounded-full font-medium transition-colors cursor-pointer ${deviceMode === 'switch' && !mediaStreamRef.current ? 'bg-cyan-600 text-white' : 'text-neutral-400 hover:text-white'}`}
            >
              Nintendo Switch
            </button>
            <button
              onClick={() => { mediaStreamRef.current = null; setDeviceMode('ubuntu'); }}
              className={`px-2.5 py-0.5 rounded-full font-medium transition-colors cursor-pointer ${deviceMode === 'ubuntu' && !mediaStreamRef.current ? 'bg-orange-600 text-white' : 'text-neutral-400 hover:text-white'}`}
            >
              Ubuntu Touch
            </button>
            <div className="w-[1px] h-3 bg-neutral-800 mx-1" />
            <button
              onClick={connectRealDevice}
              className={`px-2.5 py-0.5 rounded-full font-medium transition-colors cursor-pointer ${mediaStreamRef.current ? 'bg-emerald-600 text-white' : 'text-neutral-400 hover:text-white'}`}
              title="Activar cámara o capturadora física del PC"
            >
              Cámara/HDMI Real
            </button>
          </div>

          {/* Floating Lapdock OSD toggle handle */}
          <div className="absolute bottom-4 right-4 z-40 flex items-center gap-2 opacity-30 hover:opacity-100 transition-opacity">
            <button
              onClick={() => setOsdOpen(!osdOpen)}
              className="p-2 rounded-xl bg-neutral-900/90 text-neutral-300 border border-neutral-700 hover:bg-neutral-800 transition-colors shadow-2xl cursor-pointer"
              title="Lapdock OSD (Ajustes de pantalla)"
            >
              <Sliders className="w-4 h-4" />
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-neutral-900/90 text-neutral-300 border border-neutral-700 hover:bg-neutral-800 transition-colors shadow-2xl cursor-pointer"
              title="Pantalla Completa"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
            <button
              onClick={disconnectDevice}
              className="px-3 py-1.5 rounded-xl bg-red-600/30 text-red-300 border border-red-500/40 hover:bg-red-600/50 text-xs font-medium transition-colors shadow-2xl cursor-pointer"
              title="Desconectar señal"
            >
              Desconectar
            </button>
          </div>
        </div>
      ) : (
        /* =========================================================================
            STATE 2: LAPDOCK STANDBY SCREEN (Modern, Sleek, Futuristic Kiosk Dashboard)
           ========================================================================= */
        <div className="relative w-full h-full flex flex-col justify-between p-6 sm:p-10 overflow-hidden bg-gradient-to-b from-[#0c111e] via-[#07090f] to-[#040508]">
          
          {/* Animated radar rings in background */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
            <div className="w-[700px] h-[700px] rounded-full border border-sky-500/10 animate-[spin_40s_linear_infinite]" />
            <div className="absolute w-[500px] h-[500px] rounded-full border border-blue-500/15 animate-[pulse_4s_ease-in-out_infinite]" />
            <div className="absolute w-[320px] h-[320px] rounded-full border border-sky-400/20" />
          </div>

          {/* Top Status Bar (Lapdock Firmware Bar) */}
          <header className="relative z-20 flex items-center justify-between text-xs text-neutral-400 font-mono border-b border-neutral-800/60 pb-4">
            {/* Lapdock brand mark */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-white font-medium text-base tracking-wide">
                <div className="w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 shadow-lg shadow-sky-500/10">
                  <Monitor className="w-4 h-4" />
                </div>
                <span>Lapdock <span className="text-sky-400 font-semibold">OS</span></span>
              </div>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-sans font-bold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                SISTEMA LISTO EN RAM
              </span>
            </div>

            {/* Hardware Status: Battery, Audio, Controls */}
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-1.5 text-neutral-300">
                <BatteryCharging className="w-4 h-4 text-emerald-400" />
                <span>{batteryLevel}%</span>
                <span className="text-neutral-500 text-[11px] hidden sm:inline">(PD 45W)</span>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 text-neutral-400">
                <span className="text-neutral-300 font-medium">1080p FHD</span>
                <span className="text-[10px] tracking-wider uppercase text-neutral-500">60Hz IPS</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOsdOpen(!osdOpen)}
                  className="p-2 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer border border-neutral-700/50"
                  title="Abrir Menú OSD (F2)"
                >
                  <Sliders className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={toggleFullscreen}
                  className="p-2 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer border border-neutral-700/50"
                  title="Pantalla Completa"
                >
                  {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </header>

          {/* Central Standby Screen (Sleek Connection Hub) */}
          <main className="relative z-20 my-auto max-w-4xl mx-auto w-full text-center flex flex-col items-center py-6">
            
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-semibold mb-3 shadow-lg shadow-sky-500/5">
              <Sparkles className="w-3.5 h-3.5" /> Detección Automática de Señal Activa
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">
              Conecta tu Dispositivo
            </h1>
            <p className="text-xs sm:text-sm text-neutral-400 max-w-lg mb-8 leading-relaxed">
              Selecciona o conecta tu smartphone, consola o entrada de vídeo para iniciar la experiencia a pantalla completa y sin retardo.
            </p>

            {/* Interactive Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full mb-8">
              {/* Card 1: Samsung Galaxy (DeX) */}
              <button
                onClick={() => startConnecting('dex')}
                className="group relative p-5 rounded-2xl bg-[#0f1524]/90 hover:bg-[#131b2e] border border-blue-500/30 hover:border-blue-400/60 transition-all text-left flex flex-col justify-between shadow-xl shadow-blue-950/20 cursor-pointer hover:-translate-y-1"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-mono">
                    USB / Wi-Fi
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white mb-1 group-hover:text-blue-300 transition-colors">
                    Samsung Galaxy (DeX)
                  </h3>
                  <p className="text-[11px] text-neutral-400 leading-relaxed mb-4">
                    Modo escritorio 16:9 con ventanas, navegador y teclado nativo.
                  </p>
                </div>
                <div className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs text-center transition-colors shadow-md shadow-blue-600/30">
                  Conectar DeX
                </div>
              </button>

              {/* Card 2: Nintendo Switch */}
              <button
                onClick={() => startConnecting('switch')}
                className="group relative p-5 rounded-2xl bg-[#0f1524]/90 hover:bg-[#131b2e] border border-cyan-500/30 hover:border-cyan-400/60 transition-all text-left flex flex-col justify-between shadow-xl shadow-cyan-950/20 cursor-pointer hover:-translate-y-1"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                    <Gamepad2 className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono">
                    HDMI 60 FPS
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white mb-1 group-hover:text-cyan-300 transition-colors">
                    Nintendo Switch
                  </h3>
                  <p className="text-[11px] text-neutral-400 leading-relaxed mb-4">
                    Dock + capturadora HDMI para jugar a pantalla completa y sin lag.
                  </p>
                </div>
                <div className="w-full py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs text-center transition-colors shadow-md shadow-cyan-600/30">
                  Conectar Switch
                </div>
              </button>

              {/* Card 3: Ubuntu Touch */}
              <button
                onClick={() => startConnecting('ubuntu')}
                className="group relative p-5 rounded-2xl bg-[#0f1524]/90 hover:bg-[#131b2e] border border-orange-500/30 hover:border-orange-400/60 transition-all text-left flex flex-col justify-between shadow-xl shadow-orange-950/20 cursor-pointer hover:-translate-y-1"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 group-hover:scale-110 transition-transform">
                    <Laptop className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 font-mono">
                    Lomiri / Mir
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white mb-1 group-hover:text-orange-300 transition-colors">
                    Ubuntu Touch
                  </h3>
                  <p className="text-[11px] text-neutral-400 leading-relaxed mb-4">
                    Convergencia nativa Linux con soporte para aplicaciones de escritorio.
                  </p>
                </div>
                <div className="w-full py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs text-center transition-colors shadow-md shadow-orange-600/30">
                  Conectar Ubuntu
                </div>
              </button>
            </div>

            {/* Direct Hardware Capture fallback trigger */}
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
              <button
                onClick={connectRealDevice}
                className="px-5 py-2.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 font-medium flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Usb className="w-4 h-4 text-emerald-400" />
                <span>Escanear Cámara / Capturadora HDMI del Ordenador</span>
              </button>
            </div>
          </main>

          {/* Bottom Lapdock Footer */}
          <footer className="relative z-20 flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-500 font-mono border-t border-neutral-800/60 pt-4 gap-2">
            <div className="flex items-center gap-4">
              <span>Display: 1080p FHD IPS</span>
              <span className="hidden sm:inline">Teclado y Clickpad activos</span>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowIsoModal(true)}
                className="text-neutral-400 hover:text-white underline underline-offset-4 cursor-pointer transition-colors"
              >
                Generar ISO Ventoy para PC/Portátil
              </button>
              <span>Firmware v2.10</span>
            </div>
          </footer>
        </div>
      )}

      {/* =========================================================================
          AUTHENTIC LAPDOCK OSD (On-Screen Display Menu)
         ========================================================================= */}
      {osdOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl overflow-hidden font-sans">
            
            {/* OSD Header */}
            <div className="px-6 py-4 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-neutral-300" />
                <span className="text-xs font-bold uppercase tracking-widest text-white">
                  Lapdock OSD
                </span>
              </div>
              <button
                onClick={() => setOsdOpen(false)}
                className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* OSD Body */}
            <div className="p-6 space-y-5 text-xs">
              
              {/* Input Source Selector */}
              <div>
                <label className="text-neutral-400 font-semibold mb-2 block uppercase text-[10px] tracking-wider">
                  Entrada Activa
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['usbc-1', 'usbc-2', 'hdmi'] as const).map((src) => (
                    <button
                      key={src}
                      onClick={() => setInputSource(src)}
                      className={`py-2 px-3 rounded-xl font-mono text-center transition-all cursor-pointer ${
                        inputSource === src
                          ? 'bg-neutral-100 text-neutral-900 font-bold shadow-md'
                          : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                      }`}
                    >
                      {src === 'usbc-1' && 'USB-C 1'}
                      {src === 'usbc-2' && 'USB-C 2 (Wi-Fi)'}
                      {src === 'hdmi' && 'micro-HDMI'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Brightness Slider */}
              <div>
                <div className="flex items-center justify-between mb-1.5 text-neutral-300">
                  <div className="flex items-center gap-2">
                    <Sun className="w-4 h-4 text-amber-400" />
                    <span>Brillo de la pantalla</span>
                  </div>
                  <span className="font-mono text-neutral-400">{brightness}%</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="120"
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                  className="w-full accent-neutral-300 bg-neutral-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Volume Slider */}
              <div>
                <div className="flex items-center justify-between mb-1.5 text-neutral-300">
                  <div className="flex items-center gap-2">
                    {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                    <span>Altavoces Integrados</span>
                  </div>
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="text-[11px] text-neutral-400 hover:underline cursor-pointer"
                  >
                    {isMuted ? 'Desactivar Mudo' : 'Silenciar'}
                  </button>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={isMuted ? 0 : volume}
                  disabled={isMuted}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="w-full accent-neutral-300 bg-neutral-800 rounded-lg cursor-pointer disabled:opacity-40"
                />
              </div>

              {/* USB-C Power Delivery toggle */}
              <div className="pt-2 border-t border-neutral-800 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">Cargar dispositivo conectado</div>
                  <div className="text-[11px] text-neutral-500">USB-PD 45W a través de la batería del Lapdock</div>
                </div>
                <button
                  onClick={() => setChargeExternalDevice(!chargeExternalDevice)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    chargeExternalDevice ? 'bg-neutral-100' : 'bg-neutral-800'
                  }`}
                >
                  <span 
                    className={`absolute top-1 w-4 h-4 rounded-full transition-transform ${
                      chargeExternalDevice ? 'left-6 bg-neutral-900' : 'left-1 bg-neutral-400'
                    }`} 
                  />
                </button>
              </div>

              {/* ISO Image Creator Option */}
              <div className="pt-2 border-t border-neutral-800">
                <button
                  onClick={() => {
                    setOsdOpen(false);
                    setShowIsoModal(true);
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium border border-neutral-700 flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-neutral-300" />
                    <span>Convertir cualquier Portátil/PC en Lapdock (ISO)</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-500" />
                </button>
              </div>
            </div>

            {/* OSD Footer */}
            <div className="px-6 py-3 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between text-[11px] text-neutral-500">
              <span>Resolución Nativa: 1920x1080 @ 60Hz</span>
              <button
                onClick={() => setOsdOpen(false)}
                className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold cursor-pointer"
              >
                Cerrar (Esc)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          ISO BUILDER MODAL (Ventoy Compatibility Recipe)
         ========================================================================= */}
      {showIsoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-3xl bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl overflow-hidden font-sans max-h-[90vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-neutral-800 text-neutral-100 border border-neutral-700">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Imagen ISO Compatible con Ventoy (Lapdock OS)
                  </h3>
                  <p className="text-[11px] text-neutral-400">
                    Transforma cualquier ordenador portátil o mini-PC en un Lapdock de arranque instantáneo en RAM.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowIsoModal(false)}
                className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-neutral-800 bg-neutral-950/60 px-6 pt-2 gap-2 overflow-x-auto text-xs font-mono">
              {ISO_CONFIG_FILES.map((file, idx) => (
                <button
                  key={file.filename}
                  onClick={() => setActiveIsoTab(idx)}
                  className={`py-2 px-3 rounded-t-lg transition-all cursor-pointer ${
                    activeIsoTab === idx
                      ? 'bg-neutral-900 text-neutral-100 border-t-2 border-neutral-200 font-semibold'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {file.filename}
                </button>
              ))}
            </div>

            {/* Script Display */}
            <div className="p-6 flex-1 overflow-y-auto font-mono text-xs text-neutral-300 bg-neutral-950 leading-relaxed">
              <pre className="select-text whitespace-pre-wrap">
                <code>{ISO_CONFIG_FILES[activeIsoTab].content}</code>
              </pre>
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-4 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between text-xs">
              <div className="text-neutral-400 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Compatible con Ventoy USB (BIOS y UEFI)</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(ISO_CONFIG_FILES[activeIsoTab].content);
                    setCopiedScript(true);
                    setTimeout(() => setCopiedScript(false), 2000);
                  }}
                  className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : null}
                  <span>{copiedScript ? 'Copiado' : 'Copiar Script'}</span>
                </button>
                <button
                  onClick={handleDownloadVentoyScript}
                  className="px-4 py-2 rounded-xl bg-neutral-100 hover:bg-white text-neutral-900 font-semibold transition-colors flex items-center gap-2 cursor-pointer shadow-lg shadow-white/5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar Archivo (.sh)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

