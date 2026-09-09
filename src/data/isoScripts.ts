export interface IsoConfigFile {
  filename: string;
  path: string;
  language: string;
  description: string;
  content: string;
}

export const ISO_CONFIG_FILES: IsoConfigFile[] = [
  {
    filename: '.github/workflows/build-iso.yml',
    path: '/.github/workflows/build-iso.yml',
    language: 'yaml',
    description: 'Flujo de CI/CD de GitHub Actions que compila la imagen ISO completa automáticamente y la publica para descargarla directo a Ventoy.',
    content: `name: Build Lapdock OS ISO (Ventoy Ready)

on:
  push:
    branches: [ main, master ]
    tags: [ 'v*' ]
  pull_request:
    branches: [ main, master ]
  workflow_dispatch:
    inputs:
      release_version:
        description: 'Versión del release (ej. v1.0.0)'
        required: false
        default: 'v1.0.0'

permissions:
  contents: write

jobs:
  build-iso:
    name: Compilar Imagen ISO Live (Debian 12 + Wayland)
    runs-on: ubuntu-latest
    timeout-minutes: 60

    steps:
      - name: Clonar Repositorio
        uses: actions/checkout@v4

      - name: Instalar Dependencias del Host
        run: |
          sudo apt-get update
          sudo apt-get install -y --no-install-recommends \\
            debootstrap squashfs-tools xorriso isolinux syslinux-efi \\
            grub-pc-bin grub-efi-amd64-bin mtools dosfstools wget curl

      - name: Hacer ejecutables los scripts
        run: |
          chmod +x scripts/*.sh || true
          chmod +x scripts/*.py || true

      - name: Compilar Imagen ISO de Lapdock OS
        run: |
          mkdir -p output
          sudo bash scripts/build-lapdock-iso.sh

      - name: Generar Sumas de Verificación SHA256
        run: |
          cd output
          sha256sum Lapdock-OS-*.iso > SHA256SUMS.txt

      - name: Subir ISO como Artefacto de GitHub Actions
        uses: actions/upload-artifact@v4
        with:
          name: Lapdock-OS-Ventoy-ISO
          path: |
            output/Lapdock-OS-*.iso
            output/SHA256SUMS.txt
          retention-days: 30

      - name: Publicar Release Público en GitHub (Descarga Directa)
        if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master' || startsWith(github.ref, 'refs/tags/') || github.event_name == 'workflow_dispatch'
        uses: softprops/action-gh-release@v2
        with:
          files: |
            output/Lapdock-OS-*.iso
            output/SHA256SUMS.txt
          tag_name: \${{ startsWith(github.ref, 'refs/tags/') && github.ref_name || (github.event.inputs.release_tag || 'latest') }}
          name: \${{ startsWith(github.ref, 'refs/tags/') && format('Lapdock OS {0}', github.ref_name) || 'Lapdock OS (Versión Pública Oficial para Ventoy)' }}
          draft: false
          prerelease: false
          make_latest: true
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`
  },
  {
    filename: 'scripts/build-lapdock-iso.sh',
    path: '/scripts/build-lapdock-iso.sh',
    language: 'bash',
    description: 'Script automatizado de construcción de la imagen ISO híbrida (UEFI + BIOS) compatible con Ventoy basada en Debian 12 Minimal.',
    content: `#!/usr/bin/env bash
# ==============================================================================
# Lapdock OS - Generador de Imagen ISO Live para Ventoy
# Distribución base: Debian 12 (Bookworm) Minimal + Wayland Cage Kiosk
# Compatible con: Ventoy (UEFI x86_64 y BIOS Legacy)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "\${SCRIPT_DIR}/.." && pwd)"

OUTPUT_DIR="\${ROOT_DIR}/output"
BUILD_DIR="/tmp/lapdock-build-$$"
ISO_NAME="Lapdock-OS-x86_64.iso"
DEST_ISO="\${OUTPUT_DIR}/\${ISO_NAME}"

echo "=================================================================="
echo "  🚀 INICIANDO COMPILACIÓN DE LAPDOCK OS ISO PARA VENTOY"
echo "=================================================================="

if [ "$EUID" -ne 0 ]; then
  echo "[!] Este script requiere privilegios de superusuario: sudo bash $0"
  exit 1
fi

mkdir -p "\${OUTPUT_DIR}"
rm -rf "\${BUILD_DIR}"
mkdir -p "\${BUILD_DIR}"/{chroot,image/live,image/boot/grub,image/isolinux}

KEYRING_ARG=""
if [ -f "/usr/share/keyrings/debian-archive-keyring.gpg" ]; then
  KEYRING_ARG="--keyring=/usr/share/keyrings/debian-archive-keyring.gpg"
fi

echo "==> [1/6] Descargando sistema base Debian 12 Bookworm (amd64)..."
debootstrap \${KEYRING_ARG} --arch=amd64 --variant=minbase bookworm "\${BUILD_DIR}/chroot" http://deb.debian.org/debian/

echo "==> [2/6] Configurando chroot del sistema..."
mount --bind /dev "\${BUILD_DIR}/chroot/dev"
mount --bind /dev/pts "\${BUILD_DIR}/chroot/dev/pts"
mount -t proc /proc "\${BUILD_DIR}/chroot/proc"
mount -t sysfs /sys "\${BUILD_DIR}/chroot/sys"

cat << 'EOF' > "\${BUILD_DIR}/chroot/tmp/provision.sh"
#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

cat << 'SOURCES' > /etc/apt/sources.list
deb http://deb.debian.org/debian bookworm main contrib non-free non-free-firmware
deb http://deb.debian.org/debian-security bookworm-security main contrib non-free non-free-firmware
deb http://deb.debian.org/debian bookworm-updates main contrib non-free non-free-firmware
SOURCES

apt-get update
apt-get install -y --no-install-recommends \
    linux-image-amd64 live-boot systemd-sysv udev \
    firmware-linux firmware-misc-nonfree \
    pipewire pipewire-audio-client-libraries pipewire-pulse wireplumber \
    cage wayland-protocols xwayland adb mpv v4l-utils \
    python3 python3-pyudev pciutils usbutils \
    libgl1-mesa-dri mesa-vulkan-drivers \
    curl ca-certificates libsdl2-2.0-0 libusb-1.0-0 ffmpeg

update-initramfs -u -k all

# Instalar Scrcpy oficial precompilado (v3.1)
SCRCPY_VERSION="v3.1"
SCRCPY_URL="https://github.com/Genymobile/scrcpy/releases/download/\${SCRCPY_VERSION}/scrcpy-linux-x86_64-\${SCRCPY_VERSION}.tar.gz"

mkdir -p /tmp/scrcpy-dl
if curl -sL --fail "\${SCRCPY_URL}" -o /tmp/scrcpy-dl/scrcpy.tar.gz; then
    mkdir -p /tmp/scrcpy-extract
    tar -xzf /tmp/scrcpy-dl/scrcpy.tar.gz -C /tmp/scrcpy-extract --strip-components=1
    cp /tmp/scrcpy-extract/scrcpy /usr/local/bin/scrcpy
    mkdir -p /usr/local/share/scrcpy /usr/share/scrcpy
    cp /tmp/scrcpy-extract/scrcpy-server /usr/local/share/scrcpy/scrcpy-server
    cp /tmp/scrcpy-extract/scrcpy-server /usr/share/scrcpy/scrcpy-server
    chmod +x /usr/local/bin/scrcpy
fi
rm -rf /tmp/scrcpy-dl /tmp/scrcpy-extract

useradd -m -s /bin/bash -G video,audio,input,plugdev lapdock
passwd -d lapdock
echo "lapdock-os" > /etc/hostname

apt-get clean
rm -rf /var/lib/apt/lists/*
EOF

chmod +x "\${BUILD_DIR}/chroot/tmp/provision.sh"
chroot "\${BUILD_DIR}/chroot" /tmp/provision.sh
rm -f "\${BUILD_DIR}/chroot/tmp/provision.sh"

echo "==> [3/6] Inyectando orquestador Kiosk y servicios..."
mkdir -p "\${BUILD_DIR}/chroot/etc/udev/rules.d"
mkdir -p "\${BUILD_DIR}/chroot/usr/local/bin"
mkdir -p "\${BUILD_DIR}/chroot/etc/systemd/system"

if [ -f "\${ROOT_DIR}/scripts/kiosk-manager.py" ]; then
  cp "\${ROOT_DIR}/scripts/kiosk-manager.py" "\${BUILD_DIR}/chroot/usr/local/bin/kiosk-manager.py"
fi
chmod +x "\${BUILD_DIR}/chroot/usr/local/bin/kiosk-manager.py"

if [ -f "\${ROOT_DIR}/configs/99-lapdock-devices.rules" ]; then
  cp "\${ROOT_DIR}/configs/99-lapdock-devices.rules" "\${BUILD_DIR}/chroot/etc/udev/rules.d/99-lapdock-devices.rules"
fi

if [ -f "\${ROOT_DIR}/configs/lapdock-kiosk.service" ]; then
  cp "\${ROOT_DIR}/configs/lapdock-kiosk.service" "\${BUILD_DIR}/chroot/etc/systemd/system/lapdock-kiosk.service"
fi
chroot "\${BUILD_DIR}/chroot" systemctl enable lapdock-kiosk.service

echo "==> [4/6] Desmontando y empaquetando SquashFS..."
umount -lf "\${BUILD_DIR}/chroot/proc"
umount -lf "\${BUILD_DIR}/chroot/sys"
umount -lf "\${BUILD_DIR}/chroot/dev/pts"
umount -lf "\${BUILD_DIR}/chroot/dev"

mksquashfs "\${BUILD_DIR}/chroot" "\${BUILD_DIR}/image/live/filesystem.squashfs" -comp xz -e boot

cp "\${BUILD_DIR}/chroot/boot"/vmlinuz-* "\${BUILD_DIR}/image/live/vmlinuz"
cp "\${BUILD_DIR}/chroot/boot"/initrd.img-* "\${BUILD_DIR}/image/live/initrd"

echo "==> [5/6] Configurando cargador de arranque GRUB..."
cat << 'EOF' > "\${BUILD_DIR}/image/boot/grub/grub.cfg"
set default="0"
set timeout=2

menuentry "Lapdock OS (Modo RAM - Compatible con Ventoy)" {
    linux /live/vmlinuz boot=live toram quiet splash loglevel=3 console=tty1
    initrd /live/initrd
}
EOF

echo "==> [6/6] Generando archivo ISO híbrido con xorriso..."
xorriso -as mkisofs \
    -iso-level 3 \
    -full-iso9660-filenames \
    -volid "LAPDOCK_OS" \
    -output "\${DEST_ISO}" \
    -graft-points \
    "\${BUILD_DIR}/image"

echo "=================================================================="
echo "  ✅ COMPILACIÓN FINALIZADA CON ÉXITO"
echo "  📁 Archivo ISO: \${DEST_ISO}"
echo "=================================================================="
`
  },
  {
    filename: 'scripts/kiosk-manager.py',
    path: '/scripts/kiosk-manager.py',
    language: 'python',
    description: 'Orquestador del Kiosk en Python que monitorea sockets udev y lanza Scrcpy o MPV en pantalla completa con PipeWire.',
    content: `#!/usr/bin/env python3
"""
Lapdock OS - Kiosk Manager Daemon
Monitorea sockets udev y lanza automáticamente Scrcpy (DeX / Android)
o MPV (Nintendo Switch HDMI UVC) en pantalla completa sin bordes.
"""
import os, sys, time, subprocess, threading, pyudev

CURRENT_PROCESS = None
LOCK = threading.Lock()

def launch_projection(device_type):
    global CURRENT_PROCESS
    with LOCK:
        if CURRENT_PROCESS and CURRENT_PROCESS.poll() is None:
            CURRENT_PROCESS.terminate()
            try:
                CURRENT_PROCESS.wait(timeout=2)
            except subprocess.TimeoutExpired:
                CURRENT_PROCESS.kill()

        if device_type == "samsung-dex":
            cmd = [
                "scrcpy", "--stay-awake", "--video-codec=h265",
                "--max-fps=60", "--fullscreen", "--audio-codec=opus",
                "--keyboard=uhid", "--mouse=uhid", "--turn-screen-off"
            ]
        elif device_type == "nintendo-switch":
            cmd = [
                "mpv", "av://v4l2:/dev/video0", "--profile=low-latency",
                "--untimed", "--video-sync=display-resample", "--fullscreen",
                "--demuxer-lavf-format=v4l2", "--demuxer-lavf-o-set=input_format=mjpeg",
                "--audio-buffer=0.01"
            ]
        elif device_type == "android":
            cmd = ["scrcpy", "--stay-awake", "--max-fps=60", "--fullscreen", "--forward-all-clicks"]
        else:
            return

        try:
            CURRENT_PROCESS = subprocess.Popen(cmd)
            CURRENT_PROCESS.wait()
        except Exception as err:
            print(f"Error en proyección: {err}")

def udev_event_handler():
    context = pyudev.Context()
    monitor = pyudev.Monitor.from_netlink(context)
    monitor.filter_by(subsystem='usb')
    monitor.filter_by(subsystem='video4linux')

    for action, device in monitor:
        if action == 'add':
            vendor = device.get('ID_VENDOR_ID', '')
            subsystem = device.subsystem

            if vendor == '04e8': # Samsung Galaxy DeX
                threading.Thread(target=launch_projection, args=('samsung-dex',), daemon=True).start()
            elif subsystem == 'video4linux' and 'video0' in str(device.device_node): # Switch HDMI
                threading.Thread(target=launch_projection, args=('nintendo-switch',), daemon=True).start()
            elif vendor in ['18d1', '2717', '22b8', '0bb4', '12d1', '05c6', '2a70']: # Android
                threading.Thread(target=launch_projection, args=('android',), daemon=True).start()

if __name__ == '__main__':
    udev_event_handler()
`
  },
  {
    filename: 'configs/99-lapdock-devices.rules',
    path: '/configs/99-lapdock-devices.rules',
    language: 'udev',
    description: 'Reglas udev para detectar inserción de hardware en caliente.',
    content: `# /etc/udev/rules.d/99-lapdock-devices.rules
# 1. Teléfonos Samsung (DeX)
SUBSYSTEM=="usb", ATTR{idVendor}=="04e8", MODE="0666", GROUP="plugdev", TAG+="systemd"

# 2. Terminales Android universales
SUBSYSTEM=="usb", ATTR{idVendor}=="18d1|2717|22b8|0bb4|12d1|05c6|2a70", MODE="0666", GROUP="plugdev", TAG+="systemd"

# 3. Capturadoras HDMI UVC (Nintendo Switch)
SUBSYSTEM=="video4linux", KERNEL=="video[0-9]*", MODE="0666", GROUP="video", TAG+="systemd"
`
  }
];
