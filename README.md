# Lapdock OS

> **Sistema operativo Kiosk minimalista para convertir cualquier ordenador portátil o PC en un Lapdock de proyección instantánea compatible con Ventoy.**

[![Build Lapdock OS ISO (Ventoy Ready)](https://github.com/actions/workflows/build-iso.yml/badge.svg)](../../actions/workflows/build-iso.yml)
[![Ventoy Compatible](https://img.shields.io/badge/Ventoy-100%25%20Compatible-blue.svg)](https://www.ventoy.net/)
[![Licencia](https://img.shields.io/badge/Licencia-GPLv3-green.svg)](LICENSE)

---

## ⚡ Descarga Rápida: GitHub Compila la ISO Automáticamente

No necesitas compilar nada en tu propio ordenador si no lo deseas. **GitHub Actions se encarga de compilar la imagen ISO completa automáticamente y empaquetarla lista para Ventoy.**

### Opción A: Descargar desde GitHub Releases (Recomendada)
1. Ve a la sección **[Releases](../../releases)** de este repositorio en GitHub.
2. Descarga el archivo:
   * 💿 **`Lapdock-OS-x86_64.iso`** (Imagen híbrida lista para BIOS y UEFI)
   * 🔑 **`SHA256SUMS.txt`** (Suma de verificación criptográfica)
3. **Copia el archivo `.iso` directamente a tu memoria USB con Ventoy.**

### Opción B: Generar una nueva ISO en GitHub con 1 Clic (GitHub Actions)
Si has hecho cambios o quieres generar la última versión al momento:
1. Ve a la pestaña **Actions** en la parte superior de tu repositorio GitHub.
2. En la barra lateral izquierda, haz clic en **`Build Lapdock OS ISO (Ventoy Ready)`**.
3. Haz clic en el botón desplegable **`Run workflow`** a la derecha y pulsa el botón verde **`Run workflow`**.
4. GitHub Actions iniciará una máquina virtual limpia con Ubuntu, compilará el sistema y publicará automáticamente la ISO en la sección **[Releases](../../releases)** con acceso público directo.

> ⚠️ **Importante para que GitHub publique la ISO sola (Permisos de Releases):**
> En GitHub, asegúrate de que Actions tenga permisos de escritura:
> 1. Ve a **Settings** (Configuración de tu repositorio).
> 2. En el menú lateral izquierdo, haz clic en **Actions** > **General**.
> 3. Baja hasta la sección **Workflow permissions** y selecciona **"Read and write permissions"**.
> 4. Haz clic en **Save**. ¡Con esto, cada commit o ejecución manual creará el Release público automáticamente!

---

## 📋 ¿Qué es Lapdock OS?

**Lapdock OS** convierte un portátil o mini-PC en un **Lapdock abierto**: un monitor y estación de trabajo portátil que no tiene interfaz de escritorio tradicional ni sistemas pesados. Su único cometido es:
1. Arrancar en una **pantalla de espera limpia** en cuestión de segundos, alojándose completamente en memoria RAM (`toram`).
2. Al conectar un **Samsung Galaxy (DeX)**, una **Nintendo Switch** o un móvil **Android**, proyectar inmediatamente su pantalla a **1080p a 60 FPS sin bordes, sin barras de tareas y con reenvío de teclado, ratón y altavoces**.
3. Al desconectar el cable, volver en silencio a la pantalla de espera, listo para el siguiente dispositivo.

---

## 🎯 Dispositivos Compatibles

| Dispositivo | Conexión | Motor Interno | Características |
| :--- | :--- | :--- | :--- |
| **Samsung Galaxy (DeX)** | Cable USB-C a USB-A / C | `scrcpy` (H.265 / UHID) | Modo escritorio One UI completo, emulación de teclado/ratón por hardware UHID, pantalla del móvil apagada automáticamente para evitar calentamiento. |
| **Nintendo Switch** | Dock / Dongle + Capturadora HDMI UVC | `mpv` (Low-Latency V4L2) | Captura nativa a 1080p60 a menos de 30 ms de retardo, audio PCM digital directo a los altavoces. |
| **Android Universal** | Cable USB | `scrcpy` (H.264 / ADB) | Proyección fluida a 60 FPS con soporte para modo escritorio nativo de Android 10+. |
| **Ubuntu Touch / Linux** | Cable USB (Convergencia) | Pipeline PipeWire / Scrcpy | Modo convergencia Lomiri con teclado físico. |

---

## 🚀 Guía de Instalación en Ventoy

### 1. Instalar Ventoy en tu memoria USB
1. Descarga e instala Ventoy desde su web oficial: **[ventoy.net](https://www.ventoy.net/)**.
2. Conecta tu memoria USB (se recomienda USB 3.0 de al menos 8 GB) y presiona **Install**.

### 2. Copiar la ISO
1. Arrastra el archivo **`Lapdock-OS-x86_64.iso`** directamente a la partición de la memoria USB con Ventoy.
2. ¡Listo! No necesitas formatear, quemar particiones ni usar Rufus/Etcher.

### 3. Arrancar el Portátil
1. Conecta la memoria USB al ordenador que quieras convertir en Lapdock.
2. Enciéndelo pulsando la tecla de arranque (generalmente `F12`, `F11`, `F9` o `Esc`).
3. Selecciona la memoria USB y en el menú de Ventoy elige **Lapdock OS**.
4. El sistema se cargará en la memoria RAM y mostrará la pantalla de espera. Enchufa tu teléfono o Nintendo Switch y comenzará a proyectar de inmediato.

---

## 🛠️ Compilación Local Manual (Opcional)

Si prefieres compilar la ISO tú mismo en tu propio ordenador en lugar de que lo haga GitHub:

```bash
# Clonar repositorio
git clone https://github.com/tu-usuario/lapdock-os.git
cd lapdock-os

# Dar permisos de ejecución
chmod +x scripts/*.sh scripts/*.py

# Compilar imagen ISO (requiere sudo en Debian/Ubuntu o WSL2)
sudo bash scripts/build-lapdock-iso.sh
```

El script creará automáticamente el archivo `output/Lapdock-OS-x86_64.iso`.

---

## 📐 Estructura del Repositorio

```
├── .github/
│   └── workflows/
│       └── build-iso.yml          # Flujo CI/CD que compila la ISO en GitHub
├── configs/
│   ├── 99-lapdock-devices.rules   # Reglas udev de hotplug instantáneo
│   └── lapdock-kiosk.service      # Servicio systemd de inicio Wayland Cage
├── scripts/
│   ├── build-lapdock-iso.sh       # Constructor de la ISO basada en Debian 12
│   └── kiosk-manager.py           # Demonio Python que orquesta Scrcpy y MPV
├── src/                           # Interfaz web complementaria y emulador de firmware
├── README.md                      # Documentación completa del proyecto
└── metadata.json                  # Metadatos del sistema
```

---

## ⌨️ Teclas de Control y Menú OSD

* **F2** o **Alt + O**: Despliega el menú en pantalla (**OSD**) para regular brillo, volumen de altavoces o alternar entre entradas USB-C y micro-HDMI.
* **Escape**: Cierra el menú OSD.
* **F11**: Alterna modo pantalla completa del monitor.

---

## 📄 Licencia

Software libre y abierto publicado bajo la licencia **GNU General Public License v3.0 (GPLv3)**.
