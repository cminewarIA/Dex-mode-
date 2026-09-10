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
deb http://deb.debian.org/debian bookworm-backports main contrib non-free non-free-firmware
SOURCES

apt-get update
apt-get install -y --no-install-recommends \
    linux-image-amd64 live-boot systemd-sysv udev dbus-user-session \
    firmware-linux firmware-misc-nonfree \
    seatd libseat1 sudo polkitd \
    pipewire pipewire-audio-client-libraries pipewire-pulse wireplumber \
    cage wlr-randr wayland-protocols xwayland x11-xserver-utils adb mpv v4l-utils \
    python3 python3-tk python3-pyudev pciutils usbutils \
    libgl1-mesa-dri mesa-vulkan-drivers \
    curl ca-certificates libsdl2-2.0-0 libusb-1.0-0 ffmpeg

update-initramfs -u -k all

# Compilar Scrcpy v3.1 nativamente para Debian 12 (100% compatible con glibc 2.36)
echo "Compilando Scrcpy v3.1 nativamente para Debian 12..."
apt-get install -y --no-install-recommends \
    gcc git pkg-config meson ninja-build libsdl2-dev \
    libavcodec-dev libavdevice-dev libavformat-dev libavutil-dev \
    libswresample-dev libusb-1.0-0-dev

mkdir -p /tmp/scrcpy-build
cd /tmp/scrcpy-build
curl -sL --fail "https://github.com/Genymobile/scrcpy/releases/download/v3.1/scrcpy-server-v3.1" -o /tmp/scrcpy-server
git clone --depth 1 --branch v3.1 https://github.com/Genymobile/scrcpy.git .
meson setup x --buildtype=release --strip -Db_lto=true -Dprebuilt_server=/tmp/scrcpy-server
ninja -Cx install

mkdir -p /usr/share/scrcpy
cp -f /usr/local/share/scrcpy/scrcpy-server /usr/share/scrcpy/scrcpy-server || true

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
        exec /usr/bin/cage -s -m last -- /usr/local/bin/scrcpy.bin "$@"
    elif command -v seatd-launch >/dev/null 2>&1; then
        exec seatd-launch -- cage -s -m last -- /usr/local/bin/scrcpy.bin "$@"
    else
        exec /usr/bin/cage -s -m last -- /usr/local/bin/scrcpy.bin "$@"
    fi
else
    exec /usr/local/bin/scrcpy.bin "$@"
fi
SCRCPY_WRAPPER
chmod +x /usr/local/bin/scrcpy

# Configurar seatd y permisos SUID para seatd-launch (garantiza sesión DRM/VT limpia sin depender de logind)
chmod u+s /usr/bin/seatd-launch 2>/dev/null || true
systemctl enable seatd.service 2>/dev/null || true

# Crear grupo seat si no existe y configurar usuario lapdock
groupadd -f seat
useradd -m -s /bin/bash -G sudo,video,audio,input,plugdev,render,tty,dialout,seat lapdock || \
usermod -aG sudo,video,audio,input,plugdev,render,tty,dialout,seat lapdock
passwd -d lapdock

# Habilitar sudo sin contraseña para el usuario lapdock en modo Live
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
        exec /usr/bin/cage -s -m last -- /usr/local/bin/kiosk-manager.py
    elif command -v seatd-launch >/dev/null 2>&1; then
        exec seatd-launch -- cage -s -m last -- /usr/local/bin/kiosk-manager.py
    else
        exec /usr/bin/cage -s -m last -- /usr/local/bin/kiosk-manager.py
    fi
fi
BASH_EOF
chown lapdock:lapdock /home/lapdock/.bash_profile

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

# Auto-actualizador silencioso de GitHub
mkdir -p "\${BUILD_DIR}/chroot/etc/lapdock"
if [ -f "\${ROOT_DIR}/scripts/lapdock-updater.sh" ]; then
  cp "\${ROOT_DIR}/scripts/lapdock-updater.sh" "\${BUILD_DIR}/chroot/usr/local/bin/lapdock-updater.sh"
fi
chmod +x "\${BUILD_DIR}/chroot/usr/local/bin/lapdock-updater.sh"

if [ -s "\${ROOT_DIR}/configs/lapdock-updater.service" ]; then
  cp "\${ROOT_DIR}/configs/lapdock-updater.service" "\${BUILD_DIR}/chroot/etc/systemd/system/lapdock-updater.service"
else
  cat << 'EOF' > "\${BUILD_DIR}/chroot/etc/systemd/system/lapdock-updater.service"
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

if [ -s "\${ROOT_DIR}/configs/lapdock-updater.timer" ]; then
  cp "\${ROOT_DIR}/configs/lapdock-updater.timer" "\${BUILD_DIR}/chroot/etc/systemd/system/lapdock-updater.timer"
else
  cat << 'EOF' > "\${BUILD_DIR}/chroot/etc/systemd/system/lapdock-updater.timer"
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

if [ -s "\${ROOT_DIR}/configs/lapdock-update.conf" ]; then
  cp "\${ROOT_DIR}/configs/lapdock-update.conf" "\${BUILD_DIR}/chroot/etc/lapdock/update.conf"
fi

# Des-enmascarar y habilitar timer de auto-actualización silenciosa
chroot "\${BUILD_DIR}/chroot" systemctl unmask lapdock-updater.timer lapdock-updater.service 2>/dev/null || true
chroot "\${BUILD_DIR}/chroot" systemctl enable lapdock-updater.timer 2>/dev/null || true

echo "==> [4/6] Desmontando y empaquetando SquashFS..."
umount -lf "\${BUILD_DIR}/chroot/proc"
umount -lf "\${BUILD_DIR}/chroot/sys"
umount -lf "\${BUILD_DIR}/chroot/dev/pts"
umount -lf "\${BUILD_DIR}/chroot/dev"

