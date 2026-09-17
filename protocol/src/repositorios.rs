//! Los repositorios de `pacman.conf`, como texto.
//!
//! Acá no se toca el disco. Son funciones puras sobre el contenido del archivo,
//! y están en el crate compartido porque las usan los dos lados: el demonio para
//! escribirlo —que es lo único que necesita root— y la aplicación para leerlo y
//! mostrar la lista, que no lo necesita. Con el analizador de un solo lado, la
//! pantalla tendría que despertar a un proceso con privilegios para enterarse de
//! qué dice un archivo que cualquiera puede leer.
//!
//! Encender y apagar un repositorio es comentar o descomentar su bloque, que es
//! lo que se hace a mano y lo que cualquiera espera encontrar si después abre el
//! archivo. No se reescribe el archivo entero ni se reordena nada.

use crate::{nombre_de_repositorio_valido, servidor_valido};

/// Los repositorios sin los cuales el sistema no se puede actualizar.
///
/// No se pueden apagar ni quitar desde la tienda. Se puede a mano, editando el
/// archivo, que es donde alguien que de verdad quiere hacerlo va a ir; lo que no
/// puede pasar es que un clic en una lista deje la máquina sin de dónde sacar
/// las actualizaciones de seguridad.
pub const INTOCABLES: &[&str] = &["core", "extra"];

/// Un repositorio tal como está en el archivo.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Repositorio {
    pub nombre: String,
    pub activo: bool,
    /// Los servidores escritos con `Server =`. Vacío si sólo usa un `Include`.
    pub servidores: Vec<String>,
    /// La lista de réplicas, si el bloque usa `Include`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lista: Option<String>,
    /// Si la tienda lo deja tocar.
    pub protegido: bool,
}

/// Saca los repositorios de un `pacman.conf` ya leído.
///
/// Un bloque comentado sigue siendo un repositorio, apagado. Es la única forma
/// de que la pantalla pueda ofrecer encenderlo: si sólo se mirara la
/// configuración efectiva —lo que `pacman-conf` devuelve— los apagados no
/// existirían y el conmutador no tendría qué mostrar.
pub fn analizar(texto: &str) -> Vec<Repositorio> {
    let mut repositorios: Vec<Repositorio> = Vec::new();

    for linea in texto.lines() {
        let (comentada, contenido) = descomentar(linea);

        if let Some(nombre) = cabecera(contenido) {
            if nombre == "options" {
                // `[options]` no es un repositorio. Se empuja igual como marca
                // para que las claves que le siguen no se le asignen al último
                // repositorio visto.
                repositorios.push(Repositorio {
                    nombre: "options".to_string(),
                    activo: !comentada,
                    servidores: Vec::new(),
                    lista: None,
                    protegido: true,
                });
                continue;
            }
            repositorios.push(Repositorio {
                nombre: nombre.to_string(),
                activo: !comentada,
                servidores: Vec::new(),
                lista: None,
                protegido: INTOCABLES.contains(&nombre),
            });
            continue;
        }

        let Some(actual) = repositorios.last_mut() else {
            continue;
        };
        if let Some(valor) = clave(contenido, "Server") {
            actual.servidores.push(valor.to_string());
        } else if let Some(valor) = clave(contenido, "Include") {
            actual.lista = Some(valor.to_string());
        }
    }

    repositorios.retain(|r| r.nombre != "options");
    repositorios
}

/// Separa el `#` de comentario del contenido de la línea.
///
/// Devuelve si estaba comentada y la línea sin las almohadillas ni los espacios
/// de adelante. `## algo` es un comentario de verdad y no una línea apagada,
/// pero para decidirlo alcanza con mirar si lo que queda parece configuración.
fn descomentar(linea: &str) -> (bool, &str) {
    let recortada = linea.trim_start();
    if let Some(resto) = recortada.strip_prefix('#') {
        (true, resto.trim_start_matches('#').trim_start())
    } else {
        (false, recortada)
    }
}

