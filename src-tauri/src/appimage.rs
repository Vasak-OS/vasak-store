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
    /// Si vive en el directorio de la tienda, o sea si lo integramos nosotros.
    ///
    /// Los que no —los que estaban en la carpeta de la persona desde antes— se
    /// listan igual y se pueden abrir; lo que no se puede es borrarlos, que no
    /// es asunto de la tienda.
    pub administrado: bool,
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
            icono: crate::tipos::Icono::del_tema("application-x-executable"),
            categorias: Vec::new(),
            votos: None,
            popularidad: None,
            actualizado: Some(self.integrado),
            captura: None,
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

/// Hasta dónde se busca dentro de la carpeta de la persona.
///
/// Tres niveles alcanzan para `~/Aplicaciones`, `~/Descargas` y
/// `~/Apps/loquesea`, que es donde la gente los deja. Recorrer el hogar entero
/// sería caro y encontraría copias de seguridad y árboles de proyectos.
const HONDURA: usize = 3;

/// Los AppImage que hay: los que integramos y los que ya estaban.
///
/// Listar sólo los nuestros era lo que hacía que la sección se viera vacía en
/// una máquina con AppImage adentro: la persona los ve en su carpeta y la
/// tienda decía que no había ninguno.
pub fn listar(datos: &Path, inicio: &Path) -> Vec<AppImage> {
    let propio = directorio(datos);
    let mut lista: Vec<AppImage> = Vec::new();
    let mut vistos: Vec<PathBuf> = Vec::new();

    for ruta in buscar(&propio, HONDURA)
        .into_iter()
        .chain(buscar(inicio, HONDURA))
    {
        if vistos.contains(&ruta) {
            continue;
        }
        vistos.push(ruta.clone());
        if let Some(appimage) = mirar(&ruta, &propio, inicio) {
            lista.push(appimage);
        }
    }

    lista.sort_by(|a, b| {
        // Los integrados primero: son los que la tienda administra y los que
        // tienen acciones de verdad.
        b.administrado
            .cmp(&a.administrado)
            .then_with(|| a.titulo.to_lowercase().cmp(&b.titulo.to_lowercase()))
    });
    lista
}

/// Los `.AppImage` que cuelgan de un directorio, hasta cierta hondura.
///
/// Se saltean los directorios ocultos: adentro están las cachés, los perfiles
/// de los navegadores y la papelera, y ninguno es un lugar donde alguien haya
/// dejado un programa a propósito.
fn buscar(raiz: &Path, hondura: usize) -> Vec<PathBuf> {
    let Ok(entradas) = std::fs::read_dir(raiz) else {
        return Vec::new();
    };
    let mut encontrados = Vec::new();

    for entrada in entradas.flatten() {
        let ruta = entrada.path();
        let Ok(tipo) = entrada.file_type() else {
            continue;
        };
        let oculto = entrada.file_name().to_string_lossy().starts_with('.');

        if tipo.is_dir() && hondura > 0 && !oculto {
            encontrados.extend(buscar(&ruta, hondura - 1));
        } else if tipo.is_file() && es_appimage(&ruta) {
            encontrados.push(ruta);
        }
    }

    encontrados
}

/// Arma la ficha de un archivo.
fn mirar(ruta: &Path, propio: &Path, inicio: &Path) -> Option<AppImage> {
    let metadatos = std::fs::metadata(ruta).ok()?;
    let id = identificador(ruta)?;
    let administrado = ruta.parent() == Some(propio);
    Some(AppImage {
        titulo: titulo_de(&id),
        en_el_menu: administrado && archivo_de_menu(inicio, &id).is_file(),
        id,
        ruta: ruta.to_string_lossy().to_string(),
        tamano: metadatos.len(),
        integrado: metadatos
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0),
        administrado,
    })
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
pub fn identificador(ruta: &Path) -> Option<String> {
    sanear(&ruta.file_stem()?.to_string_lossy())
}

