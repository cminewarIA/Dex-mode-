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
    id: 'nintendo-switch',
    name: 'Nintendo Switch',
    subtitle: 'Consola Híbrida (Modo TV / Dock)',
    badge: 'HDMI / UVC Capture',
    connectionMethod: 'HDMI / UVC Capture',
    description: 'Detecta la señal de vídeo transmitida desde el Dock de Nintendo Switch mediante capturadora HDMI UVC de latencia ultrabaja.',
    detectionRule: 'SUBSYSTEM=="video4linux", ATTR{name}=="*HDMI*|*Capture*|*MS2109*|*Cam Link*"',
    launchCommand: 'mpv av://v4l2:/dev/video0 --profile=low-latency --untimed --video-sync=display-resample --fullscreen --demuxer-lavf-format=v4l2 --demuxer-lavf-o-set=input_format=mjpeg',
    optimalResolution: '1920x1080 (Docked)',
    targetFramerate: '60 FPS',
    latencyExpectation: '< 30 ms (Hardware UVC)',
    icon: 'Gamepad2',
    color: 'from-red-600 to-rose-700',
    accentHex: '#dc2626',
    features: [
      'Proyección a pantalla completa sin barras de escritorio',
      'Passthrough directo de audio PCM a PipeWire ALSA',
      'Zero-buffering pipeline optimizado con MPV',
      'Compatibilidad con Joy-Cons y Pro Controller vía Bluetooth/USB'
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
