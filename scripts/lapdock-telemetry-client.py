#!/usr/bin/env python3
# ==============================================================================
# Lapdock OS - Cliente Centinela de Telemetría y Streaming Continuo de Logs
# Escanea el hardware local, genera la ficha técnica única y transmite el flujo
# de logs del sistema de forma continua al servidor PXE.
# ==============================================================================

import os
import sys
import time
import socket
import subprocess
import json
import re
import datetime
import glob

PORT = int(os.environ.get("LAPDOCK_TELEMETRY_PORT", "8998"))
DEFAULT_SERVER = "192.168.50.2"

def get_server_ip():
    """Detecta la IP del servidor PXE a partir del cmdline, ruta por defecto o fallback."""
    # 1. Intentar obtener desde /proc/cmdline (ej: fetch=http://192.168.50.2:8999/...)
    try:
        with open("/proc/cmdline", "r") as f:
            cmdline = f.read()
            m = re.search(r"http://([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)", cmdline)
            if m:
                return m.group(1)
            m_srv = re.search(r"(?:tftp|server)=([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)", cmdline)
            if m_srv:
                return m_srv.group(1)
    except Exception:
        pass

    # 2. Intentar obtener desde /proc/net/route directamente en Python
    try:
        if os.path.exists("/proc/net/route"):
            with open("/proc/net/route", "r") as f:
                for line in f:
                    fields = line.strip().split()
                    if len(fields) >= 3 and fields[1] == "00000000":
                        gw_hex = fields[2]
                        # Little-endian IPv4 hex
                        import struct
                        gw_ip = socket.inet_ntoa(struct.pack("<L", int(gw_hex, 16)))
                        if gw_ip and gw_ip != "0.0.0.0":
                            return DEFAULT_SERVER
    except Exception:
        pass

    # 3. Intentar comando ip route como respaldo
    try:
        res = subprocess.run(["ip", "route"], capture_output=True, text=True, timeout=2)
        if res.returncode == 0:
            for line in res.stdout.splitlines():
                if line.startswith("default via"):
                    return DEFAULT_SERVER
    except Exception:
        pass

    return DEFAULT_SERVER

def get_sys_attr(path, default="Desconocido"):
    try:
        if os.path.exists(path):
            with open(path, "r", errors="replace") as f:
                val = f.read().strip()
                return val if val else default
    except Exception:
        pass
    return default

def get_primary_mac():
    """Obtiene la dirección MAC de la interfaz de red principal."""
    try:
        for iface in sorted(glob.glob("/sys/class/net/*")):
            name = os.path.basename(iface)
            if name == "lo" or name.startswith("docker") or name.startswith("veth"):
                continue
            addr_file = os.path.join(iface, "address")
            if os.path.exists(addr_file):
                with open(addr_file, "r") as f:
                    mac = f.read().strip()
                    if mac and mac != "00:00:00:00:00:00":
                        return mac
    except Exception:
        pass
    return "000000000000"

