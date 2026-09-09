export interface IsoConfigFile {
  filename: string;
  path: string;
  language: string;
  description: string;
  content: string;
}

export const ISO_CONFIG_FILES: IsoConfigFile[] = [
  {
    filename: 'build-caststation-iso.sh',
    path: '/root/build-caststation-iso.sh',
    language: 'bash',
    description: 'Script automatizado de construcción de la imagen ISO híbrida (UEFI + BIOS) compatible con Ventoy basada en Debian 12 Minimal.',
    content: `#!/usr/bin/env bash
# ==============================================================================
# CastStation OS - Generador de Imagen ISO Live para Ventoy
# Distribución base: Debian 12 (Bookworm) Minimal + Wayland Cage Kiosk
# Compatible con: Ventoy (UEFI x86_64 y BIOS Legacy)
# ==============================================================================

set -euo pipefail

if [ "$EUID" -ne 0 ]; then
  echo "[!] Este script debe ejecutarse como root (sudo)."
  exit 1
fi

BUILD_DIR="/tmp/caststation-build"
ISO_OUTPUT_NAME="CastStation-OS-v1.0-x86_64.iso"
DEST_ISO="/var/tmp/\${ISO_OUTPUT_NAME}"

echo "==> [1/6] Instalando dependencias de construcción..."
apt-get update
apt-get install -y --no-install-recommends \\
    debootstrap \\
    squashfs-tools \\
    xorriso \\
    isolinux \\
    syslinux-efi \\
    grub-pc-bin \\
    grub-efi-amd64-bin \\
    mtools

rm -rf "\${BUILD_DIR}"
mkdir -p "\${BUILD_DIR}"/{chroot,image/live,image/isolinux,image/boot/grub}

echo "==> [2/6] Ejecutando debootstrap para Debian 12 Bookworm (amd64)..."
debootstrap --arch=amd64 --variant=minbase bookworm "\${BUILD_DIR}/chroot" http://deb.debian.org/debian/

echo "==> [3/6] Configurando chroot del sistema..."
cat << 'EOF' > "\${BUILD_DIR}/chroot/setup.sh"
#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

# Repositorios Debian con non-free-firmware
cat << 'SOURCES' > /etc/apt/sources.list
deb http://deb.debian.org/debian bookworm main contrib non-free non-free-firmware
deb http://deb.debian.org/debian-security bookworm-security main contrib non-free non-free-firmware
deb http://deb.debian.org/debian bookworm-updates main contrib non-free non-free-firmware
SOURCES

apt-get update
apt-get install -y --no-install-recommends \\
    linux-image-amd64 \\
    live-boot \\
    systemd-sysv \\
    udev \\
    firmware-linux \\
    firmware-misc-nonfree \\
    network-manager \\
    wireless-tools \\
    wpasupplicant \\
    pipewire \\
    pipewire-audio-client-libraries \\
    pipewire-pulse \\
    wireplumber \\
    cage \\
    wayland-protocols \\
    scrcpy \\
    adb \\
    mpv \\
    v4l-utils \\
    python3 \\
    python3-pyudev \\
    python3-pip \\
    curl \\
    pciutils \\
    usbutils \\
    libgl1-mesa-dri \\
    mesa-vulkan-drivers \\
    xwayland

# Usuario no privilegiado para el Kiosk
useradd -m -s /bin/bash -G video,audio,input,plugdev caststation
passwd -d caststation

# Hostname
echo "caststation-os" > /etc/hostname

# Limpieza
apt-get clean
rm -rf /var/lib/apt/lists/*
EOF

chmod +x "\${BUILD_DIR}/chroot/setup.sh"
chroot "\${BUILD_DIR}/chroot" /setup.sh
rm "\${BUILD_DIR}/chroot/setup.sh"

echo "==> [4/6] Inyectando reglas udev y servicio Kiosk..."
# Inyectar reglas udev
cat << 'EOF' > "\${BUILD_DIR}/chroot/etc/udev/rules.d/99-caststation.rules"
# Reglas udev para detección de periféricos y proyección automática

# 1. Teléfonos Samsung (DeX / ADB)
SUBSYSTEM=="usb", ATTR{idVendor}=="04e8", MODE="0666", GROUP="plugdev", TAG+="systemd", ENV{SYSTEMD_WANTS}="caststation-device-connect@samsung.service"

# 2. Terminales Android universales (Google, Xiaomi, Motorola, etc.)
SUBSYSTEM=="usb", ATTR{idVendor}=="18d1|2717|22b8|0bb4|12d1|05c6", MODE="0666", GROUP="plugdev", TAG+="systemd", ENV{SYSTEMD_WANTS}="caststation-device-connect@android.service"

# 3. Capturadoras HDMI UVC (Nintendo Switch en dock o consolas)
SUBSYSTEM=="video4linux", KERNEL=="video[0-9]*", ATTRS{name}=="*HDMI*|*Capture*|*MS2109*|*Cam Link*|*USB3.0 Capture*", TAG+="systemd", ENV{SYSTEMD_WANTS}="caststation-device-connect@hdmi.service"
EOF

# Inyectar script de lanzamiento Kiosk
cat << 'EOF' > "\${BUILD_DIR}/chroot/usr/local/bin/caststation-kiosk"
#!/usr/bin/env bash
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
export WAYLAND_DISPLAY="wayland-0"

# Ejecuta el compositor minimalista Wayland 'cage' ejecutando el gestor de pantalla
exec cage -- /usr/local/bin/kiosk-manager.py
EOF
chmod +x "\${BUILD_DIR}/chroot/usr/local/bin/caststation-kiosk"

echo "==> [5/6] Creando imagen SquashFS y kernel Live..."
mksquashfs "\${BUILD_DIR}/chroot" "\${BUILD_DIR}/image/live/filesystem.squashfs" -comp xz -e boot

cp "\${BUILD_DIR}/chroot/boot"/vmlinuz-* "\${BUILD_DIR}/image/live/vmlinuz"
cp "\${BUILD_DIR}/chroot/boot"/initrd.img-* "\${BUILD_DIR}/image/live/initrd"

# Configuración GRUB para compatibilidad Ventoy / UEFI
cat << 'EOF' > "\${BUILD_DIR}/image/boot/grub/grub.cfg"
set default="0"
set timeout=3

menuentry "CastStation OS (Live Kiosk - Ventoy Compatible)" {
    linux /live/vmlinuz boot=live quiet splash loglevel=3 console=tty1
    initrd /live/initrd
}

menuentry "CastStation OS (Modo Seguro - RAM Disk)" {
    linux /live/vmlinuz boot=live toram quiet splash
    initrd /live/initrd
}
EOF

echo "==> [6/6] Empaquetando ISO híbrida con xorriso..."
xorriso -as mkisofs \\
    -iso-level 3 \\
    -full-iso9660-filenames \\
    -volid "CASTSTATION" \\
    -eltorito-boot boot/grub/bios.img \\
    -no-emul-boot -boot-load-size 4 -boot-info-table \\
    --eltorito-catalog boot/isolinux.cat \\
    -output "\${DEST_ISO}" \\
    -graft-points \\
    "\${BUILD_DIR}/image"

echo "=================================================================="
echo " [OK] ¡Imagen ISO creada exitosamente!"
echo " Ubicación: \${DEST_ISO}"
echo " Copia este archivo directamente a tu memoria USB con Ventoy."
echo "=================================================================="
`
  },
  {
    filename: '99-caststation-devices.rules',
    path: '/etc/udev/rules.d/99-caststation-devices.rules',
    language: 'udev',
    description: 'Reglas del subsistema udev para detectar al vuelo dispositivos DeX, Android, capturadoras HDMI de Switch y dispositivos USB-Ethernet.',
    content: `# /etc/udev/rules.d/99-caststation-devices.rules
# Detectores de hardware para auto-proyección instantánea

# [1] Samsung Galaxy con DeX habilitado (Vendor ID 04e8)
ACTION=="add", SUBSYSTEM=="usb", ATTR{idVendor}=="04e8", ENV{DEVTYPE}=="usb_device", RUN+="/usr/local/bin/kiosk-trigger.sh samsung-dex add"
ACTION=="remove", SUBSYSTEM=="usb", ENV{PRODUCT}=="4e8/*", RUN+="/usr/local/bin/kiosk-trigger.sh samsung-dex remove"

# [2] Teléfonos Android Universales (Google, Xiaomi, Motorola, etc.)
ACTION=="add", SUBSYSTEM=="usb", ATTR{idVendor}=="18d1|2717|22b8|0bb4|12d1|05c6|2a70", ENV{DEVTYPE}=="usb_device", RUN+="/usr/local/bin/kiosk-trigger.sh android add"

# [3] Capturadora HDMI UVC (Nintendo Switch en Dock o salida HDMI externa)
ACTION=="add", SUBSYSTEM=="video4linux", KERNEL=="video[0-9]*", ATTR{index}=="0", RUN+="/usr/local/bin/kiosk-trigger.sh nintendo-switch add"
ACTION=="remove", SUBSYSTEM=="video4linux", KERNEL=="video[0-9]*", RUN+="/usr/local/bin/kiosk-trigger.sh nintendo-switch remove"

# [4] Ubuntu Touch / Convergence vía Interfaz de red USB (RNDIS/CDC)
ACTION=="add", SUBSYSTEM=="net", KERNEL=="usb[0-9]*", RUN+="/usr/local/bin/kiosk-trigger.sh ubuntu-touch add"
`
  },
  {
    filename: 'kiosk-manager.py',
    path: '/usr/local/bin/kiosk-manager.py',
    language: 'python',
    description: 'Orquestador del Kiosk en Python que monitorea sockets udev y lanza Scrcpy o MPV en pantalla completa con PipeWire.',
    content: `#!/usr/bin/env python3
"""
CastStation Kiosk Manager
Maneja la pantalla de espera y lanza el reproductor adecuado en pantalla completa.
"""
import os
import sys
import time
import subprocess
import threading
import pyudev

CURRENT_PROCESS = None
LOCK = threading.Lock()

def launch_projection(device_type):
    global CURRENT_PROCESS
    with LOCK:
        if CURRENT_PROCESS and CURRENT_PROCESS.poll() is None:
            print(f"[Kiosk] Ya hay una proyección activa, cerrando anterior...")
            CURRENT_PROCESS.terminate()
            CURRENT_PROCESS.wait()

        print(f"[Kiosk] Lanzando proyección para: {device_type}")
        
        if device_type == "samsung-dex":
            # Scrcpy optimizado para Samsung DeX
            cmd = [
                "scrcpy",
                "--stay-awake",
                "--video-codec=h265",
                "--max-fps=60",
                "--fullscreen",
                "--audio-codec=opus",
                "--keyboard=uhid",
                "--mouse=uhid",
                "--turn-screen-off"
            ]
        elif device_type == "nintendo-switch":
            # MPV optimizado para capturadora UVC (Switch HDMI)
            cmd = [
                "mpv",
                "av://v4l2:/dev/video0",
                "--profile=low-latency",
                "--untimed",
                "--video-sync=display-resample",
                "--fullscreen",
                "--demuxer-lavf-format=v4l2",
                "--demuxer-lavf-o-set=input_format=mjpeg",
                "--audio-buffer=0.01"
            ]
        elif device_type == "android":
            # Android Universal con Scrcpy
            cmd = [
                "scrcpy",
                "--stay-awake",
                "--max-fps=60",
                "--fullscreen",
                "--forward-all-clicks"
            ]
        elif device_type == "ubuntu-touch":
            cmd = ["scrcpy", "--fullscreen"]
        else:
            return

        try:
            CURRENT_PROCESS = subprocess.Popen(cmd)
            CURRENT_PROCESS.wait()
        except Exception as e:
            print(f"[Error] Fallo al ejecutar proyección: {e}")
        finally:
            print("[Kiosk] Proyección finalizada. Regresando a pantalla de espera.")

def udev_listener():
    context = pyudev.Context()
    monitor = pyudev.Monitor.from_netlink(context)
    monitor.filter_by(subsystem='usb')
    monitor.filter_by(subsystem='video4linux')

    for action, device in monitor:
        if action == 'add':
            vendor = device.get('ID_VENDOR_ID', '')
            if vendor == '04e8': # Samsung
                threading.Thread(target=launch_projection, args=('samsung-dex',), daemon=True).start()
            elif device.subsystem == 'video4linux' and 'video0' in device.device_node:
                threading.Thread(target=launch_projection, args=('nintendo-switch',), daemon=True).start()
            elif vendor in ['18d1', '2717', '22b8']: # Android
                threading.Thread(target=launch_projection, args=('android',), daemon=True).start()

if __name__ == '__main__':
    print("[CastStation] Iniciando pantalla de espera y demonio udev...")
    udev_listener()
`
  },
  {
    filename: 'caststation-kiosk.service',
    path: '/etc/systemd/system/caststation-kiosk.service',
    language: 'ini',
    description: 'Unidad de servicio systemd para iniciar el compositor Wayland (cage) automáticamente en el TTY1 sin contraseña.',
    content: `[Unit]
Description=CastStation OS Kiosk Display Manager
After=systemd-user-sessions.service plymouth-quit-wait.service pipewire.service
Conflicts=getty@tty1.service

[Service]
Type=simple
User=caststation
Group=caststation
PAMName=login
Environment=XDG_SESSION_TYPE=wayland
Environment=XDG_CURRENT_DESKTOP=Cage
Environment=WLR_LIBINPUT_NO_DEVICES=1
TTYPath=/dev/tty1
StandardInput=tty
StandardOutput=journal
StandardError=journal
ExecStart=/usr/bin/cage -- /usr/local/bin/kiosk-manager.py
Restart=always
RestartSec=2

[Install]
WantedBy=graphical.target
`
  },
  {
    filename: 'VENTOY_README.md',
    path: '/VENTOY_README.md',
    language: 'markdown',
    description: 'Guía práctica para preparar la memoria USB con Ventoy y arrancar CastStation OS.',
    content: `# Guía de Arranque con Ventoy para CastStation OS

CastStation OS se distribuye como una imagen ISO híbrida estándar, diseñada para ejecutarse sin instalación previa (Live RAM OS) o con persistencia opcional mediante **Ventoy**.

---

### Paso 1: Instalar Ventoy en tu memoria USB
1. Descarga la última versión de **Ventoy** desde su sitio oficial: https://www.ventoy.net
2. Conecta una memoria USB de al menos 8 GB (USB 3.0 recomendado para mayor velocidad de lectura).
3. Abre Ventoy2Disk y selecciona tu memoria USB.
4. Asegúrate de configurar el tipo de partición en **GPT** (para soporte UEFI moderno) o MBR.
5. Haz clic en **Install**.

---

### Paso 2: Copiar la imagen ISO
Una vez generado el archivo \`CastStation-OS-v1.0-x86_64.iso\` mediante el script:
1. Simplemente **arrastra y suelta el archivo .iso en la partición de tu memoria USB**.
2. No necesitas quemarla ni usar Rufus o balenaEtcher: Ventoy arrancará la ISO directamente.

---

### Paso 3: Conectar periféricos para el modo Estación
Para el correcto funcionamiento automático de la estación:
* **Para Nintendo Switch**:
  * Conecta la salida HDMI del Dock de Switch a una capturadora HDMI USB de latencia ultrabaja (por ejemplo, chips MacroSilicon MS2109, Elgato Cam Link, o genéricas USB 3.0 de $10 USD).
  * El sistema asignará la señal a \`/dev/video0\` y lanzará automáticamente MPV a 60 FPS con audio PCM passthrough.
* **Para Samsung DeX**:
  * Conecta el teléfono mediante cable USB-C a USB-A o USB-C directo al PC.
  * Habilita "Depuración USB" en Ajustes de Desarrollador una sola vez y autoriza el PC.
  * El sistema lanzará \`scrcpy\` configurado en modo DeX con reenvío de teclado/ratón UHID.
* **Para terminales Android universales**:
  * Conecta el terminal con Depuración USB activa. El sistema lo proyecta en 60 FPS automáticamente.
`
  }
];
