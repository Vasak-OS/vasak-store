//! Leer las bases de datos de pacman, sin privilegios y sin salir del proceso.
//!
//! Buscar, listar lo instalado y calcular qué se puede actualizar son lecturas
//! de archivos que cualquiera puede leer. Hacerlas acá, y no pidiéndoselas al
//! demonio, tiene dos consecuencias buenas: la ventana contesta al instante
//! —sin ida y vuelta por el bus del sistema— y el proceso que corre como root
//! no atiende consultas, así que tiene menos por donde entrarle.
//!
//! Va en un hilo propio por lo mismo que el motor del demonio: `alpm::Alpm` no
//! es `Send` y no puede vivir en una tarea de tokio. Y de paso, el handle y el
//! catálogo de AppStream —que son caros de abrir— se abren una sola vez y se
//! quedan acá.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use alpm::Alpm;
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};
use tokio::sync::oneshot;

use crate::catalogo::{self, Catalogo, Ficha};
use crate::tipos::{
    Captura, Descubrimiento, Detalle, Icono, Origen, Pagina, ResumenDeCategoria, Tarjeta,
};

/// Cuántas tarjetas lleva cada fila de Descubrir.
const CUANTAS_DESTACADAS: usize = 12;

/// Lo que se le puede preguntar.
pub enum Consulta {
    Buscar {
        texto: String,
        limite: usize,
        responder: oneshot::Sender<Pagina>,
    },
    Instaladas {
        texto: String,
        responder: oneshot::Sender<Pagina>,
    },
    Actualizaciones {
        responder: oneshot::Sender<Vec<Tarjeta>>,
    },
    /// La ficha, y aparte las capturas sin bajar: bajarlas es asíncrono y acá
    /// no hay con qué esperarlas.
    Detalle {
        nombre: String,
        responder: oneshot::Sender<Option<(Detalle, Vec<catalogo::Captura>)>>,
    },
    DeCategoria {
        categoria: String,
        limite: usize,
        responder: oneshot::Sender<Pagina>,
    },
    Descubrir {
        responder: oneshot::Sender<Descubrimiento>,
    },
    /// Qué nombres existen, para poder resolver las dependencias del AUR sin
    /// preguntar una por una.
    ///
    /// Van los nombres de paquete **y lo que cada uno provee**: media
    /// dependencia del AUR está escrita contra un `provides` —`sh`, `java-runtime`,
    /// `libgl`— y no contra el nombre de ningún paquete.
    Nombres {
        responder: oneshot::Sender<(HashSet<String>, HashSet<String>)>,
    },
    /// Reabrir el handle. Después de una transacción, el que había en memoria
    /// sigue contestando con lo que era verdad antes.
    Recargar { responder: oneshot::Sender<()> },
}

/// El extremo por el que se le pregunta al hilo.
#[derive(Clone)]
pub struct Lector {
    envio: UnboundedSender<Consulta>,
}

impl Lector {
    /// Arranca el hilo y devuelve con qué hablarle.
    pub fn arrancar(idioma: String, cache: PathBuf) -> Lector {
        let (envio, mut recibo) = unbounded_channel::<Consulta>();
        std::thread::Builder::new()
            .name("alpm-lectura".to_string())
            .spawn(move || {
                // El catálogo primero: son unos veinte megas de XML comprimido
                // y tarda, pero pasa una sola vez y así la primera búsqueda ya
                // encuentra los nombres de verdad.
                let catalogo = Catalogo::cargar(&idioma);
                let mut alpm = abrir();

                while let Some(consulta) = recibo.blocking_recv() {
                    atender(&mut alpm, &catalogo, &cache, consulta);
                }
            })
            .expect("no se pudo arrancar el hilo de lectura");
        Lector { envio }
    }

    async fn preguntar<T>(&self, armar: impl FnOnce(oneshot::Sender<T>) -> Consulta) -> Option<T> {
        let (responder, respuesta) = oneshot::channel();
        self.envio.send(armar(responder)).ok()?;
        respuesta.await.ok()
    }

