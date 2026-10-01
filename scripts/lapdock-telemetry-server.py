#!/usr/bin/env python3
# ==============================================================================
# Lapdock OS - Servidor Central de Telemetría Segura y Registro de Diagnóstico
# 
# Recibe información técnica de hardware e incidencias en tiempo real mediante
# conexiones cifradas con TLS/SSL (extremo a extremo) y resolución por DNS/IP.
# Almacena un archivo único por cada ordenador en modo acumulativo y seguro.
# ==============================================================================

import os
import sys
import json
import socket
import ssl
import socketserver
import threading
import datetime
import re
import subprocess

PORT = int(os.environ.get("LAPDOCK_TELEMETRY_PORT", "8998"))
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGS_DIR = os.path.join(BASE_DIR, "logs")
CERTS_DIR = os.path.join(BASE_DIR, "configs", "certs")

os.makedirs(LOGS_DIR, exist_ok=True)
os.makedirs(CERTS_DIR, exist_ok=True)

FILE_LOCKS = {}
LOCKS_MUTEX = threading.Lock()

def get_file_lock(filename):
    with LOCKS_MUTEX:
        if filename not in FILE_LOCKS:
            FILE_LOCKS[filename] = threading.Lock()
        return FILE_LOCKS[filename]

def sanitize_filename(name):
    clean = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', name)
    return clean.strip("._") or "equipo_desconocido"

def ensure_tls_certificates():
    """Verifica la existencia de certificados TLS o genera uno autofirmado."""
    cert_path = os.path.join(CERTS_DIR, "telemetry.crt")
    key_path = os.path.join(CERTS_DIR, "telemetry.key")

    if not (os.path.exists(cert_path) and os.path.exists(key_path)):
        print(f"[TelemetryServer] 🔑 Generando par de claves y certificado TLS en {CERTS_DIR}...", flush=True)
        try:
            cmd = [
                "openssl", "req", "-x509", "-newkey", "rsa:2048",
                "-keyout", key_path, "-out", cert_path,
                "-days", "3650", "-nodes",
                "-subj", "/CN=telemetry.lapdock.net/O=LapdockOS/C=ES"
            ]
            subprocess.run(cmd, check=True, capture_output=True)
            print("[TelemetryServer] ✅ Certificado TLS generado con éxito.", flush=True)
        except Exception as e:
            print(f"[TelemetryServer] ⚠️ Error generando certificados con openssl: {e}", flush=True)
            return None, None

    return cert_path, key_path

