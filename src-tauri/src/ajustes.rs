//! Lo que la tienda recuerda entre sesiones.
//!
//! Es un archivo chico de JSON en el directorio de configuración de la
//! aplicación. Hoy guarda una sola cosa —si el AUR está encendido— y aun así
//! tiene su módulo, porque esa cosa es una decisión sobre **de dónde salen los
//! paquetes** y no una preferencia de la ventana: quien la tomó tiene que
//! encontrarla como la dejó la próxima vez que abra.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Cómo se llama el archivo dentro del directorio de configuración.
const ARCHIVO: &str = "ajustes.json";

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Ajustes {
    /// Si los resultados del AUR se incluyen al buscar.
    ///
    /// Apagado de fábrica, y a propósito: la distribución trata al AUR como
    /// inseguro, así que encenderlo tiene que ser una decisión de alguien y no
    /// el estado en el que la tienda viene.
    pub aur: bool,
}

/// La ruta del archivo.
pub fn ruta(configuracion: &Path) -> PathBuf {
    configuracion.join(ARCHIVO)
}

/// Lee los ajustes. Un archivo que no está, o que no se entiende, da los de fábrica.
///
/// No devuelve error a propósito: que no se pueda leer una preferencia no es
/// motivo para que la tienda no abra, y los de fábrica son un estado válido.
pub fn leer(configuracion: &Path) -> Ajustes {
    std::fs::read_to_string(ruta(configuracion))
        .ok()
        .and_then(|texto| serde_json::from_str(&texto).ok())
        .unwrap_or_default()
}

/// Guarda los ajustes.
///
/// A un temporal y después renombrar, como todo lo que esta tienda escribe: un
/// corte a mitad de la escritura dejaría un JSON truncado, que en la próxima
/// lectura no parsea y se lee como «nunca configuró nada».
pub fn escribir(configuracion: &Path, ajustes: &Ajustes) -> Result<(), String> {
    std::fs::create_dir_all(configuracion)
        .map_err(|e| format!("no se pudo crear {}: {e}", configuracion.display()))?;

    let texto = serde_json::to_string_pretty(ajustes)
        .map_err(|e| format!("no se pudieron serializar los ajustes: {e}"))?;

    let destino = ruta(configuracion);
    let temporal = destino.with_extension("parcial");
    std::fs::write(&temporal, texto).map_err(|e| format!("no se pudo escribir: {e}"))?;
    std::fs::rename(&temporal, &destino)
        .map_err(|e| format!("no se pudo reemplazar {}: {e}", destino.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn de_fabrica_el_aur_esta_apagado() {
        // La distribución lo trata como inseguro: encenderlo tiene que ser una
        // decisión de alguien, no el estado en el que la tienda viene.
        assert!(!Ajustes::default().aur);
    }

    #[test]
    fn sin_archivo_valen_los_de_fabrica() {
        let temporal = tempfile::tempdir().unwrap();
        assert_eq!(leer(temporal.path()), Ajustes::default());
    }

    #[test]
    fn lo_guardado_se_vuelve_a_leer() {
        let temporal = tempfile::tempdir().unwrap();
        let configuracion = temporal.path().join("no/existe/todavia");

        escribir(&configuracion, &Ajustes { aur: true }).unwrap();
        assert!(leer(&configuracion).aur);

        escribir(&configuracion, &Ajustes { aur: false }).unwrap();
        assert!(!leer(&configuracion).aur);
    }

    #[test]
    fn un_archivo_roto_no_rompe_la_tienda() {
        // Vale más abrir con los de fábrica que no abrir.
        let temporal = tempfile::tempdir().unwrap();
        std::fs::write(ruta(temporal.path()), b"{ esto no es json").unwrap();
        assert_eq!(leer(temporal.path()), Ajustes::default());
    }

    #[test]
    fn una_clave_que_todavia_no_existe_no_invalida_el_archivo() {
        // `serde(default)`: un archivo escrito por una versión anterior, sin la
        // clave nueva, tiene que seguir leyéndose.
        let temporal = tempfile::tempdir().unwrap();
        std::fs::write(ruta(temporal.path()), b"{}").unwrap();
        assert_eq!(leer(temporal.path()), Ajustes::default());
    }

    #[test]
    fn no_queda_un_temporal_dando_vueltas() {
        let temporal = tempfile::tempdir().unwrap();
        escribir(temporal.path(), &Ajustes { aur: true }).unwrap();
        let sueltos: Vec<_> = std::fs::read_dir(temporal.path())
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|n| n.ends_with(".parcial"))
            .collect();
        assert!(sueltos.is_empty(), "quedó {sueltos:?}");
    }
}
