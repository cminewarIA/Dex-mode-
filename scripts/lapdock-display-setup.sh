#!/bin/bash
# ==============================================================================
# Lapdock OS - Gestor Universal de Salidas de Vídeo DRM (Pre-arranque Wayland Cage)
# Compatible con cualquier hardware (Intel, AMD, Nvidia, portátiles, sobremesas y VMs).
# ==============================================================================

MODE="${1:-auto}"

echo "[DisplaySetup] Analizando salidas de vídeo físicas del sistema (modo: $MODE)..."

# 1. Restaurar cualquier salida en 'off' a 'detect' para lectura real del hardware
for s in /sys/class/drm/card*-*/status; do
    [ -f "$s" ] || continue
    if grep -q "off" "$s" 2>/dev/null; then
        echo detect > "$s" 2>/dev/null || true
    fi
done

# Dar un instante al kernel para actualizar estados si hubo cambios
sleep 0.1

# 2. Clasificar salidas físicas conectadas
INTERNAL_STATUS=()
EXTERNAL_STATUS=()

for s in /sys/class/drm/card*-*/status; do
    [ -f "$s" ] || continue
    conn_dir=$(dirname "$s")
    conn_name=$(basename "$conn_dir")

    # Leer estado de conexión
    status_val=$(cat "$s" 2>/dev/null || true)
    if [ "$status_val" != "connected" ]; then
        continue
    fi

    # Distinguir entre pantalla integrada (eDP, LVDS, DSI) y externa (HDMI, DP, DisplayPort, VGA, DVI, Virtual)
    if echo "$conn_name" | grep -qiE 'eDP|LVDS|DSI'; then
        INTERNAL_STATUS+=("$s")
    else
        EXTERNAL_STATUS+=("$s")
    fi
done

NUM_INT=${#INTERNAL_STATUS[@]}
NUM_EXT=${#EXTERNAL_STATUS[@]}

echo "[DisplaySetup] Salidas conectadas detectadas: Integradas=$NUM_INT, Externas=$NUM_EXT"

case "$MODE" in
    solo_interna)
        if [ "$NUM_INT" -gt 0 ]; then
            echo "[DisplaySetup] Modo Solo Portátil: Activando pantalla interna y apagando externas..."
            for s in "${INTERNAL_STATUS[@]}"; do
                [ -w "$s" ] && echo detect > "$s" 2>/dev/null || true
            done
            for s in "${EXTERNAL_STATUS[@]}"; do
                [ -w "$s" ] && echo off > "$s" 2>/dev/null || true
            done
        else
            echo "[DisplaySetup] Aviso: No se detectó pantalla interna. Manteniendo salidas externas activas."
            for s in "${EXTERNAL_STATUS[@]}"; do
                [ -w "$s" ] && echo detect > "$s" 2>/dev/null || true
            done
        fi
        ;;

    duplicar)
        echo "[DisplaySetup] Modo Duplicar: Manteniendo todas las salidas de vídeo activas..."
        for s in /sys/class/drm/card*-*/status; do
            [ -w "$s" ] && echo detect > "$s" 2>/dev/null || true
        done
        ;;

    solo_hdmi|auto|*)
        if [ "$NUM_EXT" -gt 0 ]; then
            echo "[DisplaySetup] Monitor externo detectado ($NUM_EXT conectados)."
            if [ "$NUM_INT" -gt 0 ]; then
                echo "[DisplaySetup] Apagando pantalla interna del portátil para evitar división de escritorio..."
                for s in "${INTERNAL_STATUS[@]}"; do
                    [ -w "$s" ] && echo off > "$s" 2>/dev/null || true
                done
            fi
            for s in "${EXTERNAL_STATUS[@]}"; do
                [ -w "$s" ] && echo detect > "$s" 2>/dev/null || true
            done
        elif [ "$NUM_INT" -gt 0 ]; then
            echo "[DisplaySetup] Sin monitor externo: Activando pantalla interna del portátil..."
            for s in "${INTERNAL_STATUS[@]}"; do
                [ -w "$s" ] && echo detect > "$s" 2>/dev/null || true
            done
        else
            echo "[DisplaySetup] Sin clasificación estándar: Asegurando estado activo en todas las salidas..."
            for s in /sys/class/drm/card*-*/status; do
                [ -w "$s" ] && echo detect > "$s" 2>/dev/null || true
            done
        fi
        ;;
esac

echo "[DisplaySetup] Configuración DRM aplicada con éxito."
