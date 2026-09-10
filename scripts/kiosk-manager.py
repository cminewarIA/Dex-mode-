#!/usr/bin/env python3
"""
Lapdock OS - Kiosk Manager Daemon & Dashboard UI
Muestra una interfaz gráfica a pantalla completa en Wayland (Cage),
monitorea conexiones USB/ADB en tiempo real y lanza automáticamente:
- Samsung DeX / Android vía Scrcpy (con reenvío UHID y baja latencia)
- Nintendo Switch / Consolas vía MPV (Capturadora HDMI USB UVC)
"""

import os
import sys
import time
import subprocess
import threading
import glob
import re

# Intentar importar módulos opcionales con degradación elegante
try:
    import pyudev
    HAS_PYUDEV = True
except ImportError:
    HAS_PYUDEV = False

try:
    import tkinter as tk
    from tkinter import font as tkfont
    HAS_TK = True
except ImportError:
    HAS_TK = False

CURRENT_PROCESS = None
PROCESS_LOCK = threading.Lock()
LOGS = []
LOG_LOCK = threading.Lock()

# Estados globales de detección
PHONE_STATE = {
    "status": "DISCONNECTED",
    "info": "Esperando cable USB o Wi-Fi...",
    "device_id": None,
    "is_wireless": False,
    "wireless_ip": None,
    "os_type": "UNKNOWN"
}
SWITCH_STATE = {"status": "DISCONNECTED", "info": "Esperando capturadora HDMI...", "device_node": None}

def add_log(msg):
    timestamp = time.strftime("%H:%M:%S")
    entry = f"[{timestamp}] {msg}"
    print(entry, flush=True)
    with LOG_LOCK:
        LOGS.append(entry)
        if len(LOGS) > 30:
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
            try:
                proc.kill()
            except Exception:
                pass

def optimize_displays():
    """
    Detecta pantallas conectadas en Wayland. Si detecta una pantalla externa (HDMI / DP)
    junto con la pantalla interna del portátil (eDP / LVDS), apaga la interna mediante wlr-randr
    para que Cage no divida la salida entre dos monitores ni desplace la imagen.
    """
    try:
        res = subprocess.run(["wlr-randr"], capture_output=True, text=True, timeout=2)
        if res.returncode == 0:
            lines = res.stdout.splitlines()
            outputs = [line.split()[0] for line in lines if line and not line.startswith(" ")]
            has_external = any(re.match(r"^(HDMI|DP|VGA)-", o, re.IGNORECASE) for o in outputs)
            internals = [o for o in outputs if re.match(r"^(eDP|LVDS)-", o, re.IGNORECASE)]
            if has_external and internals:
                for int_out in internals:
                    add_log(f"📺 Pantalla externa detectada. Desactivando pantalla interna {int_out} para evitar desalineación.")
                    subprocess.run(["wlr-randr", "--output", int_out, "--off"], capture_output=True, timeout=2)
    except Exception:
        pass

def get_screen_dimensions():
    """Detecta la resolución física de la pantalla activa para encajar DeX y evitar recortes o desplazamientos."""
    # 1. Intentar con wlr-randr para obtener la resolución activa real
    try:
        out = subprocess.run(["wlr-randr"], capture_output=True, text=True, timeout=1).stdout
        match = re.search(r"(\d{3,4})x(\d{3,4})\s+px.*?current", out)
        if match:
            return int(match.group(1)), int(match.group(2))
    except Exception:
        pass

    # 2. Priorizar pantallas externas conectadas en /sys/class/drm
    try:
        connectors = sorted(glob.glob("/sys/class/drm/card*-*"), key=lambda p: (0 if any(k in p for k in ["HDMI", "DP"]) else 1))
        for conn in connectors:
            status_path = os.path.join(conn, "status")
            if os.path.exists(status_path):
                with open(status_path, "r") as f:
                    if "connected" not in f.read().lower():
                        continue
            modes_path = os.path.join(conn, "modes")
            if os.path.exists(modes_path):
                with open(modes_path, "r") as f:
                    for line in f:
                        line = line.strip()
                        if "x" in line:
                            parts = line.split("x")
                            w, h = int(parts[0]), int(parts[1])
                            if w >= 800 and h >= 480:
                                return w, h
    except Exception:
        pass
    return 1920, 1080

def detect_device_system(device_id):
    """Detecta si el dispositivo conectado es Samsung (DeX), Ubuntu Touch o Android estándar."""
    if not device_id:
        return "UNKNOWN"
    try:
        # 1. Comprobar si es Ubuntu Touch (UBports / Lomiri)
        res_os = subprocess.run(
            ["adb", "-s", device_id, "shell", "cat /etc/os-release 2>/dev/null || true"],
            capture_output=True, text=True, timeout=2
        ).stdout.lower()
        if "ubuntu" in res_os or "lomiri" in res_os or "ubports" in res_os:
            return "UBUNTU_TOUCH"

        res_app = subprocess.run(
            ["adb", "-s", device_id, "shell", "which app_process 2>/dev/null || true"],
            capture_output=True, text=True, timeout=2
        ).stdout.strip()
        if not res_app:
            return "UBUNTU_TOUCH"

        # 2. Comprobar si es Samsung
        res_mfg = subprocess.run(
            ["adb", "-s", device_id, "shell", "getprop ro.product.manufacturer 2>/dev/null || true"],
            capture_output=True, text=True, timeout=2
        ).stdout.lower()
        if "samsung" in res_mfg:
            return "SAMSUNG"
        return "ANDROID"
    except Exception:
        return "ANDROID"

