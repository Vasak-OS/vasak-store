/**
 * Los tipos de `api.ts` tienen que describir lo que Rust manda.
 *
 * La cabecera de `api.ts` dice que los tipos son los de Rust escritos otra vez
 * de este lado, y que el precio de la duplicación lo pagan los tests. Había uno
 * —`comandos.test.ts`— que comparaba los **nombres** de los comandos. Faltaba el
 * de las **formas**, y se notó: `Icono` declaraba una unión de `{tipo, valor}`
 * cuando lo que llega es `{tema, archivo}`. Ningún componente se rompió, porque
 * todos leían los campos de verdad; lo que estaba mal era el tipo, o sea lo
 * único que iba a avisar si algún día cambiaba alguno.
 *
 * Y no lo agarraba nadie: `vue-tsc` no ve el acceso `icono.tema` porque vive
 * adentro de un `.vue`, y una prueba que lee el fuente y busca cadenas no sabe
 * qué campos tiene un `struct`.
 *
 * # Qué compara
 *
 * Los campos, y si son opcionales o no:
 *
 * - un `Option<T>` con `skip_serializing_if` no aparece en el JSON cuando es
 *   `None`, así que del lado de TypeScript va `campo?: T`;
 * - un `Option<T>` sin eso se serializa como `null`, así que va `T | null`;
 * - un `#[serde(flatten)]` mete los campos del otro `struct` acá, que es lo que
 *   del lado de TypeScript hace `extends`.
 *
 * Confundir las dos primeras es lo que hace que `app.captura` sea `undefined`
 * donde el código esperaba `null`, que es una comparación que pasa en silencio.
 */

import { describe, expect, test } from 'bun:test';

/** Los pares que hay que mantener iguales. */
const PARES = [
	{ rust: 'src-tauri/src/tipos.rs', struct: 'Icono', ts: 'Icono' },
	{ rust: 'src-tauri/src/tipos.rs', struct: 'Tarjeta', ts: 'Tarjeta' },
	{ rust: 'src-tauri/src/tipos.rs', struct: 'Detalle', ts: 'Detalle' },
	{ rust: 'src-tauri/src/tipos.rs', struct: 'Captura', ts: 'Captura' },
	{ rust: 'src-tauri/src/tipos.rs', struct: 'Descubrimiento', ts: 'Descubrimiento' },
	{ rust: 'src-tauri/src/tipos.rs', struct: 'ResumenDeCategoria', ts: 'ResumenDeCategoria' },
	{ rust: 'src-tauri/src/tipos.rs', struct: 'Pagina', ts: 'Pagina' },
	{ rust: 'protocol/src/lib.rs', struct: 'PaqueteBreve', ts: 'PaqueteBreve' },
	{ rust: 'protocol/src/lib.rs', struct: 'Previsualizacion', ts: 'Previsualizacion' },
	{ rust: 'protocol/src/repositorios.rs', struct: 'Repositorio', ts: 'Repositorio' },
	{ rust: 'src-tauri/src/ajustes.rs', struct: 'Ajustes', ts: 'Ajustes' },
	{ rust: 'src-tauri/src/appimage.rs', struct: 'AppImage', ts: 'AppImage' },
	// Los tres eventos. Del lado de Rust `Final` se llama distinto que del lado
	// de la ventana; el nombre da igual, la forma no.
	{ rust: 'src-tauri/src/cliente.rs', struct: 'Paso', ts: 'Paso' },
	{ rust: 'src-tauri/src/cliente.rs', struct: 'Linea', ts: 'Linea' },
	{ rust: 'src-tauri/src/cliente.rs', struct: 'Final', ts: 'FinalDeOperacion' },
];

/** Un campo, como llega al JSON. */
interface Campo {
	nombre: string;
	/** Si puede no venir. Un `campo?: T` de TypeScript. */
	opcional: boolean;
}

async function leer(ruta: string) {
	return await Bun.file(new URL(`../${ruta}`, import.meta.url)).text();
}

