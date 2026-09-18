//! El catálogo de AppStream: qué es cada programa, no sólo cómo se llama.
//!
//! La base de datos de pacman sabe el nombre, la versión y el tamaño de un
//! paquete. No sabe que `gimp` es un editor de imágenes, ni tiene su ícono, ni
//! una captura. Eso está en el catálogo de AppStream que empaqueta Arch en
//! `archlinux-appstream-data`, y sin él una tienda es la salida de `pacman -Sl`
//! con botones.
//!
//! ## Lo que el catálogo tiene y lo que no
//!
//! Son unas 1400 aplicaciones de escritorio sobre los más de 15 000 paquetes de
//! los repositorios. Eso **no** es una carencia: los otros 13 600 son
//! bibliotecas, cabeceras y herramientas de línea de comandos, que no son lo
//! que alguien busca en una tienda. Descubrir muestra lo que tiene ficha;
//! buscar encuentra todo.
//!
//! Los íconos vienen en JPEG XL —los 3843, ni uno en PNG—, que WebKit no
//! dibuja. Se convierten una vez y se guardan; ver `iconos.rs`.

use std::collections::HashMap;
use std::io::BufReader;
use std::path::{Path, PathBuf};

use flate2::read::GzDecoder;
use quick_xml::events::Event;
use quick_xml::Reader;
use serde::Serialize;

/// Dónde busca el catálogo, en orden.
///
/// El primero es el del paquete de Arch. El segundo es donde `appstreamcli`
/// deja lo que genera en la máquina, que puede traer cosas que el paquete no.
const DIRECTORIOS: &[&str] = &["/usr/share/swcatalog/xml", "/var/cache/swcatalog/xml"];

/// Una captura de pantalla de una aplicación.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Captura {
    pub url: String,
    pub titulo: String,
    /// La que se muestra primero.
    pub principal: bool,
}

/// Lo que el catálogo sabe de una aplicación.
#[derive(Debug, Clone, Serialize, PartialEq, Eq, Default)]
pub struct Ficha {
    /// El identificador de AppStream, del estilo `org.gnome.Gedit.desktop`.
    pub id: String,
    /// El paquete que la trae.
    pub paquete: String,
    pub nombre: String,
    pub resumen: String,
    pub descripcion: String,
    /// Las categorías tal como las declara la aplicación (las de freedesktop).
    pub categorias: Vec<String>,
    /// El nombre del ícono en el tema del sistema, si declara uno.
    pub icono: Option<String>,
    /// La ruta del ícono que trae el catálogo. Es un `.jxl`.
    pub icono_archivo: Option<String>,
    pub capturas: Vec<Captura>,
    /// La página del proyecto.
    pub web: Option<String>,
    pub licencia: Option<String>,
    pub autor: Option<String>,
}

/// Todo el catálogo, en memoria y por nombre de paquete.
#[derive(Debug, Default)]
pub struct Catalogo {
    /// Un paquete puede traer varias aplicaciones (`plan9port` trae unas
    /// cuantas), así que es una lista y no una sola ficha.
    por_paquete: HashMap<String, Vec<Ficha>>,
}

impl Catalogo {
    /// Lee todos los archivos del catálogo que haya en el sistema.
    ///
    /// `idioma` es el código de dos letras de la sesión. Los textos vienen
    /// repetidos con `xml:lang` para cada traducción; se guarda el del idioma
    /// pedido y, si no está, el que viene sin marcar, que es el inglés.
    pub fn cargar(idioma: &str) -> Catalogo {
        Catalogo::cargar_desde(DIRECTORIOS.iter().map(Path::new), idioma)
    }

