//! El contrato entre la tienda y su demonio.
//!
//! Vive en su propio crate porque los dos lados lo necesitan y porque un
//! cambio en un mensaje tiene que romper la compilación de ambos, no de uno.
//!
//! Acá también viven los validadores. No es un detalle de estilo: todo lo que
//! el demonio recibe por D-Bus viene de un proceso sin privilegios, y el
//! demonio corre como root. Un nombre de paquete es texto que va a parar a una
//! transacción de pacman, y un nombre de repositorio termina escrito en
//! `/etc/pacman.conf`. Validarlos de un solo lado —el que confía— no sirve de
//! nada, así que se valida en el demonio y el código que lo hace está acá para
//! que la tienda pueda rechazar lo mismo antes de mandarlo.

pub mod repositorios;

use serde::{Deserialize, Serialize};

/// El nombre del servicio en el bus del sistema.
pub const SERVICIO: &str = "ar.net.vasak.os.Store";

/// La ruta del objeto.
pub const RUTA: &str = "/ar/net/vasak/os/Store";

/// La interfaz que expone ese objeto.
pub const INTERFAZ: &str = "ar.net.vasak.os.Store";

/// La acción de polkit que autoriza cambiar paquetes.
///
/// Una sola para instalar, quitar y actualizar: las tres dejan el sistema en un
/// estado distinto y ninguna es menos delicada que las otras. Separarlas
/// invitaría a una política que permite instalar sin autenticar, y un paquete
/// instalado corre guiones como root.
pub const ACCION_PAQUETES: &str = "ar.net.vasak.os.store.gestionar-paquetes";

/// La acción de polkit que autoriza tocar los repositorios.
///
/// Aparte de la anterior, y a propósito: agregar un repositorio es entregarle
/// al sistema una fuente de paquetes para siempre. Es más grave que instalar
/// uno, aunque parezca un renglón de configuración.
pub const ACCION_REPOSITORIOS: &str = "ar.net.vasak.os.store.gestionar-repositorios";

/// Qué está haciendo una transacción.
///
/// Se informa como texto en la señal de avance para que agregar una fase no
/// rompa a un cliente viejo: el que no la conozca la muestra como desconocida
/// en lugar de fallar al deserializar.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Fase {
    /// Resolviendo dependencias y conflictos.
    Resolviendo,
    /// Bajando los paquetes.
    Descargando,
    /// Comprobando firmas e integridad.
    Verificando,
    /// Escribiendo en el sistema de archivos.
    Instalando,
    /// Sacando archivos del sistema.
    Quitando,
    /// Guiones de post-instalación y limpieza.
    Terminando,
}

impl Fase {
    /// El identificador estable que viaja por el bus.
    pub fn como_id(self) -> &'static str {
        match self {
            Fase::Resolviendo => "resolviendo",
            Fase::Descargando => "descargando",
            Fase::Verificando => "verificando",
            Fase::Instalando => "instalando",
            Fase::Quitando => "quitando",
            Fase::Terminando => "terminando",
        }
    }
}

/// Un paquete, con lo mínimo para mostrarlo en una lista o en una previsualización.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PaqueteBreve {
    pub nombre: String,
    pub version: String,
    /// La versión a la que se pasaría, cuando la operación es una actualización.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version_nueva: Option<String>,
    /// El repositorio de donde sale, o `local` si ya está instalado.
    pub origen: String,
    /// Lo que ocupa instalado, en bytes.
    pub tamano: i64,
    /// Lo que hay que bajar, en bytes. Cero si ya está en la caché.
    pub descarga: i64,
}

/// Lo que una operación arrastra, antes de confirmarla.
///
/// Se calcula en el demonio y no en la tienda porque resolver dependencias
/// necesita abrir una transacción de libalpm, y abrir una transacción toma el
/// candado de pacman. El demonio lo toma, resuelve y lo suelta sin confirmar
/// nada.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Previsualizacion {
    /// Lo que se va a instalar, incluidas las dependencias que la persona no pidió.
    pub instalar: Vec<PaqueteBreve>,
    /// Lo que se va a sacar.
    pub quitar: Vec<PaqueteBreve>,
    /// Lo que se va a actualizar.
    pub actualizar: Vec<PaqueteBreve>,
    /// Los conflictos que impiden seguir, en texto ya legible.
    pub conflictos: Vec<String>,
    /// Bytes a descargar.
    pub descarga: i64,
    /// Cuánto crece (o decrece, si es negativo) el espacio ocupado en disco.
    pub espacio: i64,
}

/// Un paso de una transacción en curso.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Avance {
    /// La fase, como identificador estable.
    pub fase: String,
    /// Sobre qué: normalmente el nombre de un paquete. Vacío si la fase no tiene uno.
    pub objetivo: String,
    /// Cuánto se lleva hecho y de cuánto. En bytes al descargar, en paquetes en el resto.
    pub hecho: u64,
    pub total: u64,
}

/// El largo máximo de un nombre que se acepta por el bus.
///
/// pacman no impone uno; esto existe para que un cliente roto no pueda mandar
/// un megabyte de texto a un proceso que corre como root.
const LARGO_MAXIMO: usize = 255;

/// Si un nombre de paquete es aceptable.
///
/// El juego de caracteres es el que Arch permite en un `pkgname`: alfanuméricos
/// y `@._+-`, sin empezar con guion ni punto. Se rechaza todo lo demás **antes**
/// de que llegue a libalpm, no porque libalpm vaya a interpretarlo como un
/// comando —no lo hace—, sino porque un nombre con una barra es una ruta y
/// nunca es lo que alguien quiso pedir.
pub fn nombre_de_paquete_valido(nombre: &str) -> bool {
    if nombre.is_empty() || nombre.len() > LARGO_MAXIMO {
        return false;
    }
    if nombre.starts_with('-') || nombre.starts_with('.') {
        return false;
    }
    nombre
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '@' | '.' | '_' | '+' | '-'))
}

