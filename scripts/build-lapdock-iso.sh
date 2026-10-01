#!/usr/bin/env bash
# ==============================================================================
# Lapdock OS - Script de Compilación de Imagen ISO Live para Ventoy & PXE
# Distribución base: Debian 12 (Bookworm) Minimal + Compositor Wayland Cage
# Aceleración: Caché persistente de paquetes APT, binarios Scrcpy y RootFS Base
# ==============================================================================

set -euo pipefail

START_TIME=$(date +%s)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

OUTPUT_DIR="${ROOT_DIR}/output"
BUILD_DIR="${BUILD_DIR:-/var/tmp/lapdock-build-$$}"
ISO_NAME="Lapdock-OS-x86_64.iso"
DEST_ISO="${OUTPUT_DIR}/${ISO_NAME}"

# Directorios de caché persistente (en almacenamiento masivo NVMe/disco)
CACHE_DIR="/mnt/almacenamiento/cache/lapdock"
BASE_ROOTFS_TAR="${CACHE_DIR}/lapdock-base-rootfs.tar.zst"
SCRCPY_CACHE_DIR="${CACHE_DIR}/scrcpy"
APT_CACHE_DIR="${CACHE_DIR}/apt/archives"

REBUILD_BASE=false
for arg in "${@:-}"; do
  case "$arg" in
    --full|--rebuild-base|--clean)
      REBUILD_BASE=true
      ;;
    --help|-h)
      echo "Uso: sudo bash $0 [OPCIONES]"
      echo ""
      echo "Opciones:"
      echo "  (Sin opciones)   Modo Rápido: Reutiliza la imagen base en caché (~20-30 seg)."
      echo "  --full           Modo Completo: Reconstruye Debian 12 desde cero con debootstrap."
      echo "  --rebuild-base   Alias de --full."
      echo "  --help, -h       Muestra esta ayuda."
      exit 0
      ;;
  esac
done

echo "=================================================================="
echo "  🚀 INICIANDO COMPILACIÓN DE LAPDOCK OS ISO PARA VENTOY & PXE"
if [ "${REBUILD_BASE}" = "false" ] && [ -f "${BASE_ROOTFS_TAR}" ]; then
  echo "  ⚡ MODO RÁPIDO ACTIVO: Reutilizando sistema base en caché"
else
  echo "  📦 MODO COMPLETO ACTIVO: Generando sistema base con debootstrap"
fi
echo "=================================================================="

# Verificar privilegios de root
if [ "$EUID" -ne 0 ]; then
  echo "[!] Este script requiere privilegios de superusuario. Ejecuta con: sudo bash $0"
  exit 1
fi

# Preparar directorios de salida y montaje
mkdir -p "${OUTPUT_DIR}" "${CACHE_DIR}" "${SCRCPY_CACHE_DIR}" "${APT_CACHE_DIR}"
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"/{chroot,image/live,image/boot/grub,image/isolinux}

cleanup() {
  echo "[*] Limpiando puntos de montaje y archivos temporales..."
  umount -lf "${BUILD_DIR}/chroot/var/cache/apt/archives" 2>/dev/null || true
  umount -lf "${BUILD_DIR}/chroot/proc" 2>/dev/null || true
  umount -lf "${BUILD_DIR}/chroot/sys" 2>/dev/null || true
  umount -lf "${BUILD_DIR}/chroot/dev/pts" 2>/dev/null || true
  umount -lf "${BUILD_DIR}/chroot/dev" 2>/dev/null || true
  rm -rf "${BUILD_DIR}" 2>/dev/null || true
}
trap cleanup EXIT

# ------------------------------------------------------------------------------
# FASE 1 Y 2: PREPARACIÓN DEL SISTEMA BASE (RÁPIDA O COMPLETA)
# ------------------------------------------------------------------------------

if [ "${REBUILD_BASE}" = "false" ] && [ -f "${BASE_ROOTFS_TAR}" ]; then
  echo "==> [1-2/6] ⚡ Descomprimiendo sistema base desde caché (${BASE_ROOTFS_TAR})..."
  tar -I "zstd -T0 -d" -xpf "${BASE_ROOTFS_TAR}" -C "${BUILD_DIR}/chroot"
  echo "  ✅ Sistema base restaurado desde caché en pocos segundos."
