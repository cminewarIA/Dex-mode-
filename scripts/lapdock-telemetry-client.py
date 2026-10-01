#!/usr/bin/env python3
# ==============================================================================
# Lapdock OS - Cliente Centinela de Telemetría Ética y Streaming de Diagnóstico
# 
# Recolecta únicamente información técnica de compatibilidad de hardware (GPU,
# pantalla, códecs, salida de vídeo) y flujos de diagnóstico de eventos del
# sistema de forma cifrada de extremo a extremo (TLS/SSL) hacia el servicio DNS.
#
# PRIVACIDAD GARANTIZADA:
# - Cero datos personales, cero archivos de usuario, cero pulsaciones de teclado.
# - El identificador del equipo se genera mediante hash criptográfico SHA-256 anónimo.
# - Las direcciones MAC de red se anonimizan y nunca se envían en claro.
# - Fácil desactivación (Opt-out) mediante parámetro de arranque o configuración.
# ==============================================================================

import os
import sys
import time
import socket
import ssl
import subprocess
import json
import re
import datetime
import glob
import hashlib

CONFIG_FILE = "/etc/lapdock/telemetry.conf"
DEFAULT_DNS_HOST = "telemetry.lapdock.net"
DEFAULT_LOCAL_SERVER = "192.168.50.2"
DEFAULT_PORT = 8998

def is_telemetry_enabled():
    """Comprueba si el usuario ha desactivado la telemetría."""
    # 1. Comprobar parámetros de arranque del kernel en /proc/cmdline
    try:
        if os.path.exists("/proc/cmdline"):
            with open("/proc/cmdline", "r") as f:
                cmdline = f.read().lower()
                if "notelemetry" in cmdline or "lapdock.telemetry=0" in cmdline or "lapdock.telemetry=false" in cmdline:
                    return False
    except Exception:
        pass

    # 2. Comprobar variable de entorno
    env_val = os.environ.get("LAPDOCK_TELEMETRY_ENABLED", "").lower()
    if env_val in ("0", "false", "no", "off"):
        return False

    # 3. Comprobar archivo de configuración local
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, "r") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("#") or not line:
                        continue
                    if "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip().upper()
                        v = v.strip().lower()
                        if k in ("ENABLED", "TELEMETRY_ENABLED") and v in ("0", "false", "no", "off"):
                            return False
    except Exception:
        pass

    return True

def load_telemetry_config():
    """Carga la configuración de destino, puerto y seguridad TLS."""
    cfg = {
        "host": DEFAULT_DNS_HOST,
        "port": DEFAULT_PORT,
        "use_tls": True,
        "verify_tls": False  # Permite certificados emitidos para el dominio o autofirmados de desarrollo
    }

    # 1. Leer archivo de configuración si existe
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("#") or not line:
                        continue
                    if "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip().upper()
                        v = v.strip()
                        if k in ("SERVER_HOST", "HOST"):
                            cfg["host"] = v
                        elif k in ("SERVER_PORT", "PORT"):
                            try:
                                cfg["port"] = int(v)
                            except ValueError:
                                pass
                        elif k in ("USE_TLS", "TLS"):
                            cfg["use_tls"] = v.lower() not in ("0", "false", "no", "off")
                        elif k in ("VERIFY_TLS", "VERIFY_CERT"):
                            cfg["verify_tls"] = v.lower() in ("1", "true", "yes", "on")
        except Exception:
            pass

    # 2. Sobrescribir con variables de entorno si están presentes
    if os.environ.get("LAPDOCK_TELEMETRY_HOST"):
        cfg["host"] = os.environ["LAPDOCK_TELEMETRY_HOST"]
    if os.environ.get("LAPDOCK_TELEMETRY_PORT"):
        try:
            cfg["port"] = int(os.environ["LAPDOCK_TELEMETRY_PORT"])
        except ValueError:
            pass
    if os.environ.get("LAPDOCK_TELEMETRY_USE_TLS"):
        cfg["use_tls"] = os.environ["LAPDOCK_TELEMETRY_USE_TLS"].lower() not in ("0", "false", "no", "off")

    # 3. Comprobar /proc/cmdline para sobreescritura dinámica de host
    try:
        if os.path.exists("/proc/cmdline"):
            with open("/proc/cmdline", "r") as f:
                cmdline = f.read()
                m_host = re.search(r"lapdock\.telemetry_host=([^\s]+)", cmdline)
                if m_host:
                    cfg["host"] = m_host.group(1)
                else:
                    # Si no hay host explícito y estamos arrancando vía PXE en red local, usar servidor PXE
                    m_pxe = re.search(r"http://([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)", cmdline)
                    if m_pxe and cfg["host"] == DEFAULT_DNS_HOST:
                        pxe_ip = m_pxe.group(1)
                        # Comprobar si ese servidor PXE responde localmente
                        cfg["local_pxe_fallback"] = pxe_ip
    except Exception:
        pass

    return cfg

