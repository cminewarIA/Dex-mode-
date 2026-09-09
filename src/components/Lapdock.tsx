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
  Monitor
} from 'lucide-react';
import { ISO_CONFIG_FILES } from '../data/isoScripts';

interface LapdockProps {
  onFullscreenToggle?: () => void;
}

export const Lapdock: React.FC<LapdockProps> = () => {
  const [isConnected, setIsConnected] = useState(false);
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
      if (e.key === 'Escape' && osdOpen) {
        setOsdOpen(false);
      }
      if (e.key === 'F2' || (e.altKey && e.key.toLowerCase() === 'o')) {
        setOsdOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [osdOpen]);

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
      setIsConnected(true);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 50);
    } catch (err) {
      console.warn('Media connection error or fallback:', err);
      // Fallback: If no camera/capture permission or cancelled, connect in virtual Lapdock passthrough mode
      setIsConnected(true);
    }
  };

  const disconnectDevice = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setIsConnected(false);
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
      className="relative w-screen h-screen overflow-hidden bg-[#0a0c10] text-neutral-200 select-none flex flex-col font-sans"
      style={{
        filter: `brightness(${brightness}%)`
      }}
    >
      {/* =========================================================================
          STATE 1: REAL OR ACTIVE DEVICE PROJECTION (Full-bleed screen, no chrome)
         ========================================================================= */}
      {isConnected ? (
        <div className="relative w-full h-full bg-black flex items-center justify-center">
          {/* Incoming Video Feed */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isMuted}
            className="w-full h-full object-contain bg-black"
          />

          {/* If video stream isn't active (e.g. fallback direct monitor feed) */}
          {!mediaStreamRef.current && (
            <div className="w-full h-full bg-[#080b12] flex flex-col justify-between p-6 relative">
              {/* Samsung DeX / Desktop Signal active simulation */}
              <div className="flex items-center justify-between text-xs text-neutral-400 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-semibold text-white tracking-wide">Señal de Entrada Activa (DisplayPort / HDMI)</span>
                </div>
                <div className="flex items-center gap-4 font-mono text-[11px]">
                  <span>1920x1080 @ 60Hz</span>
                  <span>Audio: Hi-Fi Stereo 48kHz</span>
                  <span>PD: 45W ⚡</span>
                </div>
              </div>

              <div className="my-auto max-w-xl mx-auto text-center p-8 rounded-2xl bg-neutral-900/70 border border-white/10 backdrop-blur-md">
                <div className="w-14 h-14 rounded-2xl bg-neutral-800 text-neutral-100 border border-neutral-700 flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <Tv className="w-7 h-7" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">
                  Dispositivo Conectado
                </h2>
                <p className="text-xs text-neutral-300 mb-6 leading-relaxed">
                  La señal externa está ocupando la pantalla completa de forma nativa a 60 FPS sin barras de navegación ni menús de escritorio.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={disconnectDevice}
                    className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition-colors cursor-pointer"
                  >
                    Desconectar Cable
                  </button>
                  <button
                    onClick={() => setOsdOpen(true)}
                    className="px-4 py-2 rounded-xl bg-neutral-100 hover:bg-white text-neutral-900 text-xs font-semibold shadow-md transition-colors cursor-pointer"
                  >
                    Abrir Menú OSD (F2)
                  </button>
                </div>
              </div>

              <div className="h-10 px-4 rounded-xl bg-black/50 border border-white/10 flex items-center justify-between text-xs text-neutral-400">
                <span>Lapdock OS • Entrada {inputSource.toUpperCase()}</span>
                <span>Pulsa F2 o el icono OSD para controles de pantalla</span>
              </div>
            </div>
          )}

          {/* Floating Lapdock OSD toggle handle */}
          <div className="absolute bottom-4 right-4 z-40 flex items-center gap-2 opacity-30 hover:opacity-100 transition-opacity">
            <button
              onClick={() => setOsdOpen(!osdOpen)}
              className="p-2 rounded-xl bg-neutral-900/90 text-neutral-300 border border-neutral-700 hover:bg-neutral-800 transition-colors shadow-2xl"
              title="Lapdock OSD (Ajustes de pantalla)"
            >
              <Sliders className="w-4 h-4" />
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-neutral-900/90 text-neutral-300 border border-neutral-700 hover:bg-neutral-800 transition-colors shadow-2xl"
              title="Pantalla Completa"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
            <button
              onClick={disconnectDevice}
              className="px-3 py-1.5 rounded-xl bg-red-600/30 text-red-300 border border-red-500/40 hover:bg-red-600/50 text-xs font-medium transition-colors shadow-2xl"
              title="Desconectar señal"
            >
              Desconectar
            </button>
          </div>
        </div>
      ) : (
        /* =========================================================================
            STATE 2: LAPDOCK STANDBY SCREEN (Clean Hardware Standby Screen)
           ========================================================================= */
        <div className="relative w-full h-full flex flex-col justify-between p-8 sm:p-12 overflow-hidden bg-gradient-to-b from-[#11141a] via-[#0c0e13] to-[#07080a]">
          
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 bg-[radial-gradient(#202530_1px,transparent_1px)] [background-size:28px_28px] opacity-25 pointer-events-none" />

          {/* Top Status Bar (Lapdock Firmware Bar) */}
          <header className="relative z-20 flex items-center justify-between text-xs text-neutral-400 font-mono border-b border-neutral-800/60 pb-4">
            {/* Lapdock brand mark */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-white font-medium text-base tracking-wide">
                <div className="w-6 h-6 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center">
                  <Monitor className="w-3.5 h-3.5 text-neutral-200" />
                </div>
                <span>Lapdock <span className="text-neutral-500 font-light">OS</span></span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700/60">
                Model: LD-FHD1
              </span>
            </div>

            {/* Hardware Status: Battery, Charging, Audio */}
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-1.5 text-neutral-300">
                <BatteryCharging className="w-4 h-4 text-emerald-400" />
                <span>{batteryLevel}%</span>
                <span className="text-neutral-500 text-[11px]">(46.5 Wh)</span>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 text-neutral-400">
                <span className="text-neutral-300 font-medium">Stereo</span>
                <span className="text-[10px] tracking-wider uppercase text-neutral-500">48kHz</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOsdOpen(!osdOpen)}
                  className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer"
                  title="Abrir Menú OSD (F2)"
                >
                  <Sliders className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer"
                  title="Pantalla Completa"
                >
                  {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </header>

          {/* Central Standby Screen (Minimalist Lapdock display) */}
          <main className="relative z-20 my-auto max-w-2xl mx-auto text-center flex flex-col items-center">
            {/* Geometric hardware emblem */}
            <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-700/80 flex items-center justify-center mb-6 shadow-2xl shadow-black/60">
              <Monitor className="w-8 h-8 text-neutral-300" />
            </div>

            <h1 className="text-3xl sm:text-4xl font-light tracking-tight text-white mb-3">
              Listo para conectar
            </h1>
            <p className="text-sm text-neutral-400 max-w-md mb-8 leading-relaxed">
              Conecta un smartphone <strong className="text-neutral-200 font-medium">Samsung Galaxy (DeX)</strong>, una <strong className="text-neutral-200 font-medium">Nintendo Switch</strong> o cualquier dispositivo con salida USB-C DisplayPort / micro-HDMI.
            </p>

            {/* Direct Hardware Input Detection Trigger */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-md">
              <button
                onClick={connectRealDevice}
                className="w-full py-3.5 px-6 rounded-xl bg-neutral-100 hover:bg-white text-neutral-900 font-semibold text-xs tracking-wide uppercase transition-all shadow-xl shadow-white/5 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Usb className="w-4 h-4 text-neutral-900" />
                <span>Detectar Señal de Entrada</span>
              </button>
            </div>

            {/* Ports Specification Indicator */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs font-mono text-neutral-500">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Puerto USB-C 1 (DP Alt Mode + PD 45W)
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Puerto micro-HDMI (UVC 1080p60)
              </span>
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
                      {src === 'usbc-2' && 'USB-C 2'}
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