    pub async fn buscar(&self, texto: String, limite: usize) -> Pagina {
        self.preguntar(|responder| Consulta::Buscar {
            texto,
            limite,
            responder,
        })
        .await
        .unwrap_or(Pagina {
            resultados: Vec::new(),
            total: 0,
        })
    }

    pub async fn instaladas(&self, texto: String) -> Pagina {
        self.preguntar(|responder| Consulta::Instaladas { texto, responder })
            .await
            .unwrap_or(Pagina {
                resultados: Vec::new(),
                total: 0,
            })
    }

    pub async fn actualizaciones(&self) -> Vec<Tarjeta> {
        self.preguntar(|responder| Consulta::Actualizaciones { responder })
            .await
            .unwrap_or_default()
    }

    pub async fn detalle(&self, nombre: String) -> Option<(Detalle, Vec<catalogo::Captura>)> {
        self.preguntar(|responder| Consulta::Detalle { nombre, responder })
            .await
            .flatten()
    }

    pub async fn de_categoria(&self, categoria: String, limite: usize) -> Pagina {
        self.preguntar(|responder| Consulta::DeCategoria {
            categoria,
            limite,
            responder,
        })
        .await
        .unwrap_or(Pagina {
            resultados: Vec::new(),
            total: 0,
        })
    }

    pub async fn descubrir(&self) -> Descubrimiento {
        self.preguntar(|responder| Consulta::Descubrir { responder })
            .await
            .unwrap_or_default()
    }

    /// Los nombres instalados y los disponibles, con lo que proveen.
    pub async fn nombres(&self) -> (HashSet<String>, HashSet<String>) {
        self.preguntar(|responder| Consulta::Nombres { responder })
            .await
            .unwrap_or_default()
    }

    /// Vuelve a abrir las bases de datos. Se llama al terminar una transacción.
    pub async fn recargar(&self) {
        self.preguntar(|responder| Consulta::Recargar { responder })
            .await;
    }
}

/// Abre libalpm con la configuración real, o devuelve nada si no se puede.
///
/// Que no se pueda es raro —haría falta que `pacman-conf` no esté— pero no es
/// motivo para que la ventana no abra: se muestra vacía y el resto de la
/// aplicación sigue en pie.
fn abrir() -> Option<Alpm> {
    let conf = pacmanconf::Config::new().ok()?;
    alpm_utils::alpm_with_conf(&conf).ok()
}

fn atender(alpm: &mut Option<Alpm>, catalogo: &Catalogo, cache: &PathBuf, consulta: Consulta) {
    match consulta {
        Consulta::Recargar { responder } => {
            *alpm = abrir();
            let _ = responder.send(());
        }
        Consulta::Buscar {
            texto,
            limite,
            responder,
        } => {
            let pagina = alpm
                .as_ref()
                .map(|a| buscar(a, catalogo, cache, &texto, limite))
                .unwrap_or(Pagina {
                    resultados: Vec::new(),
                    total: 0,
                });
            let _ = responder.send(pagina);
        }
        Consulta::Instaladas { texto, responder } => {
            let pagina = alpm
                .as_ref()
                .map(|a| instaladas(a, catalogo, cache, &texto))
                .unwrap_or(Pagina {
                    resultados: Vec::new(),
                    total: 0,
                });
            let _ = responder.send(pagina);
        }
        Consulta::Actualizaciones { responder } => {
            let lista = alpm
                .as_ref()
                .map(|a| actualizaciones(a, catalogo, cache))
                .unwrap_or_default();
            let _ = responder.send(lista);
        }
        Consulta::Detalle { nombre, responder } => {
            let ficha = alpm
                .as_ref()
                .and_then(|a| detalle(a, catalogo, cache, &nombre));
            let _ = responder.send(ficha);
        }
        Consulta::DeCategoria {
            categoria,
            limite,
            responder,
        } => {
            let pagina = alpm
                .as_ref()
                .map(|a| de_categoria(a, catalogo, cache, &categoria, limite))
                .unwrap_or(Pagina {
                    resultados: Vec::new(),
                    total: 0,
                });
            let _ = responder.send(pagina);
        }
        Consulta::Nombres { responder } => {
            let conjuntos = alpm.as_ref().map(nombres).unwrap_or_default();
            let _ = responder.send(conjuntos);
        }
        Consulta::Descubrir { responder } => {
            let descubrimiento = alpm
                .as_ref()
                .map(|a| descubrir(a, catalogo, cache))
                .unwrap_or_default();
            let _ = responder.send(descubrimiento);
        }
    }
}

