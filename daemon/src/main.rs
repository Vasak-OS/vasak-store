//! El servicio de sistema de la tienda de VasakOS.
//!
//! Corre como root y hace tres cosas: cambiar paquetes, escribir
//! `/etc/pacman.conf` y contar qué está pasando mientras lo hace. Nada más.
//!
//! Lo que **no** hace es tan importante como lo que hace: no busca, no lista lo
//! instalado y no calcula qué se puede actualizar. Todo eso son lecturas de
//! bases de datos que cualquiera puede leer, y las hace la aplicación en su
//! propio proceso, sin privilegios. Un demonio con root que además atiende
//! consultas es un demonio con más superficie de la que necesita.

mod autorizacion;
mod motor;
mod repositorios;

use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::OnceLock;

use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};
use tokio::sync::oneshot;
use vasak_store_protocol::{
    nombre_de_paquete_valido, ruta_de_paquete_valida, ACCION_PAQUETES, ACCION_REPOSITORIOS, RUTA,
    SERVICIO,
};
use zbus::fdo::Error as FdoError;
use zbus::object_server::SignalEmitter;

/// Cuánto se queda el demonio sin hacer nada antes de irse.
///
/// Un proceso con root que duerme mientras la ventana está abierta es
/// superficie de ataque a cambio de nada. systemd lo vuelve a levantar por
/// activación de D-Bus en cuanto alguien pide algo, y el arranque son
/// milisegundos.
const OCIO: std::time::Duration = std::time::Duration::from_secs(300);

struct Tienda {
    ordenes: UnboundedSender<motor::Orden>,
    /// De dónde salen los identificadores de transacción.
    contador: AtomicU64,
    /// Cuántas operaciones hay encoladas o en curso.
    ///
    /// El candado de pacman admite un solo dueño, así que dos transacciones a
    /// la vez no es algo que se pueda permitir y encolarlas en silencio sería
    /// peor: la segunda parecería colgada durante los minutos que tarde la
    /// primera. Se rechaza y se dice por qué.
    en_curso: AtomicUsize,
    /// La conexión al bus, para poder preguntarle a polkit.
    ///
    /// Llega después de construir esto y por eso es un `OnceLock`: el objeto se
    /// entrega a `serve_at` mientras se arma la conexión, así que no existe
    /// todavía cuando este campo se inicializa. La alternativa era abrir una
    /// segunda conexión al bus del sistema sólo para guardarla acá.
    conexion: OnceLock<zbus::Connection>,
}

#[zbus::interface(name = "ar.net.vasak.os.Store")]
impl Tienda {
    /// Instala paquetes de los repositorios.
    async fn instalar(
        &self,
        #[zbus(header)] cabecera: zbus::message::Header<'_>,
        paquetes: Vec<String>,
    ) -> zbus::fdo::Result<String> {
        self.permiso(&cabecera, ACCION_PAQUETES).await?;
        comprobar_nombres(&paquetes)?;
        let id = self.encolar(|id| motor::Orden::Instalar { id, paquetes })?;
        Ok(id)
    }

    /// Instala paquetes ya construidos. Es como entra lo que se compila del AUR.
    async fn instalar_archivos(
        &self,
        #[zbus(header)] cabecera: zbus::message::Header<'_>,
        rutas: Vec<String>,
    ) -> zbus::fdo::Result<String> {
        self.permiso(&cabecera, ACCION_PAQUETES).await?;
        if rutas.is_empty() {
            return Err(FdoError::InvalidArgs("no se pidió ningún archivo".into()));
        }
        for ruta in &rutas {
            if !ruta_de_paquete_valida(ruta) {
                return Err(FdoError::InvalidArgs(format!(
                    "«{ruta}» no es la ruta de un paquete"
                )));
            }
        }
        let id = self.encolar(|id| motor::Orden::InstalarArchivos { id, rutas })?;
        Ok(id)
    }

