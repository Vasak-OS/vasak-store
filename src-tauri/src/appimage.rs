//! Los AppImage: integrarlos, listarlos y sacarlos.
//!
//! En la jerarquía de la distribución el AppImage es «lo adicional»: un archivo
//! que la persona bajó, que no pasó por ninguna revisión y que no tiene firma
//! que comprobar. Por eso vive bajo `$HOME` y no en `/usr`, que además es donde
//! se engancha el perfil `vasak-appimage` de AppArmor —el que le cierra la
//! cámara, el micrófono y las credenciales—. Moverlo fuera de `$HOME` sería
//! sacarlo de ese perfil.
//!
//! ## Por qué el `.desktop` no sale del propio AppImage
//!
//! Un AppImage trae adentro su `.desktop` y su ícono, y se pueden sacar con
//! `--appimage-extract`. Pero esa bandera **la implementa el propio AppImage**:
//! extraer es ejecutarlo. Integrar un archivo que alguien acaba de bajar no
//! puede significar correrlo, así que el `.desktop` se escribe acá con el nombre
//! del archivo y un ícono genérico. Se ejecuta cuando la persona lo pide, no
//! cuando lo suelta en la ventana.

use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use serde::Serialize;

/// Un AppImage que la tienda administra.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct AppImage {
    /// El nombre del archivo sin la extensión. Es la clave.
    pub id: String,
    /// Cómo se muestra.
    pub titulo: String,
    pub ruta: String,
    /// Lo que ocupa, en bytes.
    pub tamano: u64,
    /// Cuándo se integró, en segundos desde época.
    pub integrado: i64,
    /// Si el `.desktop` que lo pone en el menú existe.
    pub en_el_menu: bool,
}

impl AppImage {
    /// El AppImage visto como una tarjeta más de la tienda.
    ///
    /// Existe para que el filtro por origen signifique algo: buscar «obsidian»
    /// con el filtro en AppImage tiene que encontrar el que la persona integró,
    /// y para eso los tres orígenes tienen que hablar el mismo idioma.
    pub fn como_tarjeta(&self) -> crate::tipos::Tarjeta {
        crate::tipos::Tarjeta {
            nombre: self.id.clone(),
            titulo: self.titulo.clone(),
            resumen: String::new(),
            version: String::new(),
            origen: crate::tipos::Origen::Appimage,
            repositorio: "appimage".to_string(),
            instalada: true,
            actualizable: None,
            tamano: self.tamano as i64,
            // Genérico y no el de la aplicación: sacar el ícono de adentro del
            // AppImage es ejecutarlo. Ver el comentario de arriba.
            icono: crate::tipos::Icono::Tema("application-x-executable".to_string()),
            categorias: Vec::new(),
            votos: None,
            popularidad: None,
            actualizado: Some(self.integrado),
        }
    }
}

/// Dónde viven los AppImage que administra la tienda.
pub fn directorio(datos: &Path) -> PathBuf {
    datos.join("appimages")
}

/// Dónde van los `.desktop`.
///
/// El de siempre de XDG, que es el que lee el lanzador del escritorio.
pub fn directorio_del_menu(inicio: &Path) -> PathBuf {
    inicio.join(".local/share/applications")
}

/// Los que están integrados.
pub fn listar(datos: &Path, inicio: &Path) -> Vec<AppImage> {
    let Ok(entradas) = std::fs::read_dir(directorio(datos)) else {
        return Vec::new();
    };
    let mut lista: Vec<AppImage> = entradas
        .flatten()
        .filter_map(|entrada| {
            let ruta = entrada.path();
            if !es_appimage(&ruta) {
                return None;
            }
            let metadatos = entrada.metadata().ok()?;
            let id = identificador(&ruta)?;
            Some(AppImage {
                titulo: titulo_de(&id),
                en_el_menu: archivo_de_menu(inicio, &id).is_file(),
                id,
                ruta: ruta.to_string_lossy().to_string(),
                tamano: metadatos.len(),
                integrado: metadatos
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0),
            })
        })
        .collect();
    lista.sort_by(|a, b| a.titulo.to_lowercase().cmp(&b.titulo.to_lowercase()));
    lista
}

/// Si el archivo tiene pinta de AppImage.
///
/// Por la extensión y sin distinguir mayúsculas, que es como los publican:
/// `.AppImage`, `.appimage` y todo lo del medio.
pub fn es_appimage(ruta: &Path) -> bool {
    ruta.extension()
        .map(|e| e.to_string_lossy().to_lowercase() == "appimage")
        .unwrap_or(false)
}