/// Cuánto se parece un paquete a lo que se buscó. Más alto es mejor.
///
/// El orden importa más de lo que parece: buscando «git» tienen que aparecer
/// primero `git` y `gitg`, no los cuatrocientos paquetes que mencionan git en su
/// descripción. Sin puntaje, el orden es el de la base de datos, que es
/// alfabético y no significa nada.
pub fn puntaje(consulta: &str, nombre: &str, resumen: &str) -> Option<u32> {
    let consulta = consulta.trim().to_lowercase();
    if consulta.is_empty() {
        return Some(1);
    }
    let nombre = nombre.to_lowercase();
    if nombre == consulta {
        return Some(1000);
    }
    if nombre.starts_with(&consulta) {
        // Los más cortos primero: buscando «git», `git-lfs` antes que
        // `git-annex-remote-rclone`.
        return Some(700u32.saturating_sub(nombre.len().min(200) as u32));
    }
    if nombre.contains(&consulta) {
        return Some(400u32.saturating_sub(nombre.len().min(200) as u32));
    }
    if resumen.to_lowercase().contains(&consulta) {
        return Some(100);
    }
    None
}

/// Un extra para lo que tiene ficha en el catálogo.
///
/// Empata desempates: entre dos paquetes que coinciden igual, el que es una
/// aplicación con nombre, ícono y descripción es casi siempre el que se buscaba,
/// y la biblioteca que lo acompaña casi nunca.
const EXTRA_POR_FICHA: u32 = 50;

fn buscar(alpm: &Alpm, catalogo: &Catalogo, cache: &PathBuf, texto: &str, limite: usize) -> Pagina {
    let mut puntuados: Vec<(u32, &alpm::Package)> = Vec::new();

    for db in alpm.syncdbs() {
        for paquete in db.pkgs() {
            let resumen = paquete.desc().unwrap_or_default();
            let Some(mut punto) = puntaje(texto, paquete.name(), resumen) else {
                continue;
            };
            if catalogo.de(paquete.name()).is_some() {
                punto += EXTRA_POR_FICHA;
            }
            puntuados.push((punto, paquete));
        }
    }

    puntuados.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.name().cmp(b.1.name())));
    // Un mismo nombre puede estar en varios repositorios —`extra` y
    // `cachyos-extra-v3` traen los dos casi todo—, y mostrarlo dos veces en la
    // lista no ayuda a nadie. Gana el primero, que es el de más puntaje.
    //
    // Con un `HashSet` y no recorriendo una lista: acá entran quince mil
    // paquetes y esto corre en cada tecla. Buscar en un `Vec` cada vez son
    // cien millones de comparaciones de cadenas por búsqueda.
    let mut vistos: HashSet<&str> = HashSet::new();
    puntuados.retain(|(_, paquete)| vistos.insert(paquete.name()));

    let total = puntuados.len();
    let resultados = puntuados
        .into_iter()
        .take(limite)
        .map(|(_, paquete)| tarjeta(alpm, catalogo, cache, paquete, false))
        .collect();

    Pagina { resultados, total }
}

fn instaladas(alpm: &Alpm, catalogo: &Catalogo, cache: &PathBuf, texto: &str) -> Pagina {
    let mut lista: Vec<Tarjeta> = alpm
        .localdb()
        .pkgs()
        .iter()
        .filter(|p| puntaje(texto, p.name(), p.desc().unwrap_or_default()).is_some())
        .map(|p| tarjeta(alpm, catalogo, cache, p, true))
        .collect();
    lista.sort_by(|a, b| a.titulo.to_lowercase().cmp(&b.titulo.to_lowercase()));
    let total = lista.len();
    Pagina {
        resultados: lista,
        total,
    }
}

