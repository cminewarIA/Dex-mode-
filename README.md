# Lapdock OS

> **Sistema operativo Kiosk minimalista y firmware live para convertir cualquier ordenador portátil o PC en un Lapdock de proyección instantánea compatible con Ventoy.**

[![Build Lapdock OS ISO (Ventoy Ready)](https://github.com/cminewarIA/Dex-mode-/actions/workflows/build-iso.yml/badge.svg)](../../actions/workflows/build-iso.yml)
[![Ventoy Compatible](https://img.shields.io/badge/Ventoy-100%25%20Compatible-blue.svg)](https://www.ventoy.net/)
[![Licencia](https://img.shields.io/badge/Licencia-GPLv3-green.svg)](LICENSE)

---

## ⚡ Descarga Rápida: GitHub Compila la ISO Automáticamente

No necesitas compilar nada en tu propio ordenador ni instalar entornos Linux pesados. **GitHub Actions se encarga de compilar la imagen ISO completa automáticamente y publicarla lista para arrancar en Ventoy.**

### Opción A: Descargar desde GitHub Releases (Recomendada)
1. Ve a la sección **[Releases](../../releases)** de este repositorio en GitHub.
2. Descarga los archivos de la última versión:
   * 💿 **`Lapdock-OS-x86_64.iso`** (Imagen híbrida arrancable en BIOS Legacy y UEFI moderna).
   * 🔑 **`SHA256SUMS.txt`** (Suma de verificación criptográfica).
3. **Copia el archivo `.iso` directamente a tu memoria USB con Ventoy.**

### Opción B: Generar una nueva ISO en GitHub con 1 Clic (GitHub Actions)
Si has hecho cambios o quieres generar la última versión al momento:
1. Ve a la pestaña **Actions** en la parte superior de tu repositorio GitHub.
2. En la barra lateral izquierda, haz clic en **`Build Lapdock OS ISO (Ventoy Ready)`**.
3. Haz clic en el desplegable **`Run workflow`** a la derecha y pulsa el botón verde **`Run workflow`**.
4. GitHub Actions iniciará una máquina virtual limpia con Ubuntu, compilará el sistema y publicará automáticamente la ISO en la sección **[Releases](../../releases)** con acceso público directo.

> ⚠️ **Permisos de GitHub Releases:**
> Asegúrate de que Actions tenga permisos de escritura:
> En tu repositorio ve a **Settings** > **Actions** > **General** > **Workflow permissions** > Selecciona **"Read and write permissions"** > Haz clic en **Save**.

---

## 📋 ¿Qué es Lapdock OS?

**Lapdock OS** transforma cualquier portátil antiguo o moderno en una terminal **Lapdock**:
* **Sin entorno de escritorio tradicional**: Elimina GNOME, KDE o XFCE. No hay menús innecesarios, navegadores de fondo ni procesos en segundo plano que gasten batería o CPU.
* **100% en memoria RAM (`toram`)**: Se carga al encender en la memoria RAM del portátil, dejando libres los discos duros internos y permitiendo retirar el pendrive si se desea.
* **Compositor Wayland Cage ultra-rápido**: Utiliza `cage`, un compositor de ventana única sobre `wlroots`, que garantiza 60 FPS estables con latencia imperceptible.
* **Gestión Inteligente de Pantallas y Monitores Externos**:
  - Si conectas un monitor externo por HDMI o DisplayPort a tu portátil, el sistema **apaga automáticamente la pantalla interna del portátil (`eDP-1`)** y proyecta a pantalla completa única (100%) en el monitor externo, eliminando pantallas divididas o escritorios extendidos.
  - Al desconectar el monitor, reactiva la pantalla interna del portátil de inmediato.
* **Proyección instantánea**:
  - Al conectar un **Samsung Galaxy** (o terminal Android compatible), activa automáticamente **Samsung DeX** o el modo escritorio a pantalla completa con teclado, touchpad, altavoces y micrófono nativos.
  - Al activar el modo inalámbrico, permite desconectar el cable y continuar trabajando a través de la red Wi-Fi local sin interrupciones.
  - Al desconectar el dispositivo, regresa de inmediato al radar visual de espera.

---

## 🎯 Dispositivos Compatibles y Cómo Conectarlos

### 1. 📱 Samsung Galaxy (Samsung DeX) y Móviles Android por Cable USB
| Parámetro | Detalle |
| :--- | :--- |
| **Conexión** | Cable USB (USB-C a USB-C o USB-A a USB-C) |
| **Motor** | `scrcpy` (Códec H.265 / H.264 con emulación de hardware UHID y túnel de audio PipeWire) |
| **Pasos** | 1. En el móvil, activa la **Depuración USB** (Ajustes > Opciones de desarrollador > Depuración USB).<br>2. Enchufa el cable USB al portátil.<br>3. **IMPORTANTE:** Desbloquea la pantalla del móvil. Aparecerá una ventana emergente: *«¿Permitir depuración USB desde este equipo?»*. Marca la casilla **"Permitir siempre"** y pulsa **Aceptar**.<br>4. Lapdock OS detectará el teléfono y lanzará DeX a pantalla completa automáticamente. |

### 2. 📶 Conexión Inalámbrica Wi-Fi (ADB TCP/IP)
| Parámetro | Detalle |
| :--- | :--- |
| **Conexión** | Red Local Wi-Fi (Recomendado 5 GHz) |
| **Motor** | `scrcpy --tcpip` con puerto 5555 y buffer cero |
| **Pasos** | 1. Conecta el móvil por cable USB la primera vez para autorizar la depuración.<br>2. Lapdock OS habilita automáticamente el modo TCP/IP (`adb tcpip 5555`) y memoriza la dirección IP del terminal.<br>3. Desconecta el cable USB: el sistema mantendrá la proyección por Wi-Fi a 60 FPS con teclado y ratón inalámbricos. |

---

## 🖥️ Gestión Automática de Pantallas y Monitores Externos

Uno de los mayores desafíos al conectar un portátil a un monitor externo es evitar que Wayland cree un "escritorio extendido" (la mitad de la pantalla en el portátil y la otra mitad en el monitor externo).

Lapdock OS incluye un subsistema de detección dinámica (`auto_select_best_display`):
1. **Prioridad Absoluta al Monitor Externo**:
   * Mediante `wlr-randr`, escanea periódicamente y al arrancar todas las salidas de vídeo.
   * Si detecta cualquier salida externa activa (`HDMI-A-1`, `DP-1`, `VGA-1`, `DVI-I-1`), **apaga de inmediato la pantalla integrada del portátil (`eDP-1`, `LVDS-1`)** ejecutando `wlr-randr --output eDP-1 --off`.
   * Reposiciona el monitor externo en la coordenada de origen `(0,0)` ocupando el 100% de la superficie visual sin franjas ni cortes.
2. **Restauración Autónoma al Desconectar**:
   * Si desconectas el monitor externo, el demonio reactiva inmediatamente la pantalla del portátil (`wlr-randr --output eDP-1 --on --pos 0,0`) para que puedas seguir usando el equipo de viaje o en la cama.
3. **Atajo Manual Rápido**:
   * Puedes pulsar **`F7`** en cualquier momento para forzar la sincronización y centrado de la pantalla activa.

---

## 📁 Guía Detallada de Archivos del Proyecto

Esta sección describe el propósito exacto, la ubicación y la función de cada archivo en este repositorio:

```
├── .github/
│   └── workflows/
│       └── build-iso.yml               # Flujo CI/CD de compilación automática en GitHub Actions
├── configs/
│   ├── 99-lapdock-devices.rules        # Reglas udev de permisos para dispositivos USB, V4L2 y UHID
│   ├── lapdock-kiosk.service           # Servicio systemd de inicio automático de Cage y Kiosk
│   ├── lapdock-update.conf             # Configuración del repositorio GitHub para actualizaciones
│   ├── lapdock-updater.service         # Servicio systemd para el actualizador silencioso
│   └── lapdock-updater.timer           # Temporizador systemd periódico del actualizador
├── scripts/
│   ├── build-lapdock-iso.sh            # Script maestro que construye la ISO Live de Debian 12
│   ├── kiosk-manager.py                # Demonio principal: UI de radar, detección y lanzador
│   └── lapdock-updater.sh              # Script en bash del actualizador silencioso desde GitHub
├── src/
│   ├── components/
│   │   ├── ArchitectureDocs.tsx        # Documentación interactiva de la arquitectura del sistema
│   │   ├── DeviceSimulator.tsx         # Simulador web de conexión/desconexión de dispositivos
│   │   ├── DexDesktop.tsx              # Maqueta interactiva de escritorio Samsung DeX en web
│   │   ├── IsoBuilderPanel.tsx         # Panel web para visualizar, copiar y descargar scripts
│   │   ├── KioskScreen.tsx             # Pantalla de radar en espera de Lapdock OS en web
│   │   ├── Lapdock.tsx                 # Chasis visual de portátil/lapdock para la vista previa
│   │   └── UbuntuTouchHome.tsx         # Maqueta interactiva para dispositivos con Ubuntu Touch
│   ├── data/
│   │   ├── deviceProfiles.ts           # Perfiles de hardware y configuraciones de dispositivos
│   │   └── isoScripts.ts               # Almacén de scripts y ficheros de configuración para la web
│   ├── App.tsx                         # Componente raíz de la aplicación web complementaria
│   ├── index.css                       # Estilos globales y utilidades de Tailwind CSS
│   ├── main.tsx                        # Punto de entrada de React en el navegador
│   └── types.ts                        # Definición de tipos e interfaces TypeScript
├── index.html                          # Plantilla HTML principal del frontend web
├── metadata.json                       # Metadatos del applet y configuración de permisos
├── package.json                        # Definición de dependencias npm y scripts de Vite
├── tsconfig.json                       # Configuración del compilador de TypeScript
├── vite.config.ts                      # Configuración del empaquetador Vite y plugins
├── .env.example                        # Ejemplo de variables de entorno requeridas
├── .gitignore                          # Patrones de exclusión para Git (node_modules, builds, etc.)
└── README.md                           # Documentación principal, manual de usuario y especificaciones
```

### 1. Flujo de Integración y CI/CD (`.github/`)
* **`.github/workflows/build-iso.yml`**: Define la tarea automatizada en GitHub Actions. Cuando se realiza un `push` a la rama principal o se activa manualmente mediante `workflow_dispatch`, levanta un contenedor Ubuntu, instala las herramientas de compilación (`debootstrap`, `xorriso`, `squashfs-tools`, `syslinux`, `grub`), ejecuta `scripts/build-lapdock-iso.sh`, genera las sumas de verificación `SHA256SUMS.txt` y publica automáticamente la imagen en la sección **Releases** de GitHub.

### 2. Configuraciones de Sistema y Servicios (`configs/`)
* **`configs/99-lapdock-devices.rules`**: Archivo de reglas `udev` que se instala en `/etc/udev/rules.d/`. Otorga permisos de lectura/escritura (`0666`) sin requerir `root` a los dispositivos USB de los principales fabricantes de móviles (Samsung, Google, Xiaomi, Motorola, etc.), a las interfaces de vídeo V4L2 y a los nodos de kernel `/dev/uhid` y `/dev/uinput` para la emulación nativa de ratón y teclado por hardware.
* **`configs/lapdock-kiosk.service`**: Archivo de servicio systemd que se instala en `/etc/systemd/system/`. Inicia automáticamente en TTY1 el compositor Wayland `cage -s -- /usr/local/bin/kiosk-manager.py` bajo el usuario sin privilegios `lapdock`, preparando el entorno Wayland (`XDG_RUNTIME_DIR=/run/user/1000`, `LIBSEAT_BACKEND=seatd`, `MOZ_ENABLE_WAYLAND=1`).
* **`configs/lapdock-update.conf`**: Archivo de configuración en `/etc/lapdock/update.conf` que indica qué repositorio y rama de GitHub debe seguir el auto-actualizador (por defecto `cminewarIA/Dex-mode-`, rama `main`).
* **`configs/lapdock-updater.service`**: Servicio systemd de tipo `oneshot` que ejecuta `/usr/local/bin/lapdock-updater.sh` cuando es invocado por el temporizador o de forma manual.
* **`configs/lapdock-updater.timer`**: Temporizador de systemd que activa `lapdock-updater.service` a los 60 segundos del arranque y periódicamente cada 10 minutos.

### 3. Scripts Operativos del Sistema (`scripts/`)
* **`scripts/build-lapdock-iso.sh`**: El script central de compilación de la distribución. Descarga Debian 12 (Bookworm) con `debootstrap`, instala el kernel Linux 6.1, configura el usuario `lapdock`, instala los paquetes esenciales (`cage`, `seatd`, `pipewire`, `scrcpy`, `python3-tk`, `wlr-randr`), compila `scrcpy` 3.1 nativamente para evitar incompatibilidades de glibc, empaqueta el sistema de archivos en SquashFS y genera la ISO híbrida compatible con BIOS Legacy, UEFI y Ventoy.
* **`scripts/kiosk-manager.py`**: El demonio y UI principal de Lapdock OS. Se ejecuta en pantalla completa dentro de Cage. Incluye:
  - **`auto_select_best_display()`**: Detecta monitores externos (`HDMI`, `DP`, etc.) y apaga la pantalla integrada del portátil (`eDP`, `LVDS`) para garantizar una proyección única al 100%.
  - **`poll_devices_worker()`**: Hilo que comprueba cada 2 segundos conexiones USB ADB y terminales inalámbricos en red local.
  - **`launch_scrcpy()`**: Invoca Scrcpy con paso de ratón y teclado nativos UHID por hardware, resolución detectada y aceleración gráfica directa.
  - **`enable_wireless_adb()`**: Pasa la conexión de cable a Wi-Fi (puerto 5555) para poder desenchufar el cable y continuar la sesión inalámbricamente.
  - **Atajos de teclado**: `Esc` (volver al menú), `F1` (reiniciar ADB), `F5` (refrescar), `F7` (reconfigurar pantalla).
* **`scripts/lapdock-updater.sh`**: Script en bash que se conecta de manera segura a la API/raw de GitHub, descarga las últimas versiones de los scripts, comprueba su sintaxis (`bash -n` y `py_compile`), verifica los hashes SHA256 y reemplaza los archivos en vivo sin interrumpir sesiones activas.

### 4. Interfaz Web y Simulador Complementario (`src/`)
* **`src/App.tsx`**: Aplicación web interactiva que permite a los usuarios previsualizar el comportamiento de Lapdock OS, simular conexiones de diferentes dispositivos y descargar los scripts.
* **`src/components/ArchitectureDocs.tsx`**: Panel interactivo que expone la arquitectura técnica, el mapa de llamadas y la documentación del sistema (flujo DeX por cable y Wi-Fi inalámbrico).
* **`src/components/DeviceSimulator.tsx`**: Panel de control con botones interactivos para simular enchufar y desenchufar terminales (Samsung DeX USB, Wi-Fi 5 GHz, Pixel/Android y Ubuntu Touch).
* **`src/components/DexDesktop.tsx`**: Emulación visual en React del entorno de escritorio Samsung DeX con ventana interactiva de navegador y terminal.
* **`src/components/IsoBuilderPanel.tsx`**: Visor de código fuente que permite inspeccionar, copiar y descargar cualquiera de los scripts y configuraciones del sistema.
* **`src/components/KioskScreen.tsx`**: Renderiza la pantalla de radar en espera con efectos visuales, reloj en tiempo real, logs de hardware y simulador inalámbrico.
* **`src/components/Lapdock.tsx`**: Marco gráfico que emula físicamente la carcasa, pantalla y teclado de un ordenador portátil con selector de modos.
* **`src/components/UbuntuTouchHome.tsx`**: Emulación de la interfaz móvil Lomiri de Ubuntu Touch.
* **`src/data/deviceProfiles.ts`**: Fichero de datos con las características técnicas, códecs y resoluciones de los dispositivos compatibles.
* **`src/data/isoScripts.ts`**: Repositorio centralizado en TypeScript de todos los scripts y ficheros de configuración para visualización web.
* **`src/types.ts`**: Definición de interfaces TypeScript para el estado de la conexión, modos de proyección y perfiles.
* **`src/main.tsx`** e **`src/index.css`**: Punto de entrada de React e inicialización de Tailwind CSS.

### 5. Archivos de Configuración Raíz
* **`index.html`**: Documento HTML que aloja la interfaz de demostración web con etiquetas Open Graph y metadatos sincronizados.
* **`metadata.json`**: Metadatos de la aplicación web requeridos por el entorno de desarrollo.
* **`package.json`**: Lista de dependencias JavaScript/TypeScript (React, Lucide icons, Tailwind CSS, Vite) y comandos de compilación.
* **`tsconfig.json`**: Configuración de TypeScript con soporte para JSX y rutas de alias (`@/*`).
* **`vite.config.ts`**: Configuración de Vite con plugin oficial de Tailwind CSS y alias de directorios.
* **`.env.example`**: Plantilla de variables de entorno del proyecto.
* **`.gitignore`**: Exclusiones de control de versiones para dependencias, salidas de compilación e imágenes ISO.

---

## ⌨️ Atajos de Teclado y Diagnóstico del Sistema

* **`Esc`**: Cierra la proyección activa y regresa al Dashboard de Lapdock OS.
* **`F1`**: Reinicia el servicio de detección ADB si el teléfono no es detectado.
* **`F5`**: Refresca la detección de hardware y puertos USB.
* **`F7`**: Fuerza la sincronización de pantalla única (apaga pantalla interna del portátil y centra el monitor externo).
* **`Ctrl` + `Alt` + `F2`**: Abre la **terminal de emergencia TTY2**:
  * **Usuario**: `lapdock`
  * **Contraseña**: *(vacía / pulsa Enter directamente)*
  * **Comandos útiles de diagnóstico**:
    ```bash
    # Ver pantallas activas y resoluciones
    WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000 wlr-randr

    # Forzar apagado de la pantalla del portátil si quedó extendida
    WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000 wlr-randr --output eDP-1 --off

    # Ver dispositivos USB conectados
    lsusb
    
    # Comprobar si el móvil está reconocido por ADB
    adb devices -l
    
    # Comprobar conectividad de red local y ADB inalámbrico
    ip a && adb connect <IP_DEL_MOVIL>:5555
    
    # Ver estado del servicio Kiosk
    systemctl status lapdock-kiosk.service

    # Ejecutar actualización inmediata desde GitHub
    sudo /usr/local/bin/lapdock-updater.sh
    ```
* **`Ctrl` + `Alt` + `F1`**: Regresa a la interfaz gráfica principal de Lapdock OS (TTY1).

---

## 🔄 Auto-Actualización Silenciosa desde GitHub

Lapdock OS incluye un servicio en segundo plano que **escanea, descarga y aplica automáticamente las novedades del repositorio de GitHub** sin requerir ninguna acción por parte del usuario ni mostrar avisos molestos:

1. **Comprobación periódica no invasiva:** Cada 10 minutos (y a los 60 segundos tras arrancar), el temporizador `lapdock-updater.timer` verifica si hay conexión a Internet y consulta las novedades en GitHub.
2. **Archivos gestionados:**
   * `/usr/local/bin/kiosk-manager.py` (Orquestador gráfico y detector de hardware).
   * `/usr/local/bin/lapdock-updater.sh` (Script del actualizador).
   * `/etc/systemd/system/lapdock-kiosk.service` (Servicio de arranque).
   * `/etc/udev/rules.d/99-lapdock-devices.rules` (Reglas udev).
3. **Verificación de seguridad:** Valida sintaxis con `py_compile` y `bash -n`, comprueba hashes SHA256 y nunca sobreescribe si el archivo descargado está dañado o incompleto.
4. **Protección de sesiones de trabajo:** Si estás usando DeX o proyectando Android de manera inalámbrica o por cable, pospone cualquier reinicio hasta que la pantalla regrese al estado de espera.

---

## 📄 Licencia

Software libre y abierto publicado bajo la licencia **GNU General Public License v3.0 (GPLv3)**.