/// El nombre de un `[bloque]`, si la línea es uno.
fn cabecera(contenido: &str) -> Option<&str> {
    let contenido = contenido.trim_end();
    let sin_abrir = contenido.strip_prefix('[')?;
    let nombre = sin_abrir.strip_suffix(']')?;
    (!nombre.is_empty() && !nombre.contains('[')).then_some(nombre)
}

/// El valor de una clave `Nombre = valor`.
fn clave<'a>(contenido: &'a str, nombre: &str) -> Option<&'a str> {
    let (izquierda, derecha) = contenido.split_once('=')?;
    (izquierda.trim() == nombre).then(|| derecha.trim())
}

/// Enciende o apaga el bloque de un repositorio dentro del texto.
///
/// Devuelve el texto nuevo, o un error si el repositorio no está. El bloque
/// termina donde empieza el siguiente `[...]`, comentado o no.
pub fn cambiar_estado(texto: &str, nombre: &str, activo: bool) -> Result<String, String> {
    if !nombre_de_repositorio_valido(nombre) {
        return Err(format!("«{nombre}» no es un nombre de repositorio"));
    }
    if INTOCABLES.contains(&nombre) && !activo {
        return Err(format!(
            "{nombre} no se puede apagar desde la tienda: sin él el sistema se queda sin \
             actualizaciones"
        ));
    }

    let mut salida = String::with_capacity(texto.len());
    let mut dentro = false;
    let mut encontrado = false;

    for linea in texto.lines() {
        let (comentada, contenido) = descomentar(linea);
        if let Some(bloque) = cabecera(contenido) {
            dentro = bloque == nombre;
            if dentro {
                encontrado = true;
            }
        }

        if dentro && (contenido.starts_with('[') || es_clave_de_repositorio(contenido)) {
            if activo && comentada {
                salida.push_str(contenido);
                salida.push('\n');
                continue;
            }
            if !activo && !comentada {
                salida.push('#');
                salida.push_str(contenido);
                salida.push('\n');
                continue;
            }
        }

        salida.push_str(linea);
        salida.push('\n');
    }

    if !encontrado {
        return Err(format!("no hay ningún repositorio llamado {nombre}"));
    }
    Ok(salida)
}

/// Si la línea es una de las claves que forman parte de un bloque de repositorio.
///
/// Se comprueba en lugar de comentar todo lo que haya dentro del bloque para no
/// tocar los comentarios de verdad que alguien haya escrito ahí: apagar un
/// repositorio no debería convertir su explicación en `##`.
fn es_clave_de_repositorio(contenido: &str) -> bool {
    ["Server", "Include", "SigLevel", "Usage"]
        .iter()
        .any(|nombre| clave(contenido, nombre).is_some())
}

/// Agrega un bloque nuevo al final del texto.
pub fn agregar(
    texto: &str,
    nombre: &str,
    servidor: &str,
    siglevel: &str,
) -> Result<String, String> {
    if !nombre_de_repositorio_valido(nombre) {
        return Err(format!("«{nombre}» no es un nombre de repositorio"));
    }
    if !servidor_valido(servidor) {
        return Err("el servidor tiene que ser una URL http, https o ftp".to_string());
    }
    if !siglevel_valido(siglevel) {
        return Err(format!(
            "«{siglevel}» no es un nivel de firma que pacman entienda"
        ));
    }
    if analizar(texto).iter().any(|r| r.nombre == nombre) {
        return Err(format!("ya hay un repositorio llamado {nombre}"));
    }

    let mut salida = texto.to_string();
    if !salida.ends_with('\n') {
        salida.push('\n');
    }
    salida.push_str(&format!(
        "\n# Agregado desde la tienda de VasakOS.\n[{nombre}]\nSigLevel = {siglevel}\nServer = {servidor}\n"
    ));
    Ok(salida)
}

