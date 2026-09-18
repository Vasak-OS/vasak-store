//! El AUR: buscar, mirar la receta y compilar.
//!
//! ## Por qué no hay un ayudante del AUR acá abajo
//!
//! Delegar en `paru` o `yay` habría sido menos código. A cambio, la tienda
//! dependería de una herramienta pensada para una terminal —su salida es para
//! leer, no para parsear— y el paso que importa, el de instalar, lo daría ella
//! con sus propias reglas. Acá la RPC da los metadatos, `makepkg` compila **como
//! la persona** y el paquete construido se lo entrega al demonio, que es el
//! único que instala. Cada pieza hace una cosa.
//!
//! ## Y por qué se muestra la receta antes
//!
//! Un paquete del AUR es un guión que alguien subió y que va a correr en esta
//! máquina. La política de la distribución lo marca como inseguro, y marcarlo
//! sin dar manera de mirarlo es un cartel. `receta` trae el PKGBUILD para que la
//! ventana lo muestre antes de compilar nada.

use std::path::{Path, PathBuf};
use std::process::Stdio;

use raur::Raur;
use vasak_store_protocol::nombre_de_paquete_valido;

use crate::tipos::{Detalle, Icono, Origen, Tarjeta};

/// De dónde se clonan las recetas.
const GIT: &str = "https://aur.archlinux.org";

/// Hasta dónde se sigue la cadena de dependencias del AUR.
///
/// Diez es mucho más de lo que cualquier paquete real necesita. El límite está
/// para que una dependencia circular —que en el AUR existe— no deje esto dando
/// vueltas para siempre.
const PROFUNDIDAD: usize = 10;

/// Cuánto se espera a la RPC.
const PLAZO: std::time::Duration = std::time::Duration::from_secs(15);

fn handle() -> raur::Handle {
    raur::Handle::new()
}

/// Busca en el AUR.
pub async fn buscar(consulta: &str) -> Result<Vec<Tarjeta>, String> {
    if consulta.trim().len() < 2 {
        return Ok(Vec::new());
    }
    let paquetes = tokio::time::timeout(PLAZO, handle().search(consulta))
        .await
        .map_err(|_| "el AUR no contestó a tiempo".to_string())?
        .map_err(|e| format!("no se pudo consultar el AUR: {e}"))?;

    let mut tarjetas: Vec<Tarjeta> = paquetes.into_iter().map(tarjeta).collect();
    // Por votos: en el AUR hay muchos paquetes con el mismo nombre más un
    // sufijo —`-git`, `-bin`, `-beta`— y los votos son lo más parecido a «cuál
    // usa la gente» que la RPC ofrece.
    tarjetas.sort_by(|a, b| b.votos.cmp(&a.votos));
    Ok(tarjetas)
}

/// La ficha de un paquete del AUR.
pub async fn detalle(nombre: &str) -> Result<Option<Detalle>, String> {
    if !nombre_de_paquete_valido(nombre) {
        return Err(format!("«{nombre}» no es un nombre de paquete"));
    }
    let mut paquetes = tokio::time::timeout(PLAZO, handle().info(&[nombre]))
        .await
        .map_err(|_| "el AUR no contestó a tiempo".to_string())?
        .map_err(|e| format!("no se pudo consultar el AUR: {e}"))?;

    let Some(paquete) = paquetes.pop() else {
        return Ok(None);
    };

    Ok(Some(Detalle {
        descripcion: paquete.description.clone().unwrap_or_default(),
        capturas: Vec::new(),
        web: paquete.url.clone(),
        licencia: (!paquete.license.is_empty()).then(|| paquete.license.join(", ")),
        autor: paquete.maintainer.clone(),
        empaquetador: paquete.maintainer.clone(),
        arquitectura: None,
        descarga: 0,
        construido: paquete.first_submitted,
        instalado_el: None,
        dependencias: paquete.depends.clone(),
        opcionales: paquete.opt_depends.clone(),
        requerido_por: Vec::new(),
        tarjeta: tarjeta(paquete),
    }))
}

