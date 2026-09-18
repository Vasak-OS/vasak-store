//! Lo que la ventana puede pedir.
//!
//! **Todos son `async`, sin excepción.** No es estilo: Tauri despacha los
//! comandos que no son `async` en el hilo principal, que es el de GTK, y ahí
//! cualquier cosa que tarde congela la ventana entera —ni se dibuja, ni se puede
//! mover, ni se cierra—. En esta aplicación casi todo tarda: abrir libalpm, leer
//! veinte megas de catálogo, hablar con un servidor. Un solo comando sin `async`
//! alcanza para que la tienda parezca colgada.

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, State};
use vasak_store_protocol::repositorios::Repositorio;
use vasak_store_protocol::Previsualizacion;

use crate::appimage::{self, AppImage};
use crate::aur;
use crate::cliente::{Cliente, Final, Linea};
use crate::lector::Lector;
use crate::medios;
use crate::tipos::{Descubrimiento, Detalle, Pagina, Tarjeta};

/// Cuántos resultados vuelven de una búsqueda si no se pide otra cosa.
///
/// Los repositorios tienen más de quince mil paquetes y la lista es virtual,
/// pero serializar quince mil tarjetas a JSON en cada tecla sí se nota.
const LIMITE: usize = 60;

/// Lo que los comandos comparten.
pub struct Estado {
    pub lector: Lector,
    /// El cliente del demonio, cuando la conexión ya está.
    ///
    /// Llega después: conectarse al bus del sistema es asíncrono y el arranque
    /// no espera por eso. Una ventana que no abre porque el servicio tarda es
    /// peor que una que abre y dice que todavía no puede instalar.
    pub cliente: OnceLock<Cliente>,
    /// `~/.cache/vasak-store`, donde van íconos y capturas.
    pub cache: PathBuf,
    /// `~/.local/share/vasak-store`, donde viven los AppImage.
    pub datos: PathBuf,
    /// El directorio de la persona, para el `.desktop` del menú.
    pub inicio: PathBuf,
    pub http: reqwest::Client,
    /// La última lista de AppImage, con cuándo se armó.
    ///
    /// Buscarlos es recorrer la carpeta de la persona, y la búsqueda de la
    /// tienda los incluye: sin esto, cada tecla recorría el disco. Se guarda un
    /// rato corto —lo justo para que una búsqueda no lo repita— y se tira al
    /// integrar o quitar uno, que son los dos momentos en que cambia.
    pub appimages: Mutex<Option<(Instant, Vec<AppImage>)>>,
}

/// Cuánto vale la lista de AppImage guardada.
const VIGENCIA: Duration = Duration::from_secs(15);

impl Estado {
    fn servicio(&self) -> Result<&Cliente, String> {
        self.cliente
            .get()
            .ok_or_else(|| "no hay conexión con el servicio de paquetes".to_string())
    }

    /// Los AppImage, del disco o de lo guardado hace poco.
    ///
    /// El recorrido va a `spawn_blocking`: son operaciones de archivo
    /// sincrónicas, y hacerlas en una tarea de tokio ocupa un hilo del ejecutor
    /// mientras dure. Con una carpeta grande, eso es la ventana entera esperando.
    async fn appimages(&self) -> Vec<AppImage> {
        if let Ok(guardado) = self.appimages.lock() {
            if let Some((cuando, lista)) = guardado.as_ref() {
                if cuando.elapsed() < VIGENCIA {
                    return lista.clone();
                }
            }
        }

        let datos = self.datos.clone();
        let inicio = self.inicio.clone();
        let lista = tauri::async_runtime::spawn_blocking(move || appimage::listar(&datos, &inicio))
            .await
            .unwrap_or_default();

        if let Ok(mut guardado) = self.appimages.lock() {
            *guardado = Some((Instant::now(), lista.clone()));
        }
        lista
    }

    /// Olvida la lista guardada. Se llama tras integrar o quitar uno.
    fn olvidar_appimages(&self) {
        if let Ok(mut guardado) = self.appimages.lock() {
            *guardado = None;
        }
    }
}