fn actualizaciones(alpm: &Alpm, catalogo: &Catalogo, cache: &PathBuf) -> Vec<Tarjeta> {
    let mut lista: Vec<Tarjeta> = alpm
        .localdb()
        .pkgs()
        .iter()
        .filter_map(|instalado| {
            let nuevo = instalado.sync_new_version(alpm.syncdbs())?;
            let mut t = tarjeta(alpm, catalogo, cache, nuevo, false);
            t.version = instalado.version().to_string();
            t.actualizable = Some(nuevo.version().to_string());
            Some(t)
        })
        .collect();
    lista.sort_by(|a, b| a.titulo.to_lowercase().cmp(&b.titulo.to_lowercase()));
    lista
}

fn de_categoria(
    alpm: &Alpm,
    catalogo: &Catalogo,
    cache: &PathBuf,
    categoria: &str,
    limite: usize,
) -> Pagina {
    let mut nombres: Vec<&str> = catalogo
        .todas()
        .filter(|f| catalogo::categorias_de(f).contains(&categoria))
        .map(|f| f.paquete.as_str())
        .collect();
    nombres.sort_unstable();
    nombres.dedup();

    // El total se cuenta **después** de descartar lo que no existe en los
    // repositorios configurados: el catálogo de Arch nombra paquetes que esta
    // máquina puede no tener, y contarlos dejaba la lista con un tramo final
    // vacío.
    let existentes: Vec<&alpm::Package> = nombres
        .into_iter()
        .filter_map(|nombre| buscar_paquete(alpm, nombre))
        .collect();

    let total = existentes.len();
    let resultados = existentes
        .into_iter()
        .take(limite)
        .map(|p| tarjeta(alpm, catalogo, cache, p, false))
        .collect();

    Pagina { resultados, total }
}

/// Busca un paquete en los repositorios y, si no está, en lo instalado.
fn buscar_paquete<'a>(alpm: &'a Alpm, nombre: &str) -> Option<&'a alpm::Package> {
    alpm.syncdbs()
        .iter()
        .find_map(|db| db.pkg(nombre).ok())
        .or_else(|| alpm.localdb().pkg(nombre).ok())
}

