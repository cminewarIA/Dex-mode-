# Lapdock OS

> **Sistema operativo Kiosk minimalista para convertir cualquier ordenador portátil o PC en un Lapdock de proyección instantánea compatible con Ventoy.**

[![Build Lapdock OS ISO (Ventoy Ready)](https://github.com/actions/workflows/build-iso.yml/badge.svg)](../../actions/workflows/build-iso.yml)
[![Ventoy Compatible](https://img.shields.io/badge/Ventoy-100%25%20Compatible-blue.svg)](https://www.ventoy.net/)
[![Licencia](https://img.shields.io/badge/Licencia-GPLv3-green.svg)](LICENSE)

---

## ⚡ Descarga Rápida: GitHub Compila la ISO Automáticamente

No necesitas compilar nada en tu propio ordenador. **GitHub Actions se encarga de compilar la imagen ISO completa automáticamente y empaquetarla lista para arrancar en Ventoy.**

### Opción A: Descargar desde GitHub Releases (Recomendada)
1. Ve a la sección **[Releases](../../releases)** de este repositorio en GitHub.
2. Descarga los archivos de la última versión:
   * 💿 **`Lapdock-OS-x86_64.iso`** (Imagen híbrida lista para BIOS Legacy y UEFI)
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
> 1. Ve a **Settings** (Configuración de tu repositorio en GitHub).
> 2. En el menú lateral izquierdo, haz clic en **Actions** > **General**.
> 3. Baja hasta la sección **Workflow permissions** y selecciona **"Read and write permissions"**.
> 4. Haz clic en **Save**. ¡Con esto, cada commit o ejecución manual creará el Release público automáticamente!

---

## 📋 ¿Qué es Lapdock OS?

**Lapdock OS** convierte cualquier portátil antiguo o moderno en un **Lapdock independiente**:
* **Sin entorno de escritorio pesado**: No hay menús innecesarios, navegadores de fondo ni bloatware que consuman batería o CPU.
* **100% en memoria RAM (`toram`)**: Se carga al encender en la memoria RAM del portátil, dejando libres los puertos y los discos duros.
* **Dashboard visual interactivo**: Al iniciar, muestra un panel de control con el estado de las conexiones en tiempo real.
* **Proyección instantánea**:
  - Al conectar un **Samsung Galaxy**, activa automáticamente **Samsung DeX** en pantalla completa a 60 FPS con teclado, ratón y altavoces.
  - Al conectar una **Nintendo Switch** o consola HDMI (mediante capturadora USB), reproduce el juego a 60 FPS con latencia inferior a 30 ms.
  - Al desconectar el cable, regresa al panel de espera de inmediato.

---

## 🎯 Dispositivos Compatibles y Cómo Conectarlos

### 1. 📱 Samsung Galaxy (Samsung DeX) y Móviles Android
| Conexión | Cable USB normal (USB-C a USB-C o USB-A) |
| :--- | :--- |
| **Motor** | `scrcpy` (Códec H.265 / H.264 con emulación de hardware UHID) |
| **Pasos** | 1. En el móvil, activa la **Depuración USB** (Ajustes > Opciones de desarrollador > Depuración USB).<br>2. Enchufa el cable USB al portátil.<br>3. **IMPORTANTE:** Desbloquea la pantalla del móvil. Aparecerá una ventana emergente: *«¿Permitir depuración USB desde este equipo?»*. Marca la casilla **"Permitir siempre"** y pulsa **Aceptar**.<br>4. Lapdock OS detectará el teléfono y lanzará DeX a pantalla completa automáticamente. |

### 2. 🎮 Nintendo Switch y Consolas HDMI (PS5, Xbox, Steam Deck)
| Conexión | Dock / Adaptador HDMI ➔ Capturadora HDMI a USB (UVC) |
| :--- | :--- |
| **Motor** | `mpv` (Perfil de ultra-baja latencia V4L2) |
| **Aclaración técnica** | **Los puertos HDMI y USB-C de un portátil son salidas de vídeo (OUTPUT), no entradas.** Por tanto, no se puede proyectar una consola conectando un cable HDMI o USB directo al portátil.<br>Para proyectar la Switch:<br>1. Coloca la consola en su **Dock** o en un dongle USB-C con salida HDMI.<br>2. Conecta el cable HDMI a una **capturadora HDMI USB** (las capturadoras compactas UVC estándar de 8-10€).<br>3. Conecta la capturadora al USB del portátil. Lapdock OS la reconocerá al instante y abrirá la imagen a 60 FPS sin retraso. |

---

## 🚀 Guía de Uso con Ventoy

### 1. Preparar la memoria USB
1. Instala Ventoy en tu memoria USB desde **[ventoy.net](https://www.ventoy.net/)**.
2. Copia el archivo **`Lapdock-OS-x86_64.iso`** dentro de la memoria USB.

### 2. Arrancar en el Portátil
1. Conecta la memoria USB al portátil y enciéndelo pulsando la tecla de selección de arranque (`F12`, `F11`, `F9` o `Esc` según la marca).
2. En el menú de Ventoy, selecciona **`Lapdock-OS-x86_64.iso`**.
3. Elige la opción recomendada:
   * **Modo RAM (toram - Recomendado)**: Copia el sistema a la memoria RAM (tarda 1-2 min según la velocidad del USB). Una vez cargado, puedes incluso retirar el pendrive.
   * **Modo Directo**: Inicia en menos de 15 segundos leyendo directamente desde el USB.

---

## ⌨️ Atajos de Teclado y Diagnóstico del Sistema

* **`Esc`**: Cierra la proyección activa y regresa al Dashboard de Lapdock OS.
* **`F1`**: Reinicia el servicio de detección ADB si el teléfono no es detectado.
* **`Ctrl` + `Alt` + `F2`**: Abre la **terminal de emergencia TTY2**:
  * **Usuario**: `lapdock`
  * **Contraseña**: *(vacía / pulsa Enter directamente)*
  * **Comandos útiles de diagnóstico**:
    ```bash
    # Ver dispositivos USB conectados
    lsusb
    
    # Comprobar si el móvil está reconocido por ADB
    adb devices -l
    
    # Probar proyección manualmente
    scrcpy
    
    # Comprobar capturadora de vídeo HDMI
    ls -l /dev/video*
    
    # Ver estado del servicio Kiosk
    systemctl status lapdock-kiosk.service
    ```
* **`Ctrl` + `Alt` + `F1`**: Regresa a la interfaz gráfica principal (TTY1).

---

## 🔧 Resolución de Problemas y Diagnósticos Comunes

### 1. `Socket file found at socket path /run/seatd.sock, refusing to start`
* **Causa exacta**: El servicio systemd `seatd.service` ya está activo en segundo plano y ha creado el socket del sistema `/run/seatd.sock`. Si el orquestador o un script invoca `seatd-launch`, este intenta arrancar una segunda instancia privada de `seatd`, la cual detecta que el socket ya existe y rechaza iniciar, provocando un bucle de reinicios.
* **Solución permanente**: `seatd-launch` solo debe usarse si `seatd.service` no estuviera corriendo. Con `seatd.service` activo y el usuario en el grupo `seat`, `cage` se ejecuta directamente (`cage -s -- ...`) y conecta a `/run/seatd.sock` a través de `libseat`.
* **Arreglo inmediato en tu portátil sin recompilar la ISO (desde TTY2):**
  Pulsa `Ctrl` + `Alt` + `F2`, inicia sesión como `lapdock` y escribe:
  ```bash
  # Corregir el servicio y arrancar la interfaz
  sudo sed -i 's|/usr/bin/seatd-launch -- ||g' /etc/systemd/system/lapdock-kiosk.service
  sudo systemctl daemon-reload
  sudo systemctl restart lapdock-kiosk.service
  ```
  Vuelve a la interfaz gráfica con **`Ctrl` + `Alt` + `F1`** ¡y el dashboard aparecerá en pantalla!

### 2. `cage: Could not activate session: Permission denied` / `Could not open target tty`
* **Causa**: Al ejecutarse Cage como un servicio systemd bajo el usuario `lapdock`, `systemd-logind` rechaza la activación de la sesión gráfica al no considerarla una sesión de usuario interactiva tradicional, provocando que el backend de wlroots no pueda adquirir el control del hardware gráfico (DRM/KMS) ni de la TTY.
* **Solución**: Se integra **`seatd`** y **`seatd-launch`** con permisos SUID y membresía en el grupo `seat`. `seatd-launch` crea una sesión de asiento aislada con privilegios para inicializar la VT y los nodos DRM `/dev/dri/card*` y cede limpiamente el control al usuario `lapdock`, permitiendo que Cage y Wayland arranquen de forma instantánea sin requerir login manual ni bloqueos de Polkit.

### 2. `scrcpy` detecta el móvil pero no muestra interfaz gráfica (ejecutado desde consola TTY2)
* **Causa**: Una terminal virtual TTY (como TTY2) es una consola de texto puro sin servidor de ventanas ni compositor Wayland activo (`WAYLAND_DISPLAY` y `DISPLAY` están vacíos). Aunque `scrcpy` decodifique el stream de vídeo por hardware en OpenGL (`INFO: Texture: 1080x2336`), la ventana no tiene un compositor gráfico donde proyectarse.
* **Solución implementada**: 
  1. Se ha incorporado un **Wrapper Inteligente** en `/usr/local/bin/scrcpy`: al escribir `scrcpy` en una TTY sin entorno gráfico, detecta la ausencia de display e invoca automáticamente **`seatd-launch -- cage -s -- /usr/local/bin/scrcpy.bin "$@"`**, abriendo la sesión gráfica en pantalla completa de inmediato.
  2. Si deseas regresar a la interfaz gráfica principal con el dashboard y la detección automática, pulsa **`Ctrl` + `Alt` + `F1`**.
  3. Para lanzar manualmente el Kiosk completo desde la terminal:
     ```bash
     seatd-launch -- cage -s -- /usr/local/bin/kiosk-manager.py
     ```

### 3. `scrcpy: GLIBC_2.38 not found`
* **Causa**: El binario precompilado de GitHub dependía de glibc 2.38 (Ubuntu 24.04), incompatible con Debian 12 (glibc 2.36).
* **Solución**: En el script de compilación de la ISO, `scrcpy` v3.1 se compila nativamente con `meson` y `ninja` en el propio entorno Debian 12 Bookworm, garantizando 100% de compatibilidad binaria.

### 4. El móvil no aparece en `lsusb`
* Si al ejecutar `lsusb` en TTY2 no ves una línea con el fabricante de tu móvil (Samsung, Google, Xiaomi, etc.):
  1. **Cable USB**: Muchos cables USB comerciales son de "solo carga" (solo tienen los 2 cables de alimentación y no los de datos D+/D-). Prueba con el cable oficial o un cable de datos contrastado.
  2. **Puerto USB**: Prueba en otro puerto USB del portátil (preferiblemente USB 3.0 / azul o USB-C).
  3. **Modo USB en el móvil**: Al conectar el cable, baja la barra de notificaciones del teléfono y en *Ajustes de USB*, selecciona *Transferir archivos / Android Auto* o *Controlar este dispositivo*.

### 5. El móvil aparece en `lsusb` pero `adb devices` dice `unauthorized`
* Desbloquea la pantalla del teléfono. Aparecerá una ventana emergente pidiendo autorizar la huella RSA de la clave del ordenador. Marca la casilla **"Permitir siempre desde este equipo"** y pulsa **Aceptar**.

---

## 📡 Modo Inalámbrico (Wi-Fi): Usar Samsung DeX Sin Cables

¿Es posible desconectar el cable USB una vez iniciada la conexión? **¡Sí, 100%!** ADB y Scrcpy permiten operar de forma completamente inalámbrica sobre TCP/IP:

### ¿Cómo funciona?
1. **Paso 1: Autorización inicial por cable USB (1 segundo)**
   * Conecta el móvil por cable USB al portátil y autoriza la depuración USB si te lo solicita.
2. **Paso 2: Transferir la conexión a Wi-Fi**
   * **Desde la interfaz gráfica:** En el dashboard de Lapdock OS, pulsa el botón **`📶 Activar Wi-Fi (Desconectar Cable)`**. El sistema configura automáticamente `adb tcpip 5555`, detecta la dirección IP del móvil en la red local y enlaza la sesión inalámbrica.
   * **O desde la terminal:**
     ```bash
     scrcpy --tcpip
     ```
     `scrcpy --tcpip` detecta automáticamente el teléfono por USB, consulta su IP, activa el puerto 5555 y se conecta a través de Wi-Fi de forma transparente.
3. **Paso 3: ¡Desconecta el cable USB!**
   * Una vez establecida la conexión inalámbrica, retira el cable USB: Samsung DeX o el mirroring de Android **seguirán proyectándose en pantalla completa a través de Wi-Fi** con teclado, ratón y sonido activos.

### 💡 Uso en Movilidad (Sin Router Wi-Fi Externo)
Si estás en la calle, en un tren o en un lugar sin router Wi-Fi común:
1. En tu Samsung Galaxy, activa **"Zona Wi-Fi" / "Punto de acceso móvil" (Mobile Hotspot)**.
2. Conecta el portátil a la red Wi-Fi emitida por tu móvil.
3. Conecta el cable USB unos segundos, pulsa **`Activar Wi-Fi`** (o ejecuta `scrcpy --tcpip`) y desconecta el cable.
4. ¡Disfruta de tu Lapdock portátil 100% libre de cables en cualquier parte!

---

## 🛠️ Compilación Local Manual (Opcional)

Si prefieres compilar la ISO tú mismo en tu propio equipo con Linux:

```bash
# Clonar repositorio
git clone https://github.com/tu-usuario/lapdock-os.git
cd lapdock-os

# Dar permisos de ejecución
chmod +x scripts/*.sh scripts/*.py

# Compilar imagen ISO (requiere sudo en Debian/Ubuntu)
sudo bash scripts/build-lapdock-iso.sh
```

El script creará automáticamente el archivo `output/Lapdock-OS-x86_64.iso`.

---

## 📐 Estructura del Proyecto

```
├── .github/
│   └── workflows/
│       └── build-iso.yml          # Flujo CI/CD que compila la ISO en GitHub
├── configs/
│   ├── 99-lapdock-devices.rules   # Reglas udev para dar acceso USB sin root
│   └── lapdock-kiosk.service      # Servicio systemd de inicio Wayland Cage
├── scripts/
│   ├── build-lapdock-iso.sh       # Script de construcción de la ISO Debian 12
│   └── kiosk-manager.py           # Dashboard visual interactivo y orquestador
├── src/                           # Interfaz web complementaria y visor de scripts
├── README.md                      # Documentación completa y manual de usuario
└── metadata.json                  # Metadatos del sistema
```

---

## 📄 Licencia

Software libre y abierto publicado bajo la licencia **GNU General Public License v3.0 (GPLv3)**.