    /// Desinstala paquetes.
    async fn quitar(
        &self,
        #[zbus(header)] cabecera: zbus::message::Header<'_>,
        paquetes: Vec<String>,
        con_huerfanas: bool,
    ) -> zbus::fdo::Result<String> {
        self.permiso(&cabecera, ACCION_PAQUETES).await?;
        comprobar_nombres(&paquetes)?;
        let id = self.encolar(|id| motor::Orden::Quitar {
            id,
            paquetes,
            con_huerfanas,
        })?;
        Ok(id)
    }

    /// Actualiza el sistema entero.
    async fn actualizar(
        &self,
        #[zbus(header)] cabecera: zbus::message::Header<'_>,
    ) -> zbus::fdo::Result<String> {
        self.permiso(&cabecera, ACCION_PAQUETES).await?;
        self.encolar(|id| motor::Orden::Actualizar { id })
    }

    /// Baja las bases de datos de los repositorios.
    async fn sincronizar(
        &self,
        #[zbus(header)] cabecera: zbus::message::Header<'_>,
    ) -> zbus::fdo::Result<String> {
        self.permiso(&cabecera, ACCION_PAQUETES).await?;
        self.encolar(|id| motor::Orden::Sincronizar { id })
    }

    /// Qué arrastraría una operación, sin hacerla. Devuelve JSON.
    ///
    /// No pide autorización: no cambia nada. Sí toma el candado de pacman un
    /// instante, que es el motivo por el que se rechaza si hay algo en curso.
    async fn previsualizar(
        &self,
        operacion: &str,
        paquetes: Vec<String>,
        con_huerfanas: bool,
    ) -> zbus::fdo::Result<String> {
        comprobar_nombres_si_hay(&paquetes)?;
        let peticion = match operacion {
            "instalar" => motor::Peticion::Instalar(paquetes),
            "quitar" => motor::Peticion::Quitar {
                paquetes,
                con_huerfanas,
            },
            "actualizar" => motor::Peticion::Actualizar,
            otra => {
                return Err(FdoError::InvalidArgs(format!(
                    "«{otra}» no es una operación"
                )))
            }
        };

        if self.en_curso.load(Ordering::SeqCst) > 0 {
            return Err(FdoError::Failed(
                "hay una operación de paquetes en curso".into(),
            ));
        }

        let (responder, respuesta) = oneshot::channel();
        self.ordenes
            .send(motor::Orden::Previsualizar {
                operacion: peticion,
                responder,
            })
            .map_err(|_| FdoError::Failed("el motor de paquetes no está".into()))?;

        let informe = respuesta
            .await
            .map_err(|_| FdoError::Failed("el motor de paquetes no contestó".into()))?
            .map_err(FdoError::Failed)?;

        serde_json::to_string(&informe)
            .map_err(|e| FdoError::Failed(format!("no se pudo serializar: {e}")))
    }

    /// Los repositorios de `pacman.conf`, encendidos y apagados. Devuelve JSON.
    async fn repositorios(&self) -> zbus::fdo::Result<String> {
        let lista = repositorios::listar().map_err(FdoError::Failed)?;
        serde_json::to_string(&lista)
            .map_err(|e| FdoError::Failed(format!("no se pudo serializar: {e}")))
    }

    /// Enciende o apaga un repositorio.
    async fn cambiar_repositorio(
        &self,
        #[zbus(header)] cabecera: zbus::message::Header<'_>,
        nombre: &str,
        activo: bool,
    ) -> zbus::fdo::Result<()> {
        self.permiso(&cabecera, ACCION_REPOSITORIOS).await?;
        self.reescribir(|texto| repositorios::cambiar_estado(texto, nombre, activo))
    }

    /// Agrega un repositorio de terceros.
    async fn agregar_repositorio(
        &self,
        #[zbus(header)] cabecera: zbus::message::Header<'_>,
        nombre: &str,
        servidor: &str,
        siglevel: &str,
    ) -> zbus::fdo::Result<()> {
        self.permiso(&cabecera, ACCION_REPOSITORIOS).await?;
        self.reescribir(|texto| repositorios::agregar(texto, nombre, servidor, siglevel))
    }

    /// Saca un repositorio.
    async fn quitar_repositorio(
        &self,
        #[zbus(header)] cabecera: zbus::message::Header<'_>,
        nombre: &str,
    ) -> zbus::fdo::Result<()> {
        self.permiso(&cabecera, ACCION_REPOSITORIOS).await?;
        self.reescribir(|texto| repositorios::quitar(texto, nombre))
    }

