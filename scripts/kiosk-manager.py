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

def get_screen_dimensions():
    """Detecta la resolución física de la pantalla del portátil para encajar DeX y evitar recortes."""
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
    """Proyección específica para Ubuntu Touch mediante Mir/Lomiri o Screenrecord."""
    global CURRENT_PROCESS
    kill_current_projection()
    add_log(f"Iniciando proyección para terminal Ubuntu Touch ({device_id})...")

    p_adb = None
    p_mpv = None
    try:
        # Intento 1: mirscreencast canalizado hacia MPV a baja latencia
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
            # Intento 2: screenrecord h264
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
        self.root.configure(bg="#0b0f19")

        # Pantalla completa
        self.root.attributes("-fullscreen", True)
        self.root.bind("<Escape>", lambda e: kill_current_projection())
        self.root.bind("<F1>", lambda e: self.restart_adb())
        self.root.bind("<F5>", lambda e: add_log("Refresco manual solicitado."))

        self.setup_ui()
        self.update_loop()

    def restart_adb(self):
        add_log("Reiniciando demonio ADB...")
        subprocess.run(["adb", "kill-server"], capture_output=True)
        subprocess.run(["adb", "start-server"], capture_output=True)
        add_log("Demonio ADB reiniciado.")

    def setup_ui(self):
        # Header principal
        header_frame = tk.Frame(self.root, bg="#0f172a", height=80)
        header_frame.pack(fill="x", side="top", padx=0, pady=0)

        title_lbl = tk.Label(
            header_frame,
            text="⚡ LAPDOCK OS",
            font=("Helvetica", 24, "bold"),
            fg="#38bdf8",
            bg="#0f172a"
        )
        title_lbl.pack(side="left", padx=30, pady=18)

        self.status_badge = tk.Label(
            header_frame,
            text="🟢 SISTEMA ACTIVO EN RAM",
            font=("Helvetica", 11, "bold"),
            fg="#10b981",
            bg="#064e3b",
            padx=14,
            pady=6
        )
        self.status_badge.pack(side="right", padx=30, pady=22)

        # Contenedor central de tarjetas de dispositivos
        cards_container = tk.Frame(self.root, bg="#0b0f19")
        cards_container.pack(fill="both", expand=True, padx=40, pady=25)
        cards_container.columnconfigure(0, weight=1)
        cards_container.columnconfigure(1, weight=1)

        # Tarjeta 1: Samsung Galaxy / Android
        self.card_phone = tk.Frame(cards_container, bg="#1e293b", bd=2, relief="flat", padx=25, pady=25)
        self.card_phone.grid(row=0, column=0, sticky="nsew", padx=15, pady=10)

        tk.Label(
            self.card_phone,
            text="📱 SAMSUNG GALAXY (DeX) & ANDROID",
            font=("Helvetica", 15, "bold"),
            fg="#f8fafc",
            bg="#1e293b"
        ).pack(anchor="w")

        self.lbl_phone_status = tk.Label(
            self.card_phone,
            text="⚪ Esperando conexión USB...",
            font=("Helvetica", 13, "bold"),
            fg="#94a3b8",
            bg="#1e293b",
            wraplength=450,
            justify="left"
        )
        self.lbl_phone_status.pack(anchor="w", pady=(15, 8))

        self.lbl_phone_help = tk.Label(
            self.card_phone,
            text="1. Conecta tu teléfono por USB para autorizar la conexión.\n2. Pulsa '📶 Activar Wi-Fi' para transferir la sesión a la red local.\n3. ¡Desconecta el cable USB! Podrás usar DeX sin cables.\n💡 Consejo: En viajes, activa 'Zona Wi-Fi' en tu móvil y conecta el portátil a su red.",
            font=("Helvetica", 10),
            fg="#cbd5e1",
            bg="#1e293b",
            justify="left"
        )
        self.lbl_phone_help.pack(anchor="w", pady=(5, 15))

        btn_phone_box = tk.Frame(self.card_phone, bg="#1e293b")
        btn_phone_box.pack(anchor="w", fill="x")

        btn_phone = tk.Button(
            btn_phone_box,
            text="Proyectar (USB)",
            font=("Helvetica", 10, "bold"),
            bg="#2563eb",
            fg="white",
            activebackground="#1d4ed8",
            relief="flat",
            padx=14,
            pady=8,
            command=lambda: threading.Thread(target=launch_scrcpy, args=(PHONE_STATE.get("device_id"),), daemon=True).start()
        )
        btn_phone.pack(side="left", padx=(0, 10))

        btn_wifi = tk.Button(
            btn_phone_box,
            text="📶 Activar Wi-Fi (Desconectar Cable)",
            font=("Helvetica", 10, "bold"),
            bg="#0284c7",
            fg="white",
            activebackground="#0369a1",
            relief="flat",
            padx=14,
            pady=8,
            command=lambda: threading.Thread(target=lambda: (enable_wireless_adb(), launch_scrcpy(force_wireless=True)), daemon=True).start()
        )
        btn_wifi.pack(side="left")

        # Tarjeta 2: Nintendo Switch / Consolas HDMI
        self.card_switch = tk.Frame(cards_container, bg="#1e293b", bd=2, relief="flat", padx=25, pady=25)
        self.card_switch.grid(row=0, column=1, sticky="nsew", padx=15, pady=10)

        tk.Label(
            self.card_switch,
            text="🎮 NINTENDO SWITCH & CONSOLAS",
            font=("Helvetica", 15, "bold"),
            fg="#f8fafc",
            bg="#1e293b"
        ).pack(anchor="w")

        self.lbl_switch_status = tk.Label(
            self.card_switch,
            text="⚪ Esperando capturadora HDMI USB...",
            font=("Helvetica", 13, "bold"),
            fg="#94a3b8",
            bg="#1e293b",
            wraplength=450,
            justify="left"
        )
        self.lbl_switch_status.pack(anchor="w", pady=(15, 8))

        self.lbl_switch_help = tk.Label(
            self.card_switch,
            text="⚠️ IMPORTANTE SOBRE LA SWITCH:\nLas laptops no tienen entrada HDMI por hardware.\nPara proyectar la Switch requieres:\n• Colocar la Switch en su Dock o Dongle con salida HDMI.\n• Conectar el HDMI a una capturadora USB (dispositivo UVC).\n• La proyección iniciará automáticamente a 60 FPS sin lag.",
            font=("Helvetica", 10),
            fg="#cbd5e1",
            bg="#1e293b",
            justify="left"
        )
        self.lbl_switch_help.pack(anchor="w", pady=(5, 15))

        btn_switch = tk.Button(
            self.card_switch,
            text="Iniciar Captura HDMI",
            font=("Helvetica", 11, "bold"),
            bg="#059669",
            fg="white",
            activebackground="#047857",
            relief="flat",
            padx=16,
            pady=8,
            command=lambda: threading.Thread(target=launch_switch, daemon=True).start()
        )
        btn_switch.pack(anchor="w")

        # Sección inferior: Registro de eventos en vivo
        log_frame = tk.Frame(self.root, bg="#020617", height=130)
        log_frame.pack(fill="x", side="bottom", padx=40, pady=(0, 20))

        log_title = tk.Label(
            log_frame,
            text="📋 DIAGNÓSTICO DEL SISTEMA EN TIEMPO REAL (F1 = Reiniciar ADB | F5 = Refrescar | Esc = Salir de pantalla completa):",
            font=("Helvetica", 9, "bold"),
            fg="#64748b",
            bg="#020617"
        )
        log_title.pack(anchor="w", padx=15, pady=(8, 4))

        self.lbl_log = tk.Label(
            log_frame,
            text="Iniciando...",
            font=("Courier", 9),
            fg="#a7f3d0",
            bg="#020617",
            justify="left",
            anchor="w"
        )
        self.lbl_log.pack(anchor="w", padx=15, pady=(0, 8), fill="x")

    def update_loop(self):
        # Actualizar tarjeta de teléfono
        p_status = PHONE_STATE["status"]
        if p_status == "READY":
            self.lbl_phone_status.config(
                text=f"🟢 {PHONE_STATE['info']}",
                fg="#34d399"
            )
            self.card_phone.config(highlightbackground="#10b981", highlightthickness=2)
        elif p_status == "UNAUTHORIZED":
            self.lbl_phone_status.config(
                text=f"⚠️ {PHONE_STATE['info']}",
                fg="#fbbf24"
            )
            self.card_phone.config(highlightbackground="#f59e0b", highlightthickness=2)
        elif p_status == "LINUX_USB":
            self.lbl_phone_status.config(
                text=f"🐧 {PHONE_STATE['info']}",
                fg="#38bdf8"
            )
            self.card_phone.config(highlightbackground="#0284c7", highlightthickness=2)
        else:
            self.lbl_phone_status.config(
                text=f"⚪ {PHONE_STATE['info']}",
                fg="#94a3b8"
            )
            self.card_phone.config(highlightthickness=0)

        # Actualizar tarjeta de Switch
        s_status = SWITCH_STATE["status"]
        if s_status == "READY":
            self.lbl_switch_status.config(
                text=f"🟢 {SWITCH_STATE['info']}",
                fg="#34d399"
            )
            self.card_switch.config(highlightbackground="#10b981", highlightthickness=2)
        elif s_status == "USB_ONLY":
            self.lbl_switch_status.config(
                text=f"🟠 {SWITCH_STATE['info']}",
                fg="#fb923c"
            )
            self.card_switch.config(highlightbackground="#f97316", highlightthickness=2)
        else:
            self.lbl_switch_status.config(
                text=f"⚪ {SWITCH_STATE['info']}",
                fg="#94a3b8"
            )
            self.card_switch.config(highlightthickness=0)

        # Actualizar logs en pantalla
        with LOG_LOCK:
            recent = LOGS[-3:] if LOGS else ["Esperando eventos de hardware..."]
            self.lbl_log.config(text="\n".join(recent))

        # Programar próxima actualización en 300 ms
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
