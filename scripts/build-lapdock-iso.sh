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

echo "Configurando repositorios Debian con non-free-firmware y backports..."
cat << 'SOURCES' > /etc/apt/sources.list
deb http://deb.debian.org/debian bookworm main contrib non-free non-free-firmware
deb http://deb.debian.org/debian-security bookworm-security main contrib non-free non-free-firmware
deb http://deb.debian.org/debian bookworm-updates main contrib non-free non-free-firmware
deb http://deb.debian.org/debian bookworm-backports main contrib non-free non-free-firmware
SOURCES

apt-get update

# Instalar pila base, kernel, drivers gráficos y soporte multimedia
apt-get install -y --no-install-recommends \
    linux-image-amd64 \
    live-boot \
    systemd-sysv \
    udev \
    dbus-user-session \
    firmware-linux \
    firmware-misc-nonfree \
    seatd \
    libseat1 \
    sudo \
    polkitd \
    pipewire \
    pipewire-audio-client-libraries \
    pipewire-pulse \
    wireplumber \
    cage \
    wayland-protocols \
    xwayland \
    x11-xserver-utils \
    adb \
    mpv \
    v4l-utils \
    python3 \
    python3-tk \
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

# Compilar Scrcpy v3.1 nativamente para Debian 12 (100% compatible con glibc 2.36)
echo "Compilando Scrcpy v3.1 nativamente para Debian 12..."
apt-get install -y --no-install-recommends \
    gcc \
    git \
    pkg-config \
    meson \
    ninja-build \
    libsdl2-dev \
    libavcodec-dev \
    libavdevice-dev \
    libavformat-dev \
    libavutil-dev \
    libswresample-dev \
    libusb-1.0-0-dev

mkdir -p /tmp/scrcpy-build
cd /tmp/scrcpy-build
curl -sL --fail "https://github.com/Genymobile/scrcpy/releases/download/v3.1/scrcpy-server-v3.1" -o /tmp/scrcpy-server
git clone --depth 1 --branch v3.1 https://github.com/Genymobile/scrcpy.git .
meson setup x --buildtype=release --strip -Db_lto=true -Dprebuilt_server=/tmp/scrcpy-server
ninja -Cx install

mkdir -p /usr/share/scrcpy
cp -f /usr/local/share/scrcpy/scrcpy-server /usr/share/scrcpy/scrcpy-server || true

# Limpiar herramientas de compilación temporales para mantener la ISO mínima
apt-get purge -y gcc git pkg-config meson ninja-build libsdl2-dev libavcodec-dev libavdevice-dev libavformat-dev libavutil-dev libswresample-dev libusb-1.0-0-dev
apt-get autoremove -y
rm -rf /tmp/scrcpy-build /tmp/scrcpy-server

# Verificar que Scrcpy nativo ejecuta correctamente
echo "✅ Verificando Scrcpy nativo:"
scrcpy --version

# Configurar wrapper inteligente de Scrcpy para arrancar Wayland Cage si se invoca desde TTY
mv /usr/local/bin/scrcpy /usr/local/bin/scrcpy.bin
cat << 'SCRCPY_WRAPPER' > /usr/local/bin/scrcpy
#!/bin/bash
# Lapdock OS Scrcpy Smart Wrapper: detecta si se llama desde TTY y levanta Cage automáticamente
if [ -z "$WAYLAND_DISPLAY" ] && [ -z "$DISPLAY" ]; then
    echo "⚡ Lanzando Scrcpy en sesión gráfica Wayland (Cage)..."
    export XDG_RUNTIME_DIR="/run/user/$(id -u)"
    export LIBSEAT_BACKEND="seatd"
    export WLR_LIBINPUT_NO_DEVICES="1"
    if [ -S /run/seatd.sock ]; then
        exec /usr/bin/cage -s -- /usr/local/bin/scrcpy.bin "$@"
    elif command -v seatd-launch >/dev/null 2>&1; then
        exec seatd-launch -- cage -s -- /usr/local/bin/scrcpy.bin "$@"
    else
        exec /usr/bin/cage -s -- /usr/local/bin/scrcpy.bin "$@"
    fi
else
    exec /usr/local/bin/scrcpy.bin "$@"
fi
SCRCPY_WRAPPER
chmod +x /usr/local/bin/scrcpy