else
  echo "==> [1/6] Descargando sistema base Debian 12 Bookworm (amd64)..."
  KEYRING_ARG=""
  if [ -f "/usr/share/keyrings/debian-archive-keyring.gpg" ]; then
    KEYRING_ARG="--keyring=/usr/share/keyrings/debian-archive-keyring.gpg"
  fi

  debootstrap ${KEYRING_ARG} --arch=amd64 --variant=minbase bookworm "${BUILD_DIR}/chroot" http://deb.debian.org/debian/

  echo "==> [2/6] Configurando chroot del sistema operativo con caché APT..."
  mkdir -p "${BUILD_DIR}/chroot/var/cache/apt/archives"
  mount --bind "${APT_CACHE_DIR}" "${BUILD_DIR}/chroot/var/cache/apt/archives"
  mount --bind /dev "${BUILD_DIR}/chroot/dev"
  mount --bind /dev/pts "${BUILD_DIR}/chroot/dev/pts"
  mount -t proc /proc "${BUILD_DIR}/chroot/proc"
  mount -t sysfs /sys "${BUILD_DIR}/chroot/sys"

  # Copiar binarios precompilados de Scrcpy si existen en caché
  if [ -f "${SCRCPY_CACHE_DIR}/scrcpy" ] && [ -f "${SCRCPY_CACHE_DIR}/scrcpy-server" ]; then
    mkdir -p "${BUILD_DIR}/chroot/tmp/scrcpy-cache"
    cp -v "${SCRCPY_CACHE_DIR}/scrcpy" "${BUILD_DIR}/chroot/tmp/scrcpy-cache/scrcpy"
    cp -v "${SCRCPY_CACHE_DIR}/scrcpy-server" "${BUILD_DIR}/chroot/tmp/scrcpy-cache/scrcpy-server"
  fi

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
    wlr-randr \
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
    ffmpeg \
    avahi-daemon \
    avahi-utils \
    libnss-mdns \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-libav \
    gstreamer1.0-tools \
    uxplay

# Regenerar initramfs asegurando la inclusión de los scripts de live-boot
echo "Actualizando initramfs con soporte live-boot..."
update-initramfs -u -k all

# Instalar o compilar Scrcpy v3.1 nativamente
if [ -f /tmp/scrcpy-cache/scrcpy ] && [ -f /tmp/scrcpy-cache/scrcpy-server ]; then
    echo "⚡ Instalando Scrcpy v3.1 desde caché precompilada..."
    mkdir -p /usr/local/bin /usr/local/share/scrcpy /usr/share/scrcpy
    cp -f /tmp/scrcpy-cache/scrcpy /usr/local/bin/scrcpy.bin
    chmod +x /usr/local/bin/scrcpy.bin
    cp -f /tmp/scrcpy-cache/scrcpy-server /usr/local/share/scrcpy/scrcpy-server
    cp -f /tmp/scrcpy-cache/scrcpy-server /usr/share/scrcpy/scrcpy-server
else
    echo "Compilando Scrcpy v3.1 nativamente para Debian 12..."
    apt-get install -y --no-install-recommends \
        gcc git pkg-config meson ninja-build libsdl2-dev libavcodec-dev libavdevice-dev libavformat-dev libavutil-dev libswresample-dev libusb-1.0-0-dev

    mkdir -p /tmp/scrcpy-build
    cd /tmp/scrcpy-build
    curl -sL --fail "https://github.com/Genymobile/scrcpy/releases/download/v3.1/scrcpy-server-v3.1" -o /tmp/scrcpy-server
    git clone --depth 1 --branch v3.1 https://github.com/Genymobile/scrcpy.git .
    meson setup x --buildtype=release --strip -Db_lto=true -Dprebuilt_server=/tmp/scrcpy-server
    ninja -Cx install

    mkdir -p /usr/share/scrcpy
    cp -f /usr/local/share/scrcpy/scrcpy-server /usr/share/scrcpy/scrcpy-server || true

    apt-mark auto gcc git pkg-config meson ninja-build libsdl2-dev libavcodec-dev libavdevice-dev libavformat-dev libavutil-dev libswresample-dev libusb-1.0-0-dev 2>/dev/null || true
    apt-get autoremove -y --purge
    rm -rf /tmp/scrcpy-build /tmp/scrcpy-server
    mv /usr/local/bin/scrcpy /usr/local/bin/scrcpy.bin
fi

