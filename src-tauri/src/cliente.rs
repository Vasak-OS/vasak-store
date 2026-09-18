//! Hablar con el demonio que cambia paquetes.
//!
//! Todo lo que modifica el sistema pasa por acá, y nada más pasa por acá: las
//! consultas las contesta `lector.rs` sin salir del proceso. La separación es el
//! punto de tener un demonio.
//!
//! Se usa un `Proxy` genérico en lugar de generar uno con el macro porque la
//! interfaz devuelve JSON en cadenas: el tipado fuerte del macro no aportaría
//! nada que el `serde_json` del otro lado no haga ya, y a cambio habría que
//! declarar dos veces la misma firma.

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use vasak_store_protocol::{Previsualizacion, INTERFAZ, RUTA, SERVICIO};

/// El extremo de la conexión con el demonio.
#[derive(Clone)]
pub struct Cliente {
    conexion: zbus::Connection,
}

/// Lo que se le manda a la ventana cuando algo avanza.
#[derive(Debug, Clone, Serialize)]
pub struct Paso {
    pub id: String,
    pub fase: String,
    pub objetivo: String,
    pub hecho: u64,
    pub total: u64,
}

/// Una línea del registro de una operación.
#[derive(Debug, Clone, Serialize)]
pub struct Linea {
    pub id: String,
    pub texto: String,
}

/// El final de una operación.
#[derive(Debug, Clone, Serialize)]
pub struct Final {
    pub id: String,
    /// Vacío si salió bien.
    pub error: String,
}

impl Cliente {
    pub async fn conectar() -> Result<Cliente, String> {
        let conexion = zbus::Connection::system()
            .await
            .map_err(|e| format!("no se pudo abrir el bus del sistema: {e}"))?;
        Ok(Cliente { conexion })
    }

    async fn proxy(&self) -> Result<zbus::Proxy<'_>, String> {
        zbus::Proxy::new(&self.conexion, SERVICIO, RUTA, INTERFAZ)
            .await
            .map_err(|e| format!("no se pudo hablar con el servicio de paquetes: {e}"))
    }

    /// Llama a un método que devuelve el identificador de una transacción.
    async fn pedir<A: serde::Serialize + zbus::zvariant::DynamicType>(
        &self,
        metodo: &str,
        argumentos: &A,
    ) -> Result<String, String> {
        self.proxy()
            .await?
            .call(metodo, argumentos)
            .await
            .map_err(traducir)
    }

    pub async fn instalar(&self, paquetes: Vec<String>) -> Result<String, String> {
        self.pedir("Instalar", &(paquetes,)).await
    }

    pub async fn quitar(
        &self,
        paquetes: Vec<String>,
        con_huerfanas: bool,
    ) -> Result<String, String> {
        self.pedir("Quitar", &(paquetes, con_huerfanas)).await
    }

    pub async fn actualizar(&self) -> Result<String, String> {
        self.pedir("Actualizar", &()).await
    }

    pub async fn sincronizar(&self) -> Result<String, String> {
        self.pedir("Sincronizar", &()).await
    }

    pub async fn previsualizar(
        &self,
        operacion: &str,
        paquetes: Vec<String>,
        con_huerfanas: bool,
    ) -> Result<Previsualizacion, String> {
        let json: String = self
            .proxy()
            .await?
            .call("Previsualizar", &(operacion, paquetes, con_huerfanas))
            .await
            .map_err(traducir)?;
        serde_json::from_str(&json).map_err(|e| format!("respuesta ilegible del servicio: {e}"))
    }

    pub async fn cambiar_repositorio(&self, nombre: &str, activo: bool) -> Result<(), String> {
        self.proxy()
            .await?
            .call("CambiarRepositorio", &(nombre, activo))
            .await
            .map_err(traducir)
    }

    pub async fn agregar_repositorio(
        &self,
        nombre: &str,
        servidor: &str,
        siglevel: &str,
    ) -> Result<(), String> {
        self.proxy()
            .await?
            .call("AgregarRepositorio", &(nombre, servidor, siglevel))
            .await
            .map_err(traducir)
    }

    pub async fn quitar_repositorio(&self, nombre: &str) -> Result<(), String> {
        self.proxy()
            .await?
            .call("QuitarRepositorio", &(nombre,))
            .await
            .map_err(traducir)
    }

    /// Pide algo y espera a que termine, en vez de volver con el identificador.
    ///
    /// La suscripción se abre **antes** de llamar al método. Al revés hay una
    /// ventana en la que la operación puede terminar entre la llamada y la
    /// suscripción, y entonces esto espera para siempre por una señal que ya
    /// pasó. Es un fallo que aparece sólo cuando la operación es rápida, o sea
    /// justo cuando nadie está mirando.
    pub async fn hacer_y_esperar<A: serde::Serialize + zbus::zvariant::DynamicType>(
        &self,
        metodo: &str,
        argumentos: &A,
    ) -> Result<(), String> {
        use futures_util::StreamExt;

        let proxy = self.proxy().await?;
        let mut finales = proxy
            .receive_signal("Terminada")
            .await
            .map_err(|e| format!("no se pudo escuchar al servicio: {e}"))?;

        let id: String = proxy.call(metodo, argumentos).await.map_err(traducir)?;

        while let Some(mensaje) = finales.next().await {
            let Ok((suyo, error)) = mensaje.body().deserialize::<(String, String)>() else {
                continue;
            };
            if suyo != id {
                continue;
            }
            return if error.is_empty() { Ok(()) } else { Err(error) };
        }
        Err("el servicio de paquetes se cerró antes de terminar".to_string())
    }

    /// Deja escuchando las señales del demonio y las reemite a la ventana.
    ///
    /// Se queda para siempre en una tarea aparte. Si la conexión se cae —el
    /// demonio se va solo a los cinco minutos de ocio— los flujos terminan y
    /// esto vuelve; la próxima llamada lo despierta de nuevo por activación de
    /// D-Bus, así que no hay nada que reintentar acá.
    pub async fn escuchar(self, app: AppHandle) {
        let Ok(proxy) = self.proxy().await else {
            return;
        };

        let avances = proxy.receive_signal("Avance").await;
        let registros = proxy.receive_signal("Registro").await;
        let finales = proxy.receive_signal("Terminada").await;
        let (Ok(mut avances), Ok(mut registros), Ok(mut finales)) = (avances, registros, finales)
        else {
            return;
        };

        use futures_util::StreamExt;
        loop {
            tokio::select! {
                Some(mensaje) = avances.next() => {
                    if let Ok((id, json)) = mensaje.body().deserialize::<(String, String)>() {
                        if let Ok(avance) =
                            serde_json::from_str::<vasak_store_protocol::Avance>(&json)
                        {
                            let _ = app.emit("tienda://avance", Paso {
                                id,
                                fase: avance.fase,
                                objetivo: avance.objetivo,
                                hecho: avance.hecho,
                                total: avance.total,
                            });
                        }
                    }
                }
                Some(mensaje) = registros.next() => {
                    if let Ok((id, texto)) = mensaje.body().deserialize::<(String, String)>() {
                        let _ = app.emit("tienda://registro", Linea { id, texto });
                    }
                }
                Some(mensaje) = finales.next() => {
                    if let Ok((id, error)) = mensaje.body().deserialize::<(String, String)>() {
                        let _ = app.emit("tienda://terminada", Final { id, error });
                    }
                }
                else => break,
            }
        }
    }
}

