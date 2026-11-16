//! El hilo que habla con libalpm.
//!
//! Vive aparte del servicio de D-Bus por una razón que no es de gusto:
//! `alpm::Alpm` no es `Send`. Guarda punteros crudos y registra funciones de
//! retorno que la biblioteca llama desde dentro, así que no se lo puede mover
//! entre hilos ni tener en un futuro de tokio —que es exactamente lo que zbus
//! necesita—. La forma de tenerlo es un hilo del sistema operativo dedicado:
//! recibe órdenes por un canal, contesta novedades por otro, y el handle nunca
//! sale de acá.
//!
//! El handle se abre de nuevo en cada operación en lugar de mantenerlo vivo.
//! Cuesta unos milisegundos y a cambio: se relee `pacman.conf` —que la propia
//! tienda puede haber cambiado—, y el candado de pacman se toma cuando hay algo
//! que hacer y se suelta al terminar, en vez de quedar tomado mientras la
//! ventana esté abierta.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use alpm::{
    Alpm, AnyEvent, AnyQuestion, DownloadEvent, Event, LogLevel, Progress, Question, TransFlag,
};
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender};
use tokio::sync::oneshot;
use vasak_store_protocol::{Avance, Fase, PaqueteBreve, Previsualizacion};

/// Lo que se le puede pedir al motor.
pub enum Orden {
    Instalar {
        id: String,
        paquetes: Vec<String>,
    },
    /// Paquetes ya construidos, que es como entra lo del AUR.
    InstalarArchivos {
        id: String,
        rutas: Vec<String>,
    },
    Quitar {
        id: String,
        paquetes: Vec<String>,
        /// Llevarse también las dependencias que queden sin nadie que las use.
        con_huerfanas: bool,
    },
    Actualizar {
        id: String,
    },
    /// Bajar las bases de datos de los repositorios.
    Sincronizar {
        id: String,
    },
    /// Qué pasaría, sin que pase. Contesta por el canal que trae.
    Previsualizar {
        operacion: Peticion,
        responder: oneshot::Sender<Result<Previsualizacion, String>>,
    },
}

/// Qué operación previsualizar.
pub enum Peticion {
    Instalar(Vec<String>),
    Quitar {
        paquetes: Vec<String>,
        con_huerfanas: bool,
    },
    Actualizar,
}

/// Lo que el motor cuenta mientras trabaja.
pub enum Novedad {
    Avance { id: String, avance: Avance },
    Registro { id: String, linea: String },
    Terminada { id: String, error: Option<String> },
}

/// El estado que las funciones de retorno de libalpm comparten.
struct Contexto {
    id: String,
    novedades: UnboundedSender<Novedad>,
    /// Lo bajado por archivo, para poder informar el total y no el del último.
    ///
    /// libalpm informa el avance de cada descarga por separado y baja varias a
    /// la vez. Mostrando la última, la barra salta hacia atrás cada vez que
    /// empieza un archivo nuevo.
    descargas: HashMap<String, (i64, i64)>,
    /// El primer fallo que un guión de post-instalación anunció, si lo hubo.
    ///
    /// Compartido con quien ejecuta la transacción: un gancho puede imprimir un
    /// error fatal —mkinitcpio dejando el initramfs vacío— y salir con cero,
    /// así que `trans_commit` devuelve Ok y la operación parecería exitosa. La
    /// función de retorno lo anota acá y `ejecutar` lo lee al terminar.
    advertencia: Arc<Mutex<Option<String>>>,
}

impl Contexto {
    fn avisar(&self, avance: Avance) {
        let _ = self.novedades.send(Novedad::Avance {
            id: self.id.clone(),
            avance,
        });
    }

    fn registrar(&self, linea: impl Into<String>) {
        let _ = self.novedades.send(Novedad::Registro {
            id: self.id.clone(),
            linea: linea.into(),
        });
    }

    /// Anota el primer fallo de un guión. Los siguientes no lo pisan: el primero
    /// suele ser la causa y el resto el arrastre.
    fn anotar_fallo_de_gancho(&self, linea: &str) {
        let mut anotado = self.advertencia.lock().unwrap();
        if anotado.is_none() {
            *anotado = Some(format!(
                "Los paquetes se instalaron, pero un paso de post-instalación falló: «{}». \
                 Revisá el registro y no reinicies hasta resolverlo.",
                linea.trim()
            ));
        }
    }
}

