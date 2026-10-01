#!/bin/bash
# ==============================================================================
# Lapdock OS - Gestor de Salidas de Vídeo DRM (Pre-arranque Wayland Cage)
# Configura las salidas a nivel DRM del kernel antes de que Cage inicie.
# ==============================================================================

MODE="${1:-auto}"

case "$MODE" in
    solo_interna)
        echo "[DisplaySetup] Configurando modo: Solo Pantalla Interna del Portátil..."
        for s in /sys/class/drm/card*-eDP-*/status /sys/class/drm/card*-LVDS-*/status /sys/class/drm/card*-DSI-*/status; do
            [ -w "$s" ] && echo detect > "$s"
        done
        for s in /sys/class/drm/card*-HDMI-*/status /sys/class/drm/card*-DP-*/status; do
            [ -w "$s" ] && echo off > "$s"
        done
        ;;

    solo_hdmi|auto|*)
        # Comprobar si hay monitor HDMI o DisplayPort externo conectado físicamente
        EXTERNAL_CONNECTED=0
        for s in /sys/class/drm/card*-HDMI-*/status /sys/class/drm/card*-DP-*/status; do
            if [ -f "$s" ]; then
                # Si estaba en 'off', restaurar a detect para lectura real de cable conectado
                if grep -q "off" "$s" 2>/dev/null; then
                    echo detect > "$s"
                fi
                if grep -q "^connected" "$s"; then
                    EXTERNAL_CONNECTED=1
                    break
                fi
            fi
        done

        if [ "$EXTERNAL_CONNECTED" -eq 1 ]; then
            echo "[DisplaySetup] Monitor HDMI/DP externo detectado. Apagando pantalla del portátil para salida exclusiva HDMI..."
            # Apagar pantalla interna para que Cage no extienda el escritorio
            for s in /sys/class/drm/card*-eDP-*/status /sys/class/drm/card*-LVDS-*/status /sys/class/drm/card*-DSI-*/status; do
                [ -w "$s" ] && echo off > "$s"
            done
            # Asegurar que la salida externa esté activa
            for s in /sys/class/drm/card*-HDMI-*/status /sys/class/drm/card*-DP-*/status; do
                [ -w "$s" ] && echo detect > "$s"
            done
        else
            echo "[DisplaySetup] No se detectó monitor externo. Activando pantalla interna del portátil..."
            for s in /sys/class/drm/card*-eDP-*/status /sys/class/drm/card*-LVDS-*/status /sys/class/drm/card*-DSI-*/status; do
                [ -w "$s" ] && echo detect > "$s"
            done
        fi
        ;;
esac