/// Deja un texto en condiciones de ser parte de un nombre de archivo.
///
/// Hace falta porque el identificador termina en el nombre del `.desktop` y
/// porque llega desde la ventana: uno con `/` o con `..` escribiría fuera del
/// directorio del menú.
///
/// Va aparte de `identificador` y no adentro, que es como estaba: pasarle un
/// identificador ya hecho a `identificador` le aplicaba `file_stem` de nuevo, y
/// eso le come lo que haya después del último punto. `Obsidian_1.5.3` se
/// convertía en `Obsidian_1.5`, así que quitar o abrir un AppImage con la
/// versión en el nombre —o sea casi todos— no encontraba el archivo.
pub fn sanear(nombre: &str) -> Option<String> {
    let saneado: String = nombre
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
        administrado: true,
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
///
/// Sólo los que administra la tienda. Uno que la persona dejó en su carpeta se
/// lista y se abre, pero borrarlo no es asunto de acá: no lo pusimos nosotros.
pub fn quitar(ruta: &str, datos: &Path, inicio: &Path) -> Result<(), String> {
    let archivo = ruta_administrada(ruta, datos).ok_or("ese archivo no lo administra la tienda")?;
    let id = identificador(&archivo).ok_or("identificador inválido")?;

    std::fs::remove_file(&archivo).map_err(|e| format!("no se pudo borrar el archivo: {e}"))?;
    let entrada = archivo_de_menu(inicio, &id);
    if entrada.is_file() {
        let _ = std::fs::remove_file(entrada);
    }
    Ok(())
}

/// La ruta de un AppImage de los nuestros, comprobando que de verdad lo sea.
fn ruta_administrada(ruta: &str, datos: &Path) -> Option<PathBuf> {
    let archivo = PathBuf::from(ruta);
    (archivo.parent() == Some(directorio(datos).as_path())
        && archivo.is_file()
        && es_appimage(&archivo))
    .then_some(archivo)
}

/// Comprueba que una ruta sea un AppImage que se pueda ejecutar.
///
/// Tiene que colgar de la carpeta de la persona. No es una formalidad: es el
/// mismo límite que usa el perfil `vasak-appimage` de AppArmor, que se engancha
/// a `@{HOME}/**/*.AppImage`. Uno de afuera correría **sin** ese confinamiento,
/// y la tienda no puede ser el atajo para eso.
pub fn ruta_ejecutable(ruta: &str, inicio: &Path) -> Result<PathBuf, String> {
    let archivo = PathBuf::from(ruta);
    if !es_appimage(&archivo) {
        return Err("el archivo no termina en .AppImage".to_string());
    }
    // `canonicalize` resuelve los enlaces simbólicos: sin eso, uno dentro del
    // hogar que apunte afuera pasaría la comprobación.
    let real = archivo
        .canonicalize()
        .map_err(|e| format!("no se pudo resolver la ruta: {e}"))?;
    if !real.starts_with(inicio) {
        return Err(
            "el archivo está fuera de tu carpeta, donde el perfil de AppArmor no llega".to_string(),
        );
    }
    Ok(real)
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
    fn un_nombre_con_version_conserva_la_version() {
        // `identificador` saca la extensión; `sanear` no, porque lo que recibe
        // ya no es un nombre de archivo. Mezclarlos comía el `.3` de
        // `Obsidian_1.5.3` y después nada encontraba el archivo.
        assert_eq!(
            identificador(Path::new("/x/Obsidian_1.5.3.AppImage")).as_deref(),
            Some("Obsidian_1.5.3")
        );
        assert_eq!(sanear("Obsidian_1.5.3").as_deref(), Some("Obsidian_1.5.3"));
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
        let origen = inicio.join("Otra_2.1.0.AppImage");
        std::fs::create_dir_all(&inicio).unwrap();
        std::fs::write(&origen, b"x").unwrap();
        let integrado = integrar(&origen, &datos, &inicio).unwrap();

        quitar(&integrado.ruta, &datos, &inicio).unwrap();
        assert!(!directorio_del_menu(&inicio)
            .join("vasak-store-Otra_2.1.0.desktop")
            .is_file());
        // El original sigue donde estaba: la tienda copió, no se lo llevó.
        assert!(origen.is_file());
    }

    #[test]
    fn un_appimage_que_ya_estaba_en_la_carpeta_aparece_igual() {
        // Es lo que faltaba: listar sólo los integrados dejaba la sección vacía
        // en una máquina que tenía AppImage adentro.
        let temporal = tempfile::tempdir().unwrap();
        let datos = temporal.path().join("datos");
        let inicio = temporal.path().join("inicio");
        std::fs::create_dir_all(inicio.join("Apps")).unwrap();
        std::fs::write(inicio.join("Apps/Monitor_0.1.0.AppImage"), b"x").unwrap();
        // Y uno dentro de un directorio oculto, que no tiene que aparecer.
        std::fs::create_dir_all(inicio.join(".cache/basura")).unwrap();
        std::fs::write(inicio.join(".cache/basura/Vieja.AppImage"), b"x").unwrap();

        let lista = listar(&datos, &inicio);
        assert_eq!(lista.len(), 1, "{lista:?}");
        assert_eq!(lista[0].id, "Monitor_0.1.0");
        assert!(!lista[0].administrado);
        assert!(!lista[0].en_el_menu);
    }

    #[test]
    fn los_integrados_van_antes_que_los_sueltos() {
        let temporal = tempfile::tempdir().unwrap();
        let datos = temporal.path().join("datos");
        let inicio = temporal.path().join("inicio");
        std::fs::create_dir_all(&inicio).unwrap();
        std::fs::write(inicio.join("Aaa.AppImage"), b"x").unwrap();
        let otro = inicio.join("Zzz.AppImage");
        std::fs::write(&otro, b"x").unwrap();
        integrar(&otro, &datos, &inicio).unwrap();

        let lista = listar(&datos, &inicio);
        assert_eq!(lista.len(), 3, "{lista:?}");
        assert!(lista[0].administrado, "el integrado tiene que ir primero");
        assert_eq!(lista[0].id, "Zzz");
    }

    #[test]
    fn no_se_ejecuta_nada_de_afuera_de_la_carpeta() {
        // El perfil de AppArmor se engancha a los AppImage de `@{HOME}`. Uno de
        // afuera correría sin confinamiento.
        let temporal = tempfile::tempdir().unwrap();
        let inicio = temporal.path().join("inicio");
        std::fs::create_dir_all(&inicio).unwrap();
        let adentro = inicio.join("Buena.AppImage");
        std::fs::write(&adentro, b"x").unwrap();
        let afuera = temporal.path().join("Afuera.AppImage");
        std::fs::write(&afuera, b"x").unwrap();

        assert!(ruta_ejecutable(&adentro.to_string_lossy(), &inicio).is_ok());
        assert!(ruta_ejecutable(&afuera.to_string_lossy(), &inicio).is_err());
        assert!(ruta_ejecutable(
            &adentro.to_string_lossy().replace(".AppImage", ".sh"),
            &inicio
        )
        .is_err());
    }

    #[test]
    fn no_se_quita_lo_que_la_tienda_no_administra() {
        let temporal = tempfile::tempdir().unwrap();
        let datos = temporal.path().join("datos");
        let inicio = temporal.path().join("inicio");
        std::fs::create_dir_all(&inicio).unwrap();
        let suelto = inicio.join("Suelta.AppImage");
        std::fs::write(&suelto, b"x").unwrap();

        assert!(quitar(&suelto.to_string_lossy(), &datos, &inicio).is_err());
        assert!(suelto.is_file(), "se borró un archivo que no era nuestro");
    }

    #[test]
    fn lo_que_no_es_un_appimage_no_se_integra() {
        let temporal = tempfile::tempdir().unwrap();
        let origen = temporal.path().join("cosa.tar.gz");
        std::fs::write(&origen, b"x").unwrap();
        assert!(integrar(&origen, temporal.path(), temporal.path()).is_err());
    }
}
