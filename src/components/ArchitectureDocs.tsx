import React from 'react';
import { 
  Tv, 
  Cpu, 
  Layers, 
  Zap, 
  Workflow, 
  ShieldCheck, 
  Gamepad2, 
  Smartphone, 
  Terminal,
  Activity
} from 'lucide-react';

export const ArchitectureDocs: React.FC = () => {
  return (
    <div className="space-y-8">
      {/* Intro Header */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <Workflow className="w-5 h-5 text-blue-500" />
          Arquitectura Técnica del Sistema Kiosk
        </h2>
        <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed max-w-3xl">
          Para lograr una estación de proyección que inicie instantáneamente en pantalla de espera y detecte dispositivos en tiempo real sin latencia ni interferencia del escritorio, CastStation OS prescinde de entornos pesados como GNOME o KDE y utiliza una pila de software minimalista basada en <strong className="text-white">Wayland Cage Kiosk</strong> y disparadores nativos del kernel Linux.
        </p>
      </div>

      {/* Pipeline Diagram Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Samsung DeX & Android Flow */}
        <div className="p-5 rounded-2xl bg-neutral-900/90 border border-neutral-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Flujo Samsung DeX & Android</h3>
                <span className="text-[11px] text-neutral-400">Protocolo USB ADB + Scrcpy UHID</span>
              </div>
            </div>

            <div className="space-y-3 relative pl-6 border-l-2 border-blue-500/30 text-xs">
              <div className="relative">
                <span className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-neutral-900" />
                <strong className="text-white">1. Conexión Física USB-C:</strong>
                <p className="text-neutral-400 text-[11px] mt-0.5">
                  El smartphone se conecta al puerto USB del anfitrión. El bus USB anuncia el fabricante (ID 04e8 para Samsung).
                </p>
              </div>

              <div className="relative">
                <span className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-neutral-900" />
                <strong className="text-white">2. Disparador del Kernel (udev):</strong>
                <p className="text-neutral-400 text-[11px] mt-0.5">
                  La regla <code className="text-blue-300 font-mono">99-caststation.rules</code> captura el evento e invoca el demonio orquestador en milisegundos.
                </p>
              </div>

              <div className="relative">
                <span className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-neutral-900" />
                <strong className="text-white">3. Lanzamiento Scrcpy v2+:</strong>
                <p className="text-neutral-400 text-[11px] mt-0.5">
                  Se inicializa Scrcpy con decodificación por hardware H.265, pantalla del teléfono apagada, y reenvío de ratón/teclado por emulación de hardware UHID.
                </p>
              </div>

              <div className="relative">
                <span className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-neutral-900" />
                <strong className="text-white">4. Modo Escritorio DeX a 60 FPS:</strong>
                <p className="text-neutral-400 text-[11px] mt-0.5">
                  La interfaz de DeX llena la pantalla del monitor. Audio enrutado a PipeWire sin desincronización.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-3 border-t border-neutral-800 text-[11px] text-neutral-400 flex justify-between">
            <span>Latencia: <strong>&lt; 25 ms</strong></span>
            <span>Uso de CPU: <strong>~ 3% (VA-API)</strong></span>
          </div>
        </div>

        {/* Nintendo Switch Flow */}
        <div className="p-5 rounded-2xl bg-neutral-900/90 border border-neutral-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-red-500/10 text-red-400">
                <Gamepad2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Flujo Nintendo Switch (Dock)</h3>
                <span className="text-[11px] text-neutral-400">Captura Directa UVC 1080p60</span>
              </div>
            </div>

            <div className="space-y-3 relative pl-6 border-l-2 border-red-500/30 text-xs">
              <div className="relative">
                <span className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-red-500 ring-4 ring-neutral-900" />
                <strong className="text-white">1. Salida HDMI del Dock:</strong>
                <p className="text-neutral-400 text-[11px] mt-0.5">
                  La consola Switch en su base envía señal HDMI 1080p60 a una capturadora USB UVC (como MS2109 o Cam Link).
                </p>
              </div>

              <div className="relative">
                <span className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-red-500 ring-4 ring-neutral-900" />
                <strong className="text-white">2. Registro Video4Linux (/dev/video0):</strong>
                <p className="text-neutral-400 text-[11px] mt-0.5">
                  El driver UVC genérico estándar del kernel de Linux reconoce el flujo de vídeo sin necesidad de instalar drivers propietarios.
                </p>
              </div>

              <div className="relative">
                <span className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-red-500 ring-4 ring-neutral-900" />
                <strong className="text-white">3. Pipeline MPV Zero-Buffer:</strong>
                <p className="text-neutral-400 text-[11px] mt-0.5">
                  Se ejecuta MPV configurado en <code className="text-red-300 font-mono">--profile=low-latency --untimed</code> en pantalla completa nativa bajo Wayland.
                </p>
              </div>

              <div className="relative">
                <span className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-neutral-900" />
                <strong className="text-white">4. Passthrough de Audio Directo:</strong>
                <p className="text-neutral-400 text-[11px] mt-0.5">
                  El audio de los juegos se reproduce en los altavoces de la estación de trabajo con retraso inferior a 30 milisegundos.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-3 border-t border-neutral-800 text-[11px] text-neutral-400 flex justify-between">
            <span>Latencia: <strong>&lt; 30 ms</strong></span>
            <span>Resolución: <strong>1080p 60 Hz</strong></span>
          </div>
        </div>
      </div>

      {/* Key Architectural Decisions Comparison Table */}
      <div className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800">
        <h3 className="text-sm font-bold text-white mb-4">
          Comparativa de Decisiones Técnicas en CastStation OS
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-400">
                <th className="pb-3 font-semibold">Componente</th>
                <th className="pb-3 font-semibold">Elección en CastStation OS</th>
                <th className="pb-3 font-semibold">Alternativa Tradicional</th>
                <th className="pb-3 font-semibold">Ventaja Crítica</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
              <tr>
                <td className="py-3 font-medium text-white">Compositor Gráfico</td>
                <td className="py-3 font-mono text-blue-400">cage (Wayland Kiosk)</td>
                <td className="py-3 text-neutral-400">GNOME / KDE / XFCE</td>
                <td className="py-3 text-emerald-400">Sin barras de tareas ni menús; la proyección abarca el 100% de la pantalla sin cortes.</td>
              </tr>
              <tr>
                <td className="py-3 font-medium text-white">Servidor de Audio</td>
                <td className="py-3 font-mono text-blue-400">PipeWire + WirePlumber</td>
                <td className="py-3 text-neutral-400">PulseAudio clásico</td>
                <td className="py-3 text-emerald-400">Latencia en tiempo real para videojuegos y respuesta instantánea al conectar auriculares.</td>
              </tr>
              <tr>
                <td className="py-3 font-medium text-white">Protocolo Móvil</td>
                <td className="py-3 font-mono text-blue-400">Scrcpy v2.4 + UHID</td>
                <td className="py-3 text-neutral-400">MiracleCast inalámbrico</td>
                <td className="py-3 text-emerald-400">60 FPS estables sin saturación de banda Wi-Fi ni artefactos de compresión.</td>
              </tr>
              <tr>
                <td className="py-3 font-medium text-white">Medio de Arranque</td>
                <td className="py-3 font-mono text-blue-400">Live RAM ISO con Ventoy</td>
                <td className="py-3 text-neutral-400">Instalación en SSD dedicada</td>
                <td className="py-3 text-emerald-400">Portátil; cualquier PC o portátil se transforma en estación de proyección sin modificar su disco duro.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
