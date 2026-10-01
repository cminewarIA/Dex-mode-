#!/usr/bin/env python3
# ==============================================================================
# Lapdock OS - Servidor Central de Telemetría y Registro de Logs por Equipo
# Recibe información de hardware y flujos de logs continuos desde clientes PXE.
# Almacena un archivo único por cada ordenador en modo acumulativo.
# ==============================================================================

import os
import sys
import json
import socket
import socketserver
import threading
import datetime
import re

PORT = int(os.environ.get("LAPDOCK_TELEMETRY_PORT", "8998"))
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGS_DIR = os.path.join(BASE_DIR, "logs")

os.makedirs(LOGS_DIR, exist_ok=True)
FILE_LOCKS = {}
LOCKS_MUTEX = threading.Lock()

def get_file_lock(filename):
    with LOCKS_MUTEX:
        if filename not in FILE_LOCKS:
            FILE_LOCKS[filename] = threading.Lock()
        return FILE_LOCKS[filename]

def sanitize_filename(name):
    # Permitir solo letras, numeros, guiones y puntos
    clean = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', name)
    return clean.strip("._") or "equipo_desconocido"

class TelemetryTCPHandler(socketserver.StreamRequestHandler):
    def handle(self):
        client_ip = self.client_address[0]
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{now_str}] 📡 Conexión entrante de telemetría desde: {client_ip}", flush=True)

        try:
            # 1. Leer encabezado de registro JSON inicial
            raw_header = self.rfile.readline()
            if not raw_header:
                print(f"[{now_str}] ⚠️ Conexión cerrada antes de enviar encabezado por {client_ip}", flush=True)
                return

            header_str = raw_header.decode("utf-8", errors="replace").strip()
            data = json.loads(header_str)

            client_id = sanitize_filename(data.get("client_id") or f"client_{client_ip}")
            hw_info = data.get("hardware") or "Información de hardware no disponible."
            hostname = data.get("hostname", "lapdock-os")
            boot_time = data.get("timestamp", now_str)

            log_filename = f"{client_id}.log"
            log_filepath = os.path.join(LOGS_DIR, log_filename)
            file_lock = get_file_lock(log_filename)

            with file_lock:
                file_exists = os.path.exists(log_filepath) and os.path.getsize(log_filepath) > 0
                with open(log_filepath, "a", encoding="utf-8") as f:
                    if not file_exists:
                        # Si el equipo no está registrado, escribir la ficha técnica completa al inicio
                        f.write("=" * 80 + "\n")
                        f.write(f"LAPDOCK OS - FICHA DE HARDWARE Y REGISTRO DE TELEMETRÍA\n")
                        f.write(f"IDENTIFICADOR : {client_id}\n")
                        f.write(f"HOSTNAME      : {hostname}\n")
                        f.write(f"PRIMER REGISTRO: {now_str}\n")
                        f.write(f"DIRECCIÓN IP  : {client_ip}\n")
                        f.write("=" * 80 + "\n")
                        f.write("[FICHA TÉCNICA DE HARDWARE DETECTADO AL INICIAR]\n")
                        f.write(hw_info.strip() + "\n")
                        f.write("=" * 80 + "\n")
                        f.write("[HISTORIAL CONTINUO DE EVENTOS Y LOGS DEL SISTEMA]\n")
                        f.write("=" * 80 + "\n\n")
                        print(f"[{now_str}] ✨ Nuevo equipo registrado: {log_filename}", flush=True)
                    else:
                        # Si ya existe, añadir separador de nueva sesión sin borrar datos previos
                        f.write("\n" + "=" * 80 + "\n")
                        f.write(f">>> NUEVA SESIÓN DE ARRANQUE PXE / CONEXIÓN: {now_str} | IP: {client_ip}\n")
                        f.write("=" * 80 + "\n\n")
                        print(f"[{now_str}] 🔄 Sesión reanudada para equipo existente: {log_filename}", flush=True)

                    f.flush()

            # Confirmar recepción al cliente
            self.wfile.write(b"OK\n")
            self.wfile.flush()

            # 2. Transmisión continua de logs
            with open(log_filepath, "a", encoding="utf-8") as log_file:
                while True:
                    line = self.rfile.readline()
                    if not line:
                        break
                    decoded = line.decode("utf-8", errors="replace")
                    with file_lock:
                        log_file.write(decoded)
                        log_file.flush()

        except json.JSONDecodeError as e:
            print(f"[{now_str}] ❌ Error decodificando JSON de {client_ip}: {e}", flush=True)
        except ConnectionResetError:
            pass
        except Exception as e:
            print(f"[{now_str}] ⚠️ Error en streaming con {client_ip}: {e}", flush=True)
        finally:
            end_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            print(f"[{end_time}] 🔌 Desconexión de telemetría de: {client_ip}", flush=True)

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

def main():
    server_address = ("0.0.0.0", PORT)
    print(f"==================================================================", flush=True)
    print(f"  🚀 Lapdock OS Telemetry Server escuchando en puerto {PORT}", flush=True)
    print(f"  📁 Directorio de almacenamiento: {LOGS_DIR}", flush=True)
    print(f"==================================================================", flush=True)
    with ThreadedTCPServer(server_address, TelemetryTCPHandler) as server:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nApagando servidor de telemetría...", flush=True)
            server.shutdown()

if __name__ == "__main__":
    main()