fn descubrir(alpm: &Alpm, catalogo: &Catalogo, cache: &PathBuf) -> Descubrimiento {
    // Las categorías, con cuántas aplicaciones tiene cada una.
    let mut cuenta: HashMap<&str, usize> = HashMap::new();
    for ficha in catalogo.todas() {
        for categoria in catalogo::categorias_de(ficha) {
            *cuenta.entry(categoria).or_default() += 1;
        }
    }
    let categorias = catalogo::CATEGORIAS
        .iter()
        .map(|(id, _)| ResumenDeCategoria {
            id: id.to_string(),
            cuantas: cuenta.get(id).copied().unwrap_or(0),
            icono: icono_de_categoria(id).to_string(),
        })
        .collect();

    // Novedades: lo que se construyó hace menos. Es un dato real de la base de
    // datos, a diferencia de «lo más descargado», que en una máquina no existe:
    // nadie lleva la cuenta de cuánta gente instaló qué.
    let mut con_fecha: Vec<(i64, &Ficha)> = sin_repetir(catalogo)
        .into_iter()
        .filter_map(|f| Some((buscar_paquete(alpm, &f.paquete)?.build_date(), f)))
        .collect();
    con_fecha.sort_by(|a, b| b.0.cmp(&a.0));
    let novedades = con_fecha
        .iter()
        .take(CUANTAS_DESTACADAS)
        .filter_map(|(_, f)| buscar_paquete(alpm, &f.paquete))
        .map(|p| tarjeta(alpm, catalogo, cache, p, false))
        .collect();

    // Una selección que cambia todos los días. No es una recomendación
    // disfrazada de dato: es un sorteo, y el texto de la pantalla lo dice. Se
    // siembra con la fecha para que sea el mismo durante el día —una lista que
    // se baraja en cada recarga no se puede volver a mirar— y se limita a lo
    // que tiene capturas, que es lo único que se ve bien en una tarjeta grande.
    let dia = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() / 86_400)
        .unwrap_or(0);
    let mut sorteables: Vec<(u64, &Ficha)> = sin_repetir(catalogo)
        .into_iter()
        .filter(|f| !f.capturas.is_empty() && f.icono_archivo.is_some())
        .map(|f| (sorteo(&f.paquete, dia), f))
        .collect();
    sorteables.sort_by_key(|(n, _)| *n);
    // Las destacadas llevan su captura, que es lo que hace que la fila de
    // arriba se vea como una portada y no como una lista más. Va la URL: acá no
    // hay red, la baja el comando.
    let seleccion = sorteables
        .iter()
        .filter_map(|(sorteo, f)| Some((*sorteo, f, buscar_paquete(alpm, &f.paquete)?)))
        .take(CUANTAS_DESTACADAS)
        .map(|(_, ficha, paquete)| {
            let mut t = tarjeta(alpm, catalogo, cache, paquete, false);
            t.captura = ficha
                .capturas
                .iter()
                .find(|c| c.principal)
                .or_else(|| ficha.capturas.first())
                .map(|c| c.url.clone());
            t
        })
        .collect();

    Descubrimiento {
        seleccion,
        novedades,
        categorias,
    }
}

/// Los nombres que existen: los instalados y los que ofrecen los repositorios.
fn nombres(alpm: &Alpm) -> (HashSet<String>, HashSet<String>) {
    let mut instalados = HashSet::new();
    for paquete in alpm.localdb().pkgs() {
        instalados.insert(paquete.name().to_string());
        for provee in paquete.provides() {
            instalados.insert(provee.name().to_string());
        }
    }

    let mut disponibles = HashSet::new();
    for db in alpm.syncdbs() {
        for paquete in db.pkgs() {
            disponibles.insert(paquete.name().to_string());
            for provee in paquete.provides() {
                disponibles.insert(provee.name().to_string());
            }
        }
    }

    (instalados, disponibles)
}

/// Una ficha por paquete.
///
/// Un paquete puede traer varias aplicaciones —`plan9port` trae unas cuantas— y
/// sin esto las filas de Descubrir mostraban el mismo paquete repetido,
/// corriendo a otros de la lista.
fn sin_repetir(catalogo: &Catalogo) -> Vec<&Ficha> {
    let mut vistos: HashSet<&str> = HashSet::new();
    catalogo
        .todas()
        .filter(|ficha| vistos.insert(ficha.paquete.as_str()))
        .collect()
}

/// Un número estable por paquete y por día, para ordenar el sorteo.
fn sorteo(paquete: &str, dia: u64) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325 ^ dia;
    for byte in paquete.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

/// El ícono del tema con el que se dibuja cada categoría.
fn icono_de_categoria(id: &str) -> &'static str {
    match id {
        "juegos" => "applications-games",
        "desarrollo" => "applications-development",
        "productividad" => "applications-office",
        "multimedia" => "applications-multimedia",
        "sistema" => "applications-system",
        _ => "applications-utilities",
    }
}

