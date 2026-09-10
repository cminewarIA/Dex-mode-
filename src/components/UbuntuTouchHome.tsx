import React, { useState, useEffect } from 'react';
import { Terminal, Globe, Folder, Settings, Wifi, BatteryCharging, Volume2, X } from 'lucide-react';

interface UbuntuTouchHomeProps {
  onDisconnect: () => void;
  onOpenOsd: () => void;
}

export const UbuntuTouchHome: React.FC<UbuntuTouchHomeProps> = ({
  onDisconnect,
  onOpenOsd
}) => {
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => {
      setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div 
      className="relative w-full h-full flex overflow-hidden select-none font-sans text-white"
      style={{
        background: 'linear-gradient(135deg, #77216F 0%, #5E2750 40%, #2C001E 100%)'
      }}
    >
      {/* Left Lomiri Dock */}
      <aside className="w-16 bg-black/40 backdrop-blur-xl border-r border-white/10 flex flex-col items-center py-4 gap-4 z-20">
        <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center font-bold text-white shadow-lg mb-2">
          UB
        </div>
        {[
          { name: 'Navegador Morph', icon: <Globe className="w-5 h-5 text-neutral-200" /> },
          { name: 'Archivos', icon: <Folder className="w-5 h-5 text-neutral-200" /> },
          { name: 'Terminal Lomiri', icon: <Terminal className="w-5 h-5 text-neutral-200" /> },
          { name: 'Ajustes del Sistema', icon: <Settings className="w-5 h-5 text-neutral-200" /> },
        ].map((item, idx) => (
          <button
            key={idx}
            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all cursor-pointer group"
            title={item.name}
          >
            {item.icon}
          </button>
        ))}

        <div className="mt-auto">
          <button
            onClick={onDisconnect}
            className="w-10 h-10 rounded-xl bg-red-600/30 hover:bg-red-600/50 flex items-center justify-center text-red-300 transition-colors cursor-pointer"
            title="Desconectar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* Main Screen */}
      <div className="flex-1 flex flex-col justify-between">
        {/* Top Indicators Bar */}
        <header className="h-10 px-6 bg-black/30 backdrop-blur-md flex items-center justify-between text-xs text-neutral-200 border-b border-white/5">
          <div className="font-semibold tracking-wide">Ubuntu Touch • Lomiri Convergent Mode</div>
          <div className="flex items-center gap-4 font-mono">
            <span className="flex items-center gap-1.5"><Wifi className="w-3.5 h-3.5" /> Conectado</span>
            <span className="flex items-center gap-1.5"><BatteryCharging className="w-3.5 h-3.5" /> 88%</span>
            <button onClick={onOpenOsd} className="hover:text-orange-400 cursor-pointer"><Volume2 className="w-3.5 h-3.5" /></button>
            <span className="font-bold text-white">{time}</span>
          </div>
        </header>

        {/* Center Canvas */}
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md w-full p-6 rounded-2xl bg-black/50 border border-white/10 backdrop-blur-xl text-center shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-2">
              Modo Convergencia Activo
            </h2>
            <p className="text-xs text-neutral-300 leading-relaxed mb-6">
              El móvil con Ubuntu Touch está proyectando la sesión gráfica de Mir mediante Wayland nativo. Teclado y ratón mapeados para entorno de escritorio.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={onOpenOsd}
                className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Ajustes OSD
              </button>
              <button
                onClick={onDisconnect}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Desconectar
              </button>
            </div>
          </div>
        </main>

        <footer className="h-8 px-6 bg-black/30 text-[11px] text-neutral-400 flex items-center justify-between">
          <span>Pantalla Lapdock: 1920×1080 60Hz</span>
          <span>Mir Screencast Client</span>
        </footer>
      </div>
    </div>
  );
};