# Configurar wrapper inteligente de Scrcpy
cat << 'SCRCPY_WRAPPER' > /usr/local/bin/scrcpy
#!/bin/bash
if [ -z "$WAYLAND_DISPLAY" ] && [ -z "$DISPLAY" ]; then
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

chmod u+s /usr/bin/seatd-launch 2>/dev/null || true
systemctl enable seatd.service 2>/dev/null || true

# Crear usuario de sistema para la sesión Kiosk
groupadd -f seat
useradd -m -s /bin/bash -G sudo,video,audio,input,plugdev,render,tty,dialout,seat lapdock || \
usermod -aG sudo,video,audio,input,plugdev,render,tty,dialout,seat lapdock
passwd -d lapdock

mkdir -p /etc/sudoers.d
echo "lapdock ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/lapdock
chmod 0440 /etc/sudoers.d/lapdock

mkdir -p /home/lapdock/.android
chown -R lapdock:lapdock /home/lapdock

systemctl set-default graphical.target

mkdir -p /etc/systemd/system/getty@tty1.service.d
cat << 'GETTY_EOF' > /etc/systemd/system/getty@tty1.service.d/autologin.conf
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin lapdock --noclear %I $TERM
GETTY_EOF

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

echo "lapdock-os" > /etc/hostname
rm -rf /tmp/scrcpy-cache
EOF

  chmod +x "${BUILD_DIR}/chroot/tmp/provision.sh"
  chroot "${BUILD_DIR}/chroot" /tmp/provision.sh
  rm -f "${BUILD_DIR}/chroot/tmp/provision.sh"

  # Guardar binarios de Scrcpy en caché del host si no estaban
  if [ ! -f "${SCRCPY_CACHE_DIR}/scrcpy" ] && [ -f "${BUILD_DIR}/chroot/usr/local/bin/scrcpy.bin" ]; then
    cp -v "${BUILD_DIR}/chroot/usr/local/bin/scrcpy.bin" "${SCRCPY_CACHE_DIR}/scrcpy"
    cp -v "${BUILD_DIR}/chroot/usr/local/share/scrcpy/scrcpy-server" "${SCRCPY_CACHE_DIR}/scrcpy-server" 2>/dev/null || true
  fi

  # Desmontar puntos antes de guardar el snapshot
  umount -lf "${BUILD_DIR}/chroot/var/cache/apt/archives" 2>/dev/null || true
  umount -lf "${BUILD_DIR}/chroot/proc" 2>/dev/null || true
  umount -lf "${BUILD_DIR}/chroot/sys" 2>/dev/null || true
  umount -lf "${BUILD_DIR}/chroot/dev/pts" 2>/dev/null || true
  umount -lf "${BUILD_DIR}/chroot/dev" 2>/dev/null || true

  # Guardar snapshot base en caché
  echo "==> 📦 Guardando imagen base en caché (${BASE_ROOTFS_TAR})..."
  tar -I "zstd -T0 -3" -cpf "${BASE_ROOTFS_TAR}" -C "${BUILD_DIR}/chroot" .
  echo "  ✅ Caché base generada con éxito."
fi

# ------------------------------------------------------------------------------
# FASE 3: INYECTAR SCRIPTS Y CONFIGURACIONES ACTUALES DEL PROYECTO
# ------------------------------------------------------------------------------

echo "==> [3/6] Inyectando orquestador Kiosk, receptor Miracast, udev y servicios..."
mkdir -p "${BUILD_DIR}/chroot/etc/udev/rules.d"
mkdir -p "${BUILD_DIR}/chroot/usr/local/bin"
mkdir -p "${BUILD_DIR}/chroot/etc/systemd/system"
mkdir -p "${BUILD_DIR}/chroot/etc/avahi/services"
mkdir -p "${BUILD_DIR}/chroot/etc/lapdock"

# Orquestador Kiosk
if [ -f "${ROOT_DIR}/scripts/kiosk-manager.py" ]; then
  cp -fv "${ROOT_DIR}/scripts/kiosk-manager.py" "${BUILD_DIR}/chroot/usr/local/bin/kiosk-manager.py"
fi
chmod +x "${BUILD_DIR}/chroot/usr/local/bin/kiosk-manager.py"

# Receptor Miracast / Wi-Fi Display (WFD)
if [ -f "${ROOT_DIR}/scripts/lapdock-miracast-sink.py" ]; then
  cp -fv "${ROOT_DIR}/scripts/lapdock-miracast-sink.py" "${BUILD_DIR}/chroot/usr/local/bin/lapdock-miracast-sink.py"
  chmod +x "${BUILD_DIR}/chroot/usr/local/bin/lapdock-miracast-sink.py"
