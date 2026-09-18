# vasak-store

La tienda de aplicaciones de VasakOS. Instala, saca y actualiza paquetes de
pacman, compila lo del AUR e integra AppImages.

## Cómo está partida, y por qué

Tres piezas, y el corte entre ellas es de privilegios:

```
src/          la ventana (Vue)
src-tauri/    la aplicación: lee, muestra, compila lo del AUR    → corre como vos
daemon/       el servicio: cambia paquetes, escribe pacman.conf  → corre como root
protocol/     el contrato entre los dos, y las validaciones
```

**Leer no necesita permiso.** Buscar, listar lo instalado y calcular qué se
puede actualizar son lecturas de `/var/lib/pacman`, que ya es legible por
cualquiera. Las hace la aplicación en su proceso, con `libalpm` directo. Eso
tiene dos consecuencias: la ventana contesta al instante, sin ida y vuelta por
el bus del sistema, y el proceso que corre como root **no atiende consultas**,
así que tiene bastante menos por donde entrarle.

**Cambiar sí.** Instalar, quitar, actualizar y tocar `/etc/pacman.conf` pasan por
el demonio, y cada operación la autoriza polkit. Son dos acciones distintas
—paquetes y repositorios— porque no son lo mismo: instalar es una decisión sobre
un programa, y agregar un repositorio es entregarle al sistema una fuente de
paquetes para siempre.

En los dos lados el handle de `libalpm` vive en un **hilo del sistema operativo
dedicado**. No es capricho: `alpm::Alpm` guarda punteros crudos y registra
funciones de retorno, así que no es `Send` y no puede vivir en una tarea
asíncrona, que es lo que zbus y Tauri necesitan.

## Las tres fuentes, y qué se confía de cada una

La distribución tiene una jerarquía explícita y la tienda la respeta:

| | Qué es | Qué hace la tienda |
|---|---|---|
| **pacman** | firmado y revisado | instala directo, con vista previa de lo que arrastra |
| **AUR** | recetas que sube cualquiera | **muestra el PKGBUILD antes**, compila como vos y le entrega el paquete al demonio |
| **AppImage** | un archivo que bajaste | lo integra en tu carpeta, donde lo alcanza el perfil de AppArmor |

Del AUR: no hay ayudante externo. La RPC da los metadatos, `makepkg` compila
—nunca como root— y el paquete construido se instala por el demonio, que es el
único que instala. El botón de instalar de una ficha del AUR **no instala**:
abre la receta. Marcar algo como inseguro y no dar manera de mirarlo es un
cartel.

De los AppImage: el `.desktop` se escribe con el nombre del archivo y un ícono
genérico, y no se saca del propio AppImage. Extraerlo con `--appimage-extract`
es ejecutarlo, y integrar un archivo recién bajado no puede significar correrlo.

## Lo que no hace, dicho de frente

- **No hay «más descargadas» ni «tendencias».** Ese dato no existe en la
  máquina: nadie lleva la cuenta de qué instala la gente. Descubrir muestra un
  sorteo diario y lo actualizado hace poco, y los títulos dicen exactamente eso.
- **Una operación en curso no se puede cancelar.** El candado de pacman admite
  un solo dueño y una transacción interrumpida a mitad de la escritura es
  justamente lo que rompe un sistema. Se puede no empezarla.
- **Las claves PGP nuevas no se importan solas.** Si una operación pide confiar
  en una clave desconocida, falla y lo dice. Importar una clave es ampliar para
  siempre en quién confía el sistema, y la función de retorno que recibe esa
  pregunta corre dentro de la transacción, en un hilo sin ventana con quien
  preguntarle. Se importa a mano, con `pacman-key`.
- **`core` y `extra` no se pueden apagar ni quitar desde acá.** Editando
  `/etc/pacman.conf` sí, que es adonde va quien de verdad quiere hacerlo. Lo que
  no puede pasar es que un clic en una lista deje la máquina sin actualizaciones
  de seguridad.
- **El catálogo cubre unas 1400 aplicaciones** sobre más de 15 000 paquetes. El
  resto son bibliotecas y herramientas de línea de comandos, que no es lo que
  alguien busca en una tienda. Descubrir muestra lo que tiene ficha; buscar
  encuentra todo.

## Dos cosas que descubrimos armando esto

**Los íconos del catálogo son JPEG XL.** Los 3843, ni uno en PNG, y WebKit no
dibuja ese formato: puestos tal cual en un `<img>` no se ve nada, y sin error.
Se decodifican con `jxl-oxide` —Rust puro— y se guardan como PNG en la caché.

**Las capturas son URL remotas.** Cargarlas desde la ventana pediría abrir la
política de contenido a `https://*`, que es justo lo que esa política está para
impedir, y de paso le contaría a cada servidor qué fichas se miran. Se bajan
desde Rust, con límite de tamaño y de tiempo, y se sirven desde el disco.

## Probarlo

```bash
bun install
bun run tauri dev
```

Sin el demonio instalado la ventana abre igual: busca, muestra y navega, y avisa
que no puede instalar. Para la mitad que cambia cosas hace falta el paquete, que
pone la política de D-Bus, la de polkit y la unidad de systemd.

Las pruebas:

```bash
cargo test --workspace
bun test
```