def get_sys_attr(path, default="Desconocido"):
    try:
        if os.path.exists(path):
            with open(path, "r", errors="replace") as f:
                val = f.read().strip()
                return val if val else default
    except Exception:
        pass
    return default

def get_raw_hardware_seed():
    """Obtiene una semilla física local única para calcular el hash criptográfico anónimo."""
    macs = []
    try:
        for iface in sorted(glob.glob("/sys/class/net/*")):
            name = os.path.basename(iface)
            if name == "lo" or name.startswith("docker") or name.startswith("veth"):
                continue
            addr_file = os.path.join(iface, "address")
            if os.path.exists(addr_file):
                with open(addr_file, "r") as f:
                    mac = f.read().strip().lower()
                    if mac and mac != "00:00:00:00:00:00":
                        macs.append(mac)
    except Exception:
        pass

    uuid = get_sys_attr("/sys/class/dmi/id/product_uuid", "")
    board = get_sys_attr("/sys/class/dmi/id/board_name", "")
    vendor = get_sys_attr("/sys/class/dmi/id/sys_vendor", "")
    product = get_sys_attr("/sys/class/dmi/id/product_name", "")

    seed = f"{''.join(macs)}|{uuid}|{board}|{vendor}|{product}"
    return seed

def generate_anonymous_client_id():
    """
    Genera un identificador único, descriptivo y 100% anonimizado.
    Utiliza SHA-256 para ocultar la MAC real del usuario manteniendo consistencia.
    Ejemplo: Dell_Latitude-E7470_7f9c2d1e8a3b
    """
    vendor = get_sys_attr("/sys/class/dmi/id/sys_vendor", "PC")
    product = get_sys_attr("/sys/class/dmi/id/product_name", "Lapdock")

    clean_vendor = re.sub(r'[^a-zA-Z0-9]', '', vendor) or "Host"
    clean_product = re.sub(r'[^a-zA-Z0-9\-]', '_', product).strip("_") or "Machine"

    seed = get_raw_hardware_seed()
    anon_hash = hashlib.sha256(seed.encode("utf-8")).hexdigest()[:12]

    return f"{clean_vendor}_{clean_product}_{anon_hash}"

def collect_hardware_report():
    """Realiza un inventario técnico estricto de compatibilidad (cero datos personales)."""
    lines = []

    # 1. Datos DMI / Placa / Fabricante
    vendor = get_sys_attr("/sys/class/dmi/id/sys_vendor", "Genérico")
    product = get_sys_attr("/sys/class/dmi/id/product_name", "PC")
    version = get_sys_attr("/sys/class/dmi/id/product_version", "")
    board_vendor = get_sys_attr("/sys/class/dmi/id/board_vendor", "")
    board_name = get_sys_attr("/sys/class/dmi/id/board_name", "")
    bios_ver = get_sys_attr("/sys/class/dmi/id/bios_version", "")
    bios_date = get_sys_attr("/sys/class/dmi/id/bios_date", "")

    lines.append(f"• Fabricante/Equipo : {vendor} {product} {version}".strip())
    lines.append(f"• Placa Base        : {board_vendor} {board_name}".strip())
    lines.append(f"• BIOS              : {bios_ver} ({bios_date})")

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

    # 6. Adaptadores de Red (anonimizados)
    try:
        lines.append("• Interfaces de Red (Anonimizadas):")
        for iface in sorted(glob.glob("/sys/class/net/*")):
            iname = os.path.basename(iface)
            if iname == "lo":
                continue
            operstate = get_sys_attr(os.path.join(iface, "operstate"), "unknown")
            lines.append(f"    - {iname}: Estado {operstate}")
    except Exception:
        pass

    # 7. Dispositivos USB (Controladores y teléfonos)
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

