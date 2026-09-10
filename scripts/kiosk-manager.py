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
PHONE_STATE = {"status": "DISCONNECTED", "info": "Esperando cable USB...", "device_id": None}
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
    with PROCESS_LOCK:
        if CURRENT_PROCESS and CURRENT_PROCESS.poll() is None:
            add_log("Deteniendo proyección activa...")
            try:
                CURRENT_PROCESS.terminate()
                CURRENT_PROCESS.wait(timeout=1.5)
            except Exception:
                try:
                    CURRENT_PROCESS.kill()
                except Exception:
                    pass
            CURRENT_PROCESS = None

def launch_scrcpy(device_id=None):
    global CURRENT_PROCESS
    kill_current_projection()

    with PROCESS_LOCK:
        add_log(f"Iniciando proyección Android / Samsung DeX (ID: {device_id or 'Auto'})...")

        # Intento 1: Optimizado para Samsung DeX con aceleración por hardware y UHID
        base_cmd = ["scrcpy", "--stay-awake", "--fullscreen", "--max-fps=60"]
        if device_id:
            base_cmd.extend(["-s", device_id])

        dex_cmd = base_cmd + [
            "--video-codec=h265",
            "--audio-codec=opus",
            "--keyboard=uhid",
            "--mouse=uhid"
        ]

        add_log("Probando modo de alta fidelidad (H.265 + UHID)...")
        try:
            p = subprocess.Popen(dex_cmd)
            # Monitorear primeros 2.5 segundos para ver si el códec o UHID es rechazado
            time.sleep(2.0)
            if p.poll() is None:
                CURRENT_PROCESS = p
                add_log("✅ Proyección DeX/Android conectada con éxito.")
                p.wait()
                add_log("Proyección finalizada.")
                return
            else:
                add_log("Modo H.265/UHID no compatible con este dispositivo. Cambiando a modo estándar...")
        except Exception as e:
            add_log(f"Aviso en modo H.265: {e}")

        # Intento 2: Modo Universal Seguro (H.264 estándar)
        safe_cmd = base_cmd + ["--turn-screen-off"]
        try:
            add_log("Lanzando modo universal compatible...")
            p = subprocess.Popen(safe_cmd)
            CURRENT_PROCESS = p
            p.wait()
            add_log("Proyección universal finalizada.")
        except Exception as e:
            add_log(f"Error al lanzar Scrcpy: {e}")

def launch_switch(device_node="/dev/video0"):
    global CURRENT_PROCESS
    kill_current_projection()

    with PROCESS_LOCK:
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
        try:
            p = subprocess.Popen(cmd)
            CURRENT_PROCESS = p
            p.wait()
            add_log("Entrada de consola finalizada.")
        except Exception as e:
            add_log(f"Error al ejecutar MPV: {e}")

def detect_video_capture():
    """Detecta capturadoras HDMI USB externas en /dev/video* descartando webcams integradas si es posible."""
    nodes = glob.glob("/dev/video*")
    nodes.sort()
    for node in nodes:
        try:
            # Buscar en sysfs el nombre del dispositivo
            base = os.path.basename(node)
            name_file = f"/sys/class/video4linux/{base}/name"
            if os.path.exists(name_file):
                with open(name_file, "r") as f:
                    dev_name = f.read().strip()
                # Capturadoras USB HDMI comunes (Cam Link, USB Video, Macrosilicon, MiraBox, etc.)
                if any(k in dev_name.lower() for k in ["usb", "hdmi", "capture", "cam link", "ms2109"]):
                    return node, dev_name
        except Exception:
            pass
    # Si existe /dev/video0 por defecto
    if "/dev/video0" in nodes:
        return "/dev/video0", "Dispositivo de vídeo V4L2 (/dev/video0)"
    return None, None

def poll_devices_worker():
    """Hilo de fondo que verifica periódicamente el estado de ADB y V4L2."""
    add_log("Iniciando servicio de detección de hardware Lapdock OS...")
    # Asegurar que el servidor ADB arranque
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
            active_device = None
            is_unauthorized = False

            for line in lines:
                parts = line.strip().split()
                if len(parts) >= 2:
                    dev_id = parts[0]
                    state = parts[1]
                    if state == "device":
                        active_device = (dev_id, line.strip())
                        break
                    elif state == "unauthorized":
                        is_unauthorized = True
                        active_device = (dev_id, "Desbloquea tu móvil y ACEPTA 'Permitir depuración USB'")

            if active_device and not is_unauthorized:
                PHONE_STATE["status"] = "READY"
                PHONE_STATE["info"] = f"Listo: {active_device[0]}"
                PHONE_STATE["device_id"] = active_device[0]
                if last_phone_status != "READY":
                    add_log(f"Dispositivo listo para proyectar: {active_device[0]}")
                    threading.Thread(target=launch_scrcpy, args=(active_device[0],), daemon=True).start()
            elif is_unauthorized:
                PHONE_STATE["status"] = "UNAUTHORIZED"
                PHONE_STATE["info"] = "⚠️ ATENCIÓN: Desbloquea tu móvil y pulsa 'Aceptar' en la pantalla del teléfono."
                PHONE_STATE["device_id"] = active_device[0] if active_device else None
            else:
                PHONE_STATE["status"] = "DISCONNECTED"
                PHONE_STATE["info"] = "Desconectado. Conecta tu Samsung Galaxy o móvil Android por USB."
                PHONE_STATE["device_id"] = None

            last_phone_status = PHONE_STATE["status"]

            # 2. Comprobar capturadora de vídeo (Nintendo Switch)
            cap_node, cap_name = detect_video_capture()
            if cap_node:
                SWITCH_STATE["status"] = "READY"
                SWITCH_STATE["info"] = f"Detectada: {cap_name}"
                SWITCH_STATE["device_node"] = cap_node
                if last_switch_status != "READY" and PHONE_STATE["status"] != "READY":
                    add_log(f"Capturadora detectada en {cap_node}. Lanzando transmisión...")
                    threading.Thread(target=launch_switch, args=(cap_node,), daemon=True).start()
            else:
                SWITCH_STATE["status"] = "DISCONNECTED"
                SWITCH_STATE["info"] = "Conecta el dock/adaptador de la Switch a una capturadora HDMI USB."
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
            text="1. Conecta tu teléfono mediante cable USB a la laptop.\n2. Asegúrate de desbloquear la pantalla del móvil.\n3. Si aparece un aviso emergente, pulsa 'Permitir depuración USB'.\n4. En Samsung, DeX iniciará automáticamente en pantalla completa.",
            font=("Helvetica", 10),
            fg="#cbd5e1",
            bg="#1e293b",
            justify="left"
        )
        self.lbl_phone_help.pack(anchor="w", pady=(5, 15))

        btn_phone = tk.Button(
            self.card_phone,
            text="Proyectar Ahora (Forzar)",
            font=("Helvetica", 11, "bold"),
            bg="#2563eb",
            fg="white",
            activebackground="#1d4ed8",
            relief="flat",
            padx=16,
            pady=8,
            command=lambda: threading.Thread(target=launch_scrcpy, daemon=True).start()
        )
        btn_phone.pack(anchor="w")

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

def run_cli_fallback():
    """Modo consola en caso de fallo de X11/Wayland/Tkinter."""
    print("Iniciando Lapdock OS en modo consola...")
    while True:
        time.sleep(2)

if __name__ == "__main__":
    # Iniciar hilo de escaneo de dispositivos
    t = threading.Thread(target=poll_devices_worker, daemon=True)
    t.start()

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