/** El cuerpo de un bloque que abre con `apertura` y cierra con `}` al margen. */
function cuerpo(fuente: string, apertura: string) {
	const desde = fuente.indexOf(apertura);
	if (desde === -1) {
		return null;
	}
	const hasta = fuente.indexOf('\n}', desde);
	return fuente.slice(desde + apertura.length, hasta);
}

const rust = new Map<string, string>();
for (const ruta of new Set(PARES.map((par) => par.rust))) {
	rust.set(ruta, await leer(ruta));
}
const api = await leer('src/tools/api.ts');

/**
 * Los campos de un `struct`, con los de lo que venga aplanado.
 *
 * Se mira el atributo que precede a cada campo, que es donde serde dice si el
 * campo desaparece del JSON o si trae los de otro `struct`.
 */
function camposDeRust(ruta: string, nombre: string): Campo[] {
	const fuente = rust.get(ruta) ?? '';
	const bloque = cuerpo(fuente, `pub struct ${nombre} {`);
	expect(bloque, `no se encontró el struct ${nombre} en ${ruta}`).not.toBeNull();

	const campos: Campo[] = [];
	// El atributo de serde, si hay, y después el campo.
	const patron = /(?:#\[serde\(([^\]]*)\)\]\s*)?pub (\w+):\s*([^,\n]+),/g;
	for (const [, atributo = '', campo, tipo] of bloque?.matchAll(patron) ?? []) {
		if (atributo.includes('flatten')) {
			// `Detalle` mete los campos de `Tarjeta` en su propio JSON; del otro
			// lado eso es `interface Detalle extends Tarjeta`.
			campos.push(...camposDeRust(ruta, tipo.trim()));
			continue;
		}
		campos.push({
			nombre: campo,
			// Sólo el que serde omite cuando es `None`. Un `Option` sin eso
			// viaja como `null`, que del otro lado es `T | null` y no `T?`.
			opcional: atributo.includes('skip_serializing_if'),
		});
	}
	return campos;
}

/** Los campos de una `interface`, con los de la que extiende. */
function camposDeTypeScript(nombre: string): Campo[] {
	const declaracion = new RegExp(`export interface ${nombre}(?: extends (\\w+))? \\{`).exec(api);
	expect(declaracion, `no se encontró la interface ${nombre} en api.ts`).not.toBeNull();

	const heredados = declaracion?.[1] ? camposDeTypeScript(declaracion[1]) : [];
	const bloque = cuerpo(api, declaracion?.[0] ?? '');
	const propios = [...(bloque?.matchAll(/^\t(\w+)(\??):/gm) ?? [])].map(([, campo, signo]) => ({
		nombre: campo,
		opcional: signo === '?',
	}));
	return [...heredados, ...propios];
}

function porNombre(campos: Campo[]) {
	return campos.map((campo) => campo.nombre).sort();
}

function losOpcionales(campos: Campo[]) {
	return campos
		.filter((campo) => campo.opcional)
		.map((campo) => campo.nombre)
		.sort();
}

describe('las formas del backend', () => {
	test('se están mirando todas', () => {
		// Si aparece una `interface` nueva en `api.ts` sin su par acá, esta
		// prueba no la cubre y no lo dice: se sumaría un tipo al contrato y el
		// control se quedaría mirando los viejos.
		const declaradas = [...api.matchAll(/^export interface (\w+)/gm)].map((m) => m[1]);
		const miradas = PARES.map((par) => par.ts);
		expect(declaradas.filter((nombre) => !miradas.includes(nombre))).toEqual([]);
	});

	for (const par of PARES) {
		describe(par.ts, () => {
			test('tiene los mismos campos que el struct de Rust', () => {
				const deRust = camposDeRust(par.rust, par.struct);
				expect(deRust.length).toBeGreaterThan(0);
				expect(porNombre(camposDeTypeScript(par.ts))).toEqual(porNombre(deRust));
			});

			test('y los mismos son opcionales', () => {
				// Un campo que Rust omite y TypeScript declara obligatorio se lee
				// como presente siempre, y el `undefined` aparece recién en la
				// ventana de alguien.
				expect(losOpcionales(camposDeTypeScript(par.ts))).toEqual(
					losOpcionales(camposDeRust(par.rust, par.struct))
				);
			});
		});
	}
});
