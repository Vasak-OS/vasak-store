# Lo que se instala fuera del binario

| Archivo | Dónde va | Para qué |
|---|---|---|
| `ar.net.vasak.os.Store.conf` | `/usr/share/dbus-1/system.d/` | quién puede hablarle al servicio |
| `ar.net.vasak.os.Store.service` | `/usr/share/dbus-1/system-services/` | lo levanta D-Bus cuando hace falta |
| `ar.net.vasak.os.store.policy` | `/usr/share/polkit-1/actions/` | las dos acciones que piden autenticación |
| `vasak-store-daemon.service` | `/usr/lib/systemd/system/` | la unidad que D-Bus activa |
| `vasak-store.desktop` | `/usr/share/applications/` | la entrada del menú |

El `.desktop` se instala a mano y no se usa el que genera Tauri: ése toma el
nombre del producto —`vasak-store`— y lo pone como `Name`, así que el menú
mostraba el nombre del paquete en lugar del de la aplicación, sin traducir y sin
categoría.
