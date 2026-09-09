#!/usr/bin/env bash
# ==============================================================================
# Lapdock OS - Script de Compilación de Imagen ISO Live para Ventoy
# Distribución base: Debian 12 (Bookworm) Minimal + Compositor Wayland Cage
# Compatibilidad: Ventoy (UEFI x86_64 y BIOS Legacy)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

OUTPUT_DIR="${ROOT_DIR}/output"
BUILD_DIR="/tmp/lapdock-build-$$"
ISO_NAME="Lapdock-OS-x86_64.iso"
DEST_ISO="${OUTPUT_DIR}/${ISO_NAME}"

echo "=================================================================="
echo "  🚀 INICIANDO COMPILACIÓN DE LAPDOCK OS ISO PARA VENTOY"
echo "=================================================================="

# Verificar privilegios de root
if [ "$EUID" -ne 0 ]; then
  echo "[!] Este script requiere privilegios de superusuario. Ejecuta con: sudo bash $0"
  exit 1
fi

# Preparar directorios de salida y montaje
mkdir -p "${OUTPUT_DIR}"
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"/{chroot,image/live,image/boot/grub,image/isolinux}

cleanup() {
  echo "[*] Limpiando puntos de montaje y archivos temporales..."
  umount -lf "${BUILD_DIR}/chroot/proc" 2>/dev/null || true
  umount -lf "${BUILD_DIR}/chroot/sys" 2>/dev/null || true
  umount -lf "${BUILD_DIR}/chroot/dev/pts" 2>/dev/null || true
  umount -lf "${BUILD_DIR}/chroot/dev" 2>/dev/null || true
  rm -rf "${BUILD_DIR}" 2>/dev/null || true
}
trap cleanup EXIT

echo "==> [1/6] Descargando sistema base Debian 12 Bookworm (amd64)..."
KEYRING_ARG=""
if [ -f "/usr/share/keyrings/debian-archive-keyring.gpg" ]; then
  KEYRING_ARG="--keyring=/usr/share/keyrings/debian-archive-keyring.gpg"
fi

debootstrap ${KEYRING_ARG} --arch=amd64 --variant=minbase bookworm "${BUILD_DIR}/chroot" http://deb.debian.org/debian/

echo "==> [2/6] Configurando chroot del sistema operativo..."
mount --bind /dev "${BUILD_DIR}/chroot/dev"
mount --bind /dev/pts "${BUILD_DIR}/chroot/dev/pts"
mount -t proc /proc "${BUILD_DIR}/chroot/proc"
mount -t sysfs /sys "${BUILD_DIR}/chroot/sys"

cat << 'EOF' > "${BUILD_DIR}/chroot/tmp/provision.sh"
#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

echo "Configurando repositorios Debian con non-free-firmware..."
cat << 'SOURCES' > /etc/apt/sources.list
deb http://deb.debian.org/debian bookworm main contrib non-free non-free-firmware
deb http://deb.debian.org/debian-security bookworm-security main contrib non-free non-free-firmware
deb http://deb.debian.org/debian bookworm-updates main contrib non-free non-free-firmware
SOURCES

apt-get update

# Instalar pila base, kernel, drivers gráficos y soporte multimedia
apt-get install -y --no-install-recommends \
    linux-image-amd64 \
    live-boot \
    systemd-sysv \
    udev \
    firmware-linux \
    firmware-misc-nonfree \
    pipewire \
    pipewire-audio-client-libraries \
    pipewire-pulse \
    wireplumber \
    cage \
    wayland-protocols \
    xwayland \
    adb \
    mpv \
    v4l-utils \
    python3 \
    python3-pyudev \
    pciutils \
    usbutils \
    libgl1-mesa-dri \
    mesa-vulkan-drivers \
    curl \
    ca-certificates \
    libsdl2-2.0-0 \
    libusb-1.0-0 \
    ffmpeg

# Regenerar initramfs asegurando la inclusión de los scripts de live-boot
echo "Actualizando initramfs con soporte live-boot..."
update-initramfs -u -k all

