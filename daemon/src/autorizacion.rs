//! Preguntarle a polkit si quien llama puede hacer lo que pide.
//!
//! Este proceso corre como root y recibe órdenes de una ventana que corre como
//! la persona. La única razón por la que esa separación sirve de algo es que
//! entre las dos haya una autorización que la ventana no pueda darse sola:
//! polkit levanta el diálogo, en un proceso que quien llama no controla, y
//! contesta sí o no.

use std::collections::HashMap;

use zbus::fdo::Error as FdoError;
use zbus::zvariant::Value;

/// Comprueba a quien llama contra una acción de polkit.
///
/// El sujeto se identifica con `unix-process` **y su hora de arranque**, no con
/// el PID a secas. Un PID se recicla: entre que llega el mensaje y polkit mira
/// quién es, el proceso que preguntó puede haber muerto y su número haber caído
/// en otro. La hora de arranque hace que ese otro no se haga pasar por él.
pub async fn autorizar(
    conexion: &zbus::Connection,
    quien: u32,
    accion: &str,
) -> Result<(), FdoError> {
    let arranque = hora_de_arranque(quien)?;

    let mut sujeto: HashMap<&str, Value<'_>> = HashMap::new();
    sujeto.insert("pid", Value::U32(quien));
    sujeto.insert("start-time", Value::U64(arranque));

    let sujeto = ("unix-process", sujeto);
    let detalles: HashMap<&str, &str> = HashMap::new();
    // 1 = dejar que polkit muestre el diálogo. Sin esta bandera contesta «no
    // autorizado» a todo lo que necesite contraseña, y la tienda no tendría
    // manera de pedirla.
    let banderas: u32 = 1;

    let respuesta = conexion
        .call_method(
            Some("org.freedesktop.PolicyKit1"),
            "/org/freedesktop/PolicyKit1/Authority",
            Some("org.freedesktop.PolicyKit1.Authority"),
            "CheckAuthorization",
            &(sujeto, accion, detalles, banderas, ""),
        )
        .await
        .map_err(|e| FdoError::Failed(format!("no se pudo consultar a polkit: {e}")))?;

    let (autorizado, _desafio, _detalles): (bool, bool, HashMap<String, String>) = respuesta
        .body()
        .deserialize()
        .map_err(|e| FdoError::Failed(format!("respuesta inesperada de polkit: {e}")))?;

    if autorizado {
        Ok(())
    } else {
        Err(FdoError::AccessDenied("no se autorizó la operación".into()))
    }
}

/// El PID del proceso del otro lado del bus.
pub async fn quien_llama(
    conexion: &zbus::Connection,
    remitente: Option<&zbus::names::UniqueName<'_>>,
) -> Result<u32, FdoError> {
    let remitente = remitente.ok_or_else(|| FdoError::Failed("mensaje sin remitente".into()))?;
    let bus = zbus::fdo::DBusProxy::new(conexion)
        .await
        .map_err(|e| FdoError::Failed(format!("no se pudo hablar con el bus: {e}")))?;
    bus.get_connection_unix_process_id(remitente.clone().into())
        .await
}

/// El campo 22 de `/proc/<pid>/stat`: cuándo arrancó, en tics de reloj.
///
/// Se busca desde el último `)` y no partiendo la línea por espacios, porque el
/// campo 2 es el nombre del ejecutable entre paréntesis y puede tener espacios
/// —o paréntesis— adentro. Partir por espacios corre de lugar todos los campos
/// que vienen después, y el 22 dejaría de ser la hora de arranque.
fn hora_de_arranque(pid: u32) -> Result<u64, FdoError> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat"))
        .map_err(|e| FdoError::Failed(format!("no se pudo leer /proc/{pid}/stat: {e}")))?;
    interpretar_arranque(&stat)
        .ok_or_else(|| FdoError::Failed(format!("no se pudo interpretar /proc/{pid}/stat")))
}

fn interpretar_arranque(stat: &str) -> Option<u64> {
    let resto = stat.rsplit_once(')')?.1;
    // Tras el `)` viene el campo 3. La hora de arranque es el 22, o sea el
    // vigésimo de los que quedan.
    resto.split_whitespace().nth(19)?.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Campos 3 a 21 de relleno y el 22 con un valor reconocible.
    const STAT: &str = "1234 (bash) S 1 1 1 0 -1 0 0 0 0 0 0 0 0 0 0 0 0 0 987654 4194304 0 0";

    #[test]
    fn se_saca_la_hora_de_arranque_de_una_linea_normal() {
        assert_eq!(interpretar_arranque(STAT), Some(987654));
    }

    #[test]
    fn un_ejecutable_con_espacios_y_parentesis_no_corre_los_campos() {
        // Partir la línea por espacios daría `programa` como campo 3 y todo lo
        // de atrás correría dos lugares: el 22 sería otra cosa.
        let raro = STAT.replace("(bash)", "(mi programa (raro))");
        assert_eq!(interpretar_arranque(&raro), Some(987654));
    }

    #[test]
    fn una_linea_rota_no_inventa_una_hora() {
        assert_eq!(interpretar_arranque(""), None);
        assert_eq!(interpretar_arranque("1234 (bash"), None);
        assert_eq!(interpretar_arranque("1234 (bash) S 1 2 3"), None);
    }

    /// Que el campo elegido sea el correcto, medido contra algo de afuera.
    ///
    /// Un número equivocado —el 21 o el 23— también se lee y también parsea; lo
    /// único que lo delata es compararlo con la realidad. La hora de arranque
    /// de este proceso, en segundos desde que arrancó la máquina, no puede ser
    /// mayor que hace cuánto arrancó la máquina.
    #[test]
    fn la_hora_de_arranque_cae_dentro_del_tiempo_encendido() {
        let ticks = hora_de_arranque(std::process::id()).expect("no se pudo leer /proc");
        let segundos = ticks as f64 / 100.0;

        let uptime = std::fs::read_to_string("/proc/uptime").expect("no se pudo leer /proc/uptime");
        let encendida: f64 = uptime.split_whitespace().next().unwrap().parse().unwrap();

        assert!(
            segundos <= encendida,
            "este proceso habría arrancado {segundos}s tras el encendido, y la máquina \
             lleva {encendida}s prendida"
        );
    }

    /// El proceso de la prueba existe, así que esto lee un `/proc` de verdad.
    #[test]
    fn la_hora_de_arranque_de_este_proceso_se_puede_leer() {
        let yo = std::process::id();
        assert!(hora_de_arranque(yo).is_ok());
    }
}
