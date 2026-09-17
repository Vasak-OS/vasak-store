//! La tienda de aplicaciones de VasakOS.
//!
//! El reparto de responsabilidades, que es lo que explica la forma del
//! repositorio:
//!
//! - `lector` lee las bases de datos de pacman. Sin privilegios, en el proceso
//!   de la ventana, en un hilo propio porque el handle de libalpm no se puede
//!   mover entre hilos.
//! - `cliente` habla con el demonio, que es el único que cambia algo.
//! - `catalogo` y `medios` traen lo que hace que un paquete se vea como un
//!   programa y no como una línea de `pacman -Sl`.
//! - `aur` y `appimage` son las otras dos fuentes de la jerarquía de confianza
//!   de la distribución.

mod appimage;
mod aur;
// Público para que las pruebas de integración puedan medir el analizador de
// AppStream contra el catálogo de verdad, que son veinte megas y no entran en
// una prueba unitaria.
pub mod catalogo;
mod cliente;
mod comandos;
mod lector;
mod locales;
mod medios;
mod tipos;

use std::path::PathBuf;

use cliente::Cliente;
use lector::Lector;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // El diario del sistema, con el nombre de esta aplicación. Va
        // **primero** de todos los plugins: instala el gancho de pánico, y un
        // pánico mientras arranca otro plugin es de los más probables y de los
        // que menos rastro dejan.
        .plugin(tauri_plugin_vsk_journal::init())
        // El idioma de la sesión, con la ruta explícita de los catálogos: el
        // plugin sólo prueba rutas relativas al ejecutable y al directorio de
        // trabajo, y ninguna existe cuando el binario está en /usr/bin.
        .plugin(tauri_plugin_i18n_vsk::init_with_path(
            Some(locales::idioma_del_sistema()),
            locales::directorio(),
        ))
        .plugin(tauri_plugin_vsk_contextual_menu::init())
        .plugin(tauri_plugin_config_manager::init())
        .plugin(tauri_plugin_vicons::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            use tauri::Manager;

            let idioma = locales::idioma_del_sistema();
            let (cache, datos, inicio) = directorios(app.handle());

            let estado = comandos::Estado {
                lector: Lector::arrancar(idioma, cache.clone()),
                cliente: std::sync::OnceLock::new(),
                cache,
                datos,
                inicio,
                http: reqwest::Client::builder()
                    // Sin esto, cada captura que no contesta deja una conexión
                    // colgada hasta que el sistema operativo se aburre.
                    .connect_timeout(std::time::Duration::from_secs(10))
                    .user_agent(concat!("vasak-store/", env!("CARGO_PKG_VERSION")))
                    .build()
                    .unwrap_or_default(),
            };
            app.manage(estado);

            // La conexión con el demonio se abre aparte y sin bloquear el
            // arranque: si el servicio no está —una instalación a medias, un
            // D-Bus sin la política puesta— la ventana tiene que abrir igual y
            // decir qué falta, no quedarse en negro.
            let mango = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match Cliente::conectar().await {
                    Ok(cliente) => {
                        let _ = mango
                            .state::<comandos::Estado>()
                            .cliente
                            .set(cliente.clone());
                        // Y se queda escuchando las señales del demonio para
                        // reemitirlas a la ventana.
                        cliente.escuchar(mango.clone()).await;
                    }
                    Err(razon) => {
                        eprintln!("[tienda] sin servicio de paquetes: {razon}");
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            comandos::descubrir,
            comandos::buscar,
            comandos::instaladas,
            comandos::actualizaciones,
            comandos::de_categoria,
            comandos::detalle,
            comandos::receta_del_aur,
            comandos::previsualizar,
            comandos::instalar,
            comandos::quitar,
            comandos::actualizar_todo,
            comandos::sincronizar,
            comandos::recargar,
            comandos::instalar_del_aur,
            comandos::repositorios,
            comandos::cambiar_repositorio,
            comandos::agregar_repositorio,
            comandos::quitar_repositorio,
            comandos::appimages,
            comandos::integrar_appimage,
            comandos::quitar_appimage,
            comandos::ejecutar_appimage,
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar la aplicación");
}

/// Los tres directorios que la tienda usa.
///
/// Se piden a Tauri, que respeta las variables de XDG; el respaldo es para el
/// caso raro de que no pueda resolverlos, donde es mejor escribir en un lugar
/// previsible que no arrancar.
fn directorios(app: &tauri::AppHandle) -> (PathBuf, PathBuf, PathBuf) {
    use tauri::Manager;

    let inicio = app
        .path()
        .home_dir()
        .unwrap_or_else(|_| PathBuf::from(std::env::var("HOME").unwrap_or_default()));
    let cache = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| inicio.join(".cache/vasak-store"));
    let datos = app
        .path()
        .app_local_data_dir()
        .unwrap_or_else(|_| inicio.join(".local/share/vasak-store"));

    (cache, datos, inicio)
}