# Instalar Scrcpy precompilado oficial (v3.1 con soporte UHID y H.265/Opus para DeX)
echo "Instalando Scrcpy optimizado para proyección Lapdock..."
SCRCPY_VERSION="v3.1"
SCRCPY_URL="https://github.com/Genymobile/scrcpy/releases/download/${SCRCPY_VERSION}/scrcpy-linux-x86_64-${SCRCPY_VERSION}.tar.gz"

mkdir -p /tmp/scrcpy-dl
if curl -sL --fail "${SCRCPY_URL}" -o /tmp/scrcpy-dl/scrcpy.tar.gz; then
    mkdir -p /tmp/scrcpy-extract
    tar -xzf /tmp/scrcpy-dl/scrcpy.tar.gz -C /tmp/scrcpy-extract --strip-components=1
    cp /tmp/scrcpy-extract/scrcpy /usr/local/bin/scrcpy
    mkdir -p /usr/local/share/scrcpy /usr/share/scrcpy
    cp /tmp/scrcpy-extract/scrcpy-server /usr/local/share/scrcpy/scrcpy-server
    cp /tmp/scrcpy-extract/scrcpy-server /usr/share/scrcpy/scrcpy-server
    chmod +x /usr/local/bin/scrcpy
    echo "✅ Scrcpy ${SCRCPY_VERSION} instalado con éxito."