    /// Igual, pero diciendo de dónde.
    ///
    /// Existe para poder medir el analizador contra un catálogo de verdad sin
    /// tener que instalarlo en la máquina que corre las pruebas.
    pub fn cargar_desde<'a>(directorios: impl Iterator<Item = &'a Path>, idioma: &str) -> Catalogo {
        let mut catalogo = Catalogo::default();
        for directorio in directorios {
            let Ok(entradas) = std::fs::read_dir(directorio) else {
                continue;
            };
            for entrada in entradas.flatten() {
                let ruta = entrada.path();
                if ruta.extension().is_some_and(|e| e == "gz") {
                    catalogo.sumar_archivo(&ruta, idioma);
                }
            }
        }
        catalogo
    }

    fn sumar_archivo(&mut self, ruta: &Path, idioma: &str) {
        let Ok(archivo) = std::fs::File::open(ruta) else {
            return;
        };
        let origen = ruta
            .file_stem()
            .and_then(|n| Path::new(n).file_stem())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        // Los íconos van al lado del catálogo: `…/xml/extra.xml.gz` tiene los
        // suyos en `…/icons/<origen>/<tamaño>/`.
        let raiz_de_iconos = ruta
            .parent()
            .and_then(|xml| xml.parent())
            .map(|base| base.join("icons"))
            .unwrap_or_else(|| PathBuf::from("/usr/share/swcatalog/icons"));

        let lector = BufReader::new(GzDecoder::new(archivo));
        for ficha in analizar(lector, idioma, &origen, &raiz_de_iconos) {
            if ficha.paquete.is_empty() {
                continue;
            }
            self.por_paquete
                .entry(ficha.paquete.clone())
                .or_default()
                .push(ficha);
        }
    }

    /// Cuántas aplicaciones conoce.
    pub fn cuantas(&self) -> usize {
        self.por_paquete.len()
    }

    /// La ficha principal de un paquete, si tiene alguna.
    pub fn de(&self, paquete: &str) -> Option<&Ficha> {
        self.por_paquete.get(paquete)?.first()
    }

    /// Todas las fichas, para recorrer el catálogo entero.
    pub fn todas(&self) -> impl Iterator<Item = &Ficha> {
        self.por_paquete.values().flatten()
    }
}

