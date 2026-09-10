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
    cage wayland-protocols xwayland x11-xserver-utils adb mpv v4l-utils \
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

def launch_scrcpy(device_id=None, force_wireless=False):
    global CURRENT_PROCESS
    if force_wireless:
        enable_wireless_adb()
        if PHONE_STATE.get("wireless_ip"):
            device_id = PHONE_STATE["wireless_ip"]
    elif not device_id and PHONE_STATE.get("device_id"):
        device_id = PHONE_STATE["device_id"]
    kill_current_projection()
    is_wifi = bool(device_id and ":" in device_id)
    tipo = "Wi-Fi" if is_wifi else "USB"
    add_log(f"Iniciando proyección ({tipo} - ID: {device_id or 'Auto'})...")
    base_cmd = ["scrcpy", "--stay-awake", "--fullscreen", "--max-fps=60"]
    if device_id:
        base_cmd.extend(["-s", device_id])
    elif force_wireless:
        base_cmd.append("--tcpip")
    dex_cmd = base_cmd + ["--keyboard=uhid", "--mouse=uhid"]
    p = None
    try:
        add_log(f"Lanzando Scrcpy UHID ({tipo})...")
        p = subprocess.Popen(dex_cmd)
        with PROCESS_LOCK:
            CURRENT_PROCESS = p
        time.sleep(1.5)
        if p.poll() is not None and p.returncode != 0:
            add_log("Aviso: UHID no admitido. Reintentando estándar...")
            p = subprocess.Popen(base_cmd)
            with PROCESS_LOCK:
                CURRENT_PROCESS = p
        add_log("✅ Proyección DeX/Android conectada con éxito.")
        p.wait()
        add_log("Proyección DeX/Android finalizada.")
    except Exception as e:
        add_log(f"Error al lanzar Scrcpy: {e}")
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
                    return node, name
        except Exception:
            pass
    if "/dev/video0" in nodes:
        return "/dev/video0", "Dispositivo de vídeo (/dev/video0)"
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
                PHONE_STATE["status"] = "READY"
                PHONE_STATE["device_id"] = chosen[0]
                PHONE_STATE["is_wireless"] = chosen[1]
                if chosen[1]:
                    PHONE_STATE["info"] = f"📶 Conectado por Wi-Fi ({chosen[0]}) - Cable desconectable"
                else:
                    PHONE_STATE["info"] = f"🔌 Conectado por USB ({chosen[0]})"
                if last_phone != "READY":
                    threading.Thread(target=launch_scrcpy, args=(chosen[0],), daemon=True).start()
            elif unauth:
                PHONE_STATE["status"] = "UNAUTHORIZED"
                PHONE_STATE["info"] = "⚠️ Desbloquea tu móvil y pulsa 'Aceptar' en la pantalla."
            else:
                PHONE_STATE["status"] = "DISCONNECTED"
                PHONE_STATE["info"] = "Desconectado. Conecta tu móvil por USB o Wi-Fi."
            last_phone = PHONE_STATE["status"]

            node, name = detect_video_capture()
            if node:
                SWITCH_STATE["status"] = "READY"
                SWITCH_STATE["info"] = f"Detectada: {name}"
                SWITCH_STATE["device_node"] = node
                if last_switch != "READY" and PHONE_STATE["status"] != "READY":
                    threading.Thread(target=launch_switch, args=(node,), daemon=True).start()
            else:
                SWITCH_STATE["status"] = "DISCONNECTED"
                SWITCH_STATE["info"] = "Conecta el dock de la Switch a una capturadora HDMI USB."
            last_switch = SWITCH_STATE["status"]
        except Exception:
            pass
        time.sleep(1.5)

class DashboardUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Lapdock OS")
        self.root.configure(bg="#0b0f19")
        self.root.attributes("-fullscreen", True)
        self.root.bind("<Escape>", lambda e: kill_current_projection())
        self.root.bind("<F1>", lambda e: subprocess.run(["adb", "start-server"]))

        hf = tk.Frame(self.root, bg="#0f172a", height=70)
        hf.pack(fill="x", side="top")
        tk.Label(hf, text="⚡ LAPDOCK OS", font=("Helvetica", 22, "bold"), fg="#38bdf8", bg="#0f172a").pack(side="left", padx=25, pady=15)
        tk.Label(hf, text="🟢 SISTEMA ACTIVO EN RAM", font=("Helvetica", 10, "bold"), fg="#10b981", bg="#064e3b", padx=12, pady=5).pack(side="right", padx=25)

        cnt = tk.Frame(self.root, bg="#0b0f19")
        cnt.pack(fill="both", expand=True, padx=35, pady=20)
        cnt.columnconfigure(0, weight=1)
        cnt.columnconfigure(1, weight=1)

        cp = tk.Frame(cnt, bg="#1e293b", padx=20, pady=20)
        cp.grid(row=0, column=0, sticky="nsew", padx=10)
        tk.Label(cp, text="📱 SAMSUNG GALAXY & ANDROID", font=("Helvetica", 14, "bold"), fg="white", bg="#1e293b").pack(anchor="w")
        self.p_lbl = tk.Label(cp, text="Esperando...", font=("Helvetica", 12, "bold"), fg="#94a3b8", bg="#1e293b", wraplength=420, justify="left")
        self.p_lbl.pack(anchor="w", pady=12)
        tk.Label(cp, text="1. Conecta el móvil por USB para autorizar.\\n2. Pulsa 'Activar Wi-Fi' para usar DeX sin cables.\\n3. ¡Desconecta el cable USB!", fg="#cbd5e1", bg="#1e293b", justify="left").pack(anchor="w")
        
        btn_box = tk.Frame(cp, bg="#1e293b")
        btn_box.pack(anchor="w", pady=(10, 0))
        tk.Button(btn_box, text="Proyectar (USB)", bg="#2563eb", fg="white", font=("Helvetica", 10, "bold"), command=lambda: threading.Thread(target=launch_scrcpy, daemon=True).start()).pack(side="left", padx=(0, 8))
        tk.Button(btn_box, text="📶 Activar Wi-Fi (Desconectar)", bg="#0284c7", fg="white", font=("Helvetica", 10, "bold"), command=lambda: threading.Thread(target=lambda: (enable_wireless_adb(), launch_scrcpy(force_wireless=True)), daemon=True).start()).pack(side="left")

        cs = tk.Frame(cnt, bg="#1e293b", padx=20, pady=20)
        cs.grid(row=0, column=1, sticky="nsew", padx=10)
        tk.Label(cs, text="🎮 NINTENDO SWITCH & CONSOLAS", font=("Helvetica", 14, "bold"), fg="white", bg="#1e293b").pack(anchor="w")
        self.s_lbl = tk.Label(cs, text="Esperando...", font=("Helvetica", 12, "bold"), fg="#94a3b8", bg="#1e293b", wraplength=420, justify="left")
        self.s_lbl.pack(anchor="w", pady=12)
        tk.Label(cs, text="Nota: Las laptops no tienen entrada HDMI directa.\\nConecta el dock de la Switch a una capturadora HDMI-a-USB.\\nSe abrirá automáticamente a 60 FPS sin lag.", fg="#cbd5e1", bg="#1e293b", justify="left").pack(anchor="w")

        lf = tk.Frame(self.root, bg="#020617", height=100)
        lf.pack(fill="x", side="bottom", padx=35, pady=(0, 15))
        self.l_lbl = tk.Label(lf, text="Listo.", font=("Courier", 9), fg="#a7f3d0", bg="#020617", justify="left", anchor="w")
        self.l_lbl.pack(anchor="w", padx=12, pady=10, fill="x")

        self.loop()

    def loop(self):
        self.p_lbl.config(text=f"{'🟢' if PHONE_STATE['status']=='READY' else '⚠️' if PHONE_STATE['status']=='UNAUTHORIZED' else '⚪'} {PHONE_STATE['info']}")
        self.s_lbl.config(text=f"{'🟢' if SWITCH_STATE['status']=='READY' else '⚪'} {SWITCH_STATE['info']}")
        with LOG_LOCK:
            self.l_lbl.config(text="\\n".join(LOGS[-2:] or ["Esperando eventos..."]))
        self.root.after(350, self.loop)

if __name__ == "__main__":
    threading.Thread(target=poll_devices_worker, daemon=True).start()
    if HAS_TK:
        r = tk.Tk()
        DashboardUI(r)
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
ExecStart=/usr/bin/seatd-launch -- /usr/bin/cage -s -- /usr/local/bin/kiosk-manager.py
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target graphical.target
`
  }
];
