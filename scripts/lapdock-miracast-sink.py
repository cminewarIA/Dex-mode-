#!/usr/bin/env python3
"""
Lapdock OS - Miracast & Wi-Fi Display (WFD / MICE) Sink Receiver Daemon
Escucha conexiones entrantes de proyección inalámbrica (Android Smart View, Windows Cast, Xiaomi, etc.)
a través de la red local (Wi-Fi/LAN) utilizando el estándar Wi-Fi Display sobre RTSP (puerto 7236).
Decodifica la transmisión de vídeo y audio en tiempo real con baja latencia mediante MPV / GStreamer.
"""

import os
import sys
import time
import socket
import select
import threading
import subprocess
import json
import re

WFD_PORT = 7236
RTP_PORT = 19000
STATE_FILE = "/tmp/lapdock-miracast-state.json"

# Estado de sesión activa
SESSION_STATE = {
    "active": False,
    "client_ip": None,
    "device_name": None,
    "started_at": None,
    "resolution": "1920x1080@60Hz",
    "protocol": "Miracast (WFD/MICE)"
}
SESSION_LOCK = threading.Lock()
PLAYER_PROCESS = None
PLAYER_LOCK = threading.Lock()

def update_state(active, client_ip=None, device_name=None):
    global SESSION_STATE
    with SESSION_LOCK:
        SESSION_STATE["active"] = active
        SESSION_STATE["client_ip"] = client_ip
        SESSION_STATE["device_name"] = device_name or ("Dispositivo " + (client_ip or "Inalámbrico"))
        SESSION_STATE["started_at"] = time.time() if active else None

    try:
        import tempfile
        tmp_fd, tmp_path = tempfile.mkstemp(dir=os.path.dirname(STATE_FILE), suffix=".tmp")
        with os.fdopen(tmp_fd, "w") as f:
            json.dump(SESSION_STATE, f)
        os.replace(tmp_path, STATE_FILE)
    except Exception as e:
        print(f"[Miracast] Error guardando estado: {e}", flush=True)
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

def kill_player():
    global PLAYER_PROCESS
    with PLAYER_LOCK:
        if PLAYER_PROCESS and PLAYER_PROCESS.poll() is None:
            print("[Miracast] Deteniendo reproductor de vídeo...", flush=True)
            try:
                PLAYER_PROCESS.terminate()
                PLAYER_PROCESS.wait(timeout=1.5)
            except Exception:
                try:
                    PLAYER_PROCESS.kill()
                except Exception:
                    pass
        PLAYER_PROCESS = None

def start_player():
    """Inicia el reproductor MPV o GStreamer escuchando los paquetes MPEG-TS sobre UDP en RTP_PORT."""
    global PLAYER_PROCESS
    kill_player()

    cmd = [
        "mpv",
        f"udp://0.0.0.0:{RTP_PORT}",
        "--profile=low-latency",
        "--untimed",
        "--video-sync=display-resample",
        "--fullscreen",
        "--no-terminal",
        "--cursor-autohide=100",
        "--keep-open=no"
    ]

    with PLAYER_LOCK:
        try:
            print(f"[Miracast] Iniciando reproductor MPV en udp://0.0.0.0:{RTP_PORT}...", flush=True)
            PLAYER_PROCESS = subprocess.Popen(cmd)
        except Exception as e:
            print(f"[Miracast] Error al lanzar MPV, probando respaldo GStreamer: {e}", flush=True)
            gst_cmd = [
                "gst-launch-1.0",
                "udpsrc", f"port={RTP_PORT}", "caps=video/mpegts",
                "!", "tsdemux", "name=d",
                "d.", "!", "queue", "!", "h264parse", "!", "avdec_h264", "!", "autovideosink", "sync=false",
                "d.", "!", "queue", "!", "audioconvert", "!", "pipewiresink", "sync=false"
            ]
            try:
                PLAYER_PROCESS = subprocess.Popen(gst_cmd)
            except Exception as e2:
                print(f"[Miracast] Error al lanzar GStreamer: {e2}", flush=True)