/// El origen de un archivo del catálogo, como lo nombra el directorio de íconos.
///
/// `extra.xml.gz` declara `origin="archlinux-arch-extra"` y sus íconos están en
/// `icons/archlinux-arch-extra/`. El nombre del archivo no alcanza, así que se
/// lee del atributo y se usa el del archivo sólo como respaldo.
fn analizar<R: std::io::BufRead>(
    lector: R,
    idioma: &str,
    respaldo: &str,
    raiz_de_iconos: &Path,
) -> Vec<Ficha> {
    let mut xml = Reader::from_reader(lector);
    xml.config_mut().trim_text(true);

    let mut fichas = Vec::new();
    let mut buffer = Vec::new();
    let mut origen = respaldo.to_string();

    let mut actual: Option<Ficha> = None;
    // Qué elemento se está leyendo y en qué idioma venía marcado.
    let mut elemento = String::new();
    let mut lang: Option<String> = None;
    // Para saber si ya se guardó el valor en el idioma bueno y no pisarlo con
    // el genérico que viene después.
    let mut traducido: HashMap<String, bool> = HashMap::new();
    let mut en_descripcion = false;
    let mut lang_descripcion: Option<String> = None;
    let mut captura: Option<Captura> = None;
    let mut tipo_de_imagen = String::new();
    let mut tipo_de_url = String::new();

    loop {
        match xml.read_event_into(&mut buffer) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let nombre = e.name().as_ref().to_string();
                lang = atributo(&e, "xml:lang");

                match nombre.as_str() {
                    "components" => {
                        if let Some(valor) = atributo(&e, "origin") {
                            origen = valor;
                        }
                    }
                    "component" => {
                        actual = Some(Ficha::default());
                        traducido.clear();
                        en_descripcion = false;
                    }
                    "description" => {
                        en_descripcion = true;
                        // El `xml:lang` va en `<description>`, no en cada
                        // `<p>`: se guarda acá porque cuando se lea el párrafo
                        // el atributo ya no está a la vista.
                        lang_descripcion = lang.clone();
                    }
                    "icon" => {
                        let tipo = atributo(&e, "type").unwrap_or_default();
                        elemento = format!("icon:{tipo}");
                    }
                    "screenshot" => {
                        captura = Some(Captura {
                            url: String::new(),
                            titulo: String::new(),
                            principal: atributo(&e, "type").as_deref() == Some("default"),
                        });
                        elemento = nombre;
                    }
                    "image" => {
                        tipo_de_imagen = atributo(&e, "type").unwrap_or_default();
                        elemento = nombre;
                    }
                    "url" => {
                        tipo_de_url = atributo(&e, "type").unwrap_or_default();
                        elemento = nombre;
                    }
                    otro => elemento = otro.to_string(),
                }
            }
            Ok(Event::Text(texto)) => {
                let Some(ficha) = actual.as_mut() else {
                    buffer.clear();
                    continue;
                };
                let valor = texto.xml10_content().to_string();
                if valor.is_empty() {
                    buffer.clear();
                    continue;
                }

                // Un texto marcado con otro idioma no se guarda. Uno marcado
                // con el nuestro pisa lo que haya. Uno sin marcar sólo entra si
                // todavía no vino el nuestro.
                let aceptar = |clave: &str, traducido: &mut HashMap<String, bool>| -> bool {
                    match lang.as_deref() {
                        Some(l) if l.starts_with(idioma) => {
                            traducido.insert(clave.to_string(), true);
                            true
                        }
                        Some(_) => false,
                        None => !traducido.get(clave).copied().unwrap_or(false),
                    }
                };

                match elemento.as_str() {
                    "id" => ficha.id = valor,
                    "pkgname" => ficha.paquete = valor,
                    "name" if aceptar("name", &mut traducido) => ficha.nombre = valor,
                    "summary" if aceptar("summary", &mut traducido) => ficha.resumen = valor,
                    "p" if en_descripcion => {
                        // La descripción son varios párrafos, así que se suman;
                        // pero cuando llega la primera en el idioma bueno hay
                        // que **tirar** lo acumulado en el genérico, o quedan
                        // los dos idiomas pegados uno abajo del otro. Eso es lo
                        // que pasaba: la ficha de una aplicación traducida
                        // mostraba el texto en español y después otra vez en
                        // inglés.
                        let del_idioma = lang_descripcion
                            .as_deref()
                            .is_some_and(|l| l.starts_with(idioma));
                        let primera_traducida =
                            del_idioma && !traducido.get("desc").copied().unwrap_or(false);
                        if primera_traducida {
                            ficha.descripcion.clear();
                        }
                        let acepta = match lang_descripcion.as_deref() {
                            Some(l) if l.starts_with(idioma) => {
                                traducido.insert("desc".to_string(), true);
                                true
                            }
                            Some(_) => false,
                            None => !traducido.get("desc").copied().unwrap_or(false),
                        };
                        if acepta {
                            if !ficha.descripcion.is_empty() {
                                ficha.descripcion.push_str("\n\n");
                            }
                            ficha.descripcion.push_str(&valor);
                        }
                    }
                    "category" => ficha.categorias.push(valor),
                    "icon:stock" => ficha.icono = Some(valor),
                    "icon:cached" => {
                        // El catálogo nombra el archivo; el directorio sale de
                        // dónde estaba el catálogo, del origen y del tamaño.
                        //
                        // La raíz se deriva del archivo que se está leyendo y no
                        // está escrita fija: los catálogos que genera
                        // `appstreamcli` viven en `/var/cache/swcatalog` con sus
                        // íconos al lado, y con la ruta fija se los buscaba en
                        // `/usr/share`, donde no están.
                        ficha.icono_archivo = Some(
                            raiz_de_iconos
                                .join(&origen)
                                .join("64x64")
                                .join(&valor)
                                .to_string_lossy()
                                .to_string(),
                        );
                    }
                    "caption" => {
                        if let Some(c) = captura.as_mut() {
                            c.titulo = valor;
                        }
                    }
                    "image" => {
                        // `source` es la imagen entera; las miniaturas se
                        // descartan porque la ficha las muestra en grande y
                        // bajar las dos es bajar de más.
                        if tipo_de_imagen == "source" || tipo_de_imagen.is_empty() {
                            if let Some(c) = captura.as_mut() {
                                c.url = valor;
                            }
                        }
                    }
                    "url" if tipo_de_url == "homepage" => ficha.web = Some(valor),
                    "project_license" => ficha.licencia = Some(valor),
                    "developer_name" => ficha.autor = Some(valor),
                    _ => {}
                }
            }
            Ok(Event::End(e)) => {
                let nombre = e.name().as_ref().to_string();
                match nombre.as_str() {
                    "component" => {
                        if let Some(ficha) = actual.take() {
                            fichas.push(ficha);
                        }
                    }
                    "description" => {
                        en_descripcion = false;
                        lang_descripcion = None;
                    }
                    "screenshot" => {
                        if let (Some(ficha), Some(c)) = (actual.as_mut(), captura.take()) {
                            if !c.url.is_empty() {
                                ficha.capturas.push(c);
                            }
                        }
                    }
                    _ => {}
                }
                elemento.clear();
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
        buffer.clear();
    }

    fichas
}