fi

# Servicio Avahi mDNS (_display._tcp)
if [ -f "${ROOT_DIR}/configs/miracast.service" ]; then
  cp -fv "${ROOT_DIR}/configs/miracast.service" "${BUILD_DIR}/chroot/etc/avahi/services/miracast.service"
fi

if [ -f "${ROOT_DIR}/configs/lapdock-miracast.service" ]; then
  cp -fv "${ROOT_DIR}/configs/lapdock-miracast.service" "${BUILD_DIR}/chroot/etc/systemd/system/lapdock-miracast.service"
fi

# Reglas udev
if [ -f "${ROOT_DIR}/configs/99-lapdock-devices.rules" ]; then
  cp -fv "${ROOT_DIR}/configs/99-lapdock-devices.rules" "${BUILD_DIR}/chroot/etc/udev/rules.d/99-lapdock-devices.rules"
fi

# Servicio Kiosk
if [ -f "${ROOT_DIR}/configs/lapdock-kiosk.service" ]; then
  cp -fv "${ROOT_DIR}/configs/lapdock-kiosk.service" "${BUILD_DIR}/chroot/etc/systemd/system/lapdock-kiosk.service"
fi

# Auto-actualizador silencioso de GitHub
if [ -s "${ROOT_DIR}/scripts/lapdock-updater.sh" ]; then
  cp -fv "${ROOT_DIR}/scripts/lapdock-updater.sh" "${BUILD_DIR}/chroot/usr/local/bin/lapdock-updater.sh"
  chmod +x "${BUILD_DIR}/chroot/usr/local/bin/lapdock-updater.sh"
fi

if [ -s "${ROOT_DIR}/configs/lapdock-updater.service" ]; then
  cp -fv "${ROOT_DIR}/configs/lapdock-updater.service" "${BUILD_DIR}/chroot/etc/systemd/system/lapdock-updater.service"
fi

if [ -s "${ROOT_DIR}/configs/lapdock-updater.timer" ]; then
  cp -fv "${ROOT_DIR}/configs/lapdock-updater.timer" "${BUILD_DIR}/chroot/etc/systemd/system/lapdock-updater.timer"
fi

if [ -s "${ROOT_DIR}/configs/lapdock-update.conf" ]; then
  cp -fv "${ROOT_DIR}/configs/lapdock-update.conf" "${BUILD_DIR}/chroot/etc/lapdock/update.conf"
fi

# ------------------------------------------------------------------------------
# FASE 4: EMPAQUETAR SQUASHFS (MULTINÚCLEO)
# ------------------------------------------------------------------------------

echo "==> [4/6] Extrayendo kernel y empaquetando SquashFS multihilo..."

# Localizar kernel y ramdisk
LATEST_KERNEL=$(ls -1 "${BUILD_DIR}/chroot/boot"/vmlinuz-* 2>/dev/null | sort -V | tail -n 1)
LATEST_INITRD=$(ls -1 "${BUILD_DIR}/chroot/boot"/initrd.img-* 2>/dev/null | sort -V | tail -n 1)

if [ -z "${LATEST_KERNEL}" ] || [ ! -f "${LATEST_KERNEL}" ]; then
  echo "❌ ERROR: No se encontró vmlinuz en ${BUILD_DIR}/chroot/boot"
  exit 1
fi
if [ -z "${LATEST_INITRD}" ] || [ ! -f "${LATEST_INITRD}" ]; then
  echo "❌ ERROR: No se encontró initrd.img en ${BUILD_DIR}/chroot/boot"
  exit 1
fi

echo "==> Kernel localizado: ${LATEST_KERNEL}"
echo "==> Initrd localizado: ${LATEST_INITRD}"

mkdir -p "${BUILD_DIR}/image/live" "${BUILD_DIR}/image/image/live"
cp -v "${LATEST_KERNEL}" "${BUILD_DIR}/image/live/vmlinuz"
cp -v "${LATEST_INITRD}" "${BUILD_DIR}/image/live/initrd"
cp "${BUILD_DIR}/image/live/vmlinuz" "${BUILD_DIR}/image/image/live/vmlinuz"
cp "${BUILD_DIR}/image/live/initrd" "${BUILD_DIR}/image/image/live/initrd"