/// Si una línea de un guión de post-instalación anuncia un fallo fatal.
///
/// best-effort. mkinitcpio y los envoltorios estilo makepkg marcan el error con
/// el prefijo `==> ERROR:`, que es la señal del caso que importa: el initramfs
/// que no se pudo armar y deja el equipo sin arrancar.
///
/// shortcut: sólo ese prefijo. Un gancho que falle sin imprimirlo y además salga
/// con cero —como el envoltorio de limine, que «saltea» y devuelve éxito— no se
/// detecta, porque libalpm tampoco lo ve: para el handle el gancho salió bien.
/// Eso es un defecto del gancho, no algo que desde acá se pueda cerrar del todo.
fn linea_anuncia_fallo(linea: &str) -> bool {
    linea.trim_start().starts_with("==> ERROR:")
}

/// El bucle del hilo. No vuelve hasta que se cierra el canal de órdenes.
///
/// `blocking_recv` y no `recv().await`: esto es un hilo del sistema operativo,
/// no una tarea de tokio, justamente porque lo que hace adentro bloquea durante
/// minutos y no se puede soltar el handle de libalpm entre medio.
pub fn atender(mut ordenes: UnboundedReceiver<Orden>, novedades: UnboundedSender<Novedad>) {
    while let Some(orden) = ordenes.blocking_recv() {
        match orden {
            Orden::Previsualizar {
                operacion,
                responder,
            } => {
                let _ = responder.send(previsualizar(operacion));
            }
            otra => {
                let id = id_de(&otra);
                let resultado = ejecutar(otra, &novedades);
                let _ = novedades.send(Novedad::Terminada {
                    id,
                    error: resultado.err(),
                });
            }
        }
    }
}

fn id_de(orden: &Orden) -> String {
    match orden {
        Orden::Instalar { id, .. }
        | Orden::InstalarArchivos { id, .. }
        | Orden::Quitar { id, .. }
        | Orden::Actualizar { id }
        | Orden::Sincronizar { id } => id.clone(),
        Orden::Previsualizar { .. } => String::new(),
    }
}

/// El directorio donde libalpm trae sus propios ganchos.
///
/// Es una constante de compilación de libalpm —`$datadir/libalpm/hooks/`, que
/// en Arch es esto— y ahí viven casi todos: `depmod`, `systemd-tmpfiles`, el
/// despliegue del gestor de arranque. `/etc/pacman.d/hooks/` es sólo para los
/// que agrega quien administra la máquina.
const HOOKDIR_DEL_SISTEMA: &str = "/usr/share/libalpm/hooks/";

/// Abre un handle de libalpm con la configuración real del sistema.
///
/// `pacman.conf` no se interpreta acá: lo hace `pacman-conf`, que es parte de
/// pacman y resuelve los `Include`, los `SigLevel` por repositorio y las
/// réplicas. Reimplementar ese analizador sería tener dos ideas distintas de lo
/// que dice el archivo, y la que importa es la de pacman.
///
/// Los hookdirs se corrigen a mano después: `alpm_with_conf` hace
/// `set_hookdirs` con lo que dice `pacman-conf`, que es sólo
/// `/etc/pacman.d/hooks/`, y **pisa** el default de libalpm
/// —`/usr/share/libalpm/hooks/`—. pacman no hace eso: arranca con ese default y
/// le **suma** los de la config. Sin el default, una actualización de kernel
/// corría `90-mkinitcpio-install.hook` (que vive en los dos lados) pero no
/// `60-depmod.hook` (que vive sólo en el default), así que mkinitcpio armaba el
/// initramfs sin que depmod hubiera indexado los módulos del kernel nuevo: la
/// imagen salía vacía y el equipo no arrancaba. Por terminal no pasa porque
/// pacman sí tiene los dos directorios.
fn abrir() -> Result<Alpm, String> {
    let conf = pacmanconf::Config::new()
        .map_err(|e| format!("no se pudo leer la configuración de pacman: {e}"))?;
    let mut alpm =
        alpm_utils::alpm_with_conf(&conf).map_err(|e| format!("no se pudo abrir libalpm: {e}"))?;
    let hookdirs = hookdirs_con_el_default(&conf.hook_dir);
    alpm.set_hookdirs(hookdirs.iter().map(String::as_str))
        .map_err(|e| format!("no se pudieron fijar los directorios de ganchos: {e}"))?;
    Ok(alpm)
}