#[tauri::command]
pub async fn descubrir(estado: State<'_, Estado>) -> Result<Descubrimiento, String> {
    let mut portada = estado.lector.descubrir().await;

    // Las capturas de la fila destacada se bajan acá, en paralelo, y recién
    // entonces la tarjeta lleva una ruta local. Son doce y quedan en la caché,
    // así que esto cuesta una vez.
    //
    // La que no se pueda bajar queda sin captura y la tarjeta se dibuja con su
    // ícono sobre un degradado: sin red, la portada se ve distinta pero se ve.
    let bajadas = futures_util::future::join_all(portada.seleccion.iter().map(|tarjeta| {
        let cache = estado.cache.clone();
        let http = estado.http.clone();
        let url = tarjeta.captura.clone();
        async move {
            match url {
                Some(url) => medios::traer_captura(&url, &cache, &http)
                    .await
                    .map(|ruta| ruta.to_string_lossy().to_string()),
                None => None,
            }
        }
    }))
    .await;

    for (tarjeta, bajada) in portada.seleccion.iter_mut().zip(bajadas) {
        tarjeta.captura = bajada;
    }

    Ok(portada)
}

/// Busca en los repositorios y, si se pide, también en el AUR.
///
/// El AUR va después y aparte: son dos fuentes con dos niveles de confianza
/// distintos, y mezclarlas ordenadas por relevancia haría que un paquete que
/// alguien subió ayer pueda aparecer antes que el oficial con el mismo nombre.
#[tauri::command]
pub async fn buscar(
    estado: State<'_, Estado>,
    texto: String,
    incluir_aur: bool,
    limite: Option<usize>,
) -> Result<Pagina, String> {
    let limite = limite.unwrap_or(LIMITE);
    let mut pagina = estado.lector.buscar(texto.clone(), limite).await;

    // Los AppImage van primero: son pocos y son de la persona, así que si uno
    // coincide es casi seguro el que buscaba.
    let suyos: Vec<Tarjeta> = estado
        .appimages()
        .await
        .iter()
        .filter(|a| crate::lector::puntaje(&texto, &a.id, &a.titulo).is_some())
        .map(|a| a.como_tarjeta())
        .collect();
    pagina.total += suyos.len();
    for (posicion, tarjeta) in suyos.into_iter().enumerate() {
        pagina.resultados.insert(posicion, tarjeta);
    }

    if incluir_aur {
        // Un fallo del AUR no puede llevarse puesta la búsqueda: si no hay red,
        // lo de los repositorios sigue estando y es lo que importa.
        if let Ok(del_aur) = aur::buscar(&texto).await {
            let ya_estan: HashSet<String> =
                pagina.resultados.iter().map(|t| t.nombre.clone()).collect();
            let suman: Vec<Tarjeta> = del_aur
                .into_iter()
                .filter(|t| !ya_estan.contains(&t.nombre))
                .collect();
            pagina.total += suman.len();
            pagina.resultados.extend(suman);
        }
    }

    // El límite se aplica al final y no a cada fuente: pedir sesenta y recibir
    // ciento veinte —sesenta de cada lado— es lo que hacía antes, y la lista
    // terminaba con el doble de lo que se pidió.
    pagina.resultados.truncate(limite);

    Ok(pagina)
}

#[tauri::command]
pub async fn instaladas(estado: State<'_, Estado>, texto: String) -> Result<Pagina, String> {
    Ok(estado.lector.instaladas(texto).await)
}

#[tauri::command]
pub async fn actualizaciones(estado: State<'_, Estado>) -> Result<Vec<Tarjeta>, String> {
    Ok(estado.lector.actualizaciones().await)
}

#[tauri::command]
pub async fn de_categoria(
    estado: State<'_, Estado>,
    categoria: String,
    limite: Option<usize>,
) -> Result<Pagina, String> {
    Ok(estado
        .lector
        .de_categoria(categoria, limite.unwrap_or(LIMITE))
        .await)
}