/// Saca el bloque de un repositorio del texto.
pub fn quitar(texto: &str, nombre: &str) -> Result<String, String> {
    if !nombre_de_repositorio_valido(nombre) {
        return Err(format!("«{nombre}» no es un nombre de repositorio"));
    }
    if INTOCABLES.contains(&nombre) {
        return Err(format!("{nombre} no se puede quitar desde la tienda"));
    }

    let mut salida = String::with_capacity(texto.len());
    let mut dentro = false;
    let mut encontrado = false;

    for linea in texto.lines() {
        let (_, contenido) = descomentar(linea);
        if let Some(bloque) = cabecera(contenido) {
            dentro = bloque == nombre;
            if dentro {
                encontrado = true;
                continue;
            }
        }
        if dentro && (es_clave_de_repositorio(contenido) || contenido.trim().is_empty()) {
            continue;
        }
        dentro = false;
        salida.push_str(linea);
        salida.push('\n');
    }

    if !encontrado {
        return Err(format!("no hay ningún repositorio llamado {nombre}"));
    }
    Ok(salida)
}

/// Los niveles de firma que pacman acepta.
///
/// Se valida contra la lista y no con una expresión: lo que se escribe acá
/// decide si los paquetes de ese repositorio se comprueban o no.
fn siglevel_valido(siglevel: &str) -> bool {
    const PALABRAS: &[&str] = &[
        "Required",
        "Optional",
        "Never",
        "TrustedOnly",
        "TrustAll",
        "PackageRequired",
        "PackageOptional",
        "PackageNever",
        "PackageTrustedOnly",
        "PackageTrustAll",
        "DatabaseRequired",
        "DatabaseOptional",
        "DatabaseNever",
        "DatabaseTrustedOnly",
        "DatabaseTrustAll",
    ];
    if siglevel.is_empty() || siglevel.len() > 200 {
        return false;
    }
    siglevel
        .split_whitespace()
        .all(|palabra| PALABRAS.contains(&palabra))
}

#[cfg(test)]
mod tests {
    use super::*;

    const EJEMPLO: &str = "\
[options]
HoldPkg = pacman glibc
Architecture = auto

[core]
Include = /etc/pacman.d/mirrorlist

[extra]
Include = /etc/pacman.d/mirrorlist

#[multilib]
#Include = /etc/pacman.d/mirrorlist

[vasakos]
SigLevel = Required DatabaseOptional
Server = https://repo.vasak.net.ar/repo/$arch/$repo
";

    #[test]
    fn se_leen_los_encendidos_y_los_apagados() {
        let repos = analizar(EJEMPLO);
        let nombres: Vec<&str> = repos.iter().map(|r| r.nombre.as_str()).collect();
        assert_eq!(nombres, vec!["core", "extra", "multilib", "vasakos"]);

        let multilib = repos.iter().find(|r| r.nombre == "multilib").unwrap();
        assert!(!multilib.activo, "un bloque comentado está apagado");
        assert_eq!(multilib.lista.as_deref(), Some("/etc/pacman.d/mirrorlist"));

        let vasakos = repos.iter().find(|r| r.nombre == "vasakos").unwrap();
        assert!(vasakos.activo);
        assert_eq!(
            vasakos.servidores,
            vec!["https://repo.vasak.net.ar/repo/$arch/$repo"]
        );
    }

    #[test]
    fn options_no_es_un_repositorio() {
        assert!(analizar(EJEMPLO).iter().all(|r| r.nombre != "options"));
    }

    #[test]
    fn encender_descomenta_solo_su_bloque() {
        let nuevo = cambiar_estado(EJEMPLO, "multilib", true).unwrap();
        let repos = analizar(&nuevo);
        assert!(
            repos
                .iter()
                .find(|r| r.nombre == "multilib")
                .unwrap()
                .activo
        );
        // Y no tocó a nadie más.
        assert!(repos.iter().find(|r| r.nombre == "vasakos").unwrap().activo);
        assert!(repos.iter().find(|r| r.nombre == "core").unwrap().activo);
    }

