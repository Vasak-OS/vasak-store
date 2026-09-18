//! Una consulta real al AUR.
//!
//! Va marcada `#[ignore]` porque necesita red: en una máquina sin salida —o en
//! la CI— fallaría por algo que no tiene nada que ver con el código. Se corre a
//! mano:
//!
//! ```sh
//! cargo test --test aur_de_verdad -- --ignored --nocapture
//! ```
//!
//! # Qué comprueba que ninguna otra prueba puede
//!
//! Que el cliente HTTP se pueda **construir**. La tienda pide TLS sin
//! proveedor de criptografía elegido por la biblioteca, y hay que instalar uno
//! a mano antes; sin eso, armar el cliente paniquea. Eso no se ve compilando,
//! no se ve en una prueba que no haga una petición, y sólo pasaba con el AUR
//! encendido — o sea en el camino menos recorrido.

#[tokio::test]
#[ignore = "necesita red"]
async fn se_puede_buscar_en_el_aur() {
    vasak_store_lib::tls::instalar();

    let encontrados = vasak_store_lib::aur::buscar("firefox")
        .await
        .expect("la consulta al AUR falló");

    assert!(
        !encontrados.is_empty(),
        "el AUR no devolvió nada para «firefox», que tiene decenas de paquetes"
    );
    let primero = &encontrados[0];
    assert!(!primero.nombre.is_empty());
    assert!(primero.votos.is_some(), "no llegaron los votos");
    println!(
        "{} resultados; el primero es {} con {} votos",
        encontrados.len(),
        primero.nombre,
        primero.votos.unwrap_or(0)
    );
}