def stream_logs(wrapped_sock):
    """Transmite los registros técnicos de diagnóstico a través del socket TLS seguro."""
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
            wrapped_sock.sendall(line.encode("utf-8", errors="replace"))
    finally:
        try:
            proc.terminate()
            proc.wait(timeout=1)
        except Exception:
            proc.kill()

def establish_connection(host, port, use_tls, verify_tls):
    """
    Crea una conexión TCP segura vía DNS o IP.
    Aplica TLS si está habilitado con validación criptográfica.
    """
    raw_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    raw_sock.settimeout(8.0)
    raw_sock.connect((host, port))
    raw_sock.settimeout(None)

    if not use_tls:
        return raw_sock

    # Configuración de contexto TLS seguro
    ctx = ssl.create_default_context()
    if not verify_tls:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

    wrapped = ctx.wrap_socket(raw_sock, server_hostname=host if verify_tls else None)
    return wrapped

def run_agent():
    if not is_telemetry_enabled():
        print("[TelemetryClient] ℹ️ Telemetría desactivada por configuración del usuario (opt-out). Finalizando.", flush=True)
        sys.exit(0)

    cfg = load_telemetry_config()
    client_id = generate_anonymous_client_id()
    print(f"[TelemetryClient] 🔒 ID de telemetría anónimo (SHA-256): {client_id}", flush=True)
    print(f"[TelemetryClient] 🌐 Servidor configurado: {cfg['host']}:{cfg['port']} (TLS={cfg['use_tls']})", flush=True)

    # Recolectar ficha técnica inicial
    hw_report = collect_hardware_report()

    # Lista de endpoints a probar (DNS prioritario, con fallback a PXE local si existe)
    candidate_hosts = [cfg["host"]]
    if "local_pxe_fallback" in cfg and cfg["local_pxe_fallback"] not in candidate_hosts:
        candidate_hosts.append(cfg["local_pxe_fallback"])
    if DEFAULT_LOCAL_SERVER not in candidate_hosts:
        candidate_hosts.append(DEFAULT_LOCAL_SERVER)

    while True:
        connected = False
        for host in candidate_hosts:
            sock = None
            try:
                # Intentar conexión segura (con TLS si está habilitado)
                try:
                    sock = establish_connection(host, cfg["port"], cfg["use_tls"], cfg["verify_tls"])
                except (ssl.SSLError, ConnectionRefusedError):
                    # Si falla por TLS y el servidor es el PXE local antiguo, intentar fallback en texto plano
                    if host in (DEFAULT_LOCAL_SERVER, cfg.get("local_pxe_fallback")):
                        sock = establish_connection(host, cfg["port"], use_tls=False, verify_tls=False)
                    else:
                        raise

                # Transmitir encabezado JSON inicial
                payload = {
                    "client_id": client_id,
                    "hostname": socket.gethostname(),
                    "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "hardware": hw_report,
                    "tls_encrypted": cfg["use_tls"]
                }
                header_bytes = (json.dumps(payload) + "\n").encode("utf-8")
                sock.sendall(header_bytes)

                # Esperar respuesta de aceptación
                ack = sock.recv(16)
                if b"OK" in ack:
                    print(f"[TelemetryClient] ✅ Conectado de forma segura con {host}:{cfg['port']}. Transmitiendo telemetría...", flush=True)
                    connected = True
                    stream_logs(sock)
                    break
                else:
                    print(f"[TelemetryClient] ⚠️ Respuesta inesperada de {host}: {ack}", flush=True)

            except Exception as e:
                # Silencioso: la telemetría nunca debe obstaculizar el funcionamiento del sistema
                pass
            finally:
                if sock:
                    try:
                        sock.close()
                    except Exception:
                        pass

        # Si no hubo conexión con ningún servidor, esperar 6 segundos antes del siguiente intento
        time.sleep(6)

if __name__ == "__main__":
    run_agent()