    /// Un paso de una operación. El segundo argumento es JSON.
    #[zbus(signal)]
    async fn avance(emisor: &SignalEmitter<'_>, id: &str, avance: &str) -> zbus::Result<()>;

    /// Una línea de registro de una operación.
    #[zbus(signal)]
    async fn registro(emisor: &SignalEmitter<'_>, id: &str, linea: &str) -> zbus::Result<()>;

    /// Una operación terminó. `error` vacío quiere decir que salió bien.
    #[zbus(signal)]
    async fn terminada(emisor: &SignalEmitter<'_>, id: &str, error: &str) -> zbus::Result<()>;
}

impl Tienda {
    /// Autoriza a quien llama, o devuelve el error que corresponda.
    async fn permiso(
        &self,
        cabecera: &zbus::message::Header<'_>,
        accion: &str,
    ) -> Result<(), FdoError> {
        let conexion = self
            .conexion
            .get()
            .ok_or_else(|| FdoError::Failed("el servicio todavía no está listo".into()))?;
        let quien = autorizacion::quien_llama(conexion, cabecera.sender()).await?;
        autorizacion::autorizar(conexion, quien, accion).await
    }

    /// Manda una orden al motor con un identificador nuevo.
    fn encolar(&self, armar: impl FnOnce(String) -> motor::Orden) -> Result<String, FdoError> {
        if self.en_curso.load(Ordering::SeqCst) > 0 {
            return Err(FdoError::Failed(
                "hay una operación de paquetes en curso".into(),
            ));
        }
        let id = format!("t{}", self.contador.fetch_add(1, Ordering::SeqCst));
        self.en_curso.fetch_add(1, Ordering::SeqCst);
        self.ordenes.send(armar(id.clone())).map_err(|_| {
            self.en_curso.fetch_sub(1, Ordering::SeqCst);
            FdoError::Failed("el motor de paquetes no está".into())
        })?;
        Ok(id)
    }

    /// Lee `pacman.conf`, le aplica la transformación y lo vuelve a escribir.
    ///
    /// Lectura y escritura pegadas, sin nada en el medio: cuanto más corto sea
    /// ese hueco, menos posibilidad de pisar un cambio que alguien haya hecho
    /// con un editor mientras tanto.
    fn reescribir(
        &self,
        transformar: impl FnOnce(&str) -> Result<String, String>,
    ) -> Result<(), FdoError> {
        let texto = std::fs::read_to_string(repositorios::RUTA).map_err(|e| {
            FdoError::Failed(format!("no se pudo leer {}: {e}", repositorios::RUTA))
        })?;
        let nuevo = transformar(&texto).map_err(FdoError::Failed)?;
        repositorios::escribir(&nuevo).map_err(FdoError::Failed)
    }
}

/// Rechaza una lista de paquetes vacía o con nombres que no lo son.
fn comprobar_nombres(paquetes: &[String]) -> Result<(), FdoError> {
    if paquetes.is_empty() {
        return Err(FdoError::InvalidArgs("no se pidió ningún paquete".into()));
    }
    comprobar_nombres_si_hay(paquetes)
}

fn comprobar_nombres_si_hay(paquetes: &[String]) -> Result<(), FdoError> {
    for nombre in paquetes {
        if !nombre_de_paquete_valido(nombre) {
            return Err(FdoError::InvalidArgs(format!(
                "«{nombre}» no es un nombre de paquete"
            )));
        }
    }
    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let (ordenes, recibidas) = unbounded_channel();
    let (novedades, mut novedades_recibidas) = unbounded_channel();

    // El motor en su propio hilo del sistema operativo: el handle de libalpm no
    // es `Send` y las operaciones bloquean durante minutos.
    std::thread::Builder::new()
        .name("alpm".to_string())
        .spawn(move || motor::atender(recibidas, novedades))?;

    let conexion = zbus::connection::Builder::system()?
        .name(SERVICIO)?
        .serve_at(
            RUTA,
            Tienda {
                ordenes,
                contador: AtomicU64::new(1),
                en_curso: AtomicUsize::new(0),
                conexion: OnceLock::new(),
            },
        )?
        .build()
        .await?;

    // Recién ahora existe la conexión que los métodos necesitan para hablar con
    // polkit. Hasta que esto corra, cualquier llamada se rechaza.
    conexion
        .object_server()
        .interface::<_, Tienda>(RUTA)
        .await?
        .get()
        .await
        .conexion
        .set(conexion.clone())
        .map_err(|_| "la conexión ya estaba puesta")?;

    tracing::info!("{SERVICIO} en el bus del sistema");

    let emisor = SignalEmitter::new(&conexion, RUTA)?;
    let servidor = conexion.object_server();

    loop {
        let novedad = tokio::time::timeout(OCIO, novedades_recibidas.recv()).await;
        let novedad = match novedad {
            Err(_) => {
                // Se cumplió el plazo sin novedades. Si además no hay nada en
                // curso, no hay motivo para seguir vivo.
                let interfaz = servidor.interface::<_, Tienda>(RUTA).await?;
                if interfaz.get().await.en_curso.load(Ordering::SeqCst) == 0 {
                    tracing::info!("sin trabajo, se cierra");
                    return Ok(());
                }
                continue;
            }
            Ok(None) => return Ok(()),
            Ok(Some(novedad)) => novedad,
        };

        match novedad {
            motor::Novedad::Avance { id, avance } => {
                let json = serde_json::to_string(&avance)?;
                Tienda::avance(&emisor, &id, &json).await?;
            }
            motor::Novedad::Registro { id, linea } => {
                Tienda::registro(&emisor, &id, &linea).await?;
            }
            motor::Novedad::Terminada { id, error } => {
                let interfaz = servidor.interface::<_, Tienda>(RUTA).await?;
                interfaz.get().await.en_curso.fetch_sub(1, Ordering::SeqCst);
                if let Some(razon) = &error {
                    tracing::warn!("la operación {id} falló: {razon}");
                }
                Tienda::terminada(&emisor, &id, error.as_deref().unwrap_or("")).await?;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn una_lista_vacia_de_paquetes_se_rechaza() {
        assert!(comprobar_nombres(&[]).is_err());
        // Pero previsualizar una actualización no lleva paquetes y tiene que pasar.
        assert!(comprobar_nombres_si_hay(&[]).is_ok());
    }

    #[test]
    fn un_nombre_que_no_es_un_nombre_se_rechaza_antes_de_llegar_al_motor() {
        let malos = vec!["../../etc/shadow".to_string()];
        assert!(comprobar_nombres(&malos).is_err());
    }

    /// La interfaz es el contrato con la aplicación: si un método cambia de
    /// nombre o de firma, la ventana deja de funcionar y no lo dice hasta que
    /// alguien la abre. Esto lo convierte en un fallo de compilación.
    #[test]
    fn la_interfaz_exporta_lo_que_la_aplicacion_espera() {
        use zbus::object_server::Interface;

        let (ordenes, _recibidas) = unbounded_channel();
        let tienda = Tienda {
            ordenes,
            contador: AtomicU64::new(1),
            en_curso: AtomicUsize::new(0),
            conexion: OnceLock::new(),
        };

        let mut xml = String::new();
        tienda.introspect_to_writer(&mut xml, 0);

        assert!(xml.contains(&format!(
            "interface name=\"{}\"",
            vasak_store_protocol::INTERFAZ
        )));
        for metodo in [
            "Instalar",
            "InstalarArchivos",
            "Quitar",
            "Actualizar",
            "Sincronizar",
            "Previsualizar",
            "Repositorios",
            "CambiarRepositorio",
            "AgregarRepositorio",
            "QuitarRepositorio",
        ] {
            assert!(
                xml.contains(&format!("method name=\"{metodo}\"")),
                "falta {metodo}"
            );
        }
        for senal in ["Avance", "Registro", "Terminada"] {
            assert!(
                xml.contains(&format!("signal name=\"{senal}\"")),
                "falta {senal}"
            );
        }
    }
}