class WfdClientHandler(threading.Thread):
    def __init__(self, conn, addr):
        super().__init__(daemon=True)
        self.conn = conn
        self.addr = addr
        self.client_ip = addr[0]
        self.session_id = f"{int(time.time())}"
        self.cseq = 1
        self.running = True
        self.client_rtsp_port = 7236
        self.device_name = f"Android/Windows ({self.client_ip})"
        self.is_established = False

    def run(self):
        buffer = b""

        try:
            while self.running:
                r, _, _ = select.select([self.conn], [], [], 10.0)
                if not r:
                    # Timeout de lectura, comprobar si la sesión sigue viva
                    continue

                data = self.conn.recv(4096)
                if not data:
                    break

                buffer += data
                while b"\r\n\r\n" in buffer:
                    header_part, buffer = buffer.split(b"\r\n\r\n", 1)
                    request_text = header_part.decode("utf-8", errors="replace")

                    if not self.is_established:
                        self.is_established = True
                        print(f"[Miracast] Conexión RTSP establecida desde {self.client_ip}:{self.addr[1]}", flush=True)
                        update_state(active=True, client_ip=self.client_ip, device_name=self.device_name)

                    # Si hay Content-Length, leer el cuerpo correspondiente
                    content_len_match = re.search(r"Content-Length:\s*(\d+)", request_text, re.IGNORECASE)
                    body_text = ""
                    if content_len_match:
                        content_len = int(content_len_match.group(1))
                        while len(buffer) < content_len:
                            r2, _, _ = select.select([self.conn], [], [], 5.0)
                            if not r2:
                                break
                            extra = self.conn.recv(4096)
                            if not extra:
                                break
                            buffer += extra
                        body_bytes = buffer[:content_len]
                        buffer = buffer[content_len:]
                        body_text = body_bytes.decode("utf-8", errors="replace")

                    self.handle_rtsp_request(request_text, body_text)

        except Exception as e:
            if self.is_established:
                print(f"[Miracast] Error en handler de cliente {self.client_ip}: {e}", flush=True)
        finally:
            self.running = False
            try:
                self.conn.close()
            except Exception:
                pass
            if self.is_established:
                kill_player()
                update_state(active=False)
                print(f"[Miracast] Sesión finalizada con {self.client_ip}", flush=True)

    def handle_rtsp_request(self, headers, body):
        lines = headers.splitlines()
        if not lines:
            return

        request_line = lines[0]
        parts = request_line.split()
        if len(parts) < 2:
            return

        method = parts[0].upper()
        uri = parts[1]

        # Extraer CSeq
        cseq_match = re.search(r"CSeq:\s*(\d+)", headers, re.IGNORECASE)
        cseq = cseq_match.group(1) if cseq_match else "1"

        print(f"[Miracast] RTSP <<< {method} (CSeq: {cseq})", flush=True)

        # Detectar nombre de dispositivo si viene en cabeceras o cuerpo
        if "friendly_name" in body.lower():
            fn_match = re.search(r"friendly_name=([^\r\n;]+)", body, re.IGNORECASE)
            if fn_match:
                self.device_name = fn_match.group(1).strip()
                update_state(active=True, client_ip=self.client_ip, device_name=self.device_name)
        elif "User-Agent:" in headers:
            ua_match = re.search(r"User-Agent:\s*([^\r\n]+)", headers, re.IGNORECASE)
            if ua_match:
                self.device_name = ua_match.group(1).strip()
                update_state(active=True, client_ip=self.client_ip, device_name=self.device_name)

        if method == "OPTIONS":
            self.respond_options(cseq)
        elif method == "GET_PARAMETER":
            self.respond_get_parameter(cseq, body)
        elif method == "SET_PARAMETER":
            self.respond_set_parameter(cseq, body)
        elif method == "SETUP":
            self.respond_setup(cseq, headers)
        elif method == "PLAY":
            self.respond_play(cseq)
        elif method == "TEARDOWN":
            self.respond_teardown(cseq)
        else:
            self.respond_ok(cseq)

    def send_response(self, text):
        try:
            print(f"[Miracast] RTSP >>> Respondiendo ({len(text)} bytes)", flush=True)
            self.conn.sendall(text.encode("utf-8"))
        except Exception as e:
            print(f"[Miracast] Error enviando respuesta RTSP: {e}", flush=True)

    def respond_options(self, cseq):
        resp = (
            f"RTSP/1.0 200 OK\r\n"
            f"CSeq: {cseq}\r\n"
            f"Public: org.wfa.wfd1.0, GET_PARAMETER, SET_PARAMETER, SETUP, PLAY, TEARDOWN\r\n"
            f"\r\n"
        )
        self.send_response(resp)

        # Iniciar M2 opcional hacia el origen
        threading.Thread(target=self.send_m2_options, daemon=True).start()

    def send_m2_options(self):
        time.sleep(0.1)
        req = (
            f"OPTIONS * RTSP/1.0\r\n"
            f"CSeq: 1\r\n"
            f"Require: org.wfa.wfd1.0\r\n"
            f"\r\n"
        )
        try:
            self.conn.sendall(req.encode("utf-8"))
        except Exception:
            pass

    def respond_get_parameter(self, cseq, body):
        # M3: Devolver formatos soportados por Lapdock OS (1080p60, 720p60, LPCM, AAC)
        # Capacidad CEA/VESA estándar WFD para 1080p60 y 720p60 sin HDCP obligatorio
        lines = [
            "wfd_video_formats: 00 00 02 02 00000040 00000000 00000000 00 0000 0000 00 none none",
            "wfd_audio_codecs: AAC 00000001 00, LPCM 00000003 00",
            f"wfd_client_rtp_ports: RTP/AVP/UDP;unicast {RTP_PORT} 0 mode=play",
            "wfd_content_protection: none",
            "wfd_uibc_capability: none",
            "wfd_connector_type: 05",
            "wfd_standby_resume_capability: none"
        ]
        body_resp = "\r\n".join(lines) + "\r\n"
        content_len = len(body_resp.encode("utf-8"))

        resp = (
            f"RTSP/1.0 200 OK\r\n"
            f"CSeq: {cseq}\r\n"
            f"Content-Type: text/parameters\r\n"
            f"Content-Length: {content_len}\r\n"
            f"\r\n"
            f"{body_resp}"
        )
        self.send_response(resp)

    def respond_set_parameter(self, cseq, body):
        # M4 o M5
        resp = (
            f"RTSP/1.0 200 OK\r\n"
            f"CSeq: {cseq}\r\n"
            f"\r\n"
        )
        self.send_response(resp)

        # Si el cliente solicita disparar SETUP desde el sink
        if "wfd_trigger_method: SETUP" in body or "wfd_trigger_method: setup" in body:
            threading.Thread(target=self.trigger_setup, daemon=True).start()

    def trigger_setup(self):
        time.sleep(0.2)
        req = (
            f"SETUP rtsp://{self.client_ip}/wfd1.0/streamid=0 RTSP/1.0\r\n"
            f"CSeq: 2\r\n"
            f"Transport: RTP/AVP/UDP;unicast;client_port={RTP_PORT}\r\n"
            f"\r\n"
        )
        try:
            self.conn.sendall(req.encode("utf-8"))
        except Exception:
            pass

    def respond_setup(self, cseq, headers):
        # M6
        start_player()
        resp = (
            f"RTSP/1.0 200 OK\r\n"
            f"CSeq: {cseq}\r\n"
            f"Session: {self.session_id};timeout=60\r\n"
            f"Transport: RTP/AVP/UDP;unicast;client_port={RTP_PORT}-{RTP_PORT+1};server_port={RTP_PORT}-{RTP_PORT+1}\r\n"
            f"\r\n"
        )
        self.send_response(resp)

    def respond_play(self, cseq):
        # M7
        start_player()
        resp = (
            f"RTSP/1.0 200 OK\r\n"
            f"CSeq: {cseq}\r\n"
            f"Session: {self.session_id}\r\n"
            f"Range: npt=now-\r\n"
            f"\r\n"
        )
        self.send_response(resp)
        print(f"[Miracast] Transmisión de pantalla activa con {self.device_name}!", flush=True)

    def respond_teardown(self, cseq):
        kill_player()
        resp = (
            f"RTSP/1.0 200 OK\r\n"
            f"CSeq: {cseq}\r\n"
            f"\r\n"
        )
        self.send_response(resp)
        self.running = False

    def respond_ok(self, cseq):
        resp = (
            f"RTSP/1.0 200 OK\r\n"
            f"CSeq: {cseq}\r\n"
            f"\r\n"
        )
        self.send_response(resp)

def get_local_ip():
    """Obtiene la dirección IP primaria del equipo en la red local."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def start_server():
    local_ip = get_local_ip()
    print("==================================================================", flush=True)
    print("  📡 LAPDOCK OS - SERVICIO RECEPTOR MIRACAST / WI-FI DISPLAY", flush=True)
    print(f"  🌐 IP Local de escucha: {local_ip}:{WFD_PORT}", flush=True)
    print(f"  🎬 Puerto RTP Vídeo/Audio: UDP {RTP_PORT}", flush=True)
    print("  🚀 Compatible con: Samsung Smart View / Windows Cast / Android WFD", flush=True)
    print("==================================================================", flush=True)

    update_state(active=False)

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

    try:
        server.bind(("0.0.0.0", WFD_PORT))
        server.listen(5)
    except Exception as e:
        print(f"[Miracast] Error al vincular puerto {WFD_PORT}: {e}", flush=True)
        sys.exit(1)

    while True:
        try:
            conn, addr = server.accept()
            handler = WfdClientHandler(conn, addr)
            handler.start()
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"[Miracast] Error en bucle principal: {e}", flush=True)
            time.sleep(1.0)

    kill_player()
    update_state(active=False)
    server.close()

if __name__ == "__main__":
    start_server()