    #[test]
    fn apagar_comenta_solo_su_bloque() {
        let nuevo = cambiar_estado(EJEMPLO, "vasakos", false).unwrap();
        let repos = analizar(&nuevo);
        assert!(!repos.iter().find(|r| r.nombre == "vasakos").unwrap().activo);
        assert!(repos.iter().find(|r| r.nombre == "extra").unwrap().activo);
    }

    #[test]
    fn ida_y_vuelta_deja_el_archivo_igual() {
        let apagado = cambiar_estado(EJEMPLO, "vasakos", false).unwrap();
        let encendido = cambiar_estado(&apagado, "vasakos", true).unwrap();
        assert_eq!(encendido.trim_end(), EJEMPLO.trim_end());
    }

    #[test]
    fn los_intocables_no_se_pueden_apagar_ni_quitar() {
        assert!(cambiar_estado(EJEMPLO, "core", false).is_err());
        assert!(quitar(EJEMPLO, "extra").is_err());
        // Encenderlos sí, que no rompe nada.
        assert!(cambiar_estado(EJEMPLO, "core", true).is_ok());
    }

    #[test]
    fn un_repositorio_que_no_esta_da_error_y_no_texto_intacto() {
        // Devolver el texto sin cambios haría que la pantalla creyera que
        // funcionó y el conmutador se quedara al revés.
        assert!(cambiar_estado(EJEMPLO, "inexistente", true).is_err());
        assert!(quitar(EJEMPLO, "inexistente").is_err());
    }

    #[test]
    fn agregar_escribe_un_bloque_que_se_vuelve_a_leer() {
        let nuevo = agregar(EJEMPLO, "propio", "https://ejemplo.org/$arch", "Required").unwrap();
        let repos = analizar(&nuevo);
        let propio = repos.iter().find(|r| r.nombre == "propio").unwrap();
        assert!(propio.activo);
        assert_eq!(propio.servidores, vec!["https://ejemplo.org/$arch"]);
    }

    #[test]
    fn agregar_rechaza_lo_que_no_es_un_repositorio() {
        assert!(agregar(EJEMPLO, "vasakos", "https://x.org", "Required").is_err());
        assert!(agregar(EJEMPLO, "a]\n[core", "https://x.org", "Required").is_err());
        assert!(agregar(EJEMPLO, "propio", "file:///tmp", "Required").is_err());
        assert!(agregar(EJEMPLO, "propio", "https://x.org", "Nunca").is_err());
        // Y no acepta un nivel de firma inventado aunque contenga uno válido.
        assert!(agregar(EJEMPLO, "propio", "https://x.org", "Required Inventado").is_err());
    }

    #[test]
    fn quitar_se_lleva_el_bloque_entero() {
        let nuevo = quitar(EJEMPLO, "vasakos").unwrap();
        assert!(analizar(&nuevo).iter().all(|r| r.nombre != "vasakos"));
        assert!(!nuevo.contains("repo.vasak.net.ar"));
        // Y deja el resto en pie.
        assert!(nuevo.contains("[core]"));
        assert!(nuevo.contains("#[multilib]"));
    }

    #[test]
    fn los_comentarios_de_verdad_sobreviven_a_apagar() {
        let texto =
            "[vasakos]\n# Este repositorio lo mantiene el proyecto.\nServer = https://x.org\n";
        let apagado = cambiar_estado(texto, "vasakos", false).unwrap();
        assert!(
            apagado.contains("# Este repositorio lo mantiene el proyecto."),
            "el comentario se convirtió en ## al apagar: {apagado}"
        );
    }

    #[test]
    fn el_nivel_de_firma_solo_acepta_las_palabras_de_pacman() {
        assert!(siglevel_valido("Required DatabaseOptional"));
        assert!(siglevel_valido("Never"));
        assert!(!siglevel_valido(""));
        assert!(!siglevel_valido("Required; rm -rf /"));
    }
}
