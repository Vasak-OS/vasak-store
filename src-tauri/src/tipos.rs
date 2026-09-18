//! Lo que la ventana recibe.
//!
//! Están todos juntos y en un archivo aparte porque son el contrato con el
//! frontend: si acá cambia un nombre de campo, hay un `.vue` que deja de
//! mostrar algo y no lo dice. Los nombres van en español, como el resto del
//! código, y se serializan tal cual.

use serde::Serialize;

/// De dónde sale un programa. Es la jerarquía de confianza de la distribución.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Origen {
    /// Un repositorio oficial o el de VasakOS: firmado y revisado.
    Repositorio,
    /// El AUR: recetas que escribe cualquiera y que se compilan en la máquina.
    Aur,
    /// Un AppImage que la persona bajó.
    Appimage,
    /// Instalado, pero su repositorio ya no está configurado.
    Local,
}

/// Cómo dibujar el ícono de algo.
///
/// Van las dos fuentes juntas y en ese orden, no una u otra. El tema de íconos
/// del escritorio es el que **se prefiere siempre**: es el que la persona
/// eligió, el que se ve en el menú y en el lanzador, y el que cambia cuando
/// cambia el tema. El archivo del catálogo es el respaldo para lo que el tema no
/// tenga —lo que no está instalado, normalmente—, y viene ya convertido a PNG.
///
/// Los nombres del tema son varios y se prueban en orden porque los temas no se
/// ponen de acuerdo en cómo se llama cada ícono: unos usan el `Icon=` del
/// `.desktop`, otros el identificador de AppStream entero, y unos cuantos el
/// nombre del paquete.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
pub struct Icono {
    /// Nombres a probar en el tema del sistema, del más probable al menos.
    pub tema: Vec<String>,
    /// La ruta del PNG en la caché, si el catálogo traía uno.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archivo: Option<String>,
}

impl Icono {
    /// Sólo del tema, sin respaldo en disco.
    pub fn del_tema(nombre: &str) -> Icono {
        Icono {
            tema: vec![nombre.to_string(), "package-x-generic".to_string()],
            archivo: None,
        }
    }
}

/// Un programa, con lo justo para una tarjeta de una lista.
#[derive(Debug, Clone, Serialize)]
pub struct Tarjeta {
    /// El nombre del paquete. Es la clave de todo lo demás.
    pub nombre: String,
    /// Cómo se llama para una persona. Cae al nombre del paquete si no hay ficha.
    pub titulo: String,
    pub resumen: String,
    pub version: String,
    pub origen: Origen,
    /// El repositorio concreto: `extra`, `vasakos`, `aur`…
    pub repositorio: String,
    pub instalada: bool,
    /// La versión a la que se puede pasar, si hay uno.
    pub actualizable: Option<String>,
    /// Lo que ocupa instalado, en bytes.
    pub tamano: i64,
    pub icono: Icono,
    /// Las categorías de la tienda en las que cae.
    pub categorias: Vec<String>,
    /// Votos del AUR. Sólo para lo del AUR.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub votos: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub popularidad: Option<f64>,
    /// Cuándo se actualizó por última vez, en segundos desde época.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actualizado: Option<i64>,
    /// Una captura para la tarjeta grande de la portada.
    ///
    /// Sale del lector como **URL** y la reemplaza por una ruta local el comando
    /// que la baja: el hilo de lectura no tiene red ni con qué esperarla. Sólo
    /// se llena para la fila destacada de Descubrir; en una lista de sesenta
    /// resultados serían sesenta descargas para adornar.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub captura: Option<String>,
}

/// La ficha entera de un programa.
#[derive(Debug, Clone, Serialize)]
pub struct Detalle {
    #[serde(flatten)]
    pub tarjeta: Tarjeta,
    pub descripcion: String,
    /// Rutas de las capturas ya bajadas a la caché.
    pub capturas: Vec<Captura>,
    pub web: Option<String>,
    pub licencia: Option<String>,
    pub autor: Option<String>,
    pub empaquetador: Option<String>,
    pub arquitectura: Option<String>,
    /// Lo que hay que bajar, en bytes.
    pub descarga: i64,
    /// Cuándo se construyó, en segundos desde época.
    pub construido: i64,
    /// Cuándo se instaló, si está instalado.
    pub instalado_el: Option<i64>,
    pub dependencias: Vec<String>,
    pub opcionales: Vec<String>,
    /// Quién lo necesita. Es lo que decide si se puede sacar sin romper nada.
    pub requerido_por: Vec<String>,
}

/// Una captura, ya en el disco.
#[derive(Debug, Clone, Serialize)]
pub struct Captura {
    /// La ruta local. La ventana la convierte con `convertFileSrc`.
    pub ruta: String,
    pub titulo: String,
}

/// Lo que la pantalla de Descubrir muestra.
#[derive(Debug, Clone, Serialize, Default)]
pub struct Descubrimiento {
    /// Una selección que cambia cada día.
    pub seleccion: Vec<Tarjeta>,
    /// Lo que se publicó o se actualizó hace menos tiempo.
    pub novedades: Vec<Tarjeta>,
    pub categorias: Vec<ResumenDeCategoria>,
}

/// Una categoría y cuántas aplicaciones tiene.
#[derive(Debug, Clone, Serialize)]
pub struct ResumenDeCategoria {
    /// El identificador, que es también la clave de traducción.
    pub id: String,
    pub cuantas: usize,
    /// El ícono del tema con el que se dibuja.
    pub icono: String,
}

/// Una página de resultados.
///
/// Con el total aparte de lo que se devuelve: la lista es virtual y necesita
/// saber cuántos hay para dimensionar la barra sin tenerlos todos en memoria.
#[derive(Debug, Clone, Serialize)]
pub struct Pagina {
    pub resultados: Vec<Tarjeta>,
    pub total: usize,
}