/// Los hookdirs que tiene que ver libalpm: el default del sistema **primero** y
/// los de `pacman.conf` después.
///
/// El orden es el de pacman y no da igual: cuando un gancho existe en los dos
/// con el mismo nombre —`90-mkinitcpio-install.hook` lo hace—, el del directorio
/// posterior gana. `/etc/pacman.d/hooks/` tiene que ir último para que la
/// versión de quien administra la máquina sobreponga a la del sistema.
fn hookdirs_con_el_default(de_pacman_conf: &[String]) -> Vec<String> {
    let mut dirs = vec![HOOKDIR_DEL_SISTEMA.to_string()];
    dirs.extend(de_pacman_conf.iter().cloned());
    dirs
}

/// Engancha las funciones de retorno que informan el avance.
fn enganchar(
    alpm: &Alpm,
    id: &str,
    novedades: &UnboundedSender<Novedad>,
    advertencia: &Arc<Mutex<Option<String>>>,
) {
    let contexto = || Contexto {
        id: id.to_string(),
        novedades: novedades.clone(),
        descargas: HashMap::new(),
        advertencia: advertencia.clone(),
    };

    alpm.set_dl_cb(contexto(), |archivo, evento, ctx: &mut Contexto| {
        match evento.event() {
            DownloadEvent::Progress(p) => {
                ctx.descargas
                    .insert(archivo.to_string(), (p.downloaded, p.total));
            }
            DownloadEvent::Completed(_) => {
                if let Some((_, total)) = ctx.descargas.get(archivo).copied() {
                    ctx.descargas.insert(archivo.to_string(), (total, total));
                }
            }
            _ => return,
        }
        let (hecho, total) = ctx
            .descargas
            .values()
            .fold((0i64, 0i64), |(h, t), (dh, dt)| (h + dh, t + dt));
        ctx.avisar(Avance {
            fase: Fase::Descargando.como_id().to_string(),
            objetivo: archivo.to_string(),
            hecho: hecho.max(0) as u64,
            total: total.max(0) as u64,
        });
    });

    alpm.set_progress_cb(
        contexto(),
        |que, objetivo, _porcentaje, cuantos, actual, ctx: &mut Contexto| {
            let fase = match que {
                Progress::AddStart
                | Progress::UpgradeStart
                | Progress::DowngradeStart
                | Progress::ReinstallStart => Fase::Instalando,
                Progress::RemoveStart => Fase::Quitando,
                Progress::ConflictsStart | Progress::DiskspaceStart => Fase::Resolviendo,
                Progress::IntegrityStart | Progress::KeyringStart | Progress::LoadStart => {
                    Fase::Verificando
                }
            };
            ctx.avisar(Avance {
                fase: fase.como_id().to_string(),
                objetivo: objetivo.to_string(),
                hecho: actual as u64,
                total: cuantos as u64,
            });
        },
    );

    alpm.set_event_cb(contexto(), |evento: AnyEvent, ctx: &mut Contexto| {
        match evento.event() {
            // Lo que un guión de post-instalación imprime es lo único que el
            // paquete tiene para decirle a la persona. Va entero al registro.
            Event::ScriptletInfo(info) => {
                for linea in info.line().lines() {
                    ctx.registrar(linea);
                    if linea_anuncia_fallo(linea) {
                        ctx.anotar_fallo_de_gancho(linea);
                    }
                }
            }
            Event::PackageOperationStart(op) => {
                if let alpm::PackageOperation::Install(p) = op.operation() {
                    ctx.registrar(format!("instalando {} {}", p.name(), p.version()));
                } else if let alpm::PackageOperation::Upgrade(nuevo, viejo) = op.operation() {
                    ctx.registrar(format!(
                        "actualizando {} {} -> {}",
                        nuevo.name(),
                        viejo.version(),
                        nuevo.version()
                    ));
                } else if let alpm::PackageOperation::Remove(p) = op.operation() {
                    ctx.registrar(format!("quitando {} {}", p.name(), p.version()));
                }
            }
            Event::RetrieveFailed | Event::PkgRetrieveFailed(_) => {
                ctx.registrar("falló una descarga");
            }
            Event::TransactionStart => ctx.registrar("empieza la transacción"),
            Event::TransactionDone => ctx.registrar("transacción terminada"),
            _ => {}
        }
    });

    alpm.set_log_cb(contexto(), |nivel, texto, ctx: &mut Contexto| {
        // Sólo lo que importa. En nivel `Debug` libalpm emite miles de líneas
        // por transacción, y mandarlas por D-Bus a una ventana que las va a
        // mostrar es tirar abajo la ventana.
        if nivel.intersects(LogLevel::ERROR | LogLevel::WARNING) {
            ctx.registrar(texto.trim_end().to_string());
        }
    });

    alpm.set_question_cb(contexto(), |pregunta: AnyQuestion, ctx: &mut Contexto| {
        // Estas respuestas son política, no detalle. Las mismas se dan al
        // previsualizar y al ejecutar: es lo que hace que lo que se muestra
        // antes de confirmar sea lo que realmente va a pasar.
        match pregunta.question() {
            // Un conflicto se resuelve sacando el otro paquete. Se contesta que
            // sí para que la previsualización lo **liste**, y entonces la
            // persona confirma sabiendo qué se va a llevar puesto. Contestar
            // que no haría fallar la preparación y la pantalla sólo podría
            // decir «hay un conflicto».
            Question::Conflict(mut q) => {
                ctx.registrar(format!(
                    "conflicto: se quita {}",
                    q.conflict().package2().name()
                ));
                q.set_remove(true);
            }
            // Un paquete que reemplaza a otro es el camino normal de una
            // actualización; pacman también contesta que sí.
            Question::Replace(q) => q.set_replace(true),
            // Un archivo corrupto en la caché se borra y se vuelve a bajar.
            Question::Corrupted(mut q) => {
                ctx.registrar(format!("archivo corrupto, se descarta: {}", q.filepath()));
                q.set_remove(true);
            }
            // Paquetes que no se pueden actualizar sin romper dependencias. Se
            // saltean, como hace pacman: dejar el resto del sistema sin
            // actualizar por uno solo es peor. Queda nombrado en el registro.
            Question::RemovePkgs(mut q) => {
                for paquete in q.packages() {
                    ctx.registrar(format!(
                        "se saltea {}: no se puede actualizar",
                        paquete.name()
                    ));
                }
                q.set_skip(true);
            }
            // Lo que está en `IgnorePkg` se respeta. Alguien lo puso ahí.
            Question::InstallIgnorepkg(mut q) => q.set_install(false),
            // Varios paquetes proveen lo mismo: se toma el primero, que es lo
            // que pacman ofrece por omisión, y se deja dicho cuál fue.
            Question::SelectProvider(mut q) => {
                if let Some(elegido) = q.providers().first() {
                    ctx.registrar(format!(
                        "para {} se elige {}",
                        q.depend().name(),
                        elegido.name()
                    ));
                }
                q.set_index(0);
            }
            // **No.** Importar una clave PGP es ampliar para siempre en quién
            // confía el sistema para validar paquetes, y acá no hay a quién
            // preguntarle: la función de retorno corre dentro de la
            // transacción, en un hilo que no tiene ventana. Un «sí» automático
            // convertiría la comprobación de firmas en un trámite.
            //
            // La operación va a fallar con «firma desconocida», y eso es lo
            // correcto: la clave se importa a mano, con `pacman-key`, sabiendo
            // lo que se hace.
            Question::ImportKey(mut q) => {
                ctx.registrar(
                    "la operación pide confiar en una clave PGP nueva; no se importa \
                     automáticamente",
                );
                q.set_import(false);
            }
        }
    });
}