# Configurar seatd y permisos SUID para seatd-launch (garantiza sesión DRM/VT limpia sin depender de logind)
chmod u+s /usr/bin/seatd-launch 2>/dev/null || true
systemctl enable seatd.service 2>/dev/null || true

# Crear usuario de sistema para la sesión Kiosk sin contraseña con todos los permisos DRM/audio/USB/seat
groupadd -f seat
useradd -m -s /bin/bash -G sudo,video,audio,input,plugdev,render,tty,dialout,seat lapdock || \
usermod -aG sudo,video,audio,input,plugdev,render,tty,dialout,seat lapdock
passwd -d lapdock

# Habilitar sudo sin contraseña para el usuario lapdock en modo Live
mkdir -p /etc/sudoers.d
echo "lapdock ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/lapdock
chmod 0440 /etc/sudoers.d/lapdock

# Configurar directorio ADB y permisos del usuario lapdock
mkdir -p /home/lapdock/.android
chown -R lapdock:lapdock /home/lapdock

# Establecer target gráfico por defecto
systemctl set-default graphical.target

# Configurar autologin en TTY1 como respaldo garantizado
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat << 'GETTY_EOF' > /etc/systemd/system/getty@tty1.service.d/autologin.conf
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin lapdock --noclear %I $TERM
GETTY_EOF

