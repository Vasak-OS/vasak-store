/**
 * Los comandos que la ventana llama tienen que existir del otro lado.
 *
 * Un `invoke` con un nombre que Rust no registró no falla al compilar: falla en
 * tiempo de ejecución, con «command not found», y sólo cuando alguien abre esa
 * pantalla. Esto lo convierte en un test que corre en cada cambio.
 */

import { describe, expect, test } from 'bun:test';

const api = await Bun.file(new URL('../src/tools/api.ts', import.meta.url)).text();
const lib = await Bun.file(new URL('../src-tauri/src/lib.rs', import.meta.url)).text();

/**
 * Los nombres que `api.ts` invoca.
 *
 * El genérico de `invoke` es opcional y puede llevar comas —`invoke<Record<string,
 * number>>`—, así que buscar `invoke<...>(` con un `[^>]*` se saltea justamente
 * esos. Se busca `invoke` seguido de cualquier cosa hasta el paréntesis.
 */
const invocados = [
	...api.matchAll(/\binvoke\s*(?:<[\s\S]*?>)?\s*\(\s*['"`]([a-z_0-9]+)['"`]/g),
].map((m) => m[1]);

/**
 * Los que `lib.rs` registra en el `invoke_handler`.
 *
 * Sin exigir la coma final: el último de la lista no la lleva, y así se escapaba
 * del control justo el que más fácil se olvida de agregar.
 */
const handler = lib.slice(lib.indexOf('generate_handler!'), lib.indexOf('])'));
const registrados = [...handler.matchAll(/comandos::([a-z_0-9]+)/g)].map((m) => m[1]);

describe('los comandos', () => {
	test('hay comandos de los dos lados', () => {
		expect(invocados.length).toBeGreaterThan(15);
		expect(registrados.length).toBeGreaterThan(15);
	});

	test('todo lo que la ventana invoca está registrado en Rust', () => {
		const faltan = invocados.filter((nombre) => !registrados.includes(nombre));
		expect(faltan).toEqual([]);
	});

	test('todo lo registrado en Rust se usa desde la ventana', () => {
		// Al revés también importa: un comando que nadie llama es código muerto
		// con acceso al sistema de paquetes.
		const sobran = registrados.filter((nombre) => !invocados.includes(nombre));
		expect(sobran).toEqual([]);
	});
});