/// Hace lo que la orden pide. El candado de pacman se toma acá adentro.
fn ejecutar(orden: Orden, novedades: &UnboundedSender<Novedad>) -> Result<(), String> {
    let id = id_de(&orden);
    let mut alpm = abrir()?;
    let advertencia: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    enganchar(&alpm, &id, novedades, &advertencia);

    let resultado = match orden {
        Orden::Sincronizar { .. } => alpm
            .syncdbs_mut()
            .update(false)
            .map(|_| ())
            .map_err(|e| format!("no se pudieron actualizar las bases de datos: {e}")),
        Orden::Instalar { paquetes, .. } => {
            alpm.trans_init(TransFlag::NONE)
                .map_err(|e| format!("no se pudo empezar la transacción: {e}"))?;
            let resultado = (|| {
                for nombre in &paquetes {
                    let paquete = buscar_en_repositorios(&alpm, nombre)?;
                    alpm.trans_add_pkg(paquete)
                        .map_err(|e| format!("no se pudo agregar {nombre}: {}", e.error))?;
                }
                confirmar(&mut alpm)
            })();
            let _ = alpm.trans_release();
            resultado
        }
        Orden::InstalarArchivos { rutas, .. } => {
            alpm.trans_init(TransFlag::NONE)
                .map_err(|e| format!("no se pudo empezar la transacción: {e}"))?;
            let resultado = (|| {
                // El nivel de firma de los archivos locales, el mismo que
                // usaría pacman con `-U`. `USE_DEFAULT` **no** es eso: es el
                // marcador de «todavía sin resolver», y con él la comprobación
                // de firma de un paquete que acabamos de compilar queda en
                // manos de lo que libalpm decida por omisión en vez de lo que
                // dice `/etc/pacman.conf`.
                let nivel = alpm.local_file_siglevel();
                for ruta in &rutas {
                    // `full = true` lee el paquete entero, no sólo la cabecera:
                    // sin eso la transacción no conoce sus archivos y la
                    // comprobación de conflictos no puede hacerse.
                    let paquete = alpm
                        .pkg_load(ruta.as_str(), true, nivel)
                        .map_err(|e| format!("no se pudo leer {ruta}: {e}"))?;
                    alpm.trans_add_pkg(paquete)
                        .map_err(|e| format!("no se pudo agregar {ruta}: {}", e.error))?;
                }
                confirmar(&mut alpm)
            })();
            let _ = alpm.trans_release();
            resultado
        }
        Orden::Quitar {
            paquetes,
            con_huerfanas,
            ..
        } => {
            alpm.trans_init(banderas_de_quitar(con_huerfanas))
                .map_err(|e| format!("no se pudo empezar la transacción: {e}"))?;
            let resultado = (|| {
                for nombre in &paquetes {
                    let paquete = alpm
                        .localdb()
                        .pkg(nombre.as_str())
                        .map_err(|_| format!("{nombre} no está instalado"))?;
                    alpm.trans_remove_pkg(paquete)
                        .map_err(|e| format!("no se pudo quitar {nombre}: {e}"))?;
                }
                confirmar(&mut alpm)
            })();
            let _ = alpm.trans_release();
            resultado
        }
        Orden::Actualizar { .. } => {
            alpm.syncdbs_mut()
                .update(false)
                .map_err(|e| format!("no se pudieron actualizar las bases de datos: {e}"))?;
            alpm.trans_init(TransFlag::NONE)
                .map_err(|e| format!("no se pudo empezar la transacción: {e}"))?;
            let resultado = (|| {
                alpm.sync_sysupgrade(false)
                    .map_err(|e| format!("no se pudo preparar la actualización: {e}"))?;
                confirmar(&mut alpm)
            })();
            let _ = alpm.trans_release();
            resultado
        }
        Orden::Previsualizar { .. } => Ok(()),
    };

    // Una transacción puede aplicarse —`trans_commit` devuelve Ok— y aun así
    // dejar el sistema mal: un gancho de post-instalación que falla e igual sale
    // con cero. Si alguno anunció un fallo fatal, la operación no es «listo».
    resultado.and_then(|()| match advertencia.lock().unwrap().take() {
        Some(aviso) => Err(aviso),
        None => Ok(()),
    })
}