/// Convierte el error de D-Bus en algo que se pueda mostrar.
///
/// El que llega dice cosas como «org.freedesktop.DBus.Error.AccessDenied: no se
/// autorizó la operación», con el nombre de la clase de error adelante. Lo que
/// importa es la frase; el prefijo sólo confunde a quien lo lea en una ventana.
fn traducir(error: zbus::Error) -> String {
    match &error {
        zbus::Error::MethodError(nombre, mensaje, _) => frase(nombre.as_str(), mensaje.as_deref()),
        otro => otro.to_string(),
    }
}

/// La frase que se muestra, dado el nombre del error y su mensaje.
///
/// Aparte de `traducir` porque construir un `zbus::Error::MethodError` de
/// verdad pide un mensaje de D-Bus armado a mano: la lógica se prueba acá y
/// `traducir` queda como el pedazo que no tiene nada que decidir.
fn frase(nombre: &str, mensaje: Option<&str>) -> String {
    match mensaje {
        Some(texto) if !texto.trim().is_empty() => texto.to_string(),
        // Sin mensaje no queda más que el nombre de la clase. Se le saca el
        // prefijo, que es ruido para quien lo lea en una ventana.
        _ => nombre.rsplit('.').next().unwrap_or(nombre).to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn se_muestra_el_mensaje_y_no_el_nombre_de_la_clase() {
        assert_eq!(
            frase(
                "org.freedesktop.DBus.Error.AccessDenied",
                Some("no se autorizó la operación")
            ),
            "no se autorizó la operación"
        );
    }

    #[test]
    fn sin_mensaje_queda_el_final_del_nombre_y_no_el_prefijo_entero() {
        assert_eq!(
            frase("org.freedesktop.DBus.Error.ServiceUnknown", None),
            "ServiceUnknown"
        );
        assert_eq!(frase("Raro", Some("   ")), "Raro");
    }
}
