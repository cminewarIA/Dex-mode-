import React, { useState, useEffect } from 'react';
import { 
  Globe, 
  Folder, 
  Image as ImageIcon, 
  Settings, 
  Terminal, 
  Youtube, 
  X, 
  Minus, 
  Square, 
  Wifi, 
  BatteryCharging, 
  Volume2, 
  Grid, 
  Search, 
  RotateCcw,
  Sparkles,
  Play,
  Monitor
} from 'lucide-react';

interface DexDesktopProps {
  onDisconnect: () => void;
  onOpenOsd: () => void;
  deviceName?: string;
  isWifi?: boolean;
}

interface WindowState {
  id: string;
  title: string;
  icon: React.ReactNode;
  isOpen: boolean;
  isMinimized: boolean;
  content: React.ReactNode;
  width?: string;
  height?: string;
}

export const DexDesktop: React.FC<DexDesktopProps> = ({
  onDisconnect,
  onOpenOsd,
  deviceName = "Samsung Galaxy S24 Ultra",
  isWifi = false
}) => {
  const [activeWindow, setActiveWindow] = useState<string | null>('browser');
  const [appDrawerOpen, setAppDrawerOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    "Samsung DeX Core 5.1 (Linux aarch64)",
    "Display output: 1920x1080 @ 60.00Hz (Native FHD)",
    "UHID mouse & keyboard hardware bypass active.",
    "Audio routed to Lapdock Stereo 48kHz.",
    "Session secure. Type 'help' or 'status' for info."
  ]);
  const [terminalInput, setTerminalInput] = useState('');

  // Live digital clock
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setCurrentDate(now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim()) return;
    const cmd = terminalInput.trim().toLowerCase();
    const newLogs = [...terminalLogs, `$ ${terminalInput}`];

    if (cmd === 'help') {
      newLogs.push("Comandos disponibles: status, dex, scrcpy, clear, exit");
    } else if (cmd === 'status') {
      newLogs.push("● Enlace: USB 3.2 Gen 2 (DisplayPort 1.4 Alt Mode)");
      newLogs.push("● Latencia: ~8ms (Zero Lag UHID)");
      newLogs.push("● Carga activa: PD 45W Fast Charge");
    } else if (cmd === 'dex') {
      newLogs.push("Samsung DeX Desktop Launcher: Active");
      newLogs.push("Resolución virtual: 1920x1080 DPI=160");
    } else if (cmd === 'clear') {
      setTerminalLogs([]);
      setTerminalInput('');
      return;
    } else {
      newLogs.push(`Orden no reconocida: ${cmd}. Escribe 'help'.`);
    }

    setTerminalLogs(newLogs);
    setTerminalInput('');
  };

  // Windows registry
  const [windows, setWindows] = useState<Record<string, WindowState>>({
    browser: {
      id: 'browser',
      title: 'Samsung Internet',
      icon: <Globe className="w-4 h-4 text-blue-400" />,
      isOpen: true,
      isMinimized: false,
      content: (
        <div className="flex flex-col h-full bg-[#1e222b] text-neutral-200">
          {/* Browser Address Bar */}
          <div className="flex items-center gap-2 p-2.5 bg-[#171a22] border-b border-neutral-800 text-xs">
            <button className="p-1 rounded hover:bg-neutral-800 text-neutral-400">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <div className="flex-1 flex items-center bg-[#252a36] rounded-lg px-3 py-1.5 text-xs text-neutral-300 gap-2 border border-neutral-700/60">
              <Search className="w-3.5 h-3.5 text-neutral-400" />
              <span>https://samsung.com/dex/workspace</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
              1080p FHD
            </span>
          </div>
          {/* Browser Webpage Content */}
          <div className="flex-1 p-6 overflow-y-auto bg-gradient-to-b from-[#141720] to-[#0d1017]">
            <div className="max-w-xl mx-auto text-center pt-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold mb-4">
                <Sparkles className="w-3.5 h-3.5" /> Samsung DeX Desktop 2.5
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                Experiencia de PC Completa
              </h2>
              <p className="text-xs text-neutral-400 leading-relaxed mb-6">
                Tu teléfono está alimentando este monitor con interfaz de ventanas flotantes, compatibilidad con atajos de teclado de PC (Alt+Tab, Ctrl+C, Ctrl+V) y soporte multitarea real.
              </p>
              <div className="grid grid-cols-2 gap-3 text-left text-xs">
                <div className="p-3.5 rounded-xl bg-neutral-800/60 border border-neutral-700/60">
                  <div className="font-semibold text-neutral-200 mb-1">⚡ Sin Retardo</div>
                  <div className="text-[11px] text-neutral-400">Transmisión a 60 FPS con sincronización de ratón por hardware UHID.</div>
                </div>
                <div className="p-3.5 rounded-xl bg-neutral-800/60 border border-neutral-700/60">
                  <div className="font-semibold text-neutral-200 mb-1">📶 Modo Wi-Fi</div>
                  <div className="text-[11px] text-neutral-400">Puedes desconectar el cable y seguir usando DeX por red local.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    },
    terminal: {
      id: 'terminal',
      title: 'DeX Terminal (Console)',
      icon: <Terminal className="w-4 h-4 text-emerald-400" />,
      isOpen: false,
      isMinimized: false,
      content: (
        <div className="flex flex-col h-full bg-[#0a0d14] text-emerald-400 font-mono text-xs p-4 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-1.5 select-text">
            {terminalLogs.map((log, i) => (
              <div key={i} className="leading-relaxed">{log}</div>
            ))}
          </div>
          <form onSubmit={handleTerminalSubmit} className="flex items-center gap-2 pt-2 border-t border-neutral-800 mt-2">
            <span className="text-cyan-400 font-bold">$</span>
            <input
              type="text"
              value={terminalInput}
              onChange={(e) => setTerminalInput(e.target.value)}
              placeholder="escribe 'help'..."
              className="flex-1 bg-transparent text-neutral-200 outline-none font-mono text-xs"
              autoFocus
            />
          </form>
        </div>
      )
    },
    settings: {
      id: 'settings',
      title: 'Ajustes de Samsung DeX',
      icon: <Settings className="w-4 h-4 text-purple-400" />,
      isOpen: false,
      isMinimized: false,
      content: (
        <div className="p-6 bg-[#161a24] text-neutral-200 h-full overflow-y-auto text-xs space-y-5">
          <div>
            <h3 className="text-sm font-bold text-white mb-1">Pantalla y Rendimiento</h3>
            <p className="text-[11px] text-neutral-400">Configuración de salida de vídeo en el Lapdock</p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-800/80 border border-neutral-700/60">
              <div>
                <div className="font-semibold text-white">Resolución de Pantalla</div>
                <div className="text-[10px] text-neutral-400">1920 × 1080 (16:9 Panorámica)</div>
              </div>
              <span className="px-2.5 py-1 rounded bg-blue-500/20 text-blue-400 font-bold text-[10px]">NATIVA</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-800/80 border border-neutral-700/60">
              <div>
                <div className="font-semibold text-white">Salida de Audio</div>
                <div className="text-[10px] text-neutral-400">Altavoces estéreo del Lapdock</div>
              </div>
              <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">ACTIVO</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-800/80 border border-neutral-700/60">
              <div>
                <div className="font-semibold text-white">Teclado y Ratón Físicos</div>
                <div className="text-[10px] text-neutral-400">Modo UHID con soporte para acentos y rueda de scroll</div>
              </div>
              <span className="px-2.5 py-1 rounded bg-purple-500/20 text-purple-400 font-bold text-[10px]">CONECTADO</span>
            </div>
          </div>
        </div>
      )
    },
    gallery: {
      id: 'gallery',
      title: 'Galería de Fotos',
      icon: <ImageIcon className="w-4 h-4 text-amber-400" />,
      isOpen: false,
      isMinimized: false,
      content: (
        <div className="p-4 bg-[#141722] text-neutral-200 h-full overflow-y-auto">
          <div className="grid grid-cols-3 gap-3">
            {[
              { title: "Fondo DeX Abstracto", tag: "FHD 1080p", bg: "from-blue-600 to-indigo-900" },
              { title: "Captura de Pantalla", tag: "Escritorio", bg: "from-emerald-700 to-teal-900" },
              { title: "Fotografía Nocturna", tag: "Cámara Pro", bg: "from-purple-800 to-slate-900" },
              { title: "Diagrama Lapdock", tag: "Hardware", bg: "from-cyan-700 to-blue-950" },
              { title: "Wallpaper Nebula", tag: "4K UHD", bg: "from-rose-700 to-indigo-950" },
              { title: "Modo Oscuro OLED", tag: "Sistema", bg: "from-neutral-800 to-black" },
            ].map((img, idx) => (
              <div key={idx} className="group relative rounded-xl overflow-hidden border border-neutral-700/60 shadow-lg cursor-pointer">
                <div className={`h-24 bg-gradient-to-br ${img.bg} flex items-center justify-center`}>
                  <ImageIcon className="w-8 h-8 text-white/40 group-hover:scale-110 transition-transform" />
                </div>
                <div className="p-2 bg-neutral-900 text-[11px]">
                  <div className="font-semibold text-neutral-200 truncate">{img.title}</div>
                  <div className="text-[9px] text-neutral-400">{img.tag}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }
  });

  const toggleWindow = (id: string) => {
    setWindows(prev => {
      const win = prev[id];
      if (!win) return prev;
      if (!win.isOpen) {
        setActiveWindow(id);
        return { ...prev, [id]: { ...win, isOpen: true, isMinimized: false } };
      }
      if (win.isMinimized) {
        setActiveWindow(id);
        return { ...prev, [id]: { ...win, isMinimized: false } };
      }
      if (activeWindow === id) {
        return { ...prev, [id]: { ...win, isMinimized: true } };
      }
      setActiveWindow(id);
      return prev;
    });
    setAppDrawerOpen(false);
  };

  const closeWindow = (id: string) => {
    setWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], isOpen: false, isMinimized: false }
    }));
    if (activeWindow === id) setActiveWindow(null);
  };

  return (
    <div 
      className="relative w-full h-full overflow-hidden select-none flex flex-col font-sans"
      style={{
        background: 'radial-gradient(ellipse at center, #131b2e 0%, #090e1a 60%, #04060a 100%)'
      }}
    >
      {/* Dynamic Background Waves/Aura */}
      <div className="absolute inset-0 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:36px_36px] opacity-10 pointer-events-none" />

      {/* Desktop Workspace Icons Grid */}
      <div className="relative z-10 p-6 grid grid-flow-col grid-rows-6 gap-6 w-max">
        {[
          { id: 'browser', name: 'Internet', icon: <Globe className="w-6 h-6 text-blue-400" />, color: 'bg-blue-600/20 border-blue-500/30' },
          { id: 'gallery', name: 'Galería', icon: <ImageIcon className="w-6 h-6 text-amber-400" />, color: 'bg-amber-600/20 border-amber-500/30' },
          { id: 'settings', name: 'Ajustes', icon: <Settings className="w-6 h-6 text-purple-400" />, color: 'bg-purple-600/20 border-purple-500/30' },
          { id: 'terminal', name: 'Terminal', icon: <Terminal className="w-6 h-6 text-emerald-400" />, color: 'bg-emerald-600/20 border-emerald-500/30' },
        ].map((app) => (
          <button
            key={app.id}
            onDoubleClick={() => toggleWindow(app.id)}
            onClick={() => toggleWindow(app.id)}
            className="flex flex-col items-center gap-1.5 w-20 group cursor-pointer focus:outline-none"
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center backdrop-blur-md border ${app.color} group-hover:scale-105 transition-all shadow-xl shadow-black/40`}>
              {app.icon}
            </div>
            <span className="text-[11px] font-medium text-neutral-200 text-center tracking-wide group-hover:text-white drop-shadow-md">
              {app.name}
            </span>
          </button>
        ))}
      </div>

      {/* Floating Active Windows */}
      <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
        {(Object.values(windows) as WindowState[]).map((win) => {
          if (!win.isOpen || win.isMinimized) return null;
          const isActive = activeWindow === win.id;

          return (
            <div
              key={win.id}
              onClick={() => setActiveWindow(win.id)}
              className={`pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] max-w-2xl h-[70%] max-h-[500px] rounded-2xl overflow-hidden flex flex-col shadow-2xl transition-all ${
                isActive 
                  ? 'border border-blue-500/40 shadow-blue-500/10 ring-1 ring-blue-500/30 z-30' 
                  : 'border border-neutral-700/60 opacity-95 z-20'
              } bg-[#11151f]/95 backdrop-blur-xl`}
            >
              {/* Window Titlebar */}
              <div className="h-10 px-4 bg-[#181c28] border-b border-neutral-800 flex items-center justify-between select-none">
                <div className="flex items-center gap-2 text-xs font-semibold text-neutral-200">
                  {win.icon}
                  <span>{win.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleWindow(win.id); }}
                    className="w-6 h-6 rounded-md hover:bg-neutral-700/60 text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); closeWindow(win.id); }}
                    className="w-6 h-6 rounded-md hover:bg-red-500/80 text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Window Body */}
              <div className="flex-1 overflow-hidden">
                {win.content}
              </div>
            </div>
          );
        })}
      </div>

      {/* App Drawer Popup Menu */}
      {appDrawerOpen && (
        <div 
          onClick={() => setAppDrawerOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-14 left-4 w-80 p-5 rounded-2xl bg-[#141824]/95 border border-neutral-700/80 shadow-2xl backdrop-blur-2xl text-neutral-200 z-50 animate-in fade-in slide-in-from-bottom-3 duration-150"
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-blue-600/30 border border-blue-500/40 flex items-center justify-center">
                  <Grid className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <span className="text-xs font-bold text-white uppercase tracking-wider">Aplicaciones DeX</span>
              </div>
              <span className="text-[10px] text-neutral-400 font-mono">Galaxy Hub</span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { id: 'browser', name: 'Internet', icon: <Globe className="w-5 h-5 text-blue-400" /> },
                { id: 'gallery', name: 'Galería', icon: <ImageIcon className="w-5 h-5 text-amber-400" /> },
                { id: 'settings', name: 'Ajustes', icon: <Settings className="w-5 h-5 text-purple-400" /> },
                { id: 'terminal', name: 'Terminal', icon: <Terminal className="w-5 h-5 text-emerald-400" /> },
              ].map((app) => (
                <button
                  key={app.id}
                  onClick={() => toggleWindow(app.id)}
                  className="p-3 rounded-xl bg-neutral-800/40 hover:bg-neutral-800 border border-neutral-700/40 flex flex-col items-center gap-1.5 transition-all cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center">
                    {app.icon}
                  </div>
                  <span className="text-[10px] font-medium text-neutral-300">{app.name}</span>
                </button>
              ))}
            </div>

            <div className="pt-4 mt-4 border-t border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400">
              <button onClick={onOpenOsd} className="hover:text-white cursor-pointer transition-colors">
                ⚙️ OSD Pantalla
              </button>
              <button onClick={onDisconnect} className="text-red-400 hover:text-red-300 font-medium cursor-pointer transition-colors">
                Desconectar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          AUTHENTIC SAMSUNG DeX TASKBAR (Dock at bottom)
         ========================================================================= */}
      <footer className="relative z-30 mt-auto h-12 bg-[#0c101a]/95 border-t border-neutral-800/80 backdrop-blur-xl px-3 flex items-center justify-between text-neutral-200">
        {/* Left Side: Apps Button & Navigation Buttons */}
        <div className="flex items-center gap-2">
          {/* Apps Drawer Trigger */}
          <button
            onClick={() => setAppDrawerOpen(!appDrawerOpen)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              appDrawerOpen 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' 
                : 'bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300'
            }`}
          >
            <Grid className="w-4 h-4" />
            <span className="hidden sm:inline">Apps</span>
          </button>

          {/* Taskbar Open App Icons */}
          <div className="flex items-center gap-1 ml-2 border-l border-neutral-800 pl-2">
            {(Object.values(windows) as WindowState[]).map((win) => {
              if (!win.isOpen) return null;
              const isActive = activeWindow === win.id && !win.isMinimized;

              return (
                <button
                  key={win.id}
                  onClick={() => toggleWindow(win.id)}
                  className={`p-2 rounded-xl flex items-center gap-2 transition-all cursor-pointer text-xs ${
                    isActive 
                      ? 'bg-blue-600/30 border border-blue-500/50 text-white' 
                      : 'bg-neutral-800/50 hover:bg-neutral-800 text-neutral-400'
                  }`}
                  title={win.title}
                >
                  {win.icon}
                  <span className="hidden md:inline font-medium text-[11px] truncate max-w-[100px]">
                    {win.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Center: Subtle device indicator */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-neutral-400 font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{deviceName}</span>
          <span className="text-neutral-600">•</span>
          <span>{isWifi ? "📶 Wi-Fi 5GHz" : "🔌 DisplayPort USB-C"}</span>
        </div>

        {/* Right Side: System Tray (Volume, Wi-Fi, Battery, Clock, Notifications) */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-neutral-300 px-3 py-1 rounded-xl bg-neutral-900/80 border border-neutral-800">
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] text-neutral-400">98%</span>
            <div className="w-[1px] h-3 bg-neutral-700 mx-1" />
            <button 
              onClick={onOpenOsd}
              className="hover:text-blue-400 transition-colors cursor-pointer"
              title="Ajustes de pantalla OSD"
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Time & Date Pill */}
          <div className="flex flex-col items-end text-right">
            <span className="text-xs font-bold font-mono text-white tracking-wide leading-none">
              {currentTime}
            </span>
            <span className="text-[9px] text-neutral-400 leading-none mt-0.5">
              {currentDate}
            </span>
          </div>

          {/* Quick Disconnect button */}
          <button
            onClick={onDisconnect}
            className="px-2.5 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 text-[11px] font-semibold border border-red-500/30 transition-colors cursor-pointer"
            title="Desconectar dispositivo"
          >
            Salir
          </button>
        </div>
      </footer>
    </div>
  );
};