else
    echo "Descarga primaria fallida, intentando con v3.0..."
    FALLBACK_URL="https://github.com/Genymobile/scrcpy/releases/download/v3.0/scrcpy-linux-x86_64-v3.0.tar.gz"
    curl -sL "${FALLBACK_URL}" -o /tmp/scrcpy-dl/scrcpy.tar.gz
    mkdir -p /tmp/scrcpy-extract
    tar -xzf /tmp/scrcpy-dl/scrcpy.tar.gz -C /tmp/scrcpy-extract --strip-components=1
    cp /tmp/scrcpy-extract/scrcpy /usr/local/bin/scrcpy
    mkdir -p /usr/local/share/scrcpy /usr/share/scrcpy
    cp /tmp/scrcpy-extract/*server* /usr/local/share/scrcpy/scrcpy-server
    cp /tmp/scrcpy-extract/*server* /usr/share/scrcpy/scrcpy-server
    chmod +x /usr/local/bin/scrcpy
fi
rm -rf /tmp/scrcpy-dl /tmp/scrcpy-extract

# Verificar instalación de Scrcpy
which scrcpy && echo "Scrcpy ejecutable localizado en: $(which scrcpy)"

# Crear usuario de sistema para la sesión Kiosk sin contraseña
useradd -m -s /bin/bash -G video,audio,input,plugdev lapdock
passwd -d lapdock

# Hostname
echo "lapdock-os" > /etc/hostname

# Limpiar cache de paquetes para mantener la ISO liviana
apt-get clean
rm -rf /var/lib/apt/lists/*
EOF

chmod +x "${BUILD_DIR}/chroot/tmp/provision.sh"
chroot "${BUILD_DIR}/chroot" /tmp/provision.sh
rm -f "${BUILD_DIR}/chroot/tmp/provision.sh"

echo "==> [3/6] Inyectando orquestador Kiosk, reglas udev y servicios..."
mkdir -p "${BUILD_DIR}/chroot/etc/udev/rules.d"
mkdir -p "${BUILD_DIR}/chroot/usr/local/bin"
mkdir -p "${BUILD_DIR}/chroot/etc/systemd/system"

# Copiar scripts y configuraciones del repositorio si existen
if [ -f "${ROOT_DIR}/scripts/kiosk-manager.py" ]; then
  cp "${ROOT_DIR}/scripts/kiosk-manager.py" "${BUILD_DIR}/chroot/usr/local/bin/kiosk-manager.py"
fi
chmod +x "${BUILD_DIR}/chroot/usr/local/bin/kiosk-manager.py"

# Reglas udev
if [ -f "${ROOT_DIR}/configs/99-lapdock-devices.rules" ]; then
  cp "${ROOT_DIR}/configs/99-lapdock-devices.rules" "${BUILD_DIR}/chroot/etc/udev/rules.d/99-lapdock-devices.rules"
else
  cat << 'EOF' > "${BUILD_DIR}/chroot/etc/udev/rules.d/99-lapdock-devices.rules"
SUBSYSTEM=="usb", ATTR{idVendor}=="04e8", MODE="0666", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="18d1|2717|22b8|0bb4|12d1|05c6|2a70", MODE="0666", GROUP="plugdev"
SUBSYSTEM=="video4linux", KERNEL=="video[0-9]*", MODE="0666", GROUP="video"
EOF
fi

# Servicio systemd de inicio automático Kiosk en Wayland
if [ -f "${ROOT_DIR}/configs/lapdock-kiosk.service" ]; then
  cp "${ROOT_DIR}/configs/lapdock-kiosk.service" "${BUILD_DIR}/chroot/etc/systemd/system/lapdock-kiosk.service"
else
  cat << 'EOF' > "${BUILD_DIR}/chroot/etc/systemd/system/lapdock-kiosk.service"
[Unit]
Description=Lapdock OS Kiosk Display Manager
After=systemd-user-sessions.service plymouth-quit-wait.service pipewire.service
Conflicts=getty@tty1.service

[Service]
Type=simple
User=lapdock
Group=lapdock
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
EOF
fi

# Habilitar servicio en chroot
chroot "${BUILD_DIR}/chroot" systemctl enable lapdock-kiosk.service

echo "==> [4/6] Desmontando sistemas virtuales y empaquetando SquashFS..."
umount -lf "${BUILD_DIR}/chroot/proc"
umount -lf "${BUILD_DIR}/chroot/sys"
umount -lf "${BUILD_DIR}/chroot/dev/pts"
umount -lf "${BUILD_DIR}/chroot/dev"

# Extraer el kernel y el ramdisk más recientes
LATEST_KERNEL=$(ls -1 "${BUILD_DIR}/chroot/boot"/vmlinuz-* | sort -V | tail -n 1)
LATEST_INITRD=$(ls -1 "${BUILD_DIR}/chroot/boot"/initrd.img-* | sort -V | tail -n 1)
cp "${LATEST_KERNEL}" "${BUILD_DIR}/image/live/vmlinuz"
cp "${LATEST_INITRD}" "${BUILD_DIR}/image/live/initrd"

# Generar compresión SquashFS
mksquashfs "${BUILD_DIR}/chroot" "${BUILD_DIR}/image/live/filesystem.squashfs" -comp xz -e boot

echo "==> [5/6] Configurando cargador de arranque GRUB (Ventoy / UEFI / BIOS)..."
cat << 'EOF' > "${BUILD_DIR}/image/boot/grub/grub.cfg"
set default="0"
set timeout=2

insmod all_video
insmod font
insmod gfxterm

menuentry "Lapdock OS (Modo RAM - Compatible con Ventoy)" --class gnu-linux --class os {
    linux /live/vmlinuz boot=live toram quiet splash loglevel=3 console=tty1
    initrd /live/initrd
}

menuentry "Lapdock OS (Modo Directo)" --class gnu-linux --class os {
    linux /live/vmlinuz boot=live quiet splash loglevel=3 console=tty1
    initrd /live/initrd
}
EOF

# Crear imagen EFI para soporte de arranque UEFI nativo
mkdir -p "${BUILD_DIR}/image/EFI/BOOT"
if command -v grub-mkstandalone &>/dev/null; then
  grub-mkstandalone \
      --format=x86_64-efi \
      --output="${BUILD_DIR}/image/EFI/BOOT/BOOTX64.EFI" \
      --locales="" \
      --fonts="" \
      "boot/grub/grub.cfg=${BUILD_DIR}/image/boot/grub/grub.cfg" || true
fi

echo "==> [6/6] Generando archivo ISO híbrido con xorriso..."
xorriso -as mkisofs \
    -iso-level 3 \
    -full-iso9660-filenames \
    -volid "LAPDOCK_OS" \
    -output "${DEST_ISO}" \
    -graft-points \
    "${BUILD_DIR}/image"

echo "=================================================================="
echo "  ✅ COMPILACIÓN FINALIZADA CON ÉXITO"
echo "  📁 Archivo ISO: ${DEST_ISO}"
echo "  📏 Tamaño: $(du -h "${DEST_ISO}" | cut -f1)"
echo "  💡 Copia este archivo directamente a tu pendrive con Ventoy."
echo "=================================================================="