def enable_wireless_adb():
    """Configura ADB sobre TCP/IP en el móvil para permitir desconectar el cable USB."""
    dev_id = PHONE_STATE.get("device_id")
    if not dev_id:
        add_log("⚠️ Conecta primero el teléfono por cable USB para autorizar el modo inalámbrico.")
        return False

    if ":" in dev_id:
        add_log(f"✅ El terminal ya está operando por Wi-Fi ({dev_id}). Cable desconectable.")
        return True

    add_log(f"Iniciando configuración ADB TCP/IP en puerto 5555 ({dev_id})...")
    try:
        # 1. Habilitar TCP/IP en el móvil
        subprocess.run(["adb", "-s", dev_id, "tcpip", "5555"], capture_output=True, text=True, timeout=6)
        time.sleep(1.0)

        # 2. Consultar dirección IP del móvil en la red Wi-Fi
        phone_ip = None
        ip_out = subprocess.run(["adb", "-s", dev_id, "shell", "ip -f inet addr show wlan0"], capture_output=True, text=True, timeout=4).stdout
        ip_match = re.search(r"inet\s+(\d+\.\d+\.\d+\.\d+)", ip_out)
        if ip_match:
            phone_ip = ip_match.group(1)

        if not phone_ip:
            route_out = subprocess.run(["adb", "-s", dev_id, "shell", "ip route"], capture_output=True, text=True, timeout=4).stdout
            route_match = re.search(r"src\s+(\d+\.\d+\.\d+\.\d+)", route_out)
            if route_match:
                phone_ip = route_match.group(1)

        if not phone_ip:
            prop_out = subprocess.run(["adb", "-s", dev_id, "shell", "getprop dhcp.wlan0.ipaddress"], capture_output=True, text=True, timeout=4).stdout.strip()
            if re.match(r"^\d+\.\d+\.\d+\.\d+$", prop_out):
                phone_ip = prop_out

        if phone_ip:
            add_log(f"IP Wi-Fi detectada en el móvil: {phone_ip}")
            conn_res = subprocess.run(["adb", "connect", f"{phone_ip}:5555"], capture_output=True, text=True, timeout=6)
            add_log(f"ADB Connect: {conn_res.stdout.strip()}")
            PHONE_STATE["wireless_ip"] = f"{phone_ip}:5555"
            PHONE_STATE["is_wireless"] = True
            add_log("🎉 ¡MODO INALÁMBRICO ACTIVO! Ya puedes desconectar el cable USB.")
            return True
        else:
            add_log("⚠️ No se detectó IP Wi-Fi. Asegúrate de conectar el móvil y el portátil a la misma Wi-Fi (o activa 'Zona Wi-Fi' en tu Samsung).")
            return False
    except Exception as e:
        add_log(f"Error al activar ADB inalámbrico: {e}")
        return False