/// Si un nombre de repositorio es aceptable.
///
/// Más estricto que el de paquete, y con motivo: esto se escribe entre
/// corchetes en `/etc/pacman.conf`. Un nombre con un salto de línea, un `]` o
/// un `=` no es un nombre raro, es una línea de configuración inyectada en un
/// archivo que lee un proceso privilegiado.
pub fn nombre_de_repositorio_valido(nombre: &str) -> bool {
    if nombre.is_empty() || nombre.len() > LARGO_MAXIMO {
        return false;
    }
    if nombre.starts_with('-') || nombre.starts_with('.') {
        return false;
    }
    nombre
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

/// Si una URL de servidor es aceptable para `pacman.conf`.
///
/// Sólo los esquemas que pacman sabe hablar, y sin espacios ni saltos de línea
/// por la misma razón que arriba. `file://` queda afuera a propósito: un
/// repositorio en el disco local lo agrega quien edite el archivo a mano, no un
/// formulario de la tienda.
pub fn servidor_valido(url: &str) -> bool {
    if url.is_empty() || url.len() > 2048 {
        return false;
    }
    if url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return false;
    }
    ["https://", "http://", "ftp://"]
        .iter()
        .any(|esquema| url.starts_with(esquema))
}

/// Si una ruta de paquete construido es aceptable.
///
/// El demonio instala archivos sueltos sólo para lo que la tienda compila del
/// AUR. Tiene que ser absoluta, terminar en la extensión de un paquete y no
/// contener `..`: sin lo último, una ruta como `/tmp/x/../../etc/passwd` pasa
/// las otras dos comprobaciones.
pub fn ruta_de_paquete_valida(ruta: &str) -> bool {
    if ruta.is_empty() || ruta.len() > 4096 || !ruta.starts_with('/') {
        return false;
    }
    if ruta.split('/').any(|parte| parte == "..") {
        return false;
    }
    ruta.ends_with(".pkg.tar.zst") || ruta.ends_with(".pkg.tar.xz")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn los_nombres_normales_pasan() {
        for nombre in [
            "firefox",
            "gtk3",
            "lib32-glibc",
            "python-pip",
            "a+b",
            "ttf-dejavu",
        ] {
            assert!(nombre_de_paquete_valido(nombre), "{nombre}");
        }
    }

    #[test]
    fn un_nombre_que_es_una_ruta_o_una_bandera_no_pasa() {
        for nombre in ["../etc/passwd", "/usr/bin/sh", "-Rns", "a b", "a;b", ""] {
            assert!(!nombre_de_paquete_valido(nombre), "{nombre}");
        }
    }

    #[test]
    fn un_nombre_demasiado_largo_no_pasa() {
        assert!(!nombre_de_paquete_valido(&"a".repeat(LARGO_MAXIMO + 1)));
        assert!(nombre_de_paquete_valido(&"a".repeat(LARGO_MAXIMO)));
    }

    #[test]
    fn un_repositorio_no_puede_traer_una_linea_de_configuracion() {
        // Cada uno de éstos, escrito entre corchetes en pacman.conf, deja de ser
        // un nombre y pasa a ser configuración.
        for nombre in ["a]\n[core", "a=b", "a b", "a\nServer = http://x", "a/b", ""] {
            assert!(!nombre_de_repositorio_valido(nombre), "{nombre}");
        }
        for nombre in ["vasakos", "cachyos-v3", "multilib", "extra"] {
            assert!(nombre_de_repositorio_valido(nombre), "{nombre}");
        }
    }

    #[test]
    fn el_servidor_acepta_los_esquemas_de_pacman_y_nada_mas() {
        assert!(servidor_valido(
            "https://repo.vasak.net.ar/repo/x86_64/vasakos"
        ));
        assert!(servidor_valido("http://ejemplo.org/$arch/$repo"));
        assert!(servidor_valido("ftp://ejemplo.org/arch"));
        assert!(!servidor_valido("file:///tmp/repo"));
        assert!(!servidor_valido("https://ejemplo.org/a b"));
        assert!(!servidor_valido("https://ejemplo.org/a\nSigLevel = Never"));
        assert!(!servidor_valido(""));
    }

    #[test]
    fn una_ruta_de_paquete_tiene_que_ser_absoluta_y_sin_subir() {
        assert!(ruta_de_paquete_valida(
            "/tmp/x/foo-1.0-1-x86_64.pkg.tar.zst"
        ));
        assert!(!ruta_de_paquete_valida(
            "/tmp/x/../../etc/passwd.pkg.tar.zst"
        ));
        assert!(!ruta_de_paquete_valida("relativo.pkg.tar.zst"));
        assert!(!ruta_de_paquete_valida("/tmp/x/foo.tar.gz"));
    }

    #[test]
    fn las_fases_tienen_identificadores_distintos() {
        let fases = [
            Fase::Resolviendo,
            Fase::Descargando,
            Fase::Verificando,
            Fase::Instalando,
            Fase::Quitando,
            Fase::Terminando,
        ];
        let mut ids: Vec<&str> = fases.iter().map(|f| f.como_id()).collect();
        ids.sort_unstable();
        let cuantos = ids.len();
        ids.dedup();
        assert_eq!(ids.len(), cuantos, "dos fases comparten identificador");
    }
}