/// El identificador de un archivo: su nombre sin la extensión, saneado.
///
/// Se sanea porque este texto termina siendo parte de un nombre de archivo
/// —el `.desktop`— y porque llega desde la ventana. Un nombre con `/` o con
/// `..` escribiría fuera del directorio del menú.
pub fn identificador(ruta: &Path) -> Option<String> {
    let base = ruta.file_stem()?.to_string_lossy().to_string();
    let saneado: String = base
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') {
                c
            } else {
                '-'
            }
        })
        .collect();
    let saneado = saneado.trim_matches(['.', '-']).to_string();
    (!saneado.is_empty()).then_some(saneado)
}

/// El nombre que se muestra: el identificador con los separadores hechos espacios.
pub fn titulo_de(id: &str) -> String {
    let limpio = id.replace(['-', '_'], " ");
    let limpio = limpio.trim();
    let mut letras = limpio.chars();
    match letras.next() {
        Some(primera) => primera.to_uppercase().collect::<String>() + letras.as_str(),
        None => id.to_string(),
    }
}

fn archivo_de_menu(inicio: &Path, id: &str) -> PathBuf {
    directorio_del_menu(inicio).join(format!("vasak-store-{id}.desktop"))
}

/// Copia el archivo al directorio de la tienda, lo hace ejecutable y lo pone en el menú.
pub fn integrar(origen: &Path, datos: &Path, inicio: &Path) -> Result<AppImage, String> {
    if !es_appimage(origen) {
        return Err("el archivo no termina en .AppImage".to_string());
    }
    if !origen.is_file() {
        return Err("el archivo no existe".to_string());
    }
    let id = identificador(origen).ok_or("el nombre del archivo no sirve como identificador")?;

    let destino_dir = directorio(datos);
    std::fs::create_dir_all(&destino_dir)
        .map_err(|e| format!("no se pudo crear {}: {e}", destino_dir.display()))?;
    let destino = destino_dir.join(format!("{id}.AppImage"));

    // Se copia y no se mueve: el archivo original puede estar en Descargas, en
    // un pendrive o en otro sistema de archivos —donde `rename` ni siquiera
    // funciona—, y llevárselo de donde la persona lo dejó es una sorpresa.
    if origen != destino {
        std::fs::copy(origen, &destino)
            .map_err(|e| format!("no se pudo copiar el archivo: {e}"))?;
    }
    std::fs::set_permissions(&destino, std::fs::Permissions::from_mode(0o755))
        .map_err(|e| format!("no se pudo hacer ejecutable el archivo: {e}"))?;

    escribir_desktop(&destino, &id, inicio)?;

    let metadatos = std::fs::metadata(&destino).map_err(|e| e.to_string())?;
    Ok(AppImage {
        titulo: titulo_de(&id),
        en_el_menu: true,
        id,
        ruta: destino.to_string_lossy().to_string(),
        tamano: metadatos.len(),
        integrado: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0),
    })
}

/// Escribe el `.desktop` que lo pone en el menú de aplicaciones.
pub fn escribir_desktop(destino: &Path, id: &str, inicio: &Path) -> Result<(), String> {
    let menu = directorio_del_menu(inicio);
    std::fs::create_dir_all(&menu)
        .map_err(|e| format!("no se pudo crear {}: {e}", menu.display()))?;
    std::fs::write(archivo_de_menu(inicio, id), contenido_desktop(destino, id))
        .map_err(|e| format!("no se pudo escribir la entrada del menú: {e}"))
}

/// El texto del `.desktop`.
///
/// `Exec` va con la ruta entre comillas: los AppImage se bajan con nombres que
/// traen espacios y paréntesis —`App (1).AppImage`— y sin comillas el lanzador
/// parte el comando en pedazos y no arranca nada.
pub fn contenido_desktop(destino: &Path, id: &str) -> String {
    format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name={}\n\
         Exec=\"{}\" %U\n\
         Icon=application-x-executable\n\
         Terminal=false\n\
         Categories=Utility;\n\
         X-VasakStore-AppImage={}\n",
        titulo_de(id),
        destino.display(),
        id
    )
}

/// Saca un AppImage y su entrada del menú.
pub fn quitar(id: &str, datos: &Path, inicio: &Path) -> Result<(), String> {
    let id = identificador(Path::new(id)).ok_or("identificador inválido")?;
    let archivo = directorio(datos).join(format!("{id}.AppImage"));
    if archivo.is_file() {
        std::fs::remove_file(&archivo).map_err(|e| format!("no se pudo borrar el archivo: {e}"))?;
    }
    let entrada = archivo_de_menu(inicio, &id);
    if entrada.is_file() {
        let _ = std::fs::remove_file(entrada);
    }
    Ok(())
}

