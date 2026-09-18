//! Íconos y capturas: traerlos al disco y dejarlos donde el WebView los pueda ver.
//!
//! Dos problemas distintos con la misma solución —una caché en disco— y por eso
//! están juntos.
//!
//! **Los íconos.** El catálogo de Arch trae 3843 y todos son JPEG XL. WebKit no
//! dibuja ese formato: puestos tal cual en un `<img>` no se ve nada, y sin
//! error. Se decodifican con `jxl-oxide` —Rust puro— y se guardan como PNG.
//!
//! **Las capturas.** Son URL remotas a GitHub y a las páginas de cada proyecto.
//! Cargarlas desde el WebView pediría abrir la política de contenido a
//! `https://*`, que es justo lo que esa política está para impedir, y además le
//! contaría a cada uno de esos servidores qué fichas se miran. Se bajan acá y se
//! sirven desde el disco.

use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

/// Lo máximo que se baja de una captura.
///
/// Son fotos de pantallas, no material de archivo: ocho megas es holgado. El
/// límite existe porque la URL la pone un archivo que no escribimos nosotros, y
/// sin él un servidor puede mandar lo que quiera hasta llenar el disco.
const MAXIMO: u64 = 8 * 1024 * 1024;

/// Cuánto se espera a un servidor de capturas.
///
/// Corto a propósito: la captura es adorno. Una ficha que tarda treinta
/// segundos en abrir porque un servidor no contesta es peor que una ficha sin
/// foto.
const PLAZO: std::time::Duration = std::time::Duration::from_secs(10);

/// Un nombre de archivo estable para una entrada de la caché.
///
/// FNV-1a escrito acá en lugar del `DefaultHasher` de la biblioteca estándar
/// porque ése no promete dar el mismo número entre versiones de Rust: una
/// actualización del compilador invalidaría la caché entera sin que nadie
/// entienda por qué la tienda volvió a bajar todo.
fn huella(texto: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in texto.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
}

/// Silencia el aviso de que `Hash` no se usa; está para documentar la elección.
const _: fn() = || {
    fn _no_usamos_el_de_la_biblioteca<T: Hash, H: Hasher>(_: &T, _: &mut H) {}
};

/// Convierte un ícono del catálogo a PNG y devuelve dónde quedó.
///
/// Si ya estaba convertido no hace nada. Si el archivo no existe o no se puede
/// decodificar devuelve nada, y quien llama se queda con el ícono del tema del
/// sistema, que para lo instalado siempre está.
pub fn icono_a_png(origen: &Path, cache: &Path) -> Option<PathBuf> {
    if !origen.is_file() {
        return None;
    }
    let destino = cache
        .join("iconos")
        .join(format!("{}.png", huella(&origen.to_string_lossy())));
    if destino.is_file() {
        return Some(destino);
    }
    std::fs::create_dir_all(destino.parent()?).ok()?;

    let bytes = std::fs::read(origen).ok()?;
    let imagen = jxl_oxide::integration::JxlDecoder::new(std::io::Cursor::new(bytes)).ok()?;
    let imagen = image::DynamicImage::from_decoder(imagen).ok()?;

    // A un temporal y después renombrar: si la aplicación muere a mitad de
    // escribir, la caché no queda con un PNG truncado que después no se dibuja
    // y que nadie vuelve a generar porque el archivo «ya está».
    let temporal = destino.with_extension("parcial");
    imagen
        .save_with_format(&temporal, image::ImageFormat::Png)
        .ok()?;
    std::fs::rename(&temporal, &destino).ok()?;
    Some(destino)
}

/// Baja una captura y devuelve dónde quedó.
pub async fn traer_captura(url: &str, cache: &Path, cliente: &reqwest::Client) -> Option<PathBuf> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return None;
    }
    let destino = cache.join("capturas").join(format!("{}.img", huella(url)));
    if destino.is_file() {
        return Some(destino);
    }
    std::fs::create_dir_all(destino.parent()?).ok()?;

    let respuesta = cliente.get(url).timeout(PLAZO).send().await.ok()?;
    if !respuesta.status().is_success() {
        return None;
    }
    // El encabezado se comprueba primero porque evita bajar; el corte de abajo
    // está igual porque el encabezado puede mentir o no venir.
    if respuesta
        .content_length()
        .is_some_and(|largo| largo > MAXIMO)
    {
        return None;
    }
    let bytes = respuesta.bytes().await.ok()?;
    if bytes.len() as u64 > MAXIMO {
        return None;
    }
    // Que sea una imagen de verdad y no lo que el servidor haya querido mandar:
    // esto va a un `<img>`, y un archivo que no es una imagen ahí no es
    // peligroso pero sí es una ficha rota sin explicación.
    image::guess_format(&bytes).ok()?;

    let temporal = destino.with_extension("parcial");
    std::fs::write(&temporal, &bytes).ok()?;
    std::fs::rename(&temporal, &destino).ok()?;
    Some(destino)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_huella_es_estable_y_distinta_por_entrada() {
        assert_eq!(huella("/usr/share/x.jxl"), huella("/usr/share/x.jxl"));
        assert_ne!(huella("/usr/share/x.jxl"), huella("/usr/share/y.jxl"));
        // El valor concreto queda anotado: si cambia, la caché de todo el mundo
        // se invalida, y eso tiene que ser una decisión y no un accidente.
        assert_eq!(huella(""), "cbf29ce484222325");
    }

    #[test]
    fn un_icono_que_no_existe_no_rompe_nada() {
        let cache = tempfile::tempdir().unwrap();
        assert_eq!(icono_a_png(Path::new("/no/existe.jxl"), cache.path()), None);
    }

    #[test]
    fn un_archivo_que_no_es_jxl_no_deja_basura_en_la_cache() {
        let cache = tempfile::tempdir().unwrap();
        let falso = cache.path().join("falso.jxl");
        std::fs::write(&falso, b"esto no es una imagen").unwrap();

        assert_eq!(icono_a_png(&falso, cache.path()), None);
        let convertidos = cache.path().join("iconos");
        let vacio =
            !convertidos.exists() || std::fs::read_dir(&convertidos).unwrap().next().is_none();
        assert!(vacio, "quedó un archivo a medio escribir en la caché");
    }

    #[tokio::test]
    async fn una_url_que_no_es_http_no_se_baja() {
        let cache = tempfile::tempdir().unwrap();
        let cliente = reqwest::Client::new();
        // `file://` es lo que importa acá: la URL sale de un archivo del
        // sistema, y una que apunte al disco convertiría esto en un lector de
        // archivos arbitrarios para la ventana.
        assert_eq!(
            traer_captura("file:///etc/shadow", cache.path(), &cliente).await,
            None
        );
    }
}