def collect_hardware_report():
    """Realiza un inventario completo de hardware del equipo."""
    lines = []
    
    # 1. Datos DMI / Placa / Fabricante
    vendor = get_sys_attr("/sys/class/dmi/id/sys_vendor", "Genérico")
    product = get_sys_attr("/sys/class/dmi/id/product_name", "PC")
    version = get_sys_attr("/sys/class/dmi/id/product_version", "")
    board_vendor = get_sys_attr("/sys/class/dmi/id/board_vendor", "")
    board_name = get_sys_attr("/sys/class/dmi/id/board_name", "")
    bios_ver = get_sys_attr("/sys/class/dmi/id/bios_version", "")
    bios_date = get_sys_attr("/sys/class/dmi/id/bios_date", "")
    uuid = get_sys_attr("/sys/class/dmi/id/product_uuid", "")

    lines.append(f"• Fabricante/Equipo : {vendor} {product} {version}".strip())
    lines.append(f"• Placa Base        : {board_vendor} {board_name}".strip())
    lines.append(f"• BIOS              : {bios_ver} ({bios_date})")
    lines.append(f"• UUID de Hardware  : {uuid}")

    # 2. CPU
    try:
        cpu_model = "Desconocido"
        cpu_cores = 0
        with open("/proc/cpuinfo", "r") as f:
            for l in f:
                if "model name" in l and cpu_model == "Desconocido":
                    cpu_model = l.split(":", 1)[1].strip()
                if l.startswith("processor"):
                    cpu_cores += 1
        lines.append(f"• Procesador (CPU)  : {cpu_model} ({cpu_cores} hilos/núcleos)")
    except Exception as e:
        lines.append(f"• Procesador (CPU)  : Error leyendo CPU: {e}")

    # 3. Memoria RAM
    try:
        mem_total_kb = 0
        with open("/proc/meminfo", "r") as f:
            for l in f:
                if "MemTotal:" in l:
                    mem_total_kb = int(l.split()[1])
                    break
        lines.append(f"• Memoria RAM Total : {round(mem_total_kb / 1024 / 1024, 2)} GB ({mem_total_kb // 1024} MB)")
    except Exception:
        pass

    # 4. Gráficos / GPU
    try:
        lspci = subprocess.run(["lspci"], capture_output=True, text=True, timeout=2)
        if lspci.returncode == 0:
            for l in lspci.stdout.splitlines():
                if re.search(r"vga|3d|display", l, re.IGNORECASE):
                    lines.append(f"• Adaptador Gráfico : {l.split(':', 2)[-1].strip()}")
    except Exception:
        pass

    # 5. Salidas de Pantalla DRM
    try:
        lines.append("• Conectores Pantalla:")
        for drm_dir in sorted(glob.glob("/sys/class/drm/card*-*")):
            name = os.path.basename(drm_dir).split("-", 1)[1] if "-" in os.path.basename(drm_dir) else os.path.basename(drm_dir)
            status = get_sys_attr(os.path.join(drm_dir, "status"), "unknown")
            modes_file = os.path.join(drm_dir, "modes")
            top_mode = ""
            if os.path.exists(modes_file):
                with open(modes_file, "r") as mf:
                    first_line = mf.readline().strip()
                    if first_line:
                        top_mode = f" [{first_line}]"
            lines.append(f"    - {name}: {status.upper()}{top_mode}")
    except Exception:
        pass

    # 6. Red y Direcciones MAC
    try:
        lines.append("• Adaptadores de Red:")
        for iface in sorted(glob.glob("/sys/class/net/*")):
            iname = os.path.basename(iface)
            if iname == "lo":
                continue
            mac = get_sys_attr(os.path.join(iface, "address"), "00:00:00:00:00:00")
            operstate = get_sys_attr(os.path.join(iface, "operstate"), "unknown")
            lines.append(f"    - {iname}: MAC {mac} ({operstate})")
    except Exception:
        pass

    # 7. Dispositivos USB
    try:
        lsusb = subprocess.run(["lsusb"], capture_output=True, text=True, timeout=2)
        if lsusb.returncode == 0 and lsusb.stdout.strip():
            lines.append("• Periféricos USB Detectados:")
            for l in lsusb.stdout.splitlines():
                parts = l.split(":", 2)
                desc = parts[-1].strip() if len(parts) >= 3 else l
                lines.append(f"    - {desc}")
    except Exception:
        pass

    # 8. Audio
    try:
        if os.path.exists("/proc/asound/cards"):
            with open("/proc/asound/cards", "r") as f:
                acards = [l.strip() for l in f if l.strip() and not l.startswith(" ")]
                if acards:
                    lines.append(f"• Tarjetas de Sonido: {', '.join(acards)}")
    except Exception:
        pass

    return "\n".join(lines)

def generate_client_id():
    """Genera un identificador único, descriptivo y reproducible para este equipo."""
    vendor = get_sys_attr("/sys/class/dmi/id/sys_vendor", "PC")
    product = get_sys_attr("/sys/class/dmi/id/product_name", "Lapdock")
    mac = get_primary_mac().replace(":", "").lower()

    # Limpiar cadenas para nombres de archivo válidos
    clean_vendor = re.sub(r'[^a-zA-Z0-9]', '', vendor)
    clean_product = re.sub(r'[^a-zA-Z0-9\-]', '_', product).strip("_")

    if not clean_vendor:
        clean_vendor = "Host"
    if not clean_product:
        clean_product = "Machine"

    client_id = f"{clean_vendor}_{clean_product}_{mac}"
    return client_id

def stream_logs(sock):
    """Ejecuta journalctl continuo y envía cada línea al socket del servidor."""
    # Transmitir logs del sistema en vivo con formato ISO (-n 50 incluye arranque previo inmediato)
    cmd = ["journalctl", "-f", "-o", "short-iso", "-n", "80"]
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )

    try:
        for line in proc.stdout:
            sock.sendall(line.encode("utf-8", errors="replace"))
    finally:
        try:
            proc.terminate()
            proc.wait(timeout=1)
        except Exception:
            proc.kill()

def run_agent():
    client_id = generate_client_id()
    print(f"[TelemetryClient] Identificador del equipo: {client_id}", flush=True)

    # Esperar hasta que la red esté lista
    server_ip = get_server_ip()
    print(f"[TelemetryClient] Servidor objetivo: {server_ip}:{PORT}", flush=True)

    # Recolectar ficha técnica de hardware
    hw_report = collect_hardware_report()

    while True:
        sock = None
        try:
            server_ip = get_server_ip()
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(10.0)
            sock.connect((server_ip, PORT))
            sock.settimeout(None)

            # Enviar encabezado JSON con registro inicial
            payload = {
                "client_id": client_id,
                "hostname": socket.gethostname(),
                "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "hardware": hw_report
            }
            header_bytes = (json.dumps(payload) + "\n").encode("utf-8")
            sock.sendall(header_bytes)

            # Esperar confirmación
            ack = sock.recv(16)
            if b"OK" in ack:
                print(f"[TelemetryClient] ✅ Conectado exitosamente con servidor de logs ({server_ip}:{PORT}). Transmitiendo...", flush=True)
                stream_logs(sock)
            else:
                print(f"[TelemetryClient] ⚠️ Respuesta inesperada del servidor: {ack}", flush=True)

        except Exception as e:
            # Reintentar silenciosamente cada 4 segundos
            time.sleep(4)
        finally:
            if sock:
                try:
                    sock.close()
                except Exception:
                    pass
            time.sleep(3)

if __name__ == "__main__":
    run_agent()
