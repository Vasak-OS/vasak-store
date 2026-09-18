//! El analizador de AppStream, contra un catálogo de verdad.
//!
//! Las pruebas unitarias del módulo corren sobre una muestra escrita a mano, que
//! prueba las reglas pero no el tamaño ni la variedad: el archivo real son
//! veinte megas comprimidos, con entidades XML, idiomas que no esperamos y
//! componentes de siete tipos distintos.
//!
//! Corre sólo si hay un catálogo. Con el paquete `archlinux-appstream-data`
//! instalado lo encuentra solo; si no, se le puede decir dónde:
//!
//! ```sh
//! VASAK_STORE_CATALOGO=/algún/lado/swcatalog/xml cargo test --test catalogo_real
//! ```
//!
//! No falla cuando no hay ninguno: la máquina que corre la CI no tiene por qué
//! tener el paquete, y un test que exige veinte megas de datos para pasar
//! termina desactivado.

use std::path::{Path, PathBuf};

use vasak_store_lib::catalogo::{categorias_de, Catalogo, CATEGORIAS};

fn donde() -> Option<PathBuf> {
    // Si alguien la puso, tiene que servir. Caer en silencio al catálogo del
    // sistema —o a no correr— haría que una ruta mal escrita se viera igual que
    // una prueba que pasó.
    if let Ok(propio) = std::env::var("VASAK_STORE_CATALOGO") {
        let ruta = PathBuf::from(propio);
        assert!(
            ruta.is_dir(),
            "VASAK_STORE_CATALOGO apunta a {}, que no es un directorio",
            ruta.display()
        );
        return Some(ruta);
    }
    let del_sistema = Path::new("/usr/share/swcatalog/xml");
    del_sistema.is_dir().then(|| del_sistema.to_path_buf())
}

#[test]
fn el_catalogo_del_sistema_se_lee_entero() {
    let Some(directorio) = donde() else {
        eprintln!("sin catálogo de AppStream; la prueba no corre");
        return;
    };

    let catalogo = Catalogo::cargar_desde(std::iter::once(directorio.as_path()), "es");

    assert!(
        catalogo.cuantas() > 500,
        "sólo salieron {} aplicaciones de un catálogo real",
        catalogo.cuantas()
    );

    let mut con_nombre = 0;
    let mut con_icono = 0;
    let mut con_capturas = 0;
    for ficha in catalogo.todas() {
        assert!(
            !ficha.paquete.is_empty(),
            "una ficha sin paquete llegó al catálogo"
        );
        if !ficha.nombre.is_empty() {
            con_nombre += 1;
        }
        if ficha.icono_archivo.is_some() || ficha.icono.is_some() {
            con_icono += 1;
        }
        if !ficha.capturas.is_empty() {
            con_capturas += 1;
        }
        // Toda ficha cae en alguna categoría de la tienda: sin eso quedaría
        // invisible al navegar.
        assert!(!categorias_de(ficha).is_empty());
    }

    // Los umbrales son bajos a propósito: lo que se comprueba es que el
    // analizador saca estos campos, no cuántos trae la versión de hoy del
    // paquete de Arch.
    assert!(con_nombre > 500, "sólo {con_nombre} fichas con nombre");
    assert!(con_icono > 500, "sólo {con_icono} fichas con ícono");
    assert!(
        con_capturas > 100,
        "sólo {con_capturas} fichas con capturas"
    );
}

#[test]
fn las_categorias_reparten_el_catalogo_y_no_lo_amontonan_en_una() {
    let Some(directorio) = donde() else {
        return;
    };
    let catalogo = Catalogo::cargar_desde(std::iter::once(directorio.as_path()), "es");

    for (grupo, _) in CATEGORIAS {
        let cuantas = catalogo
            .todas()
            .filter(|f| categorias_de(f).contains(grupo))
            .count();
        // Una categoría vacía en la portada es un botón que no lleva a ninguna
        // parte; si el mapeo se rompe, esto lo dice.
        assert!(
            cuantas > 0,
            "la categoría «{grupo}» quedó sin ninguna aplicación"
        );
    }
}