/// Arma la tarjeta de un paquete.
fn tarjeta(
    alpm: &Alpm,
    catalogo: &Catalogo,
    cache: &PathBuf,
    paquete: &alpm::Package,
    es_local: bool,
) -> Tarjeta {
    let ficha = catalogo.de(paquete.name());
    let instalado = alpm.localdb().pkg(paquete.name()).ok();
    let instalada = instalado.is_some();

    // De dónde sale, buscándolo en los repositorios y no en `db()`.
    //
    // Para un paquete leído de la base local, `db()` contesta `local` siempre,
    // así que **todo lo instalado** aparecía como origen «Instalado» aunque
    // `extra` lo siguiera ofreciendo. Sólo es local de verdad lo que ningún
    // repositorio configurado tiene.
    let repositorio = alpm
        .syncdbs()
        .iter()
        .find(|db| db.pkg(paquete.name()).is_ok())
        .map(|db| db.name().to_string())
        .or_else(|| paquete.db().map(|db| db.name().to_string()))
        .unwrap_or_else(|| "local".to_string());

    let actualizable = if es_local {
        paquete
            .sync_new_version(alpm.syncdbs())
            .map(|n| n.version().to_string())
    } else {
        None
    };

    Tarjeta {
        nombre: paquete.name().to_string(),
        titulo: ficha
            .map(|f| f.nombre.clone())
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| paquete.name().to_string()),
        resumen: ficha
            .map(|f| f.resumen.clone())
            .filter(|r| !r.is_empty())
            .or_else(|| paquete.desc().map(|d| d.to_string()))
            .unwrap_or_default(),
        version: paquete.version().to_string(),
        origen: if repositorio == "local" {
            Origen::Local
        } else {
            Origen::Repositorio
        },
        repositorio,
        instalada,
        actualizable,
        tamano: paquete.isize(),
        icono: icono(ficha, paquete.name(), cache),
        categorias: ficha
            .map(|f| {
                catalogo::categorias_de(f)
                    .into_iter()
                    .map(|c| c.to_string())
                    .collect()
            })
            .unwrap_or_default(),
        votos: None,
        popularidad: None,
        actualizado: Some(paquete.build_date()),
        captura: None,
    }
}

/// De dónde sale el ícono de algo.
///
/// **El tema del sistema primero**, siempre que tenga algo: es el mismo ícono
/// que se ve en el menú de aplicaciones, sigue el tema que la persona eligió y
/// se redibuja cuando lo cambia. El archivo del catálogo es el respaldo, para lo
/// que el tema no tenga —típicamente lo que todavía no está instalado—.
///
/// Los nombres a probar son varios porque los temas no se ponen de acuerdo: el
/// `Icon=` del `.desktop` es el más común, el identificador de AppStream sin el
/// `.desktop` lo usan los temas modernos, y el nombre del paquete acierta en
/// bastantes casos que los otros dos no cubren. Se prueban en ese orden y el
/// último es el genérico, que al menos no deja un hueco.
fn icono(ficha: Option<&Ficha>, paquete: &str, cache: &PathBuf) -> Icono {
    let mut tema: Vec<String> = Vec::new();

    if let Some(ficha) = ficha {
        if let Some(nombre) = ficha.icono.as_deref().filter(|n| !n.is_empty()) {
            tema.push(nombre.to_string());
        }
        let sin_desktop = ficha.id.strip_suffix(".desktop").unwrap_or(&ficha.id);
        if !sin_desktop.is_empty() && !tema.iter().any(|n| n == sin_desktop) {
            tema.push(sin_desktop.to_string());
        }
    }
    if !tema.iter().any(|n| n == paquete) {
        tema.push(paquete.to_string());
    }
    tema.push("package-x-generic".to_string());

    let archivo = ficha
        .and_then(|f| f.icono_archivo.as_deref())
        .and_then(|ruta| crate::medios::icono_a_png(std::path::Path::new(ruta), cache))
        .map(|png| png.to_string_lossy().to_string());

    Icono { tema, archivo }
}