/// El valor de un atributo, o nada.
fn atributo(e: &quick_xml::events::BytesStart<'_>, nombre: &str) -> Option<String> {
    e.attributes().flatten().find_map(|a| {
        (a.key.as_ref() == nombre).then(|| {
            a.normalized_value(quick_xml::XmlVersion::Implicit1_0)
                .map(|v| v.to_string())
                .unwrap_or_else(|_| a.value.to_string())
        })
    })
}

/// Las categorías con las que la tienda agrupa, y qué cae en cada una.
///
/// Las de freedesktop son ochenta y tantas y están pensadas para un menú de
/// aplicaciones, no para navegar una tienda: `Midi`, `Telephony` y
/// `RevisionControl` son tres categorías distintas ahí y ninguna es un lugar
/// donde alguien busque algo. Éstas son seis, y cada una junta las que
/// corresponden.
pub const CATEGORIAS: &[(&str, &[&str])] = &[
    (
        "juegos",
        &[
            "Game",
            "ActionGame",
            "AdventureGame",
            "ArcadeGame",
            "BoardGame",
            "BlocksGame",
            "CardGame",
            "KidsGame",
            "LogicGame",
            "RolePlaying",
            "Shooter",
            "Simulation",
            "SportsGame",
            "StrategyGame",
            "Emulator",
        ],
    ),
    (
        "desarrollo",
        &[
            "Development",
            "IDE",
            "GUIDesigner",
            "Profiling",
            "RevisionControl",
            "Translation",
            "Debugger",
            "WebDevelopment",
            "Building",
        ],
    ),
    (
        "productividad",
        &[
            "Office",
            "WordProcessor",
            "Spreadsheet",
            "Presentation",
            "Calendar",
            "ContactManagement",
            "Database",
            "Dictionary",
            "Chart",
            "Email",
            "Finance",
            "ProjectManagement",
            "Publishing",
            "Viewer",
        ],
    ),
    (
        "multimedia",
        &[
            "AudioVideo",
            "Audio",
            "Video",
            "Music",
            "Player",
            "Recorder",
            "Midi",
            "Mixer",
            "Sequencer",
            "Tuner",
            "TV",
            "AudioVideoEditing",
            "DiscBurning",
            "Graphics",
            "Photography",
            "Scanning",
            "RasterGraphics",
            "VectorGraphics",
            "2DGraphics",
            "3DGraphics",
        ],
    ),
    (
        "sistema",
        &[
            "System",
            "Settings",
            "Monitor",
            "Security",
            "PackageManager",
            "Filesystem",
            "TerminalEmulator",
            "HardwareSettings",
            "Printing",
        ],
    ),
    (
        "utilidades",
        &[
            "Utility",
            "Accessibility",
            "Archiving",
            "Compression",
            "FileTools",
            "TextEditor",
            "TextTools",
            "Calculator",
            "Clock",
            "Network",
            "WebBrowser",
            "InstantMessaging",
            "FileTransfer",
            "P2P",
            "News",
            "Chat",
            "Education",
            "Science",
            "Math",
            "Astronomy",
            "Biology",
            "Chemistry",
            "Geography",
            "Physics",
            "Electronics",
            "Engineering",
            "Maps",
        ],
    ),
];