# Extraer el kernel y el ramdisk más recientes
LATEST_KERNEL=$(ls -1 "\${BUILD_DIR}/chroot/boot"/vmlinuz-* 2>/dev/null | sort -V | tail -n 1)
LATEST_INITRD=$(ls -1 "\${BUILD_DIR}/chroot/boot"/initrd.img-* 2>/dev/null | sort -V | tail -n 1)

mkdir -p "\${BUILD_DIR}/image/live"
cp -v "\${LATEST_KERNEL}" "\${BUILD_DIR}/image/live/vmlinuz"
cp -v "\${LATEST_INITRD}" "\${BUILD_DIR}/image/live/initrd"

# Compatibilidad cruzada de rutas
mkdir -p "\${BUILD_DIR}/image/image/live"
cp "\${BUILD_DIR}/image/live/vmlinuz" "\${BUILD_DIR}/image/image/live/vmlinuz"
cp "\${BUILD_DIR}/image/live/initrd" "\${BUILD_DIR}/image/image/live/initrd"

mksquashfs "\${BUILD_DIR}/chroot" "\${BUILD_DIR}/image/live/filesystem.squashfs" -comp xz -e boot

echo "==> [5/6] Configurando cargador de arranque GRUB (Ventoy / UEFI / BIOS)..."
mkdir -p "\${BUILD_DIR}/image/boot/grub"

cat << 'EOF' > "\${BUILD_DIR}/image/boot/grub/grub.cfg"
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

if [ -n "\${iso_path}" ]; then
    set ventoy_opt="findiso=\${iso_path}"
elif [ -n "\${vtoy_iso_path}" ]; then
    set ventoy_opt="findiso=\${vtoy_iso_path}"
else
    set ventoy_opt=""
fi

menuentry "Lapdock OS (Modo RAM - Recomendado para Ventoy)" --class gnu-linux --class os {
    linux \${kpath} boot=live \${ventoy_opt} components toram quiet splash loglevel=3 console=tty1
    initrd \${ipath}
}

menuentry "Lapdock OS (Modo Directo - Sin cargar a RAM)" --class gnu-linux --class os {
    linux \${kpath} boot=live \${ventoy_opt} components quiet splash loglevel=3 console=tty1
    initrd \${ipath}
}
EOF

cp "\${BUILD_DIR}/image/boot/grub/grub.cfg" "\${BUILD_DIR}/image/boot/grub/loopback.cfg"

echo "==> [6/6] Generando archivo ISO híbrido para Ventoy / USB / CD..."
if command -v grub-mkrescue &>/dev/null; then
  grub-mkrescue -o "\${DEST_ISO}" "\${BUILD_DIR}/image" -- -volid "LAPDOCK_OS"
else
  xorriso -as mkisofs \
      -iso-level 3 \
      -full-iso9660-filenames \
      -volid "LAPDOCK_OS" \
      -output "\${DEST_ISO}" \
      -graft-points \
      /="\${BUILD_DIR}/image"