/// Las banderas de una desinstalación.
///
/// `RECURSE` saca las dependencias que quedan sin nadie que las use, que es lo
/// que hace `pacman -Rs`. Sin ella queda basura instalada para siempre; con
/// ella y sin avisar, una desinstalación se lleva más de lo que se pidió — por
/// eso es una opción y la previsualización la muestra con las mismas banderas.
fn banderas_de_quitar(con_huerfanas: bool) -> TransFlag {
    if con_huerfanas {
        TransFlag::RECURSE
    } else {
        TransFlag::NONE
    }
}

/// Busca un paquete por nombre en los repositorios configurados.
fn buscar_en_repositorios<'a>(alpm: &'a Alpm, nombre: &str) -> Result<&'a alpm::Package, String> {
    alpm.syncdbs()
        .iter()
        .find_map(|db| db.pkg(nombre).ok())
        .ok_or_else(|| format!("no hay ningún paquete llamado {nombre}"))
}

/// Prepara y confirma, traduciendo los dos fallos posibles a algo legible.
fn confirmar(alpm: &mut Alpm) -> Result<(), String> {
    alpm.trans_prepare().map_err(|e| explicar_preparacion(&e))?;
    alpm.trans_commit()
        .map_err(|e| format!("la transacción falló: {}", e.error()))
}