/// En qué categorías de la tienda cae una aplicación.
///
/// Puede caer en varias; una que no cae en ninguna va a «utilidades», que es lo
/// honesto: dejarla sin categoría la haría invisible al navegar.
pub fn categorias_de(ficha: &Ficha) -> Vec<&'static str> {
    let mut caen: Vec<&'static str> = CATEGORIAS
        .iter()
        .filter(|(_, suyas)| {
            ficha
                .categorias
                .iter()
                .any(|c| suyas.iter().any(|s| s.eq_ignore_ascii_case(c)))
        })
        .map(|(nombre, _)| *nombre)
        .collect();
    if caen.is_empty() {
        caen.push("utilidades");
    }
    caen
}

#[cfg(test)]
mod tests {
    use super::*;

    const MUESTRA: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<components version="1.0" origin="archlinux-arch-extra">
<component type="desktop-application">
  <id>adljack.desktop</id>
  <name>ADLMIDI for Jack</name>
  <name xml:lang="es">ADLMIDI para Jack</name>
  <name xml:lang="fr">ADLMIDI pour Jack</name>
  <summary>OPL3 synthesizer</summary>
  <summary xml:lang="es">Sintetizador OPL3</summary>
  <description>
    <p>A standalone synthesizer</p>
  </description>
  <description xml:lang="es">
    <p>Un sintetizador independiente</p>
  </description>
  <pkgname>adljack</pkgname>
  <icon type="cached" width="64" height="64">adljack_adljack.jxl</icon>
  <icon type="stock">adljack</icon>
  <url type="homepage">https://ejemplo.org</url>
  <project_license>GPL-3.0</project_license>
  <categories>
    <category>AudioVideo</category>
    <category>Midi</category>
  </categories>
  <screenshots>
    <screenshot type="default">
      <caption>La ventana</caption>
      <image type="source" width="616" height="462">https://ejemplo.org/1.png</image>
      <image type="thumbnail" width="624">https://ejemplo.org/1-chica.png</image>
    </screenshot>
  </screenshots>
</component>
<component type="desktop-application">
  <id>sinpaquete.desktop</id>
  <name>Sin paquete</name>
</component>
</components>
"#;

    fn muestra(idioma: &str) -> Vec<Ficha> {
        analizar(
            MUESTRA.as_bytes(),
            idioma,
            "respaldo",
            Path::new("/usr/share/swcatalog/icons"),
        )
    }

    #[test]
    fn se_lee_una_aplicacion_entera() {
        let fichas = muestra("es");
        let adljack = fichas.iter().find(|f| f.paquete == "adljack").unwrap();
        assert_eq!(adljack.id, "adljack.desktop");
        assert_eq!(adljack.web.as_deref(), Some("https://ejemplo.org"));
        assert_eq!(adljack.licencia.as_deref(), Some("GPL-3.0"));
        assert_eq!(adljack.categorias, vec!["AudioVideo", "Midi"]);
        assert_eq!(adljack.icono.as_deref(), Some("adljack"));
    }