# Configurar inicio de Cage en .bash_profile del usuario
cat << 'BASH_EOF' > /home/lapdock/.bash_profile
if [ -z "$WAYLAND_DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
    export XDG_RUNTIME_DIR="/run/user/$(id -u)"
    export XDG_SESSION_TYPE="wayland"
    export XDG_CURRENT_DESKTOP="Cage"
    export WLR_LIBINPUT_NO_DEVICES="1"
    export LIBSEAT_BACKEND="seatd"
    if [ -S /run/seatd.sock ]; then
        exec /usr/bin/cage -s -- /usr/local/bin/kiosk-manager.py
    elif command -v seatd-launch >/dev/null 2>&1; then
        exec seatd-launch -- cage -s -- /usr/local/bin/kiosk-manager.py
    else
        exec /usr/bin/cage -s -- /usr/local/bin/kiosk-manager.py
    fi
fi
BASH_EOF
chown lapdock:lapdock /home/lapdock/.bash_profile

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
SUBSYSTEM=="usb", ENV{DEVTYPE}=="usb_device", MODE="0666", GROUP="plugdev", TAG+="systemd"
SUBSYSTEM=="usb", ATTR{idVendor}=="04e8|18d1|2717|22b8|0bb4|12d1|05c6|2a70|19d2|0e8d|0b05|1004", MODE="0666", GROUP="plugdev", TAG+="systemd"
SUBSYSTEM=="video4linux", KERNEL=="video[0-9]*", MODE="0666", GROUP="video", TAG+="systemd"
KERNEL=="uhid", MODE="0666", GROUP="input"
KERNEL=="uinput", MODE="0666", GROUP="input"
EOF
fi

# Servicio systemd de inicio automático Kiosk en Wayland
if [ -f "${ROOT_DIR}/configs/lapdock-kiosk.service" ]; then
  cp "${ROOT_DIR}/configs/lapdock-kiosk.service" "${BUILD_DIR}/chroot/etc/systemd/system/lapdock-kiosk.service"
else
  cat << 'EOF' > "${BUILD_DIR}/chroot/etc/systemd/system/lapdock-kiosk.service"
[Unit]
Description=Lapdock OS Kiosk Display Manager (Wayland Cage)
After=systemd-user-sessions.service plymouth-quit-wait.service pipewire.service udev.service seatd.service
Wants=seatd.service
Conflicts=getty@tty1.service

[Service]
Type=simple
User=lapdock
Group=lapdock
SupplementaryGroups=seat video render input tty dialout plugdev sudo
PAMName=login
PermissionsStartOnly=true
ExecStartPre=/bin/mkdir -p /run/user/1000
ExecStartPre=/bin/chown -R lapdock:lapdock /run/user/1000
ExecStartPre=/bin/chmod 0700 /run/user/1000
ExecStartPre=-/bin/chown lapdock:tty /dev/tty1
Environment=XDG_RUNTIME_DIR=/run/user/1000
Environment=XDG_SESSION_TYPE=wayland
Environment=XDG_CURRENT_DESKTOP=Cage
Environment=WLR_LIBINPUT_NO_DEVICES=1
Environment=MOZ_ENABLE_WAYLAND=1
Environment=LIBSEAT_BACKEND=seatd
TTYPath=/dev/tty1
TTYReset=yes
TTYVHangup=yes
TTYVTDisallocate=yes
UtmpIdentifier=tty1
UtmpMode=user
StandardInput=tty
StandardOutput=journal+console
StandardError=journal+console
ExecStart=/usr/bin/cage -s -- /usr/local/bin/kiosk-manager.py
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target graphical.target
EOF
fi

# Habilitar servicio en chroot
chroot "${BUILD_DIR}/chroot" systemctl enable lapdock-kiosk.service 2>/dev/null || true

# Auto-actualizador silencioso de GitHub
mkdir -p "${BUILD_DIR}/chroot/etc/lapdock"
if [ -s "${ROOT_DIR}/scripts/lapdock-updater.sh" ]; then
  cp "${ROOT_DIR}/scripts/lapdock-updater.sh" "${BUILD_DIR}/chroot/usr/local/bin/lapdock-updater.sh"
fi
chmod +x "${BUILD_DIR}/chroot/usr/local/bin/lapdock-updater.sh"

if [ -s "${ROOT_DIR}/configs/lapdock-updater.service" ]; then
  cp "${ROOT_DIR}/configs/lapdock-updater.service" "${BUILD_DIR}/chroot/etc/systemd/system/lapdock-updater.service"
else
  cat << 'EOF' > "${BUILD_DIR}/chroot/etc/systemd/system/lapdock-updater.service"
[Unit]
Description=Lapdock OS Silent Background GitHub Auto-Updater
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/lapdock-updater.sh
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
fi

if [ -s "${ROOT_DIR}/configs/lapdock-updater.timer" ]; then
  cp "${ROOT_DIR}/configs/lapdock-updater.timer" "${BUILD_DIR}/chroot/etc/systemd/system/lapdock-updater.timer"
else
  cat << 'EOF' > "${BUILD_DIR}/chroot/etc/systemd/system/lapdock-updater.timer"
[Unit]
Description=Lapdock OS Silent Background GitHub Auto-Updater Timer
After=time-sync.target

[Timer]
OnBootSec=1min
OnUnitActiveSec=10min
Persistent=true

[Install]
WantedBy=timers.target
EOF
fi

if [ -s "${ROOT_DIR}/configs/lapdock-update.conf" ]; then
  cp "${ROOT_DIR}/configs/lapdock-update.conf" "${BUILD_DIR}/chroot/etc/lapdock/update.conf"
fi

# Des-enmascarar y habilitar timer de auto-actualización silenciosa
chroot "${BUILD_DIR}/chroot" systemctl unmask lapdock-updater.timer lapdock-updater.service 2>/dev/null || true
chroot "${BUILD_DIR}/chroot" systemctl enable lapdock-updater.timer 2>/dev/null || true

echo "==> [4/6] Desmontando sistemas virtuales y empaquetando SquashFS..."
umount -lf "${BUILD_DIR}/chroot/proc"
umount -lf "${BUILD_DIR}/chroot/sys"
umount -lf "${BUILD_DIR}/chroot/dev/pts"
umount -lf "${BUILD_DIR}/chroot/dev"

# Extraer el kernel y el ramdisk más recientes
LATEST_KERNEL=$(ls -1 "${BUILD_DIR}/chroot/boot"/vmlinuz-* 2>/dev/null | sort -V | tail -n 1)
LATEST_INITRD=$(ls -1 "${BUILD_DIR}/chroot/boot"/initrd.img-* 2>/dev/null | sort -V | tail -n 1)

if [ -z "${LATEST_KERNEL}" ] || [ ! -f "${LATEST_KERNEL}" ]; then
  echo "❌ ERROR: No se encontró vmlinuz en ${BUILD_DIR}/chroot/boot"
  ls -la "${BUILD_DIR}/chroot/boot" || true
  exit 1
fi
if [ -z "${LATEST_INITRD}" ] || [ ! -f "${LATEST_INITRD}" ]; then
  echo "❌ ERROR: No se encontró initrd.img en ${BUILD_DIR}/chroot/boot"
  ls -la "${BUILD_DIR}/chroot/boot" || true
  exit 1
fi

echo "==> Kernel localizado: ${LATEST_KERNEL}"
echo "==> Initrd localizado: ${LATEST_INITRD}"

mkdir -p "${BUILD_DIR}/image/live"
cp -v "${LATEST_KERNEL}" "${BUILD_DIR}/image/live/vmlinuz"
cp -v "${LATEST_INITRD}" "${BUILD_DIR}/image/live/initrd"

# Crear estructura de compatibilidad cruzada de rutas
mkdir -p "${BUILD_DIR}/image/image/live"
cp "${BUILD_DIR}/image/live/vmlinuz" "${BUILD_DIR}/image/image/live/vmlinuz"
cp "${BUILD_DIR}/image/live/initrd" "${BUILD_DIR}/image/image/live/initrd"

# Generar compresión SquashFS
mksquashfs "${BUILD_DIR}/chroot" "${BUILD_DIR}/image/live/filesystem.squashfs" -comp xz -e boot

echo "==> [5/6] Configurando cargador de arranque GRUB (Ventoy / UEFI / BIOS)..."
mkdir -p "${BUILD_DIR}/image/boot/grub"

cat << 'EOF' > "${BUILD_DIR}/image/boot/grub/grub.cfg"
set default="0"
set timeout=3

insmod all_video
insmod font
insmod gfxterm

# 1. Localizar dinámicamente la partición o medio que contiene el kernel
search --no-floppy --set=root --file /live/vmlinuz
if [ ! -e /live/vmlinuz ]; then
    search --no-floppy --set=root --file /image/live/vmlinuz
fi

# 2. Asignar rutas correctas según la ubicación detectada
if [ -e /live/vmlinuz ]; then
    set kpath="/live/vmlinuz"
    set ipath="/live/initrd"
elif [ -e /image/live/vmlinuz ]; then
    set kpath="/image/live/vmlinuz"
    set ipath="/image/live/initrd"
else
    set kpath="/live/vmlinuz"
    set ipath="/live/initrd"
fi

# 3. Detectar si arrancamos desde Ventoy (findiso automático)
if [ -n "${iso_path}" ]; then
    set ventoy_opt="findiso=${iso_path}"
elif [ -n "${vtoy_iso_path}" ]; then
    set ventoy_opt="findiso=${vtoy_iso_path}"
else
    set ventoy_opt=""
fi

menuentry "Lapdock OS (Modo RAM - Recomendado para Ventoy)" --class gnu-linux --class os {
    linux ${kpath} boot=live ${ventoy_opt} components toram quiet splash loglevel=3 console=tty1
    initrd ${ipath}
}

menuentry "Lapdock OS (Modo Directo - Sin cargar a RAM)" --class gnu-linux --class os {
    linux ${kpath} boot=live ${ventoy_opt} components quiet splash loglevel=3 console=tty1
    initrd ${ipath}
}

menuentry "Lapdock OS (Modo Seguro / Consola de Rescate)" --class gnu-linux --class os {
    linux ${kpath} boot=live ${ventoy_opt} components toram nosplash systemd.debug_shell=1
    initrd ${ipath}
}
EOF

# Crear loopback.cfg para máxima compatibilidad con Ventoy y GRUB loopmount
cp "${BUILD_DIR}/image/boot/grub/grub.cfg" "${BUILD_DIR}/image/boot/grub/loopback.cfg"

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

echo "==> [6/6] Generando archivo ISO híbrido para Ventoy / USB / CD..."
if command -v grub-mkrescue &>/dev/null; then
  echo "==> Creando ISO híbrida con grub-mkrescue..."
  grub-mkrescue -o "${DEST_ISO}" "${BUILD_DIR}/image" -- -volid "LAPDOCK_OS"
else
  echo "==> Creando ISO híbrida con xorriso..."
  xorriso -as mkisofs \
      -iso-level 3 \
      -full-iso9660-filenames \
      -volid "LAPDOCK_OS" \
      -output "${DEST_ISO}" \
      -graft-points \
      /="${BUILD_DIR}/image"
fi

echo "=================================================================="
echo "  ✅ COMPILACIÓN FINALIZADA CON ÉXITO"
echo "  📁 Archivo ISO: ${DEST_ISO}"
echo "  📏 Tamaño: $(du -h "${DEST_ISO}" | cut -f1)"
echo "  💡 Copia este archivo directamente a tu pendrive con Ventoy."
echo "=================================================================="