/// Convierte el fallo de `trans_prepare` en una frase.
///
/// El error a secas dice «could not satisfy dependencies» y nada más; lo que
/// hace falta para arreglarlo está en los datos que vienen aparte.
fn explicar_preparacion(fallo: &alpm::PrepareError<'_>) -> String {
    let Some(datos) = fallo.data() else {
        return format!("no se pudo preparar la operación: {}", fallo.error());
    };
    match datos {
        alpm::PrepareData::UnsatisfiedDeps(faltantes) => {
            let lista: Vec<String> = faltantes
                .iter()
                .map(|f| format!("{} necesita {}", f.target(), f.depend()))
                .collect();
            format!("faltan dependencias: {}", lista.join("; "))
        }
        alpm::PrepareData::ConflictingDeps(conflictos) => {
            let lista: Vec<String> = conflictos
                .iter()
                .map(|c| format!("{} con {}", c.package1().name(), c.package2().name()))
                .collect();
            format!("hay conflictos: {}", lista.join("; "))
        }
        alpm::PrepareData::PkgInvalidArch(paquetes) => {
            let lista: Vec<String> = paquetes.iter().map(|p| p.name().to_string()).collect();
            format!("no son para esta arquitectura: {}", lista.join(", "))
        }
    }
}

/// Qué pasaría si la operación se hiciera.
///
/// Abre la transacción, la prepara y la suelta **sin confirmar**. El candado se
/// toma un instante: es el precio de que resolver dependencias lo haga libalpm
/// y no una imitación nuestra que se desactualice.
fn previsualizar(peticion: Peticion) -> Result<Previsualizacion, String> {
    let mut alpm = abrir()?;

    let banderas = match &peticion {
        Peticion::Quitar { con_huerfanas, .. } => banderas_de_quitar(*con_huerfanas),
        _ => TransFlag::NONE,
    };
    alpm.trans_init(banderas)
        .map_err(|e| format!("no se pudo empezar la transacción: {e}"))?;

    let resultado = (|| {
        match &peticion {
            Peticion::Instalar(paquetes) => {
                for nombre in paquetes {
                    let paquete = buscar_en_repositorios(&alpm, nombre)?;
                    alpm.trans_add_pkg(paquete)
                        .map_err(|e| format!("no se pudo agregar {nombre}: {}", e.error))?;
                }
            }
            Peticion::Quitar { paquetes, .. } => {
                for nombre in paquetes {
                    let paquete = alpm
                        .localdb()
                        .pkg(nombre.as_str())
                        .map_err(|_| format!("{nombre} no está instalado"))?;
                    alpm.trans_remove_pkg(paquete)
                        .map_err(|e| format!("no se pudo quitar {nombre}: {e}"))?;
                }
            }
            Peticion::Actualizar => {
                alpm.sync_sysupgrade(false)
                    .map_err(|e| format!("no se pudo preparar la actualización: {e}"))?;
            }
        }

        let mut informe = Previsualizacion::default();
        if let Err(fallo) = alpm.trans_prepare() {
            // Un conflicto no es un error de la tienda: es la respuesta a la
            // pregunta. Se informa como conflicto y la pantalla decide.
            informe.conflictos.push(explicar_preparacion(&fallo));
            return Ok(informe);
        }

        for paquete in alpm.trans_add() {
            let instalado = alpm.localdb().pkg(paquete.name()).ok();
            let breve = PaqueteBreve {
                nombre: paquete.name().to_string(),
                version: instalado
                    .map(|p| p.version().to_string())
                    .unwrap_or_else(|| paquete.version().to_string()),
                version_nueva: instalado.map(|_| paquete.version().to_string()),
                origen: paquete
                    .db()
                    .map(|db| db.name().to_string())
                    .unwrap_or_else(|| "archivo".to_string()),
                tamano: paquete.isize(),
                descarga: paquete.download_size(),
            };
            informe.descarga += breve.descarga;
            informe.espacio += paquete.isize() - instalado.map(|p| p.isize()).unwrap_or(0);
            if instalado.is_some() {
                informe.actualizar.push(breve);
            } else {
                informe.instalar.push(breve);
            }
        }

        for paquete in alpm.trans_remove() {
            informe.espacio -= paquete.isize();
            informe.quitar.push(PaqueteBreve {
                nombre: paquete.name().to_string(),
                version: paquete.version().to_string(),
                version_nueva: None,
                origen: "local".to_string(),
                tamano: paquete.isize(),
                descarga: 0,
            });
        }

        Ok(informe)
    })();

    let _ = alpm.trans_release();
    resultado
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quitar_sin_huerfanas_no_arrastra_nada() {
        assert_eq!(banderas_de_quitar(false), TransFlag::NONE);
        assert!(banderas_de_quitar(true).contains(TransFlag::RECURSE));
    }

    #[test]
    fn el_id_sale_de_cualquier_orden_menos_la_previsualizacion() {
        assert_eq!(
            id_de(&Orden::Actualizar {
                id: "t7".to_string()
            }),
            "t7"
        );
        assert_eq!(
            id_de(&Orden::Quitar {
                id: "t8".to_string(),
                paquetes: vec![],
                con_huerfanas: false
            }),
            "t8"
        );
    }

    #[test]
    fn una_linea_con_error_fatal_de_gancho_se_reconoce_aun_con_sangria() {
        assert!(linea_anuncia_fallo(
            "==> ERROR: Cannot acquire used modules. Unable to use autodetection."
        ));
        assert!(linea_anuncia_fallo(
            "  ==> ERROR: module not found: 'amdgpu'"
        ));
    }

    #[test]
    fn el_resto_de_la_salida_de_un_gancho_no_se_toma_por_fallo() {
        for linea in [
            "  -> Running build hook: [autodetect]",
            "==> Starting build: '7.2.8-2-cachyos'",
            "==> WARNING: errors were encountered during the build.",
            "instalando foo 1.0",
            "",
        ] {
            assert!(!linea_anuncia_fallo(linea), "falso positivo: {linea:?}");
        }
    }

    #[test]
    fn el_primer_fallo_de_gancho_anotado_no_lo_pisa_el_segundo() {
        let (novedades, _rx) = tokio::sync::mpsc::unbounded_channel();
        let advertencia = Arc::new(Mutex::new(None));
        let ctx = Contexto {
            id: "t1".to_string(),
            novedades,
            descargas: HashMap::new(),
            advertencia: advertencia.clone(),
        };
        ctx.anotar_fallo_de_gancho("==> ERROR: primero");
        ctx.anotar_fallo_de_gancho("==> ERROR: segundo");
        let guardado = advertencia.lock().unwrap().clone().unwrap();
        assert!(guardado.contains("primero"), "{guardado}");
        assert!(!guardado.contains("segundo"), "{guardado}");
    }

    /// Las bases de datos son legibles por cualquiera, así que esto corre sin
    /// privilegios y comprueba que la configuración del sistema se pueda leer
    /// de verdad: si `pacman-conf` no está o el archivo no se entiende, el
    /// demonio no podría hacer nada y conviene enterarse acá.
    #[test]
    fn la_configuracion_del_sistema_se_puede_abrir() {
        match abrir() {
            Ok(alpm) => assert!(
                !alpm.syncdbs().is_empty(),
                "no hay ningún repositorio configurado"
            ),
            Err(razon) => panic!("no se pudo abrir libalpm: {razon}"),
        }
    }

    #[test]
    fn el_hookdir_del_sistema_va_primero_y_los_de_pacman_conf_despues_en_orden() {
        let de_conf = vec![
            "/etc/pacman.d/hooks/".to_string(),
            "/opt/ganchos/".to_string(),
        ];
        assert_eq!(
            hookdirs_con_el_default(&de_conf),
            vec![
                "/usr/share/libalpm/hooks/".to_string(),
                "/etc/pacman.d/hooks/".to_string(),
                "/opt/ganchos/".to_string(),
            ]
        );
    }

    #[test]
    fn sin_hookdirs_en_la_config_queda_el_del_sistema() {
        assert_eq!(
            hookdirs_con_el_default(&[]),
            vec!["/usr/share/libalpm/hooks/".to_string()]
        );
    }

    /// Si `pacman-conf` no se puede leer (CI sin pacman) no hay nada que
    /// comprobar y se saltea, como en las pruebas de vasak-update.
    #[test]
    fn el_handle_abierto_conserva_el_hookdir_del_sistema() {
        if pacmanconf::Config::new().is_err() {
            return;
        }
        let alpm = abrir().expect("abrir libalpm");
        let dirs: Vec<&str> = alpm.hookdirs().iter().collect();
        assert_eq!(dirs.first().copied(), Some("/usr/share/libalpm/hooks/"));
    }
}