/// La ficha entera, con las capturas ya bajadas al disco.
#[tauri::command]
pub async fn detalle(
    estado: State<'_, Estado>,
    nombre: String,
    del_aur: bool,
) -> Result<Detalle, String> {
    if del_aur {
        return aur::detalle(&nombre)
            .await?
            .ok_or_else(|| format!("el AUR no tiene ningún paquete llamado {nombre}"));
    }

    let (mut detalle, capturas) = estado
        .lector
        .detalle(nombre.clone())
        .await
        .ok_or_else(|| format!("no hay ningún paquete llamado {nombre}"))?;

    // Las capturas se bajan en paralelo: son tres o cuatro servidores
    // distintos y esperarlos de a uno multiplica la espera por cuatro.
    let bajadas = futures_util::future::join_all(capturas.into_iter().map(|captura| {
        let cache = estado.cache.clone();
        let http = estado.http.clone();
        async move {
            medios::traer_captura(&captura.url, &cache, &http)
                .await
                .map(|ruta| (ruta, captura.titulo))
        }
    }))
    .await;

    crate::lector::con_capturas(&mut detalle, bajadas.into_iter().flatten().collect());
    Ok(detalle)
}

/// El PKGBUILD de un paquete del AUR, para poder leerlo antes de compilarlo.
#[tauri::command]
pub async fn receta_del_aur(nombre: String) -> Result<String, String> {
    aur::receta(&nombre).await
}

#[tauri::command]
pub async fn previsualizar(
    estado: State<'_, Estado>,
    operacion: String,
    paquetes: Vec<String>,
    con_huerfanas: bool,
) -> Result<Previsualizacion, String> {
    estado
        .servicio()?
        .previsualizar(&operacion, paquetes, con_huerfanas)
        .await
}

#[tauri::command]
pub async fn instalar(estado: State<'_, Estado>, paquetes: Vec<String>) -> Result<String, String> {
    estado.servicio()?.instalar(paquetes).await
}

#[tauri::command]
pub async fn quitar(
    estado: State<'_, Estado>,
    paquetes: Vec<String>,
    con_huerfanas: bool,
) -> Result<String, String> {
    estado.servicio()?.quitar(paquetes, con_huerfanas).await
}

#[tauri::command]
pub async fn actualizar_todo(estado: State<'_, Estado>) -> Result<String, String> {
    estado.servicio()?.actualizar().await
}

#[tauri::command]
pub async fn sincronizar(estado: State<'_, Estado>) -> Result<String, String> {
    estado.servicio()?.sincronizar().await
}

/// Vuelve a abrir las bases de datos. Se llama cuando una operación termina.
#[tauri::command]
pub async fn recargar(estado: State<'_, Estado>) -> Result<(), String> {
    estado.lector.recargar().await;
    Ok(())
}

/// Compila algo del AUR y lo instala.
///
/// Devuelve el identificador en el acto y sigue trabajando en segundo plano: el
/// proceso son varios minutos —clonar, compilar, instalar— y la ventana tiene
/// que poder mostrar el registro mientras tanto. Los avances salen por los
/// mismos eventos que los del demonio, así que la pantalla no distingue.
#[tauri::command]
pub async fn instalar_del_aur(
    app: AppHandle,
    estado: State<'_, Estado>,
    nombre: String,
) -> Result<String, String> {
    let cliente = estado.servicio()?.clone();
    let lector = estado.lector.clone();
    let trabajo = aur::directorio_de_trabajo(&estado.cache);
    let id = format!("aur:{nombre}");

    let devuelto = id.clone();
    tauri::async_runtime::spawn(async move {
        let error = compilar_e_instalar(&app, &cliente, &lector, &nombre, &trabajo, &id)
            .await
            .err()
            .unwrap_or_default();
        lector.recargar().await;
        let _ = app.emit("tienda://terminada", Final { id, error });
    });

    Ok(devuelto)
}

