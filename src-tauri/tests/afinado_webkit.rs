//! El afinado del WebKit es glue de GTK que ninguna prueba puede montar sin un
//! display real, así que vive en `commands/webkit.rs` —fuera de la cobertura— y
//! no se ejercita acá. Lo que esta prueba cuida es el **cableado**: que las
//! palancas sigan puestas, que el comando esté registrado y que el frontend lo
//! llame. Si alguien borra una de las tres puntas, el afinado deja de correr sin
//! que nada falle en tiempo de compilación.

use std::fs;
use std::path::Path;

fn leer(ruta_relativa: &str) -> String {
    let ruta = Path::new(env!("CARGO_MANIFEST_DIR")).join(ruta_relativa);
    fs::read_to_string(&ruta).unwrap_or_else(|error| panic!("no se pudo leer {ruta:?}: {error}"))
}

#[test]
fn el_glue_tiene_las_palancas_de_memoria() {
    let webkit = leer("src/commands/webkit.rs");
    assert!(
        webkit.contains("pub fn tune_webview"),
        "falta el comando tune_webview en commands/webkit.rs"
    );
    assert!(
        webkit.contains("set_enable_developer_extras(false)"),
        "falta apagar las extras de desarrollo"
    );
    assert!(
        webkit.contains("set_enable_back_forward_navigation_gestures(false)"),
        "falta apagar los gestos de navegación atrás/adelante"
    );
    assert!(
        webkit.contains("CacheModel::DocumentViewer"),
        "falta el caché de visor de documento"
    );
}

#[test]
fn el_comando_esta_registrado() {
    let lib = leer("src/lib.rs");
    assert!(
        lib.contains("commands::webkit::tune_webview"),
        "tune_webview no está en el generate_handler de lib.rs"
    );
}

#[test]
fn el_frontend_dispara_el_afinado() {
    let app = leer("../src/App.vue");
    assert!(
        app.contains("invoke('tune_webview')"),
        "App.vue no invoca tune_webview al montar"
    );
}