/// La ruta de un AppImage administrado, si existe.
pub fn ruta_de(id: &str, datos: &Path) -> Option<PathBuf> {
    let id = identificador(Path::new(id))?;
    let archivo = directorio(datos).join(format!("{id}.AppImage"));
    archivo.is_file().then_some(archivo)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn se_reconoce_la_extension_venga_como_venga() {
        assert!(es_appimage(Path::new("/x/Cosa.AppImage")));
        assert!(es_appimage(Path::new("/x/cosa.appimage")));
        assert!(es_appimage(Path::new("/x/cosa.APPIMAGE")));
        assert!(!es_appimage(Path::new("/x/cosa.tar.gz")));
        assert!(!es_appimage(Path::new("/x/cosa")));
    }

    #[test]
    fn el_identificador_no_puede_salirse_del_directorio() {
        // Lo que importa: esto forma parte de un nombre de archivo que se
        // escribe en el directorio del menú.
        assert_eq!(
            identificador(Path::new("../../etc/passwd.AppImage")).as_deref(),
            Some("passwd")
        );
        assert_eq!(
            identificador(Path::new("/x/mi app (1).AppImage")).as_deref(),
            Some("mi-app--1")
        );
        assert_eq!(identificador(Path::new("/x/....AppImage")), None);
    }

    #[test]
    fn el_titulo_se_lee_como_un_nombre() {
        assert_eq!(titulo_de("mi-programa"), "Mi programa");
        assert_eq!(titulo_de("Obsidian_1.5.3"), "Obsidian 1.5.3");
    }

    #[test]
    fn el_desktop_entrecomilla_la_ruta() {
        // Sin comillas, `App (1).AppImage` deja de arrancar.
        let texto = contenido_desktop(Path::new("/home/x/App (1).AppImage"), "app-1");
        assert!(
            texto.contains("Exec=\"/home/x/App (1).AppImage\" %U"),
            "{texto}"
        );
        assert!(texto.contains("X-VasakStore-AppImage=app-1"));
    }

    #[test]
    fn integrar_copia_hace_ejecutable_y_pone_en_el_menu() {
        let temporal = tempfile::tempdir().unwrap();
        let datos = temporal.path().join("datos");
        let inicio = temporal.path().join("inicio");
        let origen = temporal.path().join("Mi App.AppImage");
        std::fs::write(&origen, b"no importa el contenido").unwrap();

        let integrado = integrar(&origen, &datos, &inicio).unwrap();
        assert_eq!(integrado.id, "Mi-App");
        assert!(integrado.en_el_menu);

        let copia = directorio(&datos).join("Mi-App.AppImage");
        assert!(copia.is_file(), "no se copió");
        assert!(origen.is_file(), "se llevó el original de su lugar");
        let modo = std::fs::metadata(&copia).unwrap().permissions().mode();
        assert_eq!(modo & 0o111, 0o111, "no quedó ejecutable");

        assert!(directorio_del_menu(&inicio)
            .join("vasak-store-Mi-App.desktop")
            .is_file());

        // Y aparece en la lista.
        let lista = listar(&datos, &inicio);
        assert_eq!(lista.len(), 1);
        assert_eq!(lista[0].id, "Mi-App");
    }

    #[test]
    fn quitar_se_lleva_el_archivo_y_la_entrada() {
        let temporal = tempfile::tempdir().unwrap();
        let datos = temporal.path().join("datos");
        let inicio = temporal.path().join("inicio");
        let origen = temporal.path().join("Otra.AppImage");
        std::fs::write(&origen, b"x").unwrap();
        integrar(&origen, &datos, &inicio).unwrap();

        quitar("Otra", &datos, &inicio).unwrap();
        assert!(listar(&datos, &inicio).is_empty());
        assert!(!directorio_del_menu(&inicio)
            .join("vasak-store-Otra.desktop")
            .is_file());
    }

    #[test]
    fn lo_que_no_es_un_appimage_no_se_integra() {
        let temporal = tempfile::tempdir().unwrap();
        let origen = temporal.path().join("cosa.tar.gz");
        std::fs::write(&origen, b"x").unwrap();
        assert!(integrar(&origen, temporal.path(), temporal.path()).is_err());
    }
}
