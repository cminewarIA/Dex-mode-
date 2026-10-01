# Lapdock OS

> **Convierte cualquier ordenador portátil o de sobremesa en una estación de trabajo Lapdock ultrarrápida, dedicada y universal para Samsung DeX, Android y Miracast.**

[![Compilación Automática de ISO](https://github.com/cminewarIA/Dex-mode-/actions/workflows/build-iso.yml/badge.svg)](../../actions/workflows/build-iso.yml)
[![Ventoy Ready](https://img.shields.io/badge/Ventoy-100%25%20Compatible-0078D7.svg)](https://www.ventoy.net/)
[![Base Debian 12](https://img.shields.io/badge/Base-Debian%2012%20Bookworm-A80030.svg)](https://www.debian.org/)
[![Wayland Cage](https://img.shields.io/badge/Compositor-Wayland%20Cage-orange.svg)](https://github.com/cage-kiosk/cage)
[![Seguridad TLS](https://img.shields.io/badge/Telemetr%C3%ADa-TLS%20Cifrada-success.svg)](#-proyecto-comunitario-transparencia-y-telemetr%C3%ADa-%C3%A9tica)
[![Licencia](https://img.shields.io/badge/Licencia-GPLv3-green.svg)](LICENSE)

---

## ⚡ Descarga Rápida (Ventoy & USB)

No necesitas compilar nada en tu ordenador ni configurar complejas herramientas de Linux. **GitHub Actions compila la imagen ISO completa automáticamente en cada versión y la publica lista para arrancar.**

### 📥 Descargar ISO Oficial Lista para Usar
1. Dirígete a la sección **[Releases](../../releases)** de este repositorio.
2. Descarga los archivos de la versión más reciente:
   * 💿 **`Lapdock-OS-x86_64.iso`** (Imagen híbrida autoarrancable en BIOS Legacy y UEFI moderna).
   * 🔑 **`SHA256SUMS.txt`** (Suma de verificación criptográfica de integridad).
3. **Copia el archivo `.iso` directamente a tu memoria USB con [Ventoy](https://www.ventoy.net/)**, ¡y listo para arrancar!

---

## 📋 ¿Qué es Lapdock OS?

**Lapdock OS** es una distribución de Linux minimalista de tipo Live/Kiosk diseñada con un único objetivo: **transformar ordenadores portátiles o de sobremesa (tanto antiguos como de última generación) en terminales de proyección inmediata para smartphones y dispositivos móviles.**

En lugar de desechar portátiles antiguos o utilizarlos con sistemas operativos pesados que consumen recursos, Lapdock OS les da una segunda vida como estaciones de productividad de alto rendimiento:

* ⚡ **Ejecución 100% en Memoria RAM (`toram`)**: El sistema operativo se carga íntegramente en la memoria RAM al encender el equipo. El disco duro interno no se toca ni se modifica en ningún momento. Puedes retirar el pendrive USB tras el arranque si lo deseas.
* 🚀 **Cero Procesos Innecesarios**: Sin entornos de escritorio pesados (sin GNOME, KDE ni Windows). Toda la potencia de la CPU, la tarjeta gráfica y la batería se dedican en exclusiva a renderizar la pantalla de tu móvil a 60 FPS con latencia cero.
* 🪟 **Compositor Wayland Cage Ultraligero**: Utiliza `cage` sobre `wlroots`, ofreciendo aceleración de hardware fluida, compatibilidad directa con pantallas táctiles, teclados y trackpads por hardware nativo (UHID).
* 🖥️ **Gestión Inteligente de Monitores y Salidas de Vídeo**:
  - Si usas el portátil como unidad central y le conectas un monitor externo (HDMI o DisplayPort), Lapdock OS **apaga automáticamente la pantalla interna del portátil y proyecta a pantalla completa única en el monitor externo**, evitando escritorios duplicados o divididos.
  - Al desenchufar el cable del monitor, la pantalla del portátil vuelve a encenderse al instante.
  - En ordenadores de sobremesa o máquinas virtuales, adapta la resolución dinámicamente sin fallos.
* 📶 **Controladores Wi-Fi y Gráficos Universales**: Incluye soporte integrado para adaptadores Wi-Fi Intel, Realtek, Atheros y Broadcom, así como gráficos Intel HD/Iris, AMD Radeon y controladores genéricos VESA/KMS.
* ⏱️ **Auto-Arranque Inteligente**: Compatible con PXE por red local y Ventoy con temporizador de selección de 5 segundos.

---

## 🎯 Modos de Conexión y Dispositivos Compatibles

Lapdock OS admite múltiples formas de conexión para adaptarse a cualquier situación:

```
                  ┌─────────────────────────────────────────┐
                  │               LAPDOCK OS                │
                  │   (Wayland Cage + Scrcpy + Miracast)    │
                  └────────────────────┬────────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
┌──────────────────┐         ┌───────────────────┐         ┌──────────────────┐
│   CABLE USB      │         │   WI-FI (TCP/IP)  │         │     MIRACAST     │
│  Samsung DeX /   │         │  ADB Inalámbrico  │         │   Smart View /   │
│  Android Desktop │         │  a 60 FPS estables│         │   Windows Cast   │
└──────────────────┘         └───────────────────┘         └──────────────────┘
```

### 1. 📱 Samsung Galaxy (Modo Samsung DeX por Cable USB)
Conecta tu Samsung Galaxy compatible con DeX (gamas Galaxy S, Note, Z Fold o Tab S) mediante un cable USB-C:
1. En tu teléfono Samsung, asegúrate de activar la **Depuración USB** en *Ajustes > Opciones de desarrollador > Depuración USB*.
2. Conecta el teléfono al puerto USB del ordenador.
3. Desbloquea el teléfono y marca la casilla **"Permitir siempre desde este equipo"** en el diálogo de confirmación.
4. Lapdock OS detectará el teléfono al instante y abrirá el escritorio **Samsung DeX** a pantalla completa con soporte de teclado, ratón, audio por altavoces y recarga de batería.

### 2. 📲 Móviles Android Universales (Xiaomi, Google Pixel, Motorola, OnePlus, etc.)
Cualquier dispositivo Android puede proyectar su pantalla o activar el modo de escritorio nativo de Android:
1. Conecta el teléfono por USB con la Depuración USB habilitada.
2. Lapdock OS levantará la sesión interactiva con paso de ratón y teclado directo por hardware UHID.

### 3. 📶 Proyección Inalámbrica Wi-Fi (ADB TCP/IP)
¿Quieres trabajar sin cables?
1. Conecta el móvil por cable USB durante 3 segundos para emparejarlo.
2. Lapdock OS conmuta automáticamente la sesión a TCP/IP en el puerto `5555` a través de tu red Wi-Fi local.
3. Desconecta el cable USB: la sesión continúa fluida por Wi-Fi a 60 FPS.

### 4. 📡 Proyección Miracast y Red Local (Smart View / Windows Cast / MICE)
Lapdock OS integra un receptor Miracast sobre infraestructura (MICE) y Wi-Fi Display:
1. Asegúrate de que el ordenador con Lapdock OS y tu dispositivo emisor estén en la misma red Wi-Fi.
2. En tu móvil o PC abre el menú de proyección:
   - **Samsung**: Pulsa en el icono de ajustes rápidos **"Smart View"** o **"DeX inalámbrico"**.
   - **Windows 10/11**: Pulsa las teclas **`Windows + K`**.
   - **Otros móviles Android**: Abre **"Transmitir pantalla"** / **"Cast"**.
3. Selecciona **"Lapdock OS (Miracast)"** en la lista de pantallas disponibles.
4. La imagen y el sonido se transmitirán en tiempo real con latencia imperceptible.

---

## 🛡️ Proyecto Comunitario, Transparencia y Telemetría Ética

Uno de los mayores retos en los sistemas operativos libres es lograr que funcionen **a la primera en miles de modelos de ordenadores diferentes**: portátiles con BIOS dispares, chips gráficos de diversas generaciones (Intel, AMD, Nvidia), tarjetas de sonido con diferentes códecs y controladores de pantalla DRM heterogéneos.

Para resolver esto y hacer que Lapdock OS sea verdaderamente universal, el sistema incorpora un **servicio centinela de telemetría y diagnóstico técnico comunitario**.

> [!IMPORTANT]
> **NUESTRO COMPROMISO DE PRIVACIDAD ES TOTAL Y ABSOLUTO**:
> Lapdock OS no es una empresa comercial. Este es un proyecto de código abierto desarrollado para la comunidad. La telemetría existe con un único propósito técnico: **detectar incompatibilidades de drivers y pantallas para que podamos corregirlas y mejorar el soporte de hardware para todos.**

### 📊 ¿Qué información técnica se recopila?
El agente de diagnóstico solo lee los datos indispensables para saber si el hardware del PC es compatible con la proyección:
* **Ficha de compatibilidad básica**:
  - Modelo del procesador (CPU) y cantidad de memoria RAM.
  - Modelo de tarjeta gráfica (GPU) y controlador de vídeo en uso.
  - Salidas de pantalla físicas detectadas (HDMI, DisplayPort, eDP interna) y sus resoluciones reportadas por el kernel DRM.
  - Fabricante y modelo de la placa base / BIOS (ej. *Dell Latitude E7470*, *Lenovo ThinkPad T480*).
  - Interfaces de red presentes (solo el nombre de la interfaz, ej. `wlp1s0` o `enp0s31f6`).
* **Registros de eventos de diagnóstico (Logs de sistema)**:
  - Códigos de salida del compositor gráfico Cage.
  - Reconocimiento de periféricos USB de smartphones (ej. *Samsung Electronics Co.*).
  - Eventos de inicio/cierre de la sesión de proyección Scrcpy o Miracast para detectar cierres inesperados.

---

### 🚫 ¿Qué información NUNCA se recopila ni se transmitirá jamás?
Garantizamos por diseño y a nivel de código abierto que:
* ❌ **CERO datos personales**: Ni nombres, ni correos, ni cuentas, ni identificadores de usuario.
* ❌ **CERO archivos o documentos**: El sistema nunca escanea discos duros ni lee archivos locales.
* ❌ **CERO pulsaciones de teclado o ratón**: El sistema de telemetría no tiene acceso a las entradas del usuario. Las contraseñas, mensajes o textos que escribas jamás son registrados.
* ❌ **CERO datos provenientes del teléfono móvil**: No se accede a tus fotos, contactos, mensajes de WhatsApp, historial de navegación ni archivos del móvil.
* ❌ **Anonimización criptográfica irreversible (SHA-256)**:
  - Las direcciones físicas MAC de red y los identificadores únicos de hardware se convierten localmente en un hash SHA-256 anónimo (por ejemplo: `DellInc_Latitude_E7470_e92476c06500`).
  - **La dirección MAC real nunca se transmite ni se almacena en el servidor.**

---

### 🔐 Cifrado de Extremo a Extremo mediante DNS y TLS/SSL
Para evitar que intermediarios o redes Wi-Fi públicas puedan interceptar o alterar los reportes de diagnóstico:
1. **Resolución DNS Segura**: El cliente se conecta al dominio oficial de telemetría comunitaria (`telemetry.lapdock.net`) o al servidor configurado por el usuario.
2. **Cifrado TLS 1.2 / 1.3**: Todo el canal de transmisión viaja encapsulado dentro de una conexión cifrada de extremo a extremo con TLS/SSL (puerto TCP `8998`), exactamente con el mismo nivel de seguridad que la banca online o las conexiones HTTPS.

---

### ⚙️ Transparencia Total y Cómo Desactivar la Telemetría (Opt-Out)
Creemos firmemente en el derecho de cada usuario a decidir. Si prefieres no enviar información técnica de diagnóstico, puedes desactivar la telemetría en cualquier momento con un solo paso:

#### Opción 1: Al arrancar (Recomendado para sesiones Live / USB)
En el menú de arranque de Lapdock OS (iPXE o GRUB), pulsa la tecla **`e`** o **`Tab`** para editar los parámetros del kernel y añade al final:
```text
notelemetry
```
*(O también: `lapdock.telemetry=0`)*. El cliente detectará el parámetro en `/proc/cmdline`, se apagará de inmediato y no emitirá ninguna conexión de red.

#### Opción 2: Desde el archivo de configuración
Si has personalizado tu imagen o accedes a la consola del sistema, edita el archivo `/etc/lapdock/telemetry.conf`:
```ini
# Desactivar telemetría
ENABLED=false
```

#### Opción 3: Apagar el servicio systemd
En la consola de terminal:
```bash
sudo systemctl stop lapdock-telemetry.service
sudo systemctl disable lapdock-telemetry.service
```

> 💡 **Auditoría de Código**:
> Puedes inspeccionar libremente el código completo del cliente en [`scripts/lapdock-telemetry-client.py`](scripts/lapdock-telemetry-client.py) para comprobar que cumple estrictamente estas directrices.

---

## ⌨️ Atajos de Teclado y Diagnóstico del Sistema

* **`Esc`**: Cierra la sesión de proyección activa y regresa a la pantalla de espera de Lapdock OS.
* **`F1`**: Reinicia el subsistema ADB si un teléfono USB no responde.
* **`F5`**: Fuerza un reescaneo de puertos USB y periféricos conectados.
* **`F7`**: Reconfigura y centra las pantallas activas (apaga la pantalla interna y maximiza en monitor HDMI/DisplayPort).
* **`Ctrl` + `Alt` + `F2`**: Abre la consola de terminal de emergencia TTY2:
  * **Usuario predeterminado**: `lapdock`
  * **Contraseña**: *(vacía / pulsa Enter directamente)*
  * **Comandos útiles**:
    ```bash
    # Comprobar pantallas conectadas y resoluciones
    WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000 wlr-randr

    # Comprobar si el móvil está conectado por USB
    adb devices -l

    # Comprobar el estado del servicio de telemetría y diagnósticos
    systemctl status lapdock-telemetry.service

    # Comprobar conexiones de red
    ip a
    ```
* **`Ctrl` + `Alt` + `F1`**: Regresa a la interfaz gráfica principal de Lapdock OS.

---

## 🔄 Auto-Actualización Silenciosa desde GitHub

Lapdock OS incluye un servicio en segundo plano que **comprueba periódicamente si hay mejoras de controladores o compatibilidad en este repositorio de GitHub**:
1. **Comprobación no intrusiva**: Cada 10 minutos (y a los 60 segundos del arranque), el temporizador `lapdock-updater.timer` verifica si hay conexión a Internet y consulta las actualizaciones del proyecto.
2. **Seguridad y Validación**: Comprueba la integridad mediante sumas criptográficas SHA256 y verifica la sintaxis del código antes de aplicarlo.
3. **Respeto a las sesiones activas**: Si estás en mitad de una proyección de DeX o Android, el actualizador nunca interrumpirá tu trabajo ni reiniciará la pantalla hasta que hayas finalizado tu sesión.

---

## 📁 Estructura del Repositorio

```
├── .github/
│   └── workflows/
│       └── build-iso.yml               # Flujo CI/CD que genera automáticamente la ISO en GitHub
├── configs/
│   ├── 99-lapdock-devices.rules        # Reglas udev para dispositivos USB Android, V4L2 y UHID
│   ├── 99-lapdock-ssh.conf             # Configuración SSH para diagnóstico remoto
│   ├── boot.ipxe                       # Menú de arranque iPXE con temporizador de 5 segundos
│   ├── lapdock-kiosk.service           # Servicio systemd de inicio del compositor Wayland Cage
│   ├── lapdock-miracast.service        # Servicio systemd del receptor de pantalla inalámbrica
│   ├── lapdock-telemetry-server.service# Servicio systemd para el servidor central de logs
│   ├── lapdock-telemetry.service       # Servicio del cliente centinela de telemetría ética
│   ├── lapdock-update.conf             # Repositorio y rama de GitHub para actualizaciones
│   ├── lapdock-updater.service         # Servicio systemd de auto-actualización
│   ├── lapdock-updater.timer           # Temporizador periódico de actualización
│   ├── miracast.service                # Servicio Avahi mDNS (_display._tcp) para Miracast
│   └── telemetry.conf                  # Archivo de configuración (/etc/lapdock/telemetry.conf)
├── scripts/
│   ├── build-lapdock-iso.sh            # Script maestro de compilación de la imagen ISO Debian 12
│   ├── kiosk-manager.py                # Demonio principal: interfaz de radar y orquestador DeX
│   ├── lapdock-display-setup.sh        # Gestor inteligente de salidas de vídeo (portátil vs monitor)
│   ├── lapdock-miracast-sink.py        # Receptor de vídeo y audio Miracast / Wi-Fi Display
│   ├── lapdock-telemetry-client.py     # Cliente centinela de telemetría y diagnóstico con TLS
│   ├── lapdock-telemetry-server.py     # Servidor central receptor de telemetría con TLS
│   └── lapdock-updater.sh              # Script en bash de actualización silenciosa desde GitHub
├── src/                                # Interfaz web complementaria y simulador en React + Tailwind
└── README.md                           # Documentación técnica completa y manual de usuario
```

---

## 🛠️ Cómo Compilar Tu Propia ISO Localmente

Si deseas realizar modificaciones personalizadas y compilar la ISO en tu propio equipo Linux (requiere Debian/Ubuntu y privilegios `sudo`):

```bash
# 1. Clonar el repositorio
git clone https://github.com/cminewarIA/Dex-mode-.git
cd Dex-mode-

# 2. Instalar herramientas de compilación
sudo apt-get update
sudo apt-get install -y debootstrap squashfs-tools xorriso isolinux syslinux-efi \
    grub-pc-bin grub-efi-amd64-bin mtools dosfstools zstd

# 3. Ejecutar el script de compilación
sudo bash scripts/build-lapdock-iso.sh
```

La imagen final se generará en el directorio `output/Lapdock-OS-x86_64.iso`, lista para copiar a cualquier pendrive con Ventoy o arrancar por PXE.

---

## 📄 Licencia

Este proyecto es software libre y de código abierto publicado bajo la licencia **GNU General Public License v3.0 (GPLv3)**. Eres libre de usarlo, estudiarlo, modificarlo y redistribuirlo respetando las condiciones de la licencia.