fi

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
    description: 'Dashboard visual gráfico en Wayland con monitorización en tiempo real de ADB (DeX/Android) y capturadora HDMI (Nintendo Switch).',
    content: `#!/usr/bin/env python3
"""
Lapdock OS - Kiosk Manager Daemon & Dashboard UI
Muestra una interfaz gráfica a pantalla completa en Wayland (Cage),
monitorea conexiones USB/ADB en tiempo real y lanza automáticamente:
- Samsung DeX / Android vía Scrcpy (con reenvío UHID y baja latencia)
- Nintendo Switch / Consolas vía MPV (Capturadora HDMI USB UVC)
"""

import os, sys, time, subprocess, threading, glob, re
try:
    import pyudev
    HAS_PYUDEV = True
except ImportError:
    HAS_PYUDEV = False

try:
    import tkinter as tk
    HAS_TK = True
except ImportError:
    HAS_TK = False

CURRENT_PROCESS = None
PROCESS_LOCK = threading.Lock()
LOGS = []
LOG_LOCK = threading.Lock()

PHONE_STATE = {"status": "DISCONNECTED", "info": "Esperando cable USB o Wi-Fi...", "device_id": None, "is_wireless": False, "wireless_ip": None}
SWITCH_STATE = {"status": "DISCONNECTED", "info": "Esperando capturadora HDMI...", "device_node": None}

def add_log(msg):
    t = time.strftime("%H:%M:%S")
    entry = f"[{t}] {msg}"
    print(entry, flush=True)
    with LOG_LOCK:
        LOGS.append(entry)
        if len(LOGS) > 20:
            LOGS.pop(0)

def kill_current_projection():
    global CURRENT_PROCESS
    proc = None
    with PROCESS_LOCK:
        if CURRENT_PROCESS and CURRENT_PROCESS.poll() is None:
            proc = CURRENT_PROCESS
            CURRENT_PROCESS = None
    if proc:
        add_log("Deteniendo proyección activa...")
        try:
            proc.terminate()
            proc.wait(timeout=1.5)
        except Exception:
            try: proc.kill()
            except Exception: pass

def enable_wireless_adb():
    dev_id = PHONE_STATE.get("device_id")
    if not dev_id:
        add_log("⚠️ Conecta primero el teléfono por USB para activar Wi-Fi.")
        return False
    if ":" in dev_id:
        add_log(f"✅ Ya opera por Wi-Fi ({dev_id}). Cable desconectable.")
        return True
    add_log("Activando ADB TCP/IP 5555...")
    try:
        subprocess.run(["adb", "-s", dev_id, "tcpip", "5555"], capture_output=True, text=True, timeout=6)
        time.sleep(1.0)
        out = subprocess.run(["adb", "-s", dev_id, "shell", "ip -f inet addr show wlan0"], capture_output=True, text=True, timeout=4).stdout
        m = re.search(r"inet\\s+(\\d+\\.\\d+\\.\\d+\\.\\d+)", out)
        ip = m.group(1) if m else None
        if not ip:
            r = subprocess.run(["adb", "-s", dev_id, "shell", "ip route"], capture_output=True, text=True, timeout=4).stdout
            rm = re.search(r"src\\s+(\\d+\\.\\d+\\.\\d+\\.\\d+)", r)
            ip = rm.group(1) if rm else None
        if ip:
            add_log(f"IP Wi-Fi móvil: {ip}. Conectando...")
            subprocess.run(["adb", "connect", f"{ip}:5555"], capture_output=True, text=True, timeout=6)
            PHONE_STATE["wireless_ip"] = f"{ip}:5555"
            PHONE_STATE["is_wireless"] = True
            add_log("🎉 ¡MODO INALÁMBRICO ACTIVO! Puedes desconectar el cable USB.")
            return True
        else:
            add_log("⚠️ No se detectó IP Wi-Fi. Conecta ambos a la misma Wi-Fi o enciende 'Zona Wi-Fi' en el móvil.")
            return False
    except Exception as e:
        add_log(f"Error Wi-Fi ADB: {e}")
        return False

def get_screen_dimensions():
    try:
        modes = glob.glob("/sys/class/drm/*/modes")
        for m in modes:
            if os.path.exists(m):
                with open(m, "r") as f:
                    line = f.readline().strip()
                if "x" in line:
                    parts = line.split("x")
                    w, h = int(parts[0]), int(parts[1])
                    if w >= 800 and h >= 480:
                        return w, h
    except Exception:
        pass
    return 1920, 1080

def detect_device_system(device_id):
    if not device_id:
        return "UNKNOWN"
    try:
        res_os = subprocess.run(["adb", "-s", device_id, "shell", "cat /etc/os-release 2>/dev/null || true"], capture_output=True, text=True, timeout=2).stdout.lower()
        if any(w in res_os for w in ["ubuntu", "lomiri", "ubports"]):
            return "UBUNTU_TOUCH"
        res_app = subprocess.run(["adb", "-s", device_id, "shell", "which app_process 2>/dev/null || true"], capture_output=True, text=True, timeout=2).stdout.strip()
        if not res_app:
            return "UBUNTU_TOUCH"
        res_mfg = subprocess.run(["adb", "-s", device_id, "shell", "getprop ro.product.manufacturer 2>/dev/null || true"], capture_output=True, text=True, timeout=2).stdout.lower()
        if "samsung" in res_mfg:
            return "SAMSUNG"
        return "ANDROID"
    except Exception:
        return "ANDROID"

def launch_ubuntu_touch(device_id):
    global CURRENT_PROCESS
    kill_current_projection()
    add_log(f"Iniciando proyección Ubuntu Touch ({device_id})...")
    p_mpv = None
    try:
        p_adb = subprocess.Popen(["adb", "-s", device_id, "exec-out", "mirscreencast -m /dev/stdout"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        p_mpv = subprocess.Popen(["mpv", "--profile=low-latency", "--untimed", "--fullscreen", "-"], stdin=p_adb.stdout)
        if p_adb.stdout:
            p_adb.stdout.close()
        with PROCESS_LOCK:
            CURRENT_PROCESS = p_mpv
        time.sleep(2.0)
        if p_mpv.poll() is not None:
            p_adb2 = subprocess.Popen(["adb", "-s", device_id, "shell", "screenrecord --output-format=h264 -"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            p_mpv = subprocess.Popen(["mpv", "--profile=low-latency", "--untimed", "--fullscreen", "-"], stdin=p_adb2.stdout)
            if p_adb2.stdout:
                p_adb2.stdout.close()
            with PROCESS_LOCK:
                CURRENT_PROCESS = p_mpv
        p_mpv.wait()
    except Exception as e:
        add_log(f"Error Ubuntu Touch: {e}")
    finally:
        with PROCESS_LOCK:
            if CURRENT_PROCESS == p_mpv:
                CURRENT_PROCESS = None

def launch_scrcpy(device_id=None, force_wireless=False):
    global CURRENT_PROCESS
    if force_wireless:
        enable_wireless_adb()
        if PHONE_STATE.get("wireless_ip"):
            device_id = PHONE_STATE["wireless_ip"]
    elif not device_id and PHONE_STATE.get("device_id"):
        device_id = PHONE_STATE["device_id"]
    if not device_id:
        return

    os_type = detect_device_system(device_id)
    if os_type == "UBUNTU_TOUCH":
        launch_ubuntu_touch(device_id)
        return

    kill_current_projection()
    screen_w, screen_h = get_screen_dimensions()
    is_wifi = bool(":" in device_id)
    is_samsung = (os_type == "SAMSUNG")
    tipo = "Wi-Fi" if is_wifi else "USB"
    add_log(f"Iniciando ({tipo} - {os_type} - {screen_w}x{screen_h})...")

    if is_samsung:
        try:
            subprocess.run(["adb", "-s", device_id, "shell", "am start -n com.sec.android.app.desktoplauncher/com.sec.android.app.desktoplauncher.DesktopLauncher 2>/dev/null || true"], capture_output=True, timeout=2)
        except Exception:
            pass
        # Intento con nueva pantalla virtual panorámica nativa para DeX
        try:
            p = subprocess.Popen(["scrcpy", "-s", device_id, f"--new-display={screen_w}x{screen_h}/160", "--stay-awake", "--fullscreen", f"--max-size={screen_w}", "--keyboard=uhid", "--mouse=uhid"])
            with PROCESS_LOCK:
                CURRENT_PROCESS = p
            time.sleep(2.0)
            if p.poll() is None:
                p.wait()
                return
        except Exception:
            pass

    # Modo proporcional ajustado a la altura del monitor para evitar cortes
    fit_cmd = ["scrcpy", "-s", device_id, "--stay-awake", "--fullscreen", f"--max-size={screen_h}", "--keyboard=uhid", "--mouse=uhid"]
    p = None
    try:
        p = subprocess.Popen(fit_cmd)
        with PROCESS_LOCK:
            CURRENT_PROCESS = p
        time.sleep(1.5)
        if p.poll() is not None and p.returncode != 0:
            p = subprocess.Popen(["scrcpy", "-s", device_id, "--stay-awake", "--fullscreen", f"--max-size={screen_h}"])
            with PROCESS_LOCK:
                CURRENT_PROCESS = p
        p.wait()
    except Exception as e:
        add_log(f"Error Scrcpy: {e}")
    finally:
        with PROCESS_LOCK:
            if CURRENT_PROCESS == p:
                CURRENT_PROCESS = None

def launch_switch(device_node="/dev/video0"):
    global CURRENT_PROCESS
    kill_current_projection()
    add_log(f"Iniciando entrada de consola HDMI ({device_node}) a baja latencia...")
    cmd = [
        "mpv", f"av://v4l2:{device_node}",
        "--profile=low-latency", "--untimed", "--video-sync=display-resample",
        "--fullscreen", "--demuxer-lavf-format=v4l2",
        "--demuxer-lavf-o-set=input_format=mjpeg", "--audio-buffer=0.01"
    ]
    p = None
    try:
        p = subprocess.Popen(cmd)
        with PROCESS_LOCK:
            CURRENT_PROCESS = p
        p.wait()
        add_log("Entrada de consola finalizada.")
    except Exception as e:
        add_log(f"Error al ejecutar MPV: {e}")
    finally:
        with PROCESS_LOCK:
            if CURRENT_PROCESS == p:
                CURRENT_PROCESS = None

def detect_video_capture():
    nodes = sorted(glob.glob("/dev/video*"))
    for node in nodes:
        try:
            base = os.path.basename(node)
            name_file = f"/sys/class/video4linux/{base}/name"
            if os.path.exists(name_file):
                with open(name_file, "r") as f:
                    name = f.read().strip()
                if any(k in name.lower() for k in ["usb", "hdmi", "capture", "cam link", "ms2109"]):
                    if not any(w in name.lower() for w in ["integrated", "internal", "webcam"]):
                        return node, name
        except Exception:
            pass
    return None, None

def poll_devices_worker():
    try:
        subprocess.run(["adb", "start-server"], capture_output=True, timeout=5)
    except Exception:
        pass
    last_phone = None
    last_switch = None
    while True:
        try:
            res = subprocess.run(["adb", "devices", "-l"], capture_output=True, text=True, timeout=3)
            lines = res.stdout.strip().split("\\n")[1:]
            active = []
            unauth = False
            for l in lines:
                p = l.strip().split()
                if len(p) >= 2:
                    if p[1] == "device":
                        active.append((p[0], ":" in p[0]))
                    elif p[1] == "unauthorized":
                        unauth = True
            if active:
                wifi_dev = [d for d in active if d[1]]
                chosen = wifi_dev[0] if wifi_dev else active[0]
                os_type = detect_device_system(chosen[0])
                PHONE_STATE["status"] = "READY"
                PHONE_STATE["device_id"] = chosen[0]
                PHONE_STATE["is_wireless"] = chosen[1]
                PHONE_STATE["info"] = f"🟢 Conectado ({os_type}): {chosen[0]}"
                if last_phone != "READY":
                    threading.Thread(target=launch_scrcpy, args=(chosen[0],), daemon=True).start()
            elif unauth:
                PHONE_STATE["status"] = "UNAUTHORIZED"
                PHONE_STATE["info"] = "⚠️ Desbloquea tu móvil y pulsa 'Permitir siempre'."
            else:
                PHONE_STATE["status"] = "DISCONNECTED"
                PHONE_STATE["info"] = "Desconectado. Conecta tu Samsung Galaxy, Android o Ubuntu Touch."
            last_phone = PHONE_STATE["status"]

            # Comprobar Switch por USB y capturadora HDMI
            switch_usb = any("057e" in open(f).read().strip().lower() for f in glob.glob("/sys/bus/usb/devices/*/idVendor") if os.path.exists(f))
            node, name = detect_video_capture()
            if node:
                SWITCH_STATE["status"] = "READY"
                SWITCH_STATE["info"] = f"Detectada: {name}"
                SWITCH_STATE["device_node"] = node
                if last_switch != "READY" and PHONE_STATE["status"] != "READY":
                    threading.Thread(target=launch_switch, args=(node,), daemon=True).start()
            elif switch_usb:
                SWITCH_STATE["status"] = "USB_ONLY"
                SWITCH_STATE["info"] = "⚠️ Switch detectada en USB. Requiere Dock + Capturadora HDMI para vídeo."
            else:
                SWITCH_STATE["status"] = "DISCONNECTED"
                SWITCH_STATE["info"] = "Conecta el dock de la Switch a una capturadora HDMI USB."
            last_switch = SWITCH_STATE["status"]
        except Exception:
            pass
        time.sleep(1.5)

class LapdockDashboardUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Lapdock OS")
        self.root.configure(bg="#070a12")
        self.root.attributes("-fullscreen", True)
        self.root.bind("<Escape>", lambda e: kill_current_projection())
        self.root.bind("<F1>", lambda e: self.restart_adb())
        self.root.bind("<F5>", lambda e: add_log("Refresco manual solicitado."))
        self.pulse_phase = 0
        self.last_rendered_state = None
        self.setup_ui()
        self.start_animations()
        self.update_loop()

    def restart_adb(self):
        add_log("Reiniciando demonio ADB...")
        subprocess.run(["adb", "kill-server"], capture_output=True)
        subprocess.run(["adb", "start-server"], capture_output=True)
        add_log("Demonio ADB reiniciado.")

    def setup_ui(self):
        self.header = tk.Frame(self.root, bg="#0c101c", height=65)
        self.header.pack(fill="x", side="top")
        self.header.pack_propagate(False)
        tk.Frame(self.root, bg="#192237", height=1).pack(fill="x", side="top")

        brand_box = tk.Frame(self.header, bg="#0c101c")
        brand_box.pack(side="left", padx=30, pady=12)
        tk.Label(brand_box, text="⚡ LAPDOCK", font=("DejaVu Sans", 18, "bold"), fg="#38bdf8", bg="#0c101c").pack(side="left")
        tk.Label(brand_box, text="OS", font=("DejaVu Sans", 18, "bold"), fg="#f8fafc", bg="#0c101c").pack(side="left", padx=(3, 10))
        tk.Label(brand_box, text="DeX ENGINE 2.5", font=("DejaVu Sans", 9, "bold"), fg="#0284c7", bg="#082f49", padx=8, pady=3).pack(side="left")

        center_box = tk.Frame(self.header, bg="#0c101c")
        center_box.pack(side="left", expand=True)
        self.lbl_clock = tk.Label(center_box, text="--:--:--", font=("DejaVu Sans", 13, "bold"), fg="#f1f5f9", bg="#0c101c")
        self.lbl_clock.pack(side="left", padx=(0, 15))
        scr_w, scr_h = get_screen_dimensions()
        tk.Label(center_box, text=f"🖥️ {scr_w} × {scr_h} @ 60Hz", font=("DejaVu Sans", 10), fg="#64748b", bg="#0c101c").pack(side="left")

        self.status_pill = tk.Label(self.header, text="● SISTEMA LISTO EN RAM", font=("DejaVu Sans", 10, "bold"), fg="#34d399", bg="#064e3b", padx=16, pady=6)
        self.status_pill.pack(side="right", padx=30, pady=16)

        self.main_container = tk.Frame(self.root, bg="#070a12")
        self.main_container.pack(fill="both", expand=True)
        self.canvas = tk.Canvas(self.main_container, bg="#070a12", highlightthickness=0, bd=0)
        self.canvas.place(x=0, y=0, relwidth=1.0, relheight=1.0)
        self.canvas.bind("<Configure>", lambda e: self.draw_canvas_scene())

        self.card_wrapper = tk.Frame(self.main_container, bg="#070a12")
        self.card_wrapper.place(relx=0.5, rely=0.5, anchor="center")

        tk.Frame(self.root, bg="#192237", height=1).pack(fill="x", side="bottom")
        self.footer = tk.Frame(self.root, bg="#0c101c", height=45)
        self.footer.pack(fill="x", side="bottom")
        self.footer.pack_propagate(False)

        self.lbl_recent_event = tk.Label(self.footer, text="📡 Detección activa de puertos USB-C, Wi-Fi y HDMI...", font=("DejaVu Sans", 9), fg="#94a3b8", bg="#0c101c")
        self.lbl_recent_event.pack(side="left", padx=25)

        shortcuts_box = tk.Frame(self.footer, bg="#0c101c")
        shortcuts_box.pack(side="right", padx=25)
        for key, desc in [("F1", "Reiniciar ADB"), ("F5", "Refrescar"), ("Esc", "Salir")]:
            pill = tk.Frame(shortcuts_box, bg="#1e293b", padx=6, pady=2)
            pill.pack(side="left", padx=4)
            tk.Label(pill, text=key, font=("DejaVu Sans", 8, "bold"), fg="#38bdf8", bg="#1e293b").pack(side="left")
            tk.Label(pill, text=f" {desc}", font=("DejaVu Sans", 8), fg="#cbd5e1", bg="#1e293b").pack(side="left")

    def start_animations(self):
        def animate():
            self.pulse_phase = (self.pulse_phase + 1) % 60
            self.draw_canvas_scene()
            self.root.after(50, animate)
        self.root.after(50, animate)

    def draw_canvas_scene(self):
        w = self.canvas.winfo_width()
        h = self.canvas.winfo_height()
        if w < 100 or h < 100: return
        self.canvas.delete("pulse_ring")
        cx, cy = w / 2, h / 2
        p_status = PHONE_STATE.get("status")
        s_status = SWITCH_STATE.get("status")
        base_color = "#059669" if (p_status == "READY" or s_status == "READY") else "#b45309" if p_status == "UNAUTHORIZED" else "#0369a1"
        glow_color = "#10b981" if (p_status == "READY" or s_status == "READY") else "#f59e0b" if p_status == "UNAUTHORIZED" else "#0284c7"
        for i in range(3):
            phase_offset = (self.pulse_phase + i * 20) % 60
            progress = phase_offset / 60.0
            r = 160 + progress * 240
            if progress > 0.85: continue
            self.canvas.create_oval(cx - r, cy - r, cx + r, cy + r, outline=glow_color if progress < 0.4 else base_color, width=1 if progress > 0.5 else 2, tags="pulse_ring")

    def render_state_card(self):
        p_status = PHONE_STATE.get("status")
        s_status = SWITCH_STATE.get("status")
        current_sig = (p_status, PHONE_STATE.get("device_id"), s_status)
        if self.last_rendered_state == current_sig: return
        self.last_rendered_state = current_sig

        for widget in self.card_wrapper.winfo_children(): widget.destroy()

        if p_status == "READY":
            dev_id = PHONE_STATE.get("device_id", "Desconocido")
            is_wifi = PHONE_STATE.get("is_wireless", False)
            os_type = detect_device_system(dev_id)
            scr_w, scr_h = get_screen_dimensions()
            card = tk.Frame(self.card_wrapper, bg="#0d1424", padx=40, pady=35)
            card.pack()
            bframe = tk.Frame(card, bg="#10b981", padx=2, pady=2)
            bframe.pack()
            inner = tk.Frame(bframe, bg="#0b1120", padx=35, pady=30)
            inner.pack()
            tk.Label(inner, text="● CONEXIÓN ESTABLECIDA • LISTO PARA TRANSMITIR", font=("DejaVu Sans", 10, "bold"), fg="#34d399", bg="#064e3b", padx=12, pady=4).pack(anchor="w")
            title = "SAMSUNG GALAXY (DeX)" if os_type == "SAMSUNG" else "UBUNTU TOUCH (Lomiri)" if os_type == "UBUNTU_TOUCH" else "DISPOSITIVO ANDROID"
            sub = "Modo Escritorio 16:9 activado • Ventanas libres y barra de tareas" if os_type == "SAMSUNG" else "Transmisión nativa Wayland/Mir • Interfaz optimizada"
            tk.Label(inner, text=f"📱 {title}", font=("DejaVu Sans", 22, "bold"), fg="#f8fafc", bg="#0b1120").pack(anchor="w", pady=(15, 4))
            tk.Label(inner, text=sub, font=("DejaVu Sans", 11), fg="#94a3b8", bg="#0b1120").pack(anchor="w", pady=(0, 20))
            
            srow = tk.Frame(inner, bg="#0b1120")
            srow.pack(fill="x", pady=(0, 25))
            conn_lbl = "📶 Wi-Fi 5GHz" if is_wifi else "🔌 Cable USB 3.0"
            for lbl, val in [("ENLACE", conn_lbl), ("IDENTIFICADOR", str(dev_id)), ("PANTALLA", f"{scr_w}×{scr_h}"), ("FPS", "60 FPS")]:
                ib = tk.Frame(srow, bg="#131d33", padx=12, pady=8)
                ib.pack(side="left", padx=(0, 10))
                tk.Label(ib, text=lbl, font=("DejaVu Sans", 7, "bold"), fg="#64748b", bg="#131d33").pack(anchor="w")
                tk.Label(ib, text=val, font=("DejaVu Sans", 10, "bold"), fg="#e2e8f0", bg="#131d33").pack(anchor="w")

            brow = tk.Frame(inner, bg="#0b1120")
            brow.pack(fill="x")
            tk.Button(brow, text="🚀 Abrir a Pantalla Completa", font=("DejaVu Sans", 12, "bold"), bg="#2563eb", fg="white", relief="flat", bd=0, padx=24, pady=12, cursor="hand2", command=lambda: threading.Thread(target=launch_scrcpy, args=(dev_id,), daemon=True).start()).pack(side="left", padx=(0, 14))
            if not is_wifi:
                tk.Button(brow, text="📶 Activar Wi-Fi (Desconectar Cable)", font=("DejaVu Sans", 11, "bold"), bg="#0284c7", fg="white", relief="flat", bd=0, padx=20, pady=12, cursor="hand2", command=lambda: threading.Thread(target=lambda: (enable_wireless_adb(), launch_scrcpy(force_wireless=True)), daemon=True).start()).pack(side="left", padx=(0, 14))
            tk.Button(brow, text="🔄 Reconectar", font=("DejaVu Sans", 10), bg="#1e293b", fg="#cbd5e1", relief="flat", bd=0, padx=16, pady=12, cursor="hand2", command=lambda: threading.Thread(target=launch_scrcpy, args=(dev_id,), daemon=True).start()).pack(side="left")

        elif p_status == "UNAUTHORIZED":
            card = tk.Frame(self.card_wrapper, bg="#0d1424", padx=40, pady=35)
            card.pack()
            bframe = tk.Frame(card, bg="#f59e0b", padx=2, pady=2)
            bframe.pack()
            inner = tk.Frame(bframe, bg="#14110b", padx=35, pady=30)
            inner.pack()
            tk.Label(inner, text="⚠️ ACCIÓN REQUERIDA EN TU TELÉFONO", font=("DejaVu Sans", 10, "bold"), fg="#fbbf24", bg="#451a03", padx=12, pady=4).pack(anchor="w")
            tk.Label(inner, text="🔑 Desbloquea tu teléfono móvil", font=("DejaVu Sans", 22, "bold"), fg="#fef3c7", bg="#14110b").pack(anchor="w", pady=(15, 6))
            tk.Label(inner, text="En tu móvil marca 'Permitir siempre desde este ordenador' y pulsa Aceptar.\\nLa proyección iniciará en cuanto autorices la conexión.", font=("DejaVu Sans", 11), fg="#cbd5e1", bg="#14110b", justify="left").pack(anchor="w", pady=(0, 20))
            tk.Button(inner, text="🔄 Comprobar Autorización", font=("DejaVu Sans", 11, "bold"), bg="#d97706", fg="white", relief="flat", bd=0, padx=20, pady=10, cursor="hand2", command=self.restart_adb).pack(anchor="w")

        elif s_status == "READY":
            node = SWITCH_STATE.get("device_node", "/dev/video0")
            card = tk.Frame(self.card_wrapper, bg="#0d1424", padx=40, pady=35)
            card.pack()
            bframe = tk.Frame(card, bg="#10b981", padx=2, pady=2)
            bframe.pack()
            inner = tk.Frame(bframe, bg="#081510", padx=35, pady=30)
            inner.pack()
            tk.Label(inner, text="● SEÑAL DE VÍDEO HDMI ACTIVA", font=("DejaVu Sans", 10, "bold"), fg="#34d399", bg="#064e3b", padx=12, pady=4).pack(anchor="w")
            tk.Label(inner, text="🎮 NINTENDO SWITCH / CONSOLA", font=("DejaVu Sans", 22, "bold"), fg="#f8fafc", bg="#081510").pack(anchor="w", pady=(15, 6))
            tk.Label(inner, text=f"Captura HDMI sincronizada en {node} a 60 FPS sin retardo.", font=("DejaVu Sans", 11), fg="#94a3b8", bg="#081510").pack(anchor="w", pady=(0, 20))
            tk.Button(inner, text="🎮 Jugar a Pantalla Completa", font=("DejaVu Sans", 12, "bold"), bg="#059669", fg="white", relief="flat", bd=0, padx=24, pady=12, cursor="hand2", command=lambda: threading.Thread(target=launch_switch, args=(node,), daemon=True).start()).pack(anchor="w")

        else:
            box = tk.Frame(self.card_wrapper, bg="#070a12")
            box.pack()
            tk.Label(box, text="⚡", font=("DejaVu Sans", 36), fg="#38bdf8", bg="#070a12").pack(pady=(0, 8))
            tk.Label(box, text="Conecta tu dispositivo", font=("DejaVu Sans", 26, "bold"), fg="#f8fafc", bg="#070a12").pack(pady=(0, 8))
            tk.Label(box, text="Conecta tu teléfono por USB-C / Wi-Fi o tu Nintendo Switch mediante capturadora HDMI", font=("DejaVu Sans", 12), fg="#94a3b8", bg="#070a12").pack(pady=(0, 35))

            caps = tk.Frame(box, bg="#070a12")
            caps.pack()
            for icon, title, desc, col in [
                ("📱", "Samsung Galaxy (DeX)", "Escritorio 16:9 completo\\nTeclado y touchpad listos", "#0284c7"),
                ("🐧", "Ubuntu Touch", "Entorno Lomiri nativo\\nSin retardo con Mir", "#ea580c"),
                ("🎮", "Nintendo Switch", "Juego a 60 FPS en pantalla\\nAudio estéreo directo", "#10b981")
            ]:
                cc = tk.Frame(caps, bg="#0e1526", padx=20, pady=18, width=240, height=130)
                cc.pack(side="left", padx=10)
                cc.pack_propagate(False)
                tk.Frame(cc, bg=col, height=3).pack(fill="x", side="top", pady=(0, 10))
                tk.Label(cc, text=f"{icon} {title}", font=("DejaVu Sans", 11, "bold"), fg="#f1f5f9", bg="#0e1526").pack(anchor="w")
                tk.Label(cc, text=desc, font=("DejaVu Sans", 9), fg="#94a3b8", bg="#0e1526", justify="left").pack(anchor="w", pady=(6, 0))

    def update_loop(self):
        self.lbl_clock.config(text=time.strftime("%H:%M:%S • %A, %d de %b"))
        self.render_state_card()
        p_status = PHONE_STATE.get("status")
        s_status = SWITCH_STATE.get("status")
        if p_status == "READY":
            self.status_pill.config(text="● DISPOSITIVO MÓVIL ACTIVO", fg="#34d399", bg="#064e3b")
        elif s_status == "READY":
            self.status_pill.config(text="● SEÑAL HDMI CONECTADA", fg="#34d399", bg="#064e3b")
        elif p_status == "UNAUTHORIZED":
            self.status_pill.config(text="⚠️ ACCIÓN REQUERIDA", fg="#fbbf24", bg="#451a03")
        else:
            self.status_pill.config(text="● ESPERANDO CONEXIÓN", fg="#94a3b8", bg="#1e293b")
        with LOG_LOCK:
            if LOGS: self.lbl_recent_event.config(text=f"📡 {LOGS[-1]}")
        self.root.after(300, self.update_loop)

if __name__ == "__main__":
    threading.Thread(target=poll_devices_worker, daemon=True).start()
    threading.Thread(target=silent_github_updater_worker, daemon=True).start()
    if HAS_TK:
        r = tk.Tk()
        LapdockDashboardUI(r)
        r.mainloop()
    else:
        while True: time.sleep(2)
`
  },
  {
    filename: 'configs/99-lapdock-devices.rules',
    path: '/configs/99-lapdock-devices.rules',
    language: 'udev',
    description: 'Reglas udev para dar acceso USB a ADB y dispositivos de vídeo V4L2 sin privilegios de root.',
    content: `# /etc/udev/rules.d/99-lapdock-devices.rules
# 1. Permisos globales USB para demonio ADB sin root
SUBSYSTEM=="usb", ENV{DEVTYPE}=="usb_device", MODE="0666", GROUP="plugdev", TAG+="systemd"

# 2. Terminales Android reconocidos
SUBSYSTEM=="usb", ATTR{idVendor}=="04e8|18d1|2717|22b8|0bb4|12d1|05c6|2a70|19d2|0e8d|0b05|1004", MODE="0666", GROUP="plugdev", TAG+="systemd"

# 3. Dispositivos de vídeo V4L2 (Capturadoras HDMI USB para Nintendo Switch)
SUBSYSTEM=="video4linux", KERNEL=="video[0-9]*", MODE="0666", GROUP="video", TAG+="systemd"

# 4. Emulación de periféricos UHID y UINPUT (Scrcpy teclado y ratón nativos por hardware)
KERNEL=="uhid", MODE="0666", GROUP="input"
KERNEL=="uinput", MODE="0666", GROUP="input"
`
  },
  {
    filename: 'configs/lapdock-kiosk.service',
    path: '/configs/lapdock-kiosk.service',
    language: 'ini',
    description: 'Unidad de servicio systemd para lanzar Wayland Cage mediante seatd-launch sin problemas de permisos de sesión DRM/VT.',
    content: `[Unit]
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
ExecStart=/usr/bin/cage -s -m last -- /usr/local/bin/kiosk-manager.py
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target graphical.target
`
  },
  {
    filename: 'scripts/lapdock-updater.sh',
    path: '/scripts/lapdock-updater.sh',
    language: 'bash',
    description: 'Demone silencioso en segundo plano que escanea y descarga actualizaciones de scripts y servicios directamente desde GitHub.',
    content: `#!/bin/bash
# ==============================================================================
# Lapdock OS - Silent GitHub Auto-Updater
# Escanea y actualiza automáticamente scripts y servicios en segundo plano
# ==============================================================================

set -u

CONFIG_FILE="/etc/lapdock/update.conf"
LOG_TAG="lapdock-updater"
LOG_FILE="/var/log/lapdock-update.log"

GITHUB_REPO="cminewarIA/Dex-mode-"
GITHUB_BRANCH="main"
ENABLED="true"

if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi

log() {
    local msg="[\$(date '+%Y-%m-%d %H:%M:%S')] \$1"
    echo "\$msg" >> "$LOG_FILE" 2>/dev/null || true
    logger -t "$LOG_TAG" "\$1" 2>/dev/null || true
}

if [ "$ENABLED" != "true" ] && [ "$ENABLED" != "1" ]; then
    exit 0
fi

if ! curl -s --connect-timeout 4 --max-time 6 "https://raw.githubusercontent.com" >/dev/null 2>&1; then
    exit 0
fi

BASE_RAW_URL="https://raw.githubusercontent.com/\${GITHUB_REPO}/\${GITHUB_BRANCH}"
UPDATED_SOMETHING=0
RESTART_KIOSK_NEEDED=0

update_file() {
    local remote_rel_path="\$1"
    local local_dest="\$2"
    local file_type="\$3"
    local file_mode="\$4"

    local tmp_file
    tmp_file=\$(mktemp "/tmp/lapdock-update.XXXXXX")

    if ! curl -fsSL --connect-timeout 5 --max-time 15 "\${BASE_RAW_URL}/\${remote_rel_path}" -o "\$tmp_file" 2>/dev/null; then
        rm -f "\$tmp_file"
        return 1
    fi

    if grep -qi "<!DOCTYPE html>" "\$tmp_file" 2>/dev/null || grep -qi "404: Not Found" "\$tmp_file" 2>/dev/null; then
        rm -f "\$tmp_file"
        return 1
    fi

    local file_size
    file_size=\$(wc -c < "\$tmp_file" 2>/dev/null || echo 0)
    if [ "\$file_size" -lt 100 ]; then
        rm -f "\$tmp_file"
        return 1
    fi

    if [ "\$file_type" = "python" ]; then
        if ! python3 -m py_compile "\$tmp_file" 2>/dev/null; then
            log "⚠️ Error de sintaxis en \$remote_rel_path descartado."
            rm -f "\$tmp_file"
            return 1
        fi
    fi

    if [ -f "\$local_dest" ]; then
        local current_hash new_hash
        current_hash=\$(sha256sum "\$local_dest" 2>/dev/null | awk '{print \$1}')
        new_hash=\$(sha256sum "\$tmp_file" 2>/dev/null | awk '{print \$1}')
        if [ "\$current_hash" = "\$new_hash" ]; then
            rm -f "\$tmp_file"
            return 0
        fi
        cp -p "\$local_dest" "\${local_dest}.bak" 2>/dev/null || true
    fi

    mkdir -p "\$(dirname "\$local_dest")"
    if install -m "\$file_mode" "\$tmp_file" "\$local_dest"; then
        log "✅ Actualizado con éxito: \$local_dest (desde GitHub: \$remote_rel_path)"
        UPDATED_SOMETHING=1
        if [[ "\$local_dest" == *"/kiosk-manager.py"* ]] || [[ "\$local_dest" == *"/lapdock-kiosk.service"* ]]; then
            RESTART_KIOSK_NEEDED=1
        fi
    fi

    rm -f "\$tmp_file"
    return 0
}

update_file "scripts/kiosk-manager.py" "/usr/local/bin/kiosk-manager.py" "python" "755" || true
update_file "scripts/lapdock-updater.sh" "/usr/local/bin/lapdock-updater.sh" "bash" "755" || true
update_file "configs/lapdock-kiosk.service" "/etc/systemd/system/lapdock-kiosk.service" "text" "644" || true
update_file "configs/99-lapdock-devices.rules" "/etc/udev/rules.d/99-lapdock-devices.rules" "text" "644" || true

if [ -f "/etc/udev/rules.d/99-lapdock-devices.rules" ] && [ "\$UPDATED_SOMETHING" -eq 1 ]; then
    udevadm control --reload-rules 2>/dev/null || true
fi

if [ "\$RESTART_KIOSK_NEEDED" -eq 1 ]; then
    systemctl daemon-reload 2>/dev/null || true
    if ! pgrep -x "scrcpy" >/dev/null 2>&1 && ! pgrep -x "mpv" >/dev/null 2>&1; then
        systemctl restart lapdock-kiosk.service 2>/dev/null || true
    fi
fi
exit 0
`
  },
  {
    filename: 'configs/lapdock-updater.service',
    path: '/configs/lapdock-updater.service',
    language: 'ini',
    description: 'Servicio oneshot de systemd que ejecuta el script de auto-actualización silenciosa desde GitHub.',
    content: `[Unit]
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
`
  },
  {
    filename: 'configs/lapdock-update.conf',
    path: '/configs/lapdock-update.conf',
    language: 'bash',
    description: 'Archivo de configuración del repositorio GitHub y frecuencia de actualización.',
    content: `# Lapdock OS - Configuración de Auto-Actualización desde GitHub
GITHUB_REPO="cminewarIA/Dex-mode-"
GITHUB_BRANCH="main"
ENABLED="true"
`
  },
  {
    filename: 'configs/lapdock-updater.timer',
    path: '/configs/lapdock-updater.timer',
    language: 'ini',
    description: 'Temporizador systemd que activa la búsqueda silenciosa de actualizaciones cada 10 minutos.',
    content: `[Unit]
Description=Lapdock OS Silent Background GitHub Auto-Updater Timer
After=time-sync.target

[Timer]
OnBootSec=1min
OnUnitActiveSec=10min
Persistent=true

[Install]
WantedBy=timers.target
`
  }
];