fn tarjeta(paquete: raur::Package) -> Tarjeta {
    Tarjeta {
        nombre: paquete.name.clone(),
        titulo: paquete.name.clone(),
        resumen: paquete.description.unwrap_or_default(),
        version: paquete.version,
        origen: Origen::Aur,
        repositorio: "aur".to_string(),
        instalada: false,
        actualizable: None,
        tamano: 0,
        icono: Icono::del_tema("package-x-generic"),
        categorias: Vec::new(),
        votos: Some(paquete.num_votes),
        popularidad: Some(paquete.popularity),
        actualizado: Some(paquete.last_modified),
        captura: None,
    }
}

/// El PKGBUILD tal como está en el AUR, para poder leerlo antes de compilar.
pub async fn receta(nombre: &str) -> Result<String, String> {
    if !nombre_de_paquete_valido(nombre) {
        return Err(format!("«{nombre}» no es un nombre de paquete"));
    }
    // La base y no el nombre: varios paquetes salen de la misma receta y el
    // archivo está publicado bajo el nombre de la base.
    let base = base_de(nombre).await?;
    let url = format!("{GIT}/cgit/aur.git/plain/PKGBUILD?h={base}");

    let respuesta = reqwest::Client::new()
        .get(&url)
        .timeout(PLAZO)
        .send()
        .await
        .map_err(|e| format!("no se pudo traer la receta: {e}"))?;
    if !respuesta.status().is_success() {
        return Err(format!("el AUR no tiene la receta de {base}"));
    }
    respuesta
        .text()
        .await
        .map_err(|e| format!("no se pudo leer la receta: {e}"))
}

async fn base_de(nombre: &str) -> Result<String, String> {
    let paquetes = tokio::time::timeout(PLAZO, handle().info(&[nombre]))
        .await
        .map_err(|_| "el AUR no contestó a tiempo".to_string())?
        .map_err(|e| format!("no se pudo consultar el AUR: {e}"))?;
    paquetes
        .into_iter()
        .next()
        .map(|p| p.package_base)
        .ok_or_else(|| format!("el AUR no tiene ningún paquete llamado {nombre}"))
}

/// Lo que hay que hacer para instalar algo del AUR.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct Plan {
    /// Las que salen de los repositorios y las instala el demonio.
    pub del_repositorio: Vec<String>,
    /// Las del AUR, en orden de compilación: las dependencias antes.
    pub del_aur: Vec<String>,
}

/// Arma el plan de compilación resolviendo las dependencias del AUR.
///
/// Devuelve las del AUR ordenadas para que ninguna se compile antes que algo que
/// necesita. Lo que no está ni en el AUR ni instalado se deja pasar: puede ser
/// una dependencia de un repositorio, o algo que otro paquete provee con otro
/// nombre, y decidir eso es trabajo de libalpm, no de esto.
pub async fn planificar(
    raiz: &str,
    esta_instalado: impl Fn(&str) -> bool + Sync,
    esta_en_repositorio: impl Fn(&str) -> bool + Sync,
) -> Result<Plan, String> {
    if !nombre_de_paquete_valido(raiz) {
        return Err(format!("«{raiz}» no es un nombre de paquete"));
    }

    let mut del_aur: Vec<String> = Vec::new();
    let mut del_repositorio: Vec<String> = Vec::new();
    let mut vistos: Vec<String> = Vec::new();
    let mut por_ver: Vec<(String, usize)> = vec![(raiz.to_string(), 0)];

    while let Some((nombre, hondura)) = por_ver.pop() {
        if vistos.contains(&nombre) || hondura > PROFUNDIDAD {
            continue;
        }
        vistos.push(nombre.clone());

        let paquetes = tokio::time::timeout(PLAZO, handle().info(&[&nombre]))
            .await
            .map_err(|_| "el AUR no contestó a tiempo".to_string())?
            .map_err(|e| format!("no se pudo consultar el AUR: {e}"))?;

        let Some(paquete) = paquetes.into_iter().next() else {
            continue;
        };

        for dependencia in paquete
            .depends
            .iter()
            .chain(paquete.make_depends.iter())
            .map(|d| sin_version(d))
        {
            if esta_instalado(dependencia) || vistos.iter().any(|v| v == dependencia) {
                continue;
            }
            if esta_en_repositorio(dependencia) {
                if !del_repositorio.iter().any(|r| r == dependencia) {
                    del_repositorio.push(dependencia.to_string());
                }
                continue;
            }
            if nombre_de_paquete_valido(dependencia) {
                por_ver.push((dependencia.to_string(), hondura + 1));
            }
        }

        // Al final: lo que se agregó después —sus dependencias— tiene que
        // compilarse antes que él.
        del_aur.retain(|n| n != &paquete.name);
        del_aur.insert(0, paquete.name);
    }

    Ok(Plan {
        del_repositorio,
        del_aur,
    })
}

