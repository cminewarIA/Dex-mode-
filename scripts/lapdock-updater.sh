#!/bin/bash
# ==============================================================================
# Lapdock OS - Silent GitHub Auto-Updater
# Escanea y actualiza automáticamente scripts y servicios en segundo plano
# ==============================================================================

set -u

CONFIG_FILE="/etc/lapdock/update.conf"
LOG_TAG="lapdock-updater"
LOG_FILE="/var/log/lapdock-update.log"

# Configuración por defecto
GITHUB_REPO="cminewarIA/Dex-mode-"
GITHUB_BRANCH="main"
ENABLED="true"

# Cargar configuración personalizada si existe
if [ -f "$CONFIG_FILE" ]; then
    # shellcheck source=/dev/null
    source "$CONFIG_FILE"
fi

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
    logger -t "$LOG_TAG" "$1" 2>/dev/null || true
}

if [ "$ENABLED" != "true" ] && [ "$ENABLED" != "1" ]; then
    exit 0
fi

# 1. Comprobar si hay conexión a Internet
if ! curl -s --connect-timeout 4 --max-time 6 "https://raw.githubusercontent.com" >/dev/null 2>&1; then
    # Sin conexión a Internet: salir silenciosamente
    exit 0
fi

BASE_RAW_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}"
UPDATED_SOMETHING=0
RESTART_KIOSK_NEEDED=0

update_file() {
    local remote_rel_path="$1"
    local local_dest="$2"
    local file_type="$3" # python | bash | text
    local file_mode="$4" # e.g. 755 or 644

    local tmp_file
    tmp_file=$(mktemp "/tmp/lapdock-update.XXXXXX")

    # Descargar con timeout seguro
    if ! curl -fsSL --connect-timeout 5 --max-time 15 "${BASE_RAW_URL}/${remote_rel_path}" -o "$tmp_file" 2>/dev/null; then
        rm -f "$tmp_file"
        return 1
    fi

    # Validar que no sea un 404 HTML o error de GitHub
    if grep -qi "<!DOCTYPE html>" "$tmp_file" 2>/dev/null || grep -qi "404: Not Found" "$tmp_file" 2>/dev/null; then
        rm -f "$tmp_file"
        return 1
    fi

    # Validar tamaño mínimo
    local file_size
    file_size=$(wc -c < "$tmp_file" 2>/dev/null || echo 0)
    if [ "$file_size" -lt 100 ]; then
        rm -f "$tmp_file"
        return 1
    fi

    # Validación de sintaxis según el tipo
    if [ "$file_type" = "python" ]; then
        if ! python3 -m py_compile "$tmp_file" 2>/dev/null; then
            log "⚠️ Error de sintaxis en $remote_rel_path descargado. Se descarta."
            rm -f "$tmp_file"
            return 1
        fi
    elif [ "$file_type" = "bash" ]; then
        if ! bash -n "$tmp_file" 2>/dev/null; then
            log "⚠️ Error de sintaxis en $remote_rel_path descargado. Se descarta."
            rm -f "$tmp_file"
            return 1
        fi
    fi

    # Comprobar si hay cambios con respecto a la versión instalada
    if [ -f "$local_dest" ]; then
        local current_hash new_hash
        current_hash=$(sha256sum "$local_dest" 2>/dev/null | awk '{print $1}')
        new_hash=$(sha256sum "$tmp_file" 2>/dev/null | awk '{print $1}')
        if [ "$current_hash" = "$new_hash" ]; then
            rm -f "$tmp_file"
            return 0
        fi
        # Crear respaldo
        cp -p "$local_dest" "${local_dest}.bak" 2>/dev/null || true
    fi

    # Instalar archivo actualizado
    mkdir -p "$(dirname "$local_dest")"
    if install -m "$file_mode" "$tmp_file" "$local_dest"; then
        log "✅ Actualizado con éxito: $local_dest (desde GitHub: $remote_rel_path)"
        UPDATED_SOMETHING=1
        if [[ "$local_dest" == *"/kiosk-manager.py"* ]] || [[ "$local_dest" == *"/lapdock-kiosk.service"* ]]; then
            RESTART_KIOSK_NEEDED=1
        fi
    else
        log "❌ Error al copiar archivo a $local_dest"
    fi

    rm -f "$tmp_file"
    return 0
}

# 2. Escanear y actualizar componentes clave
update_file "scripts/kiosk-manager.py" "/usr/local/bin/kiosk-manager.py" "python" "755" || true
update_file "scripts/lapdock-updater.sh" "/usr/local/bin/lapdock-updater.sh" "bash" "755" || true
update_file "configs/lapdock-kiosk.service" "/etc/systemd/system/lapdock-kiosk.service" "text" "644" || true
update_file "configs/99-lapdock-devices.rules" "/etc/udev/rules.d/99-lapdock-devices.rules" "text" "644" || true

# 3. Si hubo cambios en reglas udev, recargarlas
if [ -f "/etc/udev/rules.d/99-lapdock-devices.rules" ] && [ "$UPDATED_SOMETHING" -eq 1 ]; then
    udevadm control --reload-rules 2>/dev/null || true
fi

# 4. Si se actualizó el Kiosk o su servicio, recargar de forma segura (sin cortar partidas activas)
if [ "$RESTART_KIOSK_NEEDED" -eq 1 ]; then
    systemctl daemon-reload 2>/dev/null || true
    
    # Comprobar si hay una sesión de proyección en uso (Scrcpy o MPV)
    if pgrep -x "scrcpy" >/dev/null 2>&1 || pgrep -x "mpv" >/dev/null 2>&1; then
        log "ℹ️ Proyección activa (juego o DeX en uso). El reinicio del Kiosk se pospone para no interrumpir la sesión."
    else
        log "🔄 Reiniciando Lapdock Kiosk para aplicar novedades..."
        systemctl restart lapdock-kiosk.service 2>/dev/null || true
    fi
fi

exit 0
