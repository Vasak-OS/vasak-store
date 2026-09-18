//! El proveedor de criptografía de rustls.
//!
//! # Por qué esto existe
//!
//! La tienda habla con dos servidores: la RPC del AUR y los que alojan las
//! capturas. Los dos por TLS, y el TLS lo pone `rustls` en vez del OpenSSL del
//! sistema, para no quedar atada a la versión que tenga la distribución.
//!
//! `rustls` no trae **un** motor de criptografía: trae la maquinaria y espera
//! que el programa elija uno. Cuando el cliente HTTP se arma con la bandera
//! `rustls-no-provider` —que es lo que la tienda pide, para que la elección sea
//! suya y no de la biblioteca— hay que instalar ese motor a mano, una sola vez,
//! **antes** de construir cualquier cliente.
//!
//! Sin esto, el primer cliente que se arma paniquea:
//!
//! ```text
//! No rustls crypto provider is configured. When using the
//! `rustls-no-provider` feature you must install a crypto provider before
//! building a Client.
//! ```
//!
//! Y paniquea en un hilo del ejecutor, no en el principal: la ventana no se
//! cae, pero la búsqueda en el AUR no contesta nunca y el diario se llena.
//! Buscar sin el AUR funcionaba, así que el fallo sólo aparecía con esa opción
//! encendida.
//!
//! Se elige `ring` y no `aws-lc-rs` porque es el que ya estaba en el árbol de
//! dependencias —`raur` lo pide— y sumar un segundo motor sería compilar dos
//! bibliotecas de criptografía para usar una.

/// Instala el proveedor, si todavía no hay uno.
///
/// Se puede llamar más de una vez: `install_default` falla cuando ya hay uno
/// instalado, y eso no es un error sino la respuesta a «ya estaba». Lo que sí
/// sería un problema es no tener ninguno, y de eso se encarga el llamado.
pub fn instalar() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn despues_de_instalar_hay_proveedor_y_llamar_de_nuevo_no_rompe() {
        // Sin proveedor, construir un cliente de `reqwest` con
        // `rustls-no-provider` paniquea. Esto comprueba lo que hace falta para
        // que eso no pase, y que la función se pueda llamar dos veces —porque
        // se la llama al arrancar y nada impide que alguien la agregue en otro
        // lado—.
        instalar();
        assert!(
            rustls::crypto::CryptoProvider::get_default().is_some(),
            "no quedó ningún proveedor instalado"
        );

        instalar();
        assert!(rustls::crypto::CryptoProvider::get_default().is_some());
    }
}