async fn compilar_e_instalar(
    app: &AppHandle,
    cliente: &Cliente,
    lector: &Lector,
    nombre: &str,
    trabajo: &std::path::Path,
    id: &str,
) -> Result<(), String> {
    let registrar = {
        let app = app.clone();
        let id = id.to_string();
        move |texto: String| {
            let _ = app.emit(
                "tienda://registro",
                Linea {
                    id: id.clone(),
                    texto,
                },
            );
        }
    };

    registrar(format!("resolviendo las dependencias de {nombre}"));
    let (instalados, disponibles) = lector.nombres().await;
    let plan = aur::planificar(
        nombre,
        |n| instalados.contains(n),
        |n| disponibles.contains(n),
    )
    .await?;

    if !plan.del_repositorio.is_empty() {
        registrar(format!(
            "instalando desde los repositorios: {}",
            plan.del_repositorio.join(", ")
        ));
        cliente
            .hacer_y_esperar("Instalar", &(plan.del_repositorio.clone(),))
            .await?;
    }

    for paquete in &plan.del_aur {
        registrar(format!("compilando {paquete}"));
        let construidos = aur::construir(paquete, trabajo, registrar.clone()).await?;
        registrar(format!("instalando {paquete}"));
        cliente
            .hacer_y_esperar("InstalarArchivos", &(construidos,))
            .await?;
    }

    Ok(())
}

/// Los repositorios configurados, leyendo `pacman.conf` acá mismo.
///
/// No pasa por el demonio, y eso es el arreglo de un error de diseño: pasaba, y
/// entonces la pantalla se veía **vacía** en cualquier máquina sin el servicio
/// instalado. `pacman.conf` es legible por cualquiera; despertar a un proceso
/// con root para que cuente qué dice era pedirle permiso a alguien para mirar
/// algo público. Escribir sí sigue siendo del demonio, que es donde hace falta.
#[tauri::command]
pub async fn repositorios() -> Result<Vec<Repositorio>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let texto =
            std::fs::read_to_string(vasak_store_protocol::repositorios::RUTA).map_err(|e| {
                format!(
                    "no se pudo leer {}: {e}",
                    vasak_store_protocol::repositorios::RUTA
                )
            })?;
        Ok(vasak_store_protocol::repositorios::analizar(&texto))
    })
    .await
    .map_err(|e| format!("no se pudo leer la configuración: {e}"))?
}

#[tauri::command]
pub async fn cambiar_repositorio(
    estado: State<'_, Estado>,
    nombre: String,
    activo: bool,
) -> Result<(), String> {
    estado
        .servicio()?
        .cambiar_repositorio(&nombre, activo)
        .await
}

#[tauri::command]
pub async fn agregar_repositorio(
    estado: State<'_, Estado>,
    nombre: String,
    servidor: String,
    siglevel: String,
) -> Result<(), String> {
    estado
        .servicio()?
        .agregar_repositorio(&nombre, &servidor, &siglevel)
        .await
}

#[tauri::command]
pub async fn quitar_repositorio(estado: State<'_, Estado>, nombre: String) -> Result<(), String> {
    estado.servicio()?.quitar_repositorio(&nombre).await
}

#[tauri::command]
pub async fn appimages(estado: State<'_, Estado>) -> Result<Vec<AppImage>, String> {
    Ok(estado.appimages().await)
}

#[tauri::command]
pub async fn integrar_appimage(
    estado: State<'_, Estado>,
    ruta: String,
) -> Result<AppImage, String> {
    let datos = estado.datos.clone();
    let inicio = estado.inicio.clone();
    // Copiar un archivo de varios cientos de megas bloquea; va al pozo de hilos.
    let integrado = tauri::async_runtime::spawn_blocking(move || {
        appimage::integrar(std::path::Path::new(&ruta), &datos, &inicio)
    })
    .await
    .map_err(|e| format!("no se pudo integrar: {e}"))?;
    estado.olvidar_appimages();
    integrado
}

#[tauri::command]
pub async fn quitar_appimage(estado: State<'_, Estado>, ruta: String) -> Result<(), String> {
    let resultado = appimage::quitar(&ruta, &estado.datos, &estado.inicio);
    estado.olvidar_appimages();
    resultado
}

/// Arranca un AppImage.
///
/// Se identifica por ruta y no por nombre porque ahora la lista incluye los que
/// ya estaban en la carpeta de la persona, que no viven en el directorio de la
/// tienda. La comprobación de que esté bajo `$HOME` la hace `ruta_ejecutable`.
#[tauri::command]
pub async fn ejecutar_appimage(estado: State<'_, Estado>, ruta: String) -> Result<(), String> {
    let ruta = appimage::ruta_ejecutable(&ruta, &estado.inicio)?;
    std::process::Command::new(&ruta)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("no se pudo ejecutar: {e}"))
}