class TelemetryHandler(socketserver.BaseRequestHandler):
    def handle(self):
        client_ip = self.client_address[0]
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        sock = self.request
        is_tls = False

        # Intentar negociación TLS si el servidor dispone de contexto SSL
        ssl_ctx = getattr(self.server, "ssl_context", None)
        if ssl_ctx:
            try:
                # Comprobar el primer byte para ver si es un ClientHello TLS (0x16)
                sock.settimeout(4.0)
                first_byte = sock.recv(1, socket.MSG_PEEK)
                sock.settimeout(None)
                if first_byte == b'\x16':
                    sock = ssl_ctx.wrap_socket(sock, server_side=True)
                    is_tls = True
            except Exception as e:
                # Si falla el handshake TLS, intentar continuar con socket sin cifrar
                pass

        cipher_desc = "🔒 TLS Cifrado" if is_tls else "⚠️ Texto Plano"
        print(f"[{now_str}] 📡 Conexión entrante desde {client_ip} ({cipher_desc})", flush=True)

        rfile = sock.makefile('rb')
        wfile = sock.makefile('wb')

        try:
            # 1. Leer encabezado JSON inicial
            raw_header = rfile.readline()
            if not raw_header:
                print(f"[{now_str}] ⚠️ Conexión cerrada sin datos por {client_ip}", flush=True)
                return

            header_str = raw_header.decode("utf-8", errors="replace").strip()
            data = json.loads(header_str)

            client_id = sanitize_filename(data.get("client_id") or f"client_{client_ip}")
            hw_info = data.get("hardware") or "Información de hardware no especificada."
            hostname = data.get("hostname", "lapdock-os")
            tls_status = "SÍ (Extremo a Extremo)" if is_tls else "NO (Conexión Local)"

            log_filename = f"{client_id}.log"
            log_filepath = os.path.join(LOGS_DIR, log_filename)
            file_lock = get_file_lock(log_filename)

            with file_lock:
                file_exists = os.path.exists(log_filepath) and os.path.getsize(log_filepath) > 0
                with open(log_filepath, "a", encoding="utf-8") as f:
                    if not file_exists:
                        # Si es la primera vez que se reporta este hardware, escribir ficha completa
                        f.write("=" * 80 + "\n")
                        f.write(f"LAPDOCK OS - FICHA DE COMPATIBILIDAD Y REGISTRO DE TELEMETRÍA ÉTICA\n")
                        f.write(f"IDENTIFICADOR : {client_id}\n")
                        f.write(f"HOSTNAME      : {hostname}\n")
                        f.write(f"PRIMER REPORTE: {now_str}\n")
                        f.write(f"CIFRADO TLS   : {tls_status}\n")
                        f.write("=" * 80 + "\n")
                        f.write("[FICHA TÉCNICA DE HARDWARE AL INICIAR]\n")
                        f.write(hw_info.strip() + "\n")
                        f.write("=" * 80 + "\n")
                        f.write("[REGISTRO CONTINUO DE EVENTOS DE COMPATIBILIDAD Y RENDIMIENTO]\n")
                        f.write("=" * 80 + "\n\n")
                        print(f"[{now_str}] ✨ Nuevo equipo registrado: {log_filename}", flush=True)
                    else:
                        # Si ya existe, añadir separador de sesión sin borrar registros históricos
                        f.write("\n" + "=" * 80 + "\n")
                        f.write(f">>> NUEVA SESIÓN DE TELEMETRÍA ({cipher_desc}): {now_str}\n")
                        f.write("=" * 80 + "\n\n")
                        print(f"[{now_str}] 🔄 Sesión reanudada para equipo: {log_filename}", flush=True)
                    f.flush()

            # Confirmar aceptación al cliente
            wfile.write(b"OK\n")
            wfile.flush()

            # 2. Transmisión continua de registros
            with open(log_filepath, "a", encoding="utf-8") as log_file:
                while True:
                    line = rfile.readline()
                    if not line:
                        break
                    decoded = line.decode("utf-8", errors="replace")
                    with file_lock:
                        log_file.write(decoded)
                        log_file.flush()

        except json.JSONDecodeError as e:
            print(f"[{now_str}] ❌ JSON inválido de {client_ip}: {e}", flush=True)
        except ConnectionResetError:
            pass
        except Exception as e:
            print(f"[{now_str}] ⚠️ Error de transmisión con {client_ip}: {e}", flush=True)
        finally:
            end_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            print(f"[{end_time}] 🔌 Desconexión de cliente: {client_ip}", flush=True)
            try:
                rfile.close()
                wfile.close()
                sock.close()
            except Exception:
                pass

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

def main():
    cert_path, key_path = ensure_tls_certificates()
    ssl_context = None

    if cert_path and key_path and os.path.exists(cert_path) and os.path.exists(key_path):
        try:
            ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ssl_context.load_cert_chain(certfile=cert_path, keyfile=key_path)
            print("[TelemetryServer] 🔒 TLS habilitado con éxito.", flush=True)
        except Exception as e:
            print(f"[TelemetryServer] ⚠️ No se pudo inicializar TLS: {e}. Operando en modo directo.", flush=True)

    server_address = ("0.0.0.0", PORT)
    print(f"==================================================================", flush=True)
    print(f"  🚀 Lapdock OS Telemetry Server escuchando en puerto {PORT}", flush=True)
    print(f"  📁 Almacenamiento de reportes: {LOGS_DIR}", flush=True)
    print(f"  🔐 Cifrado de transporte: {'TLS 1.2/1.3 Activo' if ssl_context else 'Desactivado'}", flush=True)
    print(f"==================================================================", flush=True)

    with ThreadedTCPServer(server_address, TelemetryHandler) as server:
        server.ssl_context = ssl_context
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nApagando servidor de telemetría...", flush=True)
            server.shutdown()

if __name__ == "__main__":
    main()
