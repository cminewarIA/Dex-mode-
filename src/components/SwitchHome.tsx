import React, { useState } from 'react';
import { Gamepad2, Tv, BatteryCharging, Wifi, Play, Volume2, X, RotateCcw } from 'lucide-react';

interface SwitchHomeProps {
  onDisconnect: () => void;
  onOpenOsd: () => void;
}

interface GameTile {
  id: string;
  title: string;
  publisher: string;
  bgGradient: string;
  bannerImg?: string;
  fps: number;
}

export const SwitchHome: React.FC<SwitchHomeProps> = ({
  onDisconnect,
  onOpenOsd
}) => {
  const [selectedGame, setSelectedGame] = useState<number>(0);
  const [activePlay, setActivePlay] = useState<GameTile | null>(null);

  const games: GameTile[] = [
    {
      id: 'zelda',
      title: 'The Legend of Zelda: Tears of the Kingdom',
      publisher: 'Nintendo',
      bgGradient: 'from-amber-600 via-emerald-800 to-slate-950',
      fps: 60
    },
    {
      id: 'mario',
      title: 'Super Mario Bros. Wonder',
      publisher: 'Nintendo',
      bgGradient: 'from-red-600 via-orange-600 to-indigo-950',
      fps: 60
    },
    {
      id: 'metroid',
      title: 'Metroid Prime Remastered',
      publisher: 'Nintendo',
      bgGradient: 'from-cyan-600 via-blue-900 to-black',
      fps: 60
    },
    {
      id: 'kart',
      title: 'Mario Kart 8 Deluxe',
      publisher: 'Nintendo',
      bgGradient: 'from-blue-600 via-purple-700 to-neutral-950',
      fps: 60
    },
    {
      id: 'smash',
      title: 'Super Smash Bros. Ultimate',
      publisher: 'Nintendo',
      bgGradient: 'from-rose-700 via-amber-800 to-neutral-950',
      fps: 60
    }
  ];

  return (
    <div className="relative w-full h-full bg-[#171a21] text-white flex flex-col justify-between overflow-hidden select-none font-sans">
      {/* Top Console Bar */}
      <header className="h-16 px-8 flex items-center justify-between border-b border-white/5 bg-[#12141a]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-red-500 to-blue-500 flex items-center justify-center p-0.5 shadow-md">
            <div className="w-full h-full rounded-full bg-[#12141a] flex items-center justify-center text-xs font-bold">
              User
            </div>
          </div>
          <div>
            <span className="text-sm font-semibold tracking-wide">Nintendo Switch</span>
            <span className="ml-2 text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
              TV MODE 1080p60
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-neutral-400 font-mono">
          <span className="flex items-center gap-1.5">
            <Wifi className="w-4 h-4 text-emerald-400" /> Wi-Fi
          </span>
          <span className="flex items-center gap-1.5">
            <BatteryCharging className="w-4 h-4 text-emerald-400" /> 100%
          </span>
          <button 
            onClick={onOpenOsd}
            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer"
            title="Ajustes de pantalla OSD"
          >
            <Volume2 className="w-4 h-4" />
          </button>
          <button
            onClick={onDisconnect}
            className="px-3 py-1 rounded-lg bg-red-600/30 hover:bg-red-600/50 text-red-300 text-xs font-semibold border border-red-500/40 transition-colors cursor-pointer"
          >
            Desconectar
          </button>
        </div>
      </header>

      {/* Main Game Shelf */}
      <main className="flex-1 flex flex-col justify-center px-12 relative z-10">
        {activePlay ? (
          <div className="w-full max-w-4xl mx-auto rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-black relative aspect-video flex flex-col items-center justify-center text-center p-8">
            <div className={`absolute inset-0 bg-gradient-to-br ${activePlay.bgGradient} opacity-60`} />
            <div className="relative z-10 space-y-4">
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs font-bold tracking-widest uppercase">
                HDMI Directo a 60 FPS • Sin Lag
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-white drop-shadow-lg">
                {activePlay.title}
              </h2>
              <p className="text-xs text-neutral-300 max-w-md mx-auto">
                Señal HDMI recibida mediante capturadora UVC a través de mpv / DRM directo. Presiona el botón para volver al menú de juegos.
              </p>
              <div className="pt-4 flex justify-center gap-4">
                <button
                  onClick={() => setActivePlay(null)}
                  className="px-6 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-semibold text-xs transition-colors flex items-center gap-2 cursor-pointer backdrop-blur-md"
                >
                  <RotateCcw className="w-4 h-4" /> Volver al menú
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white mb-1">
                {games[selectedGame].title}
              </h1>
              <p className="text-xs text-neutral-400">{games[selectedGame].publisher}</p>
            </div>

            {/* Horizontal Game Carousel */}
            <div className="flex gap-4 overflow-x-auto pb-4 pt-2 no-scrollbar">
              {games.map((g, idx) => {
                const isSelected = selectedGame === idx;
                return (
                  <button
                    key={g.id}
                    onClick={() => { setSelectedGame(idx); }}
                    onDoubleClick={() => setActivePlay(g)}
                    className={`group relative flex-shrink-0 w-48 h-48 rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer text-left ${
                      isSelected
                        ? 'ring-4 ring-cyan-400 scale-105 shadow-2xl shadow-cyan-500/30'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div className={`w-full h-full bg-gradient-to-br ${g.bgGradient} p-4 flex flex-col justify-between`}>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-black/40 text-white/80 w-max backdrop-blur-xs">
                        60 FPS
                      </span>
                      <div>
                        <h3 className="font-bold text-sm text-white drop-shadow-md leading-tight mb-1">
                          {g.title}
                        </h3>
                        <span className="text-[10px] text-white/70">{g.publisher}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Controller Action Prompts */}
            <div className="flex items-center gap-6 pt-4 text-xs text-neutral-400">
              <button 
                onClick={() => setActivePlay(games[selectedGame])}
                className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer shadow-lg shadow-cyan-500/20"
              >
                <Play className="w-3.5 h-3.5 fill-current" /> Iniciar Juego (A)
              </button>
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-neutral-800 text-white font-bold flex items-center justify-center text-[10px]">
                  +
                </span>
                Opciones
              </span>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Footer Actions */}
      <footer className="h-16 px-8 border-t border-white/5 bg-[#12141a] flex items-center justify-between text-xs text-neutral-400">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-neutral-300" />
            <span>Mando Nintendo Switch / Pro Controller detectado</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={onOpenOsd}
            className="hover:text-white transition-colors cursor-pointer"
          >
            ⚙️ OSD de Pantalla
          </button>
        </div>
      </footer>
    </div>
  );
};