/// Saca la restricción de versión de una dependencia: `glibc>=2.38` -> `glibc`.
pub fn sin_version(dependencia: &str) -> &str {
    let corte = dependencia
        .find(|c| matches!(c, '>' | '<' | '=' | ':'))
        .unwrap_or(dependencia.len());
    dependencia[..corte].trim()
}

/// Clona la receta y compila. Devuelve los paquetes construidos.
///
/// `makepkg` corre **como la persona**, nunca como root: es lo que la propia
/// herramienta exige y es lo que hace que un PKGBUILD malicioso no tenga de
/// entrada el sistema entero. `--nodeps` porque las dependencias las instaló
/// antes el demonio; sin eso, makepkg querría llamar a pacman con sudo.
pub async fn construir(
    nombre: &str,
    trabajo: &Path,
    registrar: impl Fn(String) + Send + 'static,
) -> Result<Vec<String>, String> {
    if !nombre_de_paquete_valido(nombre) {
        return Err(format!("«{nombre}» no es un nombre de paquete"));
    }
    let base = base_de(nombre).await?;
    if !nombre_de_paquete_valido(&base) {
        return Err(format!("«{base}» no es un nombre de receta"));
    }

    let directorio = trabajo.join(&base);
    tokio::fs::create_dir_all(trabajo)
        .await
        .map_err(|e| format!("no se pudo preparar el directorio de compilación: {e}"))?;

    if directorio.join(".git").is_dir() {
        correr(
            "git",
            &["-C", &ruta(&directorio), "pull", "--ff-only"],
            None,
            &registrar,
        )
        .await?;
    } else {
        // Se borra lo que haya quedado de un intento anterior: un directorio a
        // medio clonar hace fallar el clone con un error que no dice nada.
        let _ = tokio::fs::remove_dir_all(&directorio).await;
        correr(
            "git",
            &[
                "clone",
                "--depth",
                "1",
                &format!("{GIT}/{base}.git"),
                &ruta(&directorio),
            ],
            None,
            &registrar,
        )
        .await?;
    }

    correr(
        "makepkg",
        &[
            "--force",
            "--noconfirm",
            "--noprogressbar",
            "--nodeps",
            "--needed",
        ],
        Some(&directorio),
        &registrar,
    )
    .await?;

    let mut construidos = Vec::new();
    let mut entradas = tokio::fs::read_dir(&directorio)
        .await
        .map_err(|e| format!("no se pudo mirar el directorio de compilación: {e}"))?;
    while let Ok(Some(entrada)) = entradas.next_entry().await {
        let ruta = entrada.path();
        let nombre = ruta.to_string_lossy().to_string();
        if nombre.ends_with(".pkg.tar.zst") || nombre.ends_with(".pkg.tar.xz") {
            construidos.push(nombre);
        }
    }
    if construidos.is_empty() {
        return Err("la compilación terminó sin dejar ningún paquete".to_string());
    }
    construidos.sort();
    Ok(construidos)
}

