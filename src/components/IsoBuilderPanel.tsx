import React, { useState } from 'react';
import { 
  Download, 
  Copy, 
  Check, 
  FileCode, 
  Terminal, 
  HardDrive, 
  ShieldCheck, 
  Layers, 
  ExternalLink,
  Info,
  Sparkles,
  Play
} from 'lucide-react';
import { ISO_CONFIG_FILES, IsoConfigFile } from '../data/isoScripts';

export const IsoBuilderPanel: React.FC = () => {
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [selectedDistro, setSelectedDistro] = useState<'debian' | 'ubuntu' | 'arch'>('debian');
  const [enableVAAPI, setEnableVAAPI] = useState(true);
  const [enableMiraclecast, setEnableMiraclecast] = useState(true);

  const currentFile: IsoConfigFile = ISO_CONFIG_FILES[activeFileIndex];

  const handleCopy = () => {
    navigator.clipboard.writeText(currentFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadCurrentFile = () => {
    const blob = new Blob([currentFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = currentFile.filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAllBundle = () => {
    // Generate a single executable package script with all files inlined
    const bundleScript = `#!/usr/bin/env bash
# ==============================================================================
# CastStation OS - Instalador y Creador de Archivos de Configuración
# ==============================================================================
set -e

echo "==> Desempaquetando archivos de CastStation OS..."

mkdir -p caststation-iso-workspace/{udev,systemd,bin}

${ISO_CONFIG_FILES.map((file) => `
cat << 'EOF' > "caststation-iso-workspace/${file.filename}"
${file.content}
EOF
echo "[+] Creado ${file.filename}"
`).join('\n')}

chmod +x caststation-iso-workspace/build-caststation-iso.sh
chmod +x caststation-iso-workspace/kiosk-manager.py

echo ""
echo "=================================================================="
echo " [OK] ¡Paquete generado en el directorio caststation-iso-workspace!"
echo " Para compilar la ISO en tu PC con Linux, ejecuta:"
echo "   cd caststation-iso-workspace"
echo "   sudo ./build-caststation-iso.sh"
echo "=================================================================="
`;

    const blob = new Blob([bundleScript], { type: 'application/x-sh;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'setup-caststation-builder.sh';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Ventoy Compatibility Summary */}
      <div className="bg-gradient-to-r from-blue-900/30 via-indigo-900/20 to-neutral-900 border border-blue-800/40 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-300 text-xs font-semibold">
                Ventoy 100% Compatible
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-semibold">
                UEFI & Legacy BIOS
              </span>
            </div>
            <h2 className="text-xl font-bold text-white">
              Generador de Imagen ISO Live para Ventoy
            </h2>
            <p className="text-xs text-neutral-300 mt-1 max-w-2xl leading-relaxed">
              Esta receta construye un sistema operativo ligero basado en Debian 12 con el compositor Wayland <code className="text-blue-300 font-mono">cage</code>, <code className="text-blue-300 font-mono">scrcpy</code> v2+, <code className="text-blue-300 font-mono">mpv</code> para UVC HDMI de Switch y las reglas de hotplug automático.
            </p>
          </div>

          <button
            onClick={handleDownloadAllBundle}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-all cursor-pointer shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>Descargar Paquete Completo (.sh)</span>
          </button>
        </div>
      </div>

      {/* ISO Configuration Options */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800">
          <label className="text-xs font-bold text-neutral-300 mb-2 block">
            Distribución Base del Kernel
          </label>
          <div className="space-y-2">
            <button
              onClick={() => setSelectedDistro('debian')}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                selectedDistro === 'debian'
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
              }`}
            >
              Debian 12 Bookworm (Recomendado - Máxima estabilidad)
            </button>
            <button
              onClick={() => setSelectedDistro('ubuntu')}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                selectedDistro === 'ubuntu'
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
              }`}
            >
              Ubuntu 24.04 LTS (Drivers gráficos Mesa más recientes)
            </button>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800">
          <label className="text-xs font-bold text-neutral-300 mb-2 block">
            Aceleración Gráfica y Decodificación
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
              <input
                type="checkbox"
                checked={enableVAAPI}
                onChange={(e) => setEnableVAAPI(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span>Mesa VA-API / VDPAU (Intel / AMD / Nvidia)</span>
            </label>
            <p className="text-[11px] text-neutral-500">
              Permite decodificar H.264/H.265 en 1080p60 con menos del 5% de uso de CPU.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800">
          <label className="text-xs font-bold text-neutral-300 mb-2 block">
            Módulos Inalámbricos (TuxDex)
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
              <input
                type="checkbox"
                checked={enableMiraclecast}
                onChange={(e) => setEnableMiraclecast(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span>Integrar stack MiracleCast (Wi-Fi Display WFD)</span>
            </label>
            <p className="text-[11px] text-neutral-500">
              Requiere tarjeta Wi-Fi en el PC con soporte de Wi-Fi Direct P2P.
            </p>
          </div>
        </div>
      </div>

      {/* Code Inspector Tabs & Content */}
      <div className="rounded-2xl bg-neutral-900 border border-neutral-800 overflow-hidden shadow-xl">
        {/* Tab Headers */}
        <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950/60 px-4 pt-3 overflow-x-auto">
          <div className="flex items-center gap-2">
            {ISO_CONFIG_FILES.map((file, idx) => (
              <button
                key={file.filename}
                onClick={() => setActiveFileIndex(idx)}
                className={`px-3 py-2 text-xs font-mono font-medium rounded-t-lg transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeFileIndex === idx
                    ? 'bg-neutral-900 text-blue-400 border-t-2 border-blue-500'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>{file.filename}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 pb-2">
            <button
              onClick={handleCopy}
              className="px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Copiar contenido"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>

            <button
              onClick={handleDownloadCurrentFile}
              className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Descargar archivo"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar</span>
            </button>
          </div>
        </div>

        {/* File Details */}
        <div className="px-6 py-3 bg-neutral-950/30 border-b border-neutral-800/60 flex items-center justify-between text-xs">
          <div className="text-neutral-400 flex items-center gap-2">
            <span className="font-mono text-neutral-300">{currentFile.path}</span>
            <span>•</span>
            <span>{currentFile.description}</span>
          </div>
          <span className="px-2 py-0.5 rounded bg-neutral-800 text-[11px] font-mono text-neutral-400 uppercase">
            {currentFile.language}
          </span>
        </div>

        {/* Code Box */}
        <div className="p-4 bg-neutral-950 font-mono text-xs text-neutral-300 overflow-x-auto max-h-[420px] leading-relaxed select-text">
          <pre>
            <code>{currentFile.content}</code>
          </pre>
        </div>
      </div>

      {/* How to Build & Ventoy Steps */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-xl bg-neutral-900/90 border border-neutral-800">
          <div className="flex items-center gap-2 mb-3">
            <Terminal className="w-4 h-4 text-blue-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Cómo Generar la ISO en 3 Pasos
            </h4>
          </div>
          <ol className="space-y-3 text-xs text-neutral-300">
            <li className="flex gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold shrink-0">1</span>
              <div>
                <strong>Descarga el script de construcción</strong> (<code className="text-neutral-200">setup-caststation-builder.sh</code>) o copia el contenido de <code className="text-neutral-200">build-caststation-iso.sh</code> en cualquier máquina con Debian, Ubuntu o WSL2.
              </div>
            </li>
            <li className="flex gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold shrink-0">2</span>
              <div>
                <strong>Ejecuta el script con privilegios root:</strong>
                <div className="mt-1 p-2 rounded bg-black/60 font-mono text-[11px] text-emerald-400">
                  sudo bash build-caststation-iso.sh
                </div>
              </div>
            </li>
            <li className="flex gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold shrink-0">3</span>
              <div>
                El script generará el archivo <strong className="text-white">CastStation-OS-v1.0-x86_64.iso</strong> en <code className="text-neutral-200">/var/tmp/</code> listo para Ventoy.
              </div>
            </li>
          </ol>
        </div>

        <div className="p-5 rounded-xl bg-neutral-900/90 border border-neutral-800">
          <div className="flex items-center gap-2 mb-3">
            <HardDrive className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Cómo Usarlo con Ventoy
            </h4>
          </div>
          <ul className="space-y-2.5 text-xs text-neutral-300">
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Copia directa:</strong> Copia el archivo <code className="text-neutral-200 font-mono">.iso</code> directamente a tu memoria USB con Ventoy. No requiere quemado ni formateo.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Arranque en RAM:</strong> Al seleccionar CastStation OS en el menú Ventoy, el sistema se carga completamente en memoria RAM, dejando los puertos USB 100% libres para conectar tus dispositivos.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Persistencia (Opcional):</strong> Si deseas guardar configuraciones o claves ADB autorizadas, crea un archivo de persistencia con <code className="text-neutral-200 font-mono">CreatePersistentImg.sh</code> de Ventoy.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