    #[test]
    fn la_descripcion_traducida_reemplaza_a_la_otra_y_no_se_le_suma() {
        // Pegadas una abajo de la otra, la ficha mostraba el texto dos veces:
        // en español y después en inglés.
        let f = muestra("es")
            .into_iter()
            .find(|f| f.paquete == "adljack")
            .unwrap();
        assert_eq!(f.descripcion, "Un sintetizador independiente");

        let f = muestra("en")
            .into_iter()
            .find(|f| f.paquete == "adljack")
            .unwrap();
        assert_eq!(f.descripcion, "A standalone synthesizer");
    }

    #[test]
    fn el_idioma_de_la_sesion_gana_y_los_otros_no_entran() {
        let en_espanol = muestra("es");
        let f = en_espanol.iter().find(|f| f.paquete == "adljack").unwrap();
        assert_eq!(f.nombre, "ADLMIDI para Jack");
        assert_eq!(f.resumen, "Sintetizador OPL3");

        let en_ingles = muestra("en");
        let f = en_ingles.iter().find(|f| f.paquete == "adljack").unwrap();
        assert_eq!(
            f.nombre, "ADLMIDI for Jack",
            "sin traducción va el sin marcar"
        );
        assert_eq!(f.resumen, "OPL3 synthesizer");
    }

    #[test]
    fn el_icono_del_catalogo_sale_con_la_ruta_de_su_origen() {
        let f = muestra("es")
            .into_iter()
            .find(|f| f.paquete == "adljack")
            .unwrap();
        assert_eq!(
            f.icono_archivo.as_deref(),
            Some("/usr/share/swcatalog/icons/archlinux-arch-extra/64x64/adljack_adljack.jxl"),
            "el origen sale del atributo del XML, no del nombre del archivo"
        );
    }

    #[test]
    fn de_las_capturas_se_guarda_la_grande_y_no_la_miniatura() {
        let f = muestra("es")
            .into_iter()
            .find(|f| f.paquete == "adljack")
            .unwrap();
        assert_eq!(f.capturas.len(), 1);
        assert_eq!(f.capturas[0].url, "https://ejemplo.org/1.png");
        assert_eq!(f.capturas[0].titulo, "La ventana");
        assert!(f.capturas[0].principal);
    }

    #[test]
    fn un_componente_sin_paquete_no_entra_al_catalogo() {
        // Se analiza igual —está en el XML— pero `sumar_archivo` lo descarta,
        // porque una ficha que no se puede instalar no sirve de nada.
        let fichas = muestra("es");
        assert_eq!(fichas.len(), 2);
        assert!(fichas.iter().any(|f| f.paquete.is_empty()));
    }

    #[test]
    fn las_categorias_de_freedesktop_caen_en_las_seis_de_la_tienda() {
        let f = muestra("es")
            .into_iter()
            .find(|f| f.paquete == "adljack")
            .unwrap();
        assert_eq!(categorias_de(&f), vec!["multimedia"]);
    }

    #[test]
    fn una_aplicacion_sin_categoria_conocida_no_queda_invisible() {
        let suelta = Ficha {
            categorias: vec!["CategoriaInventada".to_string()],
            ..Default::default()
        };
        assert_eq!(categorias_de(&suelta), vec!["utilidades"]);
    }

    #[test]
    fn ninguna_categoria_de_freedesktop_esta_en_dos_grupos_a_la_vez() {
        // Si una lo estuviera, la misma aplicación aparecería en dos lugares y
        // los contadores de la pantalla no cerrarían.
        let mut vistas: HashMap<&str, &str> = HashMap::new();
        for (grupo, suyas) in CATEGORIAS {
            for categoria in *suyas {
                if let Some(otro) = vistas.insert(categoria, grupo) {
                    panic!("{categoria} está en «{otro}» y en «{grupo}»");
                }
            }
        }
    }
}
