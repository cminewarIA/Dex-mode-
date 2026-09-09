#!/usr/bin/env python3
"""
Lapdock OS - Kiosk Manager Daemon
Monitorea sockets udev y lanza automáticamente Scrcpy (DeX / Android)
o MPV (Nintendo Switch HDMI UVC) en pantalla completa sin bordes.
"""

import os
import sys
import time
import subprocess
import threading
import pyudev

CURRENT_PROCESS = None
LOCK = threading.Lock()

def log(msg):
    print(f"[Lapdock OS] {msg}", flush=True)

def launch_projection(device_type):
    global CURRENT_PROCESS
    with LOCK:
        if CURRENT_PROCESS and CURRENT_PROCESS.poll() is None:
            log("Cerrando sesión de proyección previa...")
            CURRENT_PROCESS.terminate()
            try:
                CURRENT_PROCESS.wait(timeout=2)
            except subprocess.TimeoutExpired:
                CURRENT_PROCESS.kill()

        log(f"Iniciando proyección para: {device_type}")

        if device_type == "samsung-dex":
            # Parámetros optimizados para Samsung DeX vía USB
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
            # MPV configurado para capturadora UVC con pipeline de baja latencia (<30ms)
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
            # Terminales Android estándar
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
            log(f"Dispositivo no reconocido: {device_type}")
            return

        try:
            CURRENT_PROCESS = subprocess.Popen(cmd)
            CURRENT_PROCESS.wait()
        except Exception as err:
            log(f"Error al ejecutar proyección: {err}")
        finally:
            log("Dispositivo desconectado. Regresando a la pantalla de espera.")

def udev_event_handler():
    context = pyudev.Context()
    monitor = pyudev.Monitor.from_netlink(context)
    monitor.filter_by(subsystem='usb')
    monitor.filter_by(subsystem='video4linux')

    log("Escuchando eventos de inserción de hardware en caliente (hotplug)...")

    for action, device in monitor:
        if action == 'add':
            vendor = device.get('ID_VENDOR_ID', '')
            subsystem = device.subsystem

            # 1. Samsung Galaxy
            if vendor == '04e8':
                log("Detectado smartphone Samsung Galaxy (Modo DeX).")
                threading.Thread(target=launch_projection, args=('samsung-dex',), daemon=True).start()

            # 2. Capturadora de vídeo HDMI (Nintendo Switch / Consolas)
            elif subsystem == 'video4linux' and 'video0' in str(device.device_node):
                log("Detectada capturadora de vídeo HDMI activa (Nintendo Switch).")
                threading.Thread(target=launch_projection, args=('nintendo-switch',), daemon=True).start()

            # 3. Teléfonos Android Universales
            elif vendor in ['18d1', '2717', '22b8', '0bb4', '12d1', '05c6', '2a70']:
                log(f"Detectado terminal Android (Vendor ID: {vendor}).")
                threading.Thread(target=launch_projection, args=('android',), daemon=True).start()

if __name__ == '__main__':
    log("Iniciando Lapdock OS Kiosk Manager...")
    udev_event_handler()