# Generar compresión SquashFS acelerada con todos los procesadores disponibles
echo "==> Comprimiendo filesystem.squashfs con $(nproc) hilos de CPU..."
mksquashfs "${BUILD_DIR}/chroot" "${BUILD_DIR}/image/live/filesystem.squashfs" -processors "$(nproc)" -comp xz -e boot

# ------------------------------------------------------------------------------
# FASE 5: CONFIGURACIÓN GRUB (VENTOY / UEFI / BIOS)
# ------------------------------------------------------------------------------

echo "==> [5/6] Configurando cargador de arranque GRUB..."
mkdir -p "${BUILD_DIR}/image/boot/grub"

cat << 'EOF' > "${BUILD_DIR}/image/boot/grub/grub.cfg"
set default="0"
set timeout=3

insmod all_video
insmod font
insmod gfxterm

search --no-floppy --set=root --file /live/vmlinuz
if [ ! -e /live/vmlinuz ]; then
    search --no-floppy --set=root --file /image/live/vmlinuz
fi

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

cp "${BUILD_DIR}/image/boot/grub/grub.cfg" "${BUILD_DIR}/image/boot/grub/loopback.cfg"

mkdir -p "${BUILD_DIR}/image/EFI/BOOT"
if command -v grub-mkstandalone &>/dev/null; then
  grub-mkstandalone \
      --format=x86_64-efi \
      --output="${BUILD_DIR}/image/EFI/BOOT/BOOTX64.EFI" \
      --locales="" \
      --fonts="" \
      "boot/grub/grub.cfg=${BUILD_DIR}/image/boot/grub/grub.cfg" || true
fi

# ------------------------------------------------------------------------------
# FASE 6: GENERACIÓN ISO Y DESPLIEGUE AUTOMÁTICO EN PXE
# ------------------------------------------------------------------------------

echo "==> [6/6] Generando archivo ISO híbrido..."
if command -v grub-mkrescue &>/dev/null; then
  grub-mkrescue -o "${DEST_ISO}" "${BUILD_DIR}/image" -- -volid "LAPDOCK_OS"
else
  xorriso -as mkisofs \
      -iso-level 3 \
      -full-iso9660-filenames \
      -volid "LAPDOCK_OS" \
      -output "${DEST_ISO}" \
      -graft-points \
      /="${BUILD_DIR}/image"
fi

# Sincronización automática con el servidor PXE local
PXE_DIRS=(
  "/home/servidor/almacenamiento/servidor_pxe/http"
  "/mnt/almacenamiento/servidor_pxe/http"
  "/srv/pxe"
)

for PDIR in "${PXE_DIRS[@]}"; do
  if [ -d "${PDIR}" ]; then
    echo "==> Sincronizando con servidor PXE en ${PDIR}..."
    ISO_DEST="${PDIR}/isos"
    [ ! -d "${ISO_DEST}" ] && ISO_DEST="${PDIR}/iso"
    mkdir -p "${ISO_DEST}"

    SYS_DEST="${PDIR}/sistemas/lapdock"
    [ ! -d "${PDIR}/sistemas" ] && SYS_DEST="${PDIR}/os/lapdock"
    mkdir -p "${SYS_DEST}"

    cp -fv "${DEST_ISO}" "${ISO_DEST}/Lapdock-OS-x86_64.iso"

    if [ -f "${BUILD_DIR}/image/live/vmlinuz" ]; then
      cp -fv "${BUILD_DIR}/image/live/vmlinuz" "${SYS_DEST}/vmlinuz"
      cp -fv "${BUILD_DIR}/image/live/initrd" "${SYS_DEST}/initrd"
      cp -fv "${BUILD_DIR}/image/live/filesystem.squashfs" "${SYS_DEST}/filesystem.squashfs"
    fi

    chown -R servidor:servidor "${ISO_DEST}" "${SYS_DEST}" 2>/dev/null || true
  fi
done

END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))

echo "=================================================================="
echo "  ✅ COMPILACIÓN Y DESPLIEGUE FINALIZADOS CON ÉXITO"
echo "  📁 Archivo ISO: ${DEST_ISO}"
echo "  📏 Tamaño: $(du -h "${DEST_ISO}" | cut -f1)"
echo "  ⏱️ Tiempo total de compilación: ${TOTAL_TIME} segundos"
echo "  🌐 Servidor PXE listo y actualizado."
echo "=================================================================="