fn ruta(p: &Path) -> String {
    p.to_string_lossy().to_string()
}

/// Corre un programa y manda su salida, línea por línea, a donde se le diga.
async fn correr(
    programa: &str,
    argumentos: &[&str],
    directorio: Option<&Path>,
    registrar: &(impl Fn(String) + Send + 'static),
) -> Result<(), String> {
    use tokio::io::{AsyncBufReadExt, BufReader};

    let mut orden = tokio::process::Command::new(programa);
    orden
        .args(argumentos)
        .stdout(Stdio::piped())
        // La salida de error va al mismo lado: makepkg escribe ahí casi todo lo
        // que importa, y separarlas haría que el registro contara la mitad.
        .stderr(Stdio::piped())
        .stdin(Stdio::null());
    if let Some(directorio) = directorio {
        orden.current_dir(directorio);
    }

    let mut hijo = orden
        .spawn()
        .map_err(|e| format!("no se pudo ejecutar {programa}: {e}"))?;

    // Las dos salidas se leen **a la vez**. De a una se traba: mientras se
    // vacía la estándar, la de error llena su tubería de 64 KB y el proceso
    // queda bloqueado escribiendo en ella para siempre. `makepkg` escribe casi
    // todo por la de error, así que era cuestión de compilar algo grande.
    let mut salida = hijo.stdout.take().map(|s| BufReader::new(s).lines());
    let mut errores = hijo.stderr.take().map(|s| BufReader::new(s).lines());

    loop {
        let de_salida = async {
            match salida.as_mut() {
                Some(lineas) => lineas.next_line().await.ok().flatten(),
                None => std::future::pending().await,
            }
        };
        let de_errores = async {
            match errores.as_mut() {
                Some(lineas) => lineas.next_line().await.ok().flatten(),
                None => std::future::pending().await,
            }
        };

        tokio::select! {
            linea = de_salida => match linea {
                Some(linea) => registrar(linea),
                None => salida = None,
            },
            linea = de_errores => match linea {
                Some(linea) => registrar(linea),
                None => errores = None,
            },
        }

        if salida.is_none() && errores.is_none() {
            break;
        }
    }

    let estado = hijo
        .wait()
        .await
        .map_err(|e| format!("{programa} terminó mal: {e}"))?;
    if estado.success() {
        Ok(())
    } else {
        Err(format!(
            "{programa} falló con código {}",
            estado.code().unwrap_or(-1)
        ))
    }
}

/// Dónde se compila.
pub fn directorio_de_trabajo(cache: &Path) -> PathBuf {
    cache.join("aur")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_restriccion_de_version_se_saca_de_la_dependencia() {
        assert_eq!(sin_version("glibc>=2.38"), "glibc");
        assert_eq!(sin_version("python<4"), "python");
        assert_eq!(sin_version("foo=1.0"), "foo");
        assert_eq!(sin_version("libfoo.so:1.0"), "libfoo.so");
        assert_eq!(sin_version("gtk3"), "gtk3");
    }

    #[test]
    fn un_nombre_que_no_es_un_nombre_no_llega_a_una_url_ni_a_una_ruta() {
        // Es lo que impide que un nombre con `../` o con `;` termine en el
        // argumento de `git clone` o en una ruta del disco.
        let trabajo = std::path::Path::new("/tmp");
        let resultado = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(construir("../../etc", trabajo, |_| {}));
        assert!(resultado.is_err());
    }

    #[test]
    fn el_directorio_de_compilacion_cuelga_de_la_cache() {
        let cache = std::path::Path::new("/home/alguien/.cache/vasak-store");
        assert_eq!(
            directorio_de_trabajo(cache),
            std::path::PathBuf::from("/home/alguien/.cache/vasak-store/aur")
        );
    }
}