fn detalle(
    alpm: &Alpm,
    catalogo: &Catalogo,
    cache: &PathBuf,
    nombre: &str,
) -> Option<(Detalle, Vec<catalogo::Captura>)> {
    let paquete = buscar_paquete(alpm, nombre)?;
    let instalado = alpm.localdb().pkg(nombre).ok();
    let ficha = catalogo.de(nombre);

    let detalle = Detalle {
        tarjeta: tarjeta(alpm, catalogo, cache, paquete, instalado.is_some()),
        descripcion: ficha
            .map(|f| f.descripcion.clone())
            .filter(|d| !d.is_empty())
            .or_else(|| paquete.desc().map(|d| d.to_string()))
            .unwrap_or_default(),
        capturas: Vec::new(),
        web: ficha
            .and_then(|f| f.web.clone())
            .or_else(|| paquete.url().map(|u| u.to_string())),
        licencia: ficha.and_then(|f| f.licencia.clone()).or_else(|| {
            let licencias: Vec<String> = paquete.licenses().iter().map(|l| l.to_string()).collect();
            (!licencias.is_empty()).then(|| licencias.join(", "))
        }),
        autor: ficha.and_then(|f| f.autor.clone()),
        empaquetador: paquete.packager().map(|p| p.to_string()),
        arquitectura: paquete.arch().map(|a| a.to_string()),
        descarga: paquete.download_size(),
        construido: paquete.build_date(),
        instalado_el: instalado.and_then(|p| p.install_date()),
        dependencias: paquete.depends().iter().map(|d| d.to_string()).collect(),
        opcionales: paquete.optdepends().iter().map(|d| d.to_string()).collect(),
        // Sólo tiene sentido para lo instalado: de un paquete que no está,
        // libalpm no puede saber quién lo necesitaría.
        requerido_por: instalado
            .map(|p| p.required_by().iter().map(|n| n.to_string()).collect())
            .unwrap_or_default(),
    };

    Some((
        detalle,
        ficha.map(|f| f.capturas.clone()).unwrap_or_default(),
    ))
}

/// Pone en la ficha las capturas ya bajadas.
pub fn con_capturas(detalle: &mut Detalle, bajadas: Vec<(PathBuf, String)>) {
    detalle.capturas = bajadas
        .into_iter()
        .map(|(ruta, titulo)| Captura {
            ruta: ruta.to_string_lossy().to_string(),
            titulo,
        })
        .collect();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_nombre_exacto_gana_siempre() {
        let exacto = puntaje("git", "git", "").unwrap();
        let empieza = puntaje("git", "gitg", "").unwrap();
        let contiene = puntaje("git", "libgit2", "").unwrap();
        let descripcion = puntaje("git", "tig", "cliente de texto para git").unwrap();
        assert!(exacto > empieza);
        assert!(empieza > contiene);
        assert!(contiene > descripcion);
    }

    #[test]
    fn entre_dos_que_empiezan_igual_gana_el_mas_corto() {
        let corto = puntaje("git", "git-lfs", "").unwrap();
        let largo = puntaje("git", "git-annex-remote-rclone", "").unwrap();
        assert!(corto > largo, "{corto} no es mayor que {largo}");
    }

    #[test]
    fn lo_que_no_coincide_en_nada_no_entra() {
        assert_eq!(puntaje("git", "firefox", "un navegador"), None);
    }

    #[test]
    fn la_busqueda_no_distingue_mayusculas() {
        assert_eq!(puntaje("GIT", "git", ""), puntaje("git", "git", ""));
        assert!(puntaje("FireFox", "firefox", "").is_some());
    }

    #[test]
    fn sin_consulta_entra_todo() {
        // Es lo que hace que la lista de instaladas se muestre entera cuando el
        // campo de búsqueda está vacío.
        assert!(puntaje("", "cualquiera", "").is_some());
        assert!(puntaje("   ", "cualquiera", "").is_some());
    }

    #[test]
    fn el_sorteo_es_el_mismo_todo_el_dia_y_cambia_al_siguiente() {
        assert_eq!(sorteo("firefox", 100), sorteo("firefox", 100));
        assert_ne!(sorteo("firefox", 100), sorteo("firefox", 101));
        assert_ne!(sorteo("firefox", 100), sorteo("gimp", 100));
    }

    #[test]
    fn cada_categoria_tiene_su_icono_y_ninguna_queda_sin_uno() {
        for (id, _) in catalogo::CATEGORIAS {
            assert!(!icono_de_categoria(id).is_empty(), "{id} sin ícono");
        }
    }
}
