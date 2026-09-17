//! Leer y escribir `/etc/pacman.conf`.
//!
//! El trabajo de texto está en el crate compartido, que es el que tiene las
//! pruebas; acá queda lo que hace falta root para hacer.

use std::io::Write;
use std::path::Path;

pub use vasak_store_protocol::repositorios::{
    agregar, analizar, cambiar_estado, quitar, Repositorio,
};

/// El archivo de siempre. Es constante y no configurable a propósito: si
/// alguien mueve la configuración de pacman, que esto falle es mejor que que
/// escriba en el lugar equivocado.
pub const RUTA: &str = "/etc/pacman.conf";

/// Lee los repositorios del archivo, encendidos y apagados.
pub fn listar() -> Result<Vec<Repositorio>, String> {
    let texto =
        std::fs::read_to_string(RUTA).map_err(|e| format!("no se pudo leer {RUTA}: {e}"))?;
    Ok(analizar(&texto))
}

/// Escribe el archivo entero, de una vez y sin dejarlo a medias.
///
/// Se escribe un temporal **en el mismo directorio** y se lo renombra encima:
/// `rename` es atómico dentro del mismo sistema de archivos, así que un corte
/// de luz a mitad deja el archivo viejo entero y no uno truncado. Un
/// `pacman.conf` truncado es una máquina que no sabe de dónde bajar paquetes.
pub fn escribir(contenido: &str) -> Result<(), String> {
    let destino = Path::new(RUTA);
    let directorio = destino.parent().ok_or("ruta sin directorio")?;
    let temporal = directorio.join(".pacman.conf.vasak-store");

    let mut archivo = std::fs::File::create(&temporal)
        .map_err(|e| format!("no se pudo crear el temporal: {e}"))?;
    archivo
        .write_all(contenido.as_bytes())
        .map_err(|e| format!("no se pudo escribir: {e}"))?;
    archivo
        .sync_all()
        .map_err(|e| format!("no se pudo sincronizar a disco: {e}"))?;
    // Los mismos permisos de siempre: legible por todos, escribible por root.
    // `create` deja 0644 menos la umask, y la del demonio es la de systemd.
    std::fs::set_permissions(
        &temporal,
        std::os::unix::fs::PermissionsExt::from_mode(0o644),
    )
    .map_err(|e| format!("no se pudieron poner los permisos: {e}"))?;
    std::fs::rename(&temporal, destino).map_err(|e| format!("no se pudo reemplazar {RUTA}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// El archivo del sistema se puede leer y tiene los repositorios de siempre.
    ///
    /// Es una lectura, así que corre sin privilegios y sin tocar nada.
    #[test]
    fn el_pacman_conf_de_la_maquina_se_lee() {
        let repos = listar().expect("no se pudo leer /etc/pacman.conf");
        assert!(
            repos.iter().any(|r| r.nombre == "core"),
            "no apareció [core] en {RUTA}"
        );
        assert!(repos.iter().find(|r| r.nombre == "core").unwrap().protegido);
    }
}
