import { DeviceProfile } from '../types';

export const DEVICE_PROFILES: DeviceProfile[] = [
  {
    id: 'samsung-dex',
    name: 'Samsung DeX',
    subtitle: 'Galaxy S/Note/Z Fold Desktop Mode',
    badge: 'Samsung DeX',
    connectionMethod: 'USB-C (ADB/Scrcpy)',
    description: 'Proyecta el entorno de escritorio Samsung DeX nativo del smartphone con soporte completo de teclado, ratón y audio de baja latencia.',
    detectionRule: 'ATTRS{idVendor}=="04e8" (Samsung Electronics Co., Ltd.)',
    launchCommand: 'scrcpy --stay-awake --power-off-on-close --video-codec=h265 --max-fps=60 -f --audio-codec=opus --turn-screen-off --keyboard=uhid --mouse=uhid',
    optimalResolution: '1920x1080 / 2560x1440',
    targetFramerate: '60 FPS',
    latencyExpectation: '< 25 ms (Cable USB 3.2)',
    icon: 'Smartphone',
    color: 'from-blue-600 to-indigo-700',
    accentHex: '#2563eb',
    features: [
      'Modo escritorio multiventana Samsung nativo',
      'Reenvío de teclado y ratón por protocolo USB HID (UHID)',
      'Audio estéreo sincronizado mediante PipeWire',
      'Pantalla del teléfono apagada para reducir calentamiento'
    ]
  },
  {
    id: 'android-wireless',
    name: 'Android / DeX Wi-Fi',
    subtitle: 'Conexión inalámbrica ADB TCP/IP',
    badge: 'Inalámbrico (Wi-Fi)',
    connectionMethod: 'Wi-Fi (ADB TCP/IP)',
    description: 'Proyecta Samsung DeX o la pantalla de tu móvil Android sin cables a través de la red Wi-Fi local mediante ADB sobre TCP/IP.',
    detectionRule: 'adb connect <IP>:5555 (Detección automática de sockets ADB)',
    launchCommand: 'scrcpy --tcpip --video-codec=h265 --max-fps=60 -f --turn-screen-off --keyboard=uhid --mouse=uhid',
    optimalResolution: '1920x1080',
    targetFramerate: '60 FPS',
    latencyExpectation: '< 45 ms (Wi-Fi 5 GHz)',
    icon: 'Wifi',
    color: 'from-violet-600 to-purple-700',
    accentHex: '#7c3aed',
    features: [
      'Sin necesidad de cables USB una vez sincronizado',
      'Compatibilidad con Samsung DeX inalámbrico y Android estándar',
      'Códec H.265/HEVC para máxima eficiencia de ancho de banda',
      'Reconexión automática por señal de red'
    ]
  },
  {
    id: 'android-scrcpy',
    name: 'Android Universal',
    subtitle: 'Terminales Xiaomi, Pixel, Motorola, OnePlus',
    badge: 'Universal ADB',
    connectionMethod: 'USB-C (ADB/Scrcpy)',
    description: 'Proyección automática para cualquier dispositivo Android con depuración USB habilitada (incluye Modo Escritorio Android 10+ / Freeform).',
    detectionRule: 'SUBSYSTEM=="usb", ENV{DEVTYPE}=="usb_device", TAG+="android"',
    launchCommand: 'scrcpy --stay-awake --video-codec=h264 --max-size=1920 --max-fps=60 -f --forward-all-clicks',
    optimalResolution: '1080x2400 / 1920x1080',
    targetFramerate: '60 FPS',
    latencyExpectation: '< 35 ms',
    icon: 'Tablet',
    color: 'from-emerald-600 to-teal-700',
    accentHex: '#059669',
    features: [
      'Detección automática multimarca vía reglas udev globales',
      'Activación de Modo Escritorio Android secundario si es compatible',
      'Portapapeles bidireccional integrado',
      'Reanudación automática ante desconexiones accidentales'
    ]
  },
  {
    id: 'ubuntu-touch',
    name: 'Ubuntu Touch / Linux Mobile',
    subtitle: 'PinePhone, Volla, Fairphone con Convergence',
    badge: 'Convergence Mode',
    connectionMethod: 'Wayland / Network',
    description: 'Detecta terminales móviles con Ubuntu Touch / Mobian y activa el modo Convergencia para desplegar el escritorio Lomiri.',
    detectionRule: 'SUBSYSTEM=="net", ACTION=="add", KERNEL=="usb[0-9]*"',
    launchCommand: 'wayvnc-client 10.15.19.82:5900 --fullscreen || scrcpy -d -f',
    optimalResolution: '1920x1080',
    targetFramerate: '60 FPS',
    latencyExpectation: '< 20 ms',
    icon: 'Terminal',
    color: 'from-orange-600 to-amber-700',
    accentHex: '#ea580c',
    features: [
      'Escritorio Lomiri Convergence en pantalla completa',
      'Enrutamiento de red local a través de USB Gadget (RNDIS/CDC-Ethernet)',
      'Soporte directo de aplicaciones Linux nativas y web apps',
      'Aceleración Wayland nativa con cage compositor'
    ]
  }
];