def launch_ubuntu_touch(device_id):
    """Proyección para dispositivos con Ubuntu Touch (Lomiri)."""
    global CURRENT_PROCESS
    kill_current_projection()
    optimize_displays()
    add_log(f"Iniciando proyección para terminal Ubuntu Touch ({device_id})...")

    # Intento 1: Scrcpy (funciona de forma nativa en la mayoría de puertos Halium modernos)
    p_scrcpy = None
    try:
        add_log("Probando enlace de baja latencia con Scrcpy...")
        p_scrcpy = subprocess.Popen(["scrcpy", "-s", device_id, "--stay-awake", "--fullscreen"])
        with PROCESS_LOCK:
            CURRENT_PROCESS = p_scrcpy
        time.sleep(2.0)
        if p_scrcpy.poll() is None:
            p_scrcpy.wait()
            return
    except Exception:
        pass

    p_adb = None
    p_mpv = None
    try:
        # Intento 2: mirscreencast canalizado hacia MPV a baja latencia
        add_log("Lanzando mirscreencast sobre ADB a MPV...")
        p_adb = subprocess.Popen(
            ["adb", "-s", device_id, "exec-out", "mirscreencast -m /dev/stdout"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
        )
        p_mpv = subprocess.Popen(
            [
                "mpv",
                "--profile=low-latency",
                "--untimed",
                "--video-sync=display-resample",
                "--fullscreen",
                "-"
            ],
            stdin=p_adb.stdout
        )
        if p_adb.stdout:
            p_adb.stdout.close()

        with PROCESS_LOCK:
            CURRENT_PROCESS = p_mpv

        time.sleep(2.0)
        if p_mpv.poll() is not None and p_mpv.returncode != 0:
            add_log("Aviso: mirscreencast no disponible. Probando screenrecord h264...")
            # Intento 3: screenrecord h264
            p_adb2 = subprocess.Popen(
                ["adb", "-s", device_id, "shell", "screenrecord --output-format=h264 -"],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
            )
            p_mpv = subprocess.Popen(
                [
                    "mpv",
                    "--profile=low-latency",
                    "--untimed",
                    "--fullscreen",
                    "-"
                ],
                stdin=p_adb2.stdout
            )
            if p_adb2.stdout:
                p_adb2.stdout.close()
            with PROCESS_LOCK:
                CURRENT_PROCESS = p_mpv

        add_log("✅ Proyección Ubuntu Touch en curso.")
        p_mpv.wait()
        add_log("Proyección Ubuntu Touch finalizada.")
    except Exception as e:
        add_log(f"Error al proyectar Ubuntu Touch: {e}")
    finally:
        with PROCESS_LOCK:
            if CURRENT_PROCESS == p_mpv:
                CURRENT_PROCESS = None

def launch_scrcpy(device_id=None, force_wireless=False):
    """
    Lanza Scrcpy configurado para modo escritorio DeX o proyección panorámica
    con aceleración UHID, control de ratón/teclado y pantalla completa centrada.
    """
    global CURRENT_PROCESS
    if force_wireless:
        enable_wireless_adb()
        if PHONE_STATE.get("wireless_ip"):
            device_id = PHONE_STATE["wireless_ip"]
    elif not device_id and PHONE_STATE.get("device_id"):
        device_id = PHONE_STATE["device_id"]
    if not device_id:
        add_log("⚠️ No hay identificador de dispositivo para iniciar Scrcpy.")
        return

    os_type = detect_device_system(device_id)
    PHONE_STATE["os_type"] = os_type

    if os_type == "UBUNTU_TOUCH":
        launch_ubuntu_touch(device_id)
        return

    kill_current_projection()
    optimize_displays()
    screen_w, screen_h = get_screen_dimensions()
    is_wifi = bool(":" in str(device_id))
    tipo = "Wi-Fi" if is_wifi else "USB"
    add_log(f"🚀 Iniciando Scrcpy ({tipo} • {os_type} • {screen_w}x{screen_h})...")

    p = None
    if os_type == "SAMSUNG":
        # Habilitar modo escritorio en pantallas secundarias y soporte de ventanas libres en Android
        try:
            subprocess.run(["adb", "-s", device_id, "shell", "settings put global force_desktop_mode_on_external_displays 1"], capture_output=True, timeout=2)
            subprocess.run(["adb", "-s", device_id, "shell", "settings put global enable_freeform_support 1"], capture_output=True, timeout=2)
            subprocess.run(["adb", "-s", device_id, "shell", "am start -n com.sec.android.app.desktoplauncher/.DesktopLauncher 2>/dev/null || true"], capture_output=True, timeout=2)
        except Exception:
            pass

        # Intento 1: Nueva pantalla virtual nativa para Samsung DeX a resolución completa
        try:
            dex_cmd = [
                "scrcpy", "-s", device_id,
                f"--new-display={screen_w}x{screen_h}/160",
                "--start-app=com.sec.android.app.desktoplauncher",
                "--stay-awake",
                "--fullscreen",
                "--keyboard=uhid",
                "--mouse=uhid"
            ]
            add_log(f"Iniciando Samsung DeX en pantalla virtual {screen_w}x{screen_h}...")
            p = subprocess.Popen(dex_cmd)
            with PROCESS_LOCK:
                CURRENT_PROCESS = p
            time.sleep(2.0)
            if p.poll() is None:
                p.wait()
                return
        except Exception as e:
            add_log(f"Aviso pantalla virtual DeX: {e}")

        # Intento 2: Pantalla virtual estándar sin start-app
        try:
            dex_cmd2 = [
                "scrcpy", "-s", device_id,
                f"--new-display={screen_w}x{screen_h}/160",
                "--stay-awake",
                "--fullscreen",
                "--keyboard=uhid",
                "--mouse=uhid"
            ]
            p = subprocess.Popen(dex_cmd2)
            with PROCESS_LOCK:
                CURRENT_PROCESS = p
            time.sleep(2.0)
            if p.poll() is None:
                p.wait()
                return
        except Exception:
            pass

    # Modo estándar proporcional ajustado a pantalla completa
    std_cmd = [
        "scrcpy", "-s", device_id,
        "--stay-awake",
        "--fullscreen",
        "--keyboard=uhid",
        "--mouse=uhid"
    ]
    try:
        p = subprocess.Popen(std_cmd)
        with PROCESS_LOCK:
            CURRENT_PROCESS = p
        time.sleep(1.5)
        if p.poll() is not None and p.returncode != 0:
            add_log("Reintentando Scrcpy sin modo UHID...")
            p = subprocess.Popen(["scrcpy", "-s", device_id, "--stay-awake", "--fullscreen"])
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
        "mpv",
        f"av://v4l2:{device_node}",
        "--profile=low-latency",
        "--untimed",
        "--video-sync=display-resample",
        "--fullscreen",
        "--demuxer-lavf-format=v4l2",
        "--demuxer-lavf-o-set=input_format=mjpeg",
        "--audio-buffer=0.01"
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

def check_nintendo_switch_usb():
    """Detecta si la Nintendo Switch está conectada al puerto USB (VID 057e)."""
    try:
        for vid_path in glob.glob("/sys/bus/usb/devices/*/idVendor"):
            try:
                with open(vid_path, "r") as f:
                    if f.read().strip().lower() == "057e":
                        return True
            except Exception:
                pass
    except Exception:
        pass
    return False

def check_linux_phone_usb():
    """Detecta terminales Linux/Ubuntu Touch en USB sin ADB habilitado."""
    try:
        for dev_dir in glob.glob("/sys/bus/usb/devices/*"):
            try:
                v_file = os.path.join(dev_dir, "idVendor")
                p_file = os.path.join(dev_dir, "product")
                if os.path.exists(v_file):
                    with open(v_file, "r") as f:
                        vid = f.read().strip().lower()
                    if vid in ["2b4c", "2a47", "2931", "1bbb", "2ae5"]:
                        return True
                if os.path.exists(p_file):
                    with open(p_file, "r") as f:
                        prod = f.read().strip().lower()
                    if any(w in prod for w in ["ubuntu", "lomiri", "volla", "pinephone", "aquaris"]):
                        return True
            except Exception:
                pass
    except Exception:
        pass
    return False

def detect_video_capture():
    """
    Detecta capturadoras HDMI USB externas (Cam Link, MS2109, MacroSilicon, USB Video, etc.)
    descartando la webcam integrada del portátil.
    """
    nodes = glob.glob("/dev/video*")
    nodes.sort()

    # 1. Búsqueda prioritaria por nombre de capturadora conocida
    for node in nodes:
        try:
            base = os.path.basename(node)
            name_file = f"/sys/class/video4linux/{base}/name"
            if os.path.exists(name_file):
                with open(name_file, "r") as f:
                    dev_name = f.read().strip()
                dev_lower = dev_name.lower()
                if any(k in dev_lower for k in [
                    "hdmi", "capture", "cam link", "ms2109", "macrosilicon",
                    "usb video", "fhd capture", "video capture", "ezcap", "mirabox", "game live"
                ]):
                    if not any(w in dev_lower for w in ["integrated", "internal", "facetime", "front camera", "chicony"]):
                        return node, dev_name
        except Exception:
            pass

    # 2. Búsqueda por bus USB externo
    for node in nodes:
        try:
            base = os.path.basename(node)
            device_link = os.path.realpath(f"/sys/class/video4linux/{base}/device")
            name_file = f"/sys/class/video4linux/{base}/name"
            dev_name = "Capturadora HDMI USB"
            if os.path.exists(name_file):
                with open(name_file, "r") as f:
                    dev_name = f.read().strip()
            dev_lower = dev_name.lower()

            if "usb" in device_link:
                if not any(w in dev_lower for w in ["integrated", "internal", "webcam", "laptop camera", "chicony", "sunplus"]):
                    index_file = f"/sys/class/video4linux/{base}/index"
                    idx = "0"
                    if os.path.exists(index_file):
                        with open(index_file, "r") as f:
                            idx = f.read().strip()
                    if idx == "0":
                        return node, dev_name
        except Exception:
            pass

    return None, None

def poll_devices_worker():
    """Hilo de fondo que verifica periódicamente el estado de ADB y V4L2."""
    add_log("Iniciando servicio de detección de hardware Lapdock OS...")
    try:
        subprocess.run(["adb", "start-server"], capture_output=True, timeout=5)
        add_log("Servidor ADB iniciado correctamente.")
    except Exception as e:
        add_log(f"Aviso al iniciar ADB: {e}")

    last_phone_status = None
    last_switch_status = None

    while True:
        try:
            # 1. Comprobar estado de teléfonos mediante ADB
            adb_res = subprocess.run(["adb", "devices", "-l"], capture_output=True, text=True, timeout=3)
            lines = adb_res.stdout.strip().split("\n")[1:]
            active_devices = []
            is_unauthorized = False

            for line in lines:
                parts = line.strip().split()
                if len(parts) >= 2:
                    dev_id = parts[0]
                    state = parts[1]
                    if state == "device":
                        is_wifi = ":" in dev_id
                        active_devices.append((dev_id, is_wifi, line.strip()))
                    elif state == "unauthorized":
                        is_unauthorized = True

            linux_usb_detected = check_linux_phone_usb()

            if active_devices:
                wifi_devs = [d for d in active_devices if d[1]]
                usb_devs = [d for d in active_devices if not d[1]]
                chosen = wifi_devs[0] if wifi_devs else usb_devs[0]
                dev_id = chosen[0]
                is_wifi = chosen[1]

                os_type = detect_device_system(dev_id)
                PHONE_STATE["device_id"] = dev_id
                PHONE_STATE["is_wireless"] = is_wifi
                PHONE_STATE["os_type"] = os_type

                if os_type == "UBUNTU_TOUCH":
                    PHONE_STATE["status"] = "READY"
                    PHONE_STATE["info"] = f"🐧 Ubuntu Touch detectado ({dev_id})\nIniciando transmisión nativa Lomiri/Mir..."
                elif os_type == "SAMSUNG":
                    PHONE_STATE["status"] = "READY"
                    conn_lbl = "📶 Wi-Fi" if is_wifi else "🔌 USB"
                    PHONE_STATE["info"] = f"📱 Samsung Galaxy ({dev_id})\n{conn_lbl} - Iniciando Samsung DeX en modo escritorio..."
                else:
                    PHONE_STATE["status"] = "READY"
                    conn_lbl = "📶 Wi-Fi" if is_wifi else "🔌 USB"
                    PHONE_STATE["info"] = f"📱 Terminal Android ({dev_id})\n{conn_lbl} - Proyección optimizada a pantalla completa."

                if last_phone_status != "READY":
                    mode_label = "Wi-Fi inalámbrico" if is_wifi else "Cable USB"
                    add_log(f"Dispositivo listo ({os_type} - {mode_label}): {dev_id}")
                    threading.Thread(target=launch_scrcpy, args=(dev_id,), daemon=True).start()

            elif is_unauthorized:
                PHONE_STATE["status"] = "UNAUTHORIZED"
                PHONE_STATE["info"] = "⚠️ ATENCIÓN: Desbloquea tu móvil y pulsa 'Permitir siempre' en la pantalla del teléfono."
                PHONE_STATE["device_id"] = None
                PHONE_STATE["is_wireless"] = False
                if last_phone_status == "READY":
                    kill_current_projection()

            elif linux_usb_detected:
                PHONE_STATE["status"] = "LINUX_USB"
                PHONE_STATE["info"] = "🐧 Terminal Ubuntu Touch detectado por USB.\n⚠️ Activa 'Modo Desarrollador' en Ajustes -> Acerca del teléfono para proyectar."
                PHONE_STATE["device_id"] = None
                PHONE_STATE["is_wireless"] = False
                if last_phone_status == "READY":
                    kill_current_projection()

            else:
                PHONE_STATE["status"] = "DISCONNECTED"
                PHONE_STATE["info"] = "Conecta tu Samsung Galaxy (DeX), Android o Ubuntu Touch por USB."
                PHONE_STATE["device_id"] = None
                PHONE_STATE["is_wireless"] = False
                if last_phone_status == "READY":
                    kill_current_projection()

            last_phone_status = PHONE_STATE["status"]

            # 2. Comprobar Nintendo Switch y capturadora HDMI
            switch_usb = check_nintendo_switch_usb()
            cap_node, cap_name = detect_video_capture()

            if cap_node:
                SWITCH_STATE["status"] = "READY"
                SWITCH_STATE["info"] = f"🎮 Capturadora activa: {cap_name}\nSeñal HDMI conectada en {cap_node}"
                SWITCH_STATE["device_node"] = cap_node
                if last_switch_status != "READY" and PHONE_STATE["status"] != "READY":
                    add_log(f"Capturadora HDMI detectada en {cap_node}. Lanzando MPV...")
                    threading.Thread(target=launch_switch, args=(cap_node,), daemon=True).start()
            elif switch_usb:
                SWITCH_STATE["status"] = "USB_ONLY"
                SWITCH_STATE["info"] = "🎮 Nintendo Switch detectada por cable USB (057e).\n⚠️ La Switch requiere Dock + Capturadora HDMI USB para enviar señal de vídeo al portátil."
                SWITCH_STATE["device_node"] = None
                if last_switch_status != "USB_ONLY":
                    add_log("Aviso: Nintendo Switch conectada por USB directo. Conecta la salida HDMI del Dock a una capturadora USB.")
            else:
                SWITCH_STATE["status"] = "DISCONNECTED"
                SWITCH_STATE["info"] = "Conecta la Switch (Dock -> Capturadora HDMI USB) o consola HDMI."
                SWITCH_STATE["device_node"] = None

            last_switch_status = SWITCH_STATE["status"]

        except Exception as e:
            add_log(f"Error en escaneo de hardware: {e}")

        time.sleep(1.5)

class LapdockDashboardUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Lapdock OS")
        self.root.configure(bg="#070a12")

        # Pantalla completa
        self.root.attributes("-fullscreen", True)
        self.root.bind("<Escape>", lambda e: kill_current_projection())
        self.root.bind("<F1>", lambda e: self.restart_adb())
        self.root.bind("<F5>", lambda e: (optimize_displays(), add_log("Refresco de pantallas solicitado.")))

        self.pulse_phase = 0
        self.last_rendered_state = None

        optimize_displays()
        self.setup_ui()
        self.start_animations()
        self.update_loop()

    def restart_adb(self):
        add_log("Reiniciando demonio ADB...")
        subprocess.run(["adb", "kill-server"], capture_output=True)
        subprocess.run(["adb", "start-server"], capture_output=True)
        add_log("Demonio ADB reiniciado.")

    def setup_ui(self):
        # 1. BARRA SUPERIOR (HEADER MODERNO Y ELEGANTE)
        self.header = tk.Frame(self.root, bg="#0c101c", height=65)
        self.header.pack(fill="x", side="top")
        self.header.pack_propagate(False)

        # Borde sutil inferior del header
        header_border = tk.Frame(self.root, bg="#192237", height=1)
        header_border.pack(fill="x", side="top")

        # Logo y Marca
        brand_box = tk.Frame(self.header, bg="#0c101c")
        brand_box.pack(side="left", padx=30, pady=12)

        lbl_logo = tk.Label(
            brand_box,
            text="⚡ LAPDOCK",
            font=("DejaVu Sans", 18, "bold"),
            fg="#38bdf8",
            bg="#0c101c"
        )
        lbl_logo.pack(side="left")

        lbl_os = tk.Label(
            brand_box,
            text="OS",
            font=("DejaVu Sans", 18, "bold"),
            fg="#f8fafc",
            bg="#0c101c"
        )
        lbl_os.pack(side="left", padx=(3, 10))

        badge_engine = tk.Label(
            brand_box,
            text="DeX ENGINE 2.5",
            font=("DejaVu Sans", 9, "bold"),
            fg="#0284c7",
            bg="#082f49",
            padx=8,
            pady=3
        )
        badge_engine.pack(side="left")

        # Centro: Reloj en vivo y Resolución de pantalla
        center_box = tk.Frame(self.header, bg="#0c101c")
        center_box.pack(side="left", expand=True)

        self.lbl_clock = tk.Label(
            center_box,
            text="--:--:--",
            font=("DejaVu Sans", 13, "bold"),
            fg="#f1f5f9",
            bg="#0c101c"
        )
        self.lbl_clock.pack(side="left", padx=(0, 15))

        scr_w, scr_h = get_screen_dimensions()
        lbl_res = tk.Label(
            center_box,
            text=f"🖥️ {scr_w} × {scr_h} @ 60Hz",
            font=("DejaVu Sans", 10),
            fg="#64748b",
            bg="#0c101c"
        )
        lbl_res.pack(side="left")

        # Derecha: Estado global del sistema en RAM
        self.status_pill = tk.Label(
            self.header,
            text="● SISTEMA LISTO EN RAM",
            font=("DejaVu Sans", 10, "bold"),
            fg="#34d399",
            bg="#064e3b",
            padx=16,
            pady=6
        )
        self.status_pill.pack(side="right", padx=30, pady=16)

        # 2. ESCENARIO CENTRAL (CANVAS + CONTENIDO DINÁMICO)
        self.main_container = tk.Frame(self.root, bg="#070a12")
        self.main_container.pack(fill="both", expand=True)

        # Canvas para animación de radar/pulsos y halo brillante
        self.canvas = tk.Canvas(
            self.main_container,
            bg="#070a12",
            highlightthickness=0,
            bd=0
        )
        self.canvas.place(x=0, y=0, relwidth=1.0, relheight=1.0)
        self.canvas.bind("<Configure>", lambda e: self.draw_canvas_scene())

        # Contenedor para tarjetas interactivas superpuestas
        self.card_wrapper = tk.Frame(self.main_container, bg="#070a12")
        self.card_wrapper.place(relx=0.5, rely=0.5, anchor="center")

        # 3. BARRA INFERIOR (TICKER MINIMALISTA Y ATAJOS)
        footer_border = tk.Frame(self.root, bg="#192237", height=1)
        footer_border.pack(fill="x", side="bottom")

        self.footer = tk.Frame(self.root, bg="#0c101c", height=45)
        self.footer.pack(fill="x", side="bottom")
        self.footer.pack_propagate(False)

        # Ticker de evento reciente
        self.lbl_recent_event = tk.Label(
            self.footer,
            text="📡 Detección activa de puertos USB-C, Wi-Fi y HDMI...",
            font=("DejaVu Sans", 9),
            fg="#94a3b8",
            bg="#0c101c"
        )
        self.lbl_recent_event.pack(side="left", padx=25)

        # Atajos de teclado en pastillas
        shortcuts_box = tk.Frame(self.footer, bg="#0c101c")
        shortcuts_box.pack(side="right", padx=25)

        for key, desc in [("F1", "Reiniciar ADB"), ("F5", "Refrescar"), ("Esc", "Salir")]:
            pill = tk.Frame(shortcuts_box, bg="#1e293b", padx=6, pady=2)
            pill.pack(side="left", padx=4)
            tk.Label(pill, text=key, font=("DejaVu Sans", 8, "bold"), fg="#38bdf8", bg="#1e293b").pack(side="left")
            tk.Label(pill, text=f" {desc}", font=("DejaVu Sans", 8), fg="#cbd5e1", bg="#1e293b").pack(side="left")

    def start_animations(self):
        """Hilo de refresco de animación suave para ondas de conexión y reloj."""
        def animate():
            self.pulse_phase = (self.pulse_phase + 1) % 60
            self.draw_canvas_scene()
            self.root.after(50, animate)
        self.root.after(50, animate)

    def draw_canvas_scene(self):
        """Dibuja anillos de pulso concéntricos futuristas en el fondo del Canvas."""
        w = self.canvas.winfo_width()
        h = self.canvas.winfo_height()
        if w < 100 or h < 100:
            return

        self.canvas.delete("pulse_ring")

        cx, cy = w / 2, h / 2
        p_status = PHONE_STATE.get("status")
        s_status = SWITCH_STATE.get("status")

        # Color de ondas según el estado
        if p_status == "READY" or s_status == "READY":
            base_color = "#059669"
            glow_color = "#10b981"
        elif p_status == "UNAUTHORIZED":
            base_color = "#b45309"
            glow_color = "#f59e0b"
        else:
            base_color = "#0369a1"
            glow_color = "#0284c7"

        # Dibujar 3 anillos sutiles que respiran suavemente
        for i in range(3):
            phase_offset = (self.pulse_phase + i * 20) % 60
            progress = phase_offset / 60.0
            r = 160 + progress * 240
            alpha_dash = (3, 6) if i == 1 else ()

            # Solo dibujar contorno suave
            color = glow_color if progress < 0.4 else base_color
            if progress > 0.85:
                continue

            self.canvas.create_oval(
                cx - r, cy - r, cx + r, cy + r,
                outline=color,
                width=1 if progress > 0.5 else 2,
                dash=alpha_dash,
                tags="pulse_ring"
            )

    def render_state_card(self):
        """Construye la tarjeta central moderna según el estado de conexión actual."""
        p_status = PHONE_STATE.get("status")
        s_status = SWITCH_STATE.get("status")
        current_signature = (p_status, PHONE_STATE.get("device_id"), s_status)

        if self.last_rendered_state == current_signature:
            return
        self.last_rendered_state = current_signature

        # Limpiar tarjeta anterior
        for widget in self.card_wrapper.winfo_children():
            widget.destroy()

        # =========================================================================
        # ESTADO 1: DISPOSITIVO MÓVIL CONECTADO Y LISTO (SAMSUNG DeX / ANDROID / UT)
        # =========================================================================
        if p_status == "READY":
            dev_id = PHONE_STATE.get("device_id", "Desconocido")
            is_wifi = PHONE_STATE.get("is_wireless", False)
            os_type = PHONE_STATE.get("os_type", "ANDROID")
            scr_w, scr_h = get_screen_dimensions()

            # Tarjeta principal con fondo oscuro obsidian y borde sutil
            card = tk.Frame(self.card_wrapper, bg="#1e293b", padx=1, pady=1)
            card.pack()

            inner = tk.Frame(card, bg="#0d111c", padx=36, pady=28)
            inner.pack()

            # Indicador de estado sutil y elegante
            header_row = tk.Frame(inner, bg="#0d111c")
            header_row.pack(fill="x", pady=(0, 12))

            pill = tk.Label(
                header_row,
                text="● DISPOSITIVO VINCULADO",
                font=("DejaVu Sans", 9, "bold"),
                fg="#34d399",
                bg="#064e3b",
                padx=10,
                pady=4
            )
            pill.pack(side="left")

            conn_tag = "📶 Red Wi-Fi" if is_wifi else "⚡ Conexión USB-C"
            tag_label = tk.Label(
                header_row,
                text=f"{conn_tag}  •  {scr_w}×{scr_h}  •  60 FPS",
                font=("DejaVu Sans", 9),
                fg="#64748b",
                bg="#0d111c"
            )
            tag_label.pack(side="right", padx=(15, 0))

            # Título principal limpio
            if os_type == "SAMSUNG":
                title_text = "Samsung Galaxy (Modo DeX)"
                subtitle_text = "Modo escritorio panorámico 16:9 • Ventanas libres y soporte para ratón y teclado"
            elif os_type == "UBUNTU_TOUCH":
                title_text = "Ubuntu Touch (Lomiri)"
                subtitle_text = "Transmisión nativa Wayland de baja latencia"
            else:
                title_text = "Dispositivo Android"
                subtitle_text = "Proyección directa optimizada y centrada a pantalla completa"

            lbl_title = tk.Label(
                inner,
                text=title_text,
                font=("DejaVu Sans", 20, "bold"),
                fg="#f8fafc",
                bg="#0d111c"
            )
            lbl_title.pack(anchor="w", pady=(0, 4))

            lbl_sub = tk.Label(
                inner,
                text=subtitle_text,
                font=("DejaVu Sans", 11),
                fg="#94a3b8",
                bg="#0d111c"
            )
            lbl_sub.pack(anchor="w", pady=(0, 22))

            # Botonera de acciones estilizada
            btn_row = tk.Frame(inner, bg="#0d111c")
            btn_row.pack(fill="x")

            btn_launch = tk.Button(
                btn_row,
                text="🚀 Abrir a Pantalla Completa",
                font=("DejaVu Sans", 11, "bold"),
                bg="#2563eb",
                fg="#ffffff",
                activebackground="#1d4ed8",
                activeforeground="#ffffff",
                relief="flat",
                bd=0,
                padx=22,
                pady=10,
                cursor="hand2",
                command=lambda: threading.Thread(target=launch_scrcpy, args=(dev_id,), daemon=True).start()
            )
            btn_launch.pack(side="left", padx=(0, 10))

            if not is_wifi:
                btn_wifi = tk.Button(
                    btn_row,
                    text="📶 Activar Wi-Fi",
                    font=("DejaVu Sans", 10, "bold"),
                    bg="#1e293b",
                    fg="#e2e8f0",
                    activebackground="#334155",
                    activeforeground="#ffffff",
                    relief="flat",
                    bd=0,
                    padx=16,
                    pady=10,
                    cursor="hand2",
                    command=lambda: threading.Thread(target=lambda: (enable_wireless_adb(), launch_scrcpy(force_wireless=True)), daemon=True).start()
                )
                btn_wifi.pack(side="left", padx=(0, 10))

            btn_restart = tk.Button(
                btn_row,
                text="🔄 Reconectar",
                font=("DejaVu Sans", 10),
                bg="#0f172a",
                fg="#94a3b8",
                activebackground="#1e293b",
                activeforeground="#cbd5e1",
                relief="flat",
                bd=0,
                padx=14,
                pady=10,
                cursor="hand2",
                command=lambda: threading.Thread(target=launch_scrcpy, args=(dev_id,), daemon=True).start()
            )
            btn_restart.pack(side="left")

        # =========================================================================
        # ESTADO 2: TELÉFONO REQUIERE AUTORIZACIÓN (PANTALLA BLOQUEADA / RSA)
        # =========================================================================
        elif p_status == "UNAUTHORIZED":
            card = tk.Frame(self.card_wrapper, bg="#0d1424", padx=40, pady=35)
            card.pack()

            border_frame = tk.Frame(card, bg="#f59e0b", padx=2, pady=2)
            border_frame.pack()

            inner = tk.Frame(border_frame, bg="#14110b", padx=35, pady=30)
            inner.pack()

            pill = tk.Label(
                inner,
                text="⚠️ ACCIÓN REQUERIDA EN TU TELÉFONO",
                font=("DejaVu Sans", 10, "bold"),
                fg="#fbbf24",
                bg="#451a03",
                padx=12,
                pady=4
            )
            pill.pack(anchor="w")

            lbl_title = tk.Label(
                inner,
                text="🔑 Desbloquea tu teléfono móvil",
                font=("DejaVu Sans", 22, "bold"),
                fg="#fef3c7",
                bg="#14110b"
            )
            lbl_title.pack(anchor="w", pady=(15, 6))

            lbl_sub = tk.Label(
                inner,
                text="En la pantalla de tu móvil aparecerá una ventana emergente de seguridad:\n1. Marca la casilla:  ☑ 'Permitir siempre desde este ordenador'\n2. Pulsa en:  [ Permitir / Aceptar ]\n\nLa proyección iniciará en cuanto autorices la conexión.",
                font=("DejaVu Sans", 11),
                fg="#cbd5e1",
                bg="#14110b",
                justify="left"
            )
            lbl_sub.pack(anchor="w", pady=(0, 20))

            btn_retry = tk.Button(
                inner,
                text="🔄 Comprobar Autorización",
                font=("DejaVu Sans", 11, "bold"),
                bg="#d97706",
                fg="#ffffff",
                activebackground="#b45309",
                activeforeground="#ffffff",
                relief="flat",
                bd=0,
                padx=20,
                pady=10,
                cursor="hand2",
                command=lambda: self.restart_adb()
            )
            btn_retry.pack(anchor="w")

        # =========================================================================
        # ESTADO 3: NINTENDO SWITCH O CONSOLA HDMI DETECTADA
        # =========================================================================
        elif s_status == "READY":
            node = SWITCH_STATE.get("device_node", "/dev/video0")
            card = tk.Frame(self.card_wrapper, bg="#0d1424", padx=40, pady=35)
            card.pack()

            border_frame = tk.Frame(card, bg="#10b981", padx=2, pady=2)
            border_frame.pack()

            inner = tk.Frame(border_frame, bg="#081510", padx=35, pady=30)
            inner.pack()

            pill = tk.Label(
                inner,
                text="● SEÑAL DE VÍDEO HDMI ACTIVA",
                font=("DejaVu Sans", 10, "bold"),
                fg="#34d399",
                bg="#064e3b",
                padx=12,
                pady=4
            )
            pill.pack(anchor="w")

            lbl_title = tk.Label(
                inner,
                text="🎮 NINTENDO SWITCH / CONSOLA",
                font=("DejaVu Sans", 22, "bold"),
                fg="#f8fafc",
                bg="#081510"
            )
            lbl_title.pack(anchor="w", pady=(15, 6))

            lbl_sub = tk.Label(
                inner,
                text=f"Captura HDMI sincronizada en {node} a 60 FPS sin retardo.",
                font=("DejaVu Sans", 11),
                fg="#94a3b8",
                bg="#081510"
            )
            lbl_sub.pack(anchor="w", pady=(0, 20))

            btn_game = tk.Button(
                inner,
                text="🎮 Jugar a Pantalla Completa",
                font=("DejaVu Sans", 12, "bold"),
                bg="#059669",
                fg="#ffffff",
                activebackground="#047857",
                activeforeground="#ffffff",
                relief="flat",
                bd=0,
                padx=24,
                pady=12,
                cursor="hand2",
                command=lambda: threading.Thread(target=launch_switch, args=(node,), daemon=True).start()
            )
            btn_game.pack(anchor="w")

        # =========================================================================
        # ESTADO 4: EN ESPERA (STANDBY FUTURISTA Y MINIMALISTA)
        # =========================================================================
        else:
            # Standby centrado y moderno
            standby_box = tk.Frame(self.card_wrapper, bg="#070a12")
            standby_box.pack()

            # Emblema central
            lbl_icon = tk.Label(
                standby_box,
                text="⚡",
                font=("DejaVu Sans", 36),
                fg="#38bdf8",
                bg="#070a12"
            )
            lbl_icon.pack(pady=(0, 8))

            lbl_main = tk.Label(
                standby_box,
                text="Conecta tu dispositivo",
                font=("DejaVu Sans", 26, "bold"),
                fg="#f8fafc",
                bg="#070a12"
            )
            lbl_main.pack(pady=(0, 8))

            lbl_desc = tk.Label(
                standby_box,
                text="Conecta tu teléfono por USB-C / Wi-Fi o tu Nintendo Switch mediante capturadora HDMI",
                font=("DejaVu Sans", 12),
                fg="#94a3b8",
                bg="#070a12"
            )
            lbl_desc.pack(pady=(0, 35))

            # Fila de 3 tarjetas de capacidades
            caps_row = tk.Frame(standby_box, bg="#070a12")
            caps_row.pack()

            capabilities = [
                ("📱", "Samsung Galaxy (DeX)", "Escritorio 16:9 completo\nTeclado y touchpad listos", "#0284c7"),
                ("🐧", "Ubuntu Touch", "Entorno Lomiri nativo\nSin retardo con Mir", "#ea580c"),
                ("🎮", "Nintendo Switch", "Juego a 60 FPS en pantalla\nAudio estéreo directo", "#10b981")
            ]

            for icon, cap_title, cap_info, accent in capabilities:
                c_card = tk.Frame(caps_row, bg="#0e1526", padx=20, pady=18, width=240, height=130)
                c_card.pack(side="left", padx=10)
                c_card.pack_propagate(False)

                top_bar = tk.Frame(c_card, bg=accent, height=3)
                top_bar.pack(fill="x", side="top", pady=(0, 10))

                tk.Label(c_card, text=f"{icon} {cap_title}", font=("DejaVu Sans", 11, "bold"), fg="#f1f5f9", bg="#0e1526").pack(anchor="w")
                tk.Label(c_card, text=cap_info, font=("DejaVu Sans", 9), fg="#94a3b8", bg="#0e1526", justify="left").pack(anchor="w", pady=(6, 0))

    def update_loop(self):
        # Actualizar reloj en vivo
        now_str = time.strftime("%H:%M:%S • %A, %d de %b")
        self.lbl_clock.config(text=now_str)

        # Actualizar tarjeta central
        self.render_state_card()

        # Actualizar pastilla superior de estado
        p_status = PHONE_STATE.get("status")
        s_status = SWITCH_STATE.get("status")

        if p_status == "READY":
            self.status_pill.config(
                text="● DISPOSITIVO MÓVIL ACTIVO",
                fg="#34d399",
                bg="#064e3b"
            )
        elif s_status == "READY":
            self.status_pill.config(
                text="● SEÑAL HDMI CONECTADA",
                fg="#34d399",
                bg="#064e3b"
            )
        elif p_status == "UNAUTHORIZED":
            self.status_pill.config(
                text="⚠️ ACCIÓN REQUERIDA",
                fg="#fbbf24",
                bg="#451a03"
            )
        else:
            self.status_pill.config(
                text="● ESPERANDO CONEXIÓN",
                fg="#94a3b8",
                bg="#1e293b"
            )

        # Actualizar última línea de evento en el footer
        with LOG_LOCK:
            if LOGS:
                last_msg = LOGS[-1]
                self.lbl_recent_event.config(text=f"📡 {last_msg}")

        # Programar siguiente ciclo cada 300 ms
        self.root.after(300, self.update_loop)

def silent_github_updater_worker():
    """Hilo silencioso en segundo plano: escanea y descarga actualizaciones de GitHub."""
    time.sleep(20)  # Esperar a que la red y el sistema se estabilicen tras el boot
    while True:
        try:
            if os.path.exists("/usr/local/bin/lapdock-updater.sh"):
                subprocess.run(["/bin/bash", "/usr/local/bin/lapdock-updater.sh"], capture_output=True, timeout=60)
        except Exception:
            pass
        time.sleep(300)  # Recomprobar novedades cada 5 minutos

def run_cli_fallback():
    """Modo consola en caso de fallo de X11/Wayland/Tkinter."""
    print("Iniciando Lapdock OS en modo consola...")
    while True:
        time.sleep(2)

if __name__ == "__main__":
    # Iniciar hilo de escaneo de dispositivos
    t = threading.Thread(target=poll_devices_worker, daemon=True)
    t.start()

    # Iniciar hilo silencioso de auto-actualización desde GitHub
    threading.Thread(target=silent_github_updater_worker, daemon=True).start()

    if HAS_TK:
        try:
            root = tk.Tk()
            app = LapdockDashboardUI(root)
            root.mainloop()
        except Exception as err:
            add_log(f"Fallo al abrir interfaz gráfica: {err}")
            run_cli_fallback()
    else:
        run_cli_fallback()
