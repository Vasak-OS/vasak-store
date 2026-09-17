/**
 * El AUR está marcado como inseguro, y eso tiene que verse en la interfaz.
 *
 * Son tres cosas concretas, y las tres se pierden fácil en un rediseño: la
 * insignia distinta, la advertencia en la ficha y —la que importa— que el botón
 * de instalar del AUR abra la receta en lugar de compilar.
 */

import { describe, expect, test } from 'bun:test';

const insignia = await Bun.file(
	new URL('../src/components/tienda/InsigniaDeOrigen.vue', import.meta.url)
).text();
const detalle = await Bun.file(new URL('../src/views/DetalleView.vue', import.meta.url)).text();
const es = await Bun.file(new URL('../src-tauri/locales/es.yml', import.meta.url)).text();

describe('el AUR en la interfaz', () => {
	test('la insignia del AUR se distingue por color y no sólo por texto', () => {
		expect(insignia).toContain("origen === 'aur'");
		expect(insignia).toContain('status-warning');
	});

	test('la ficha del AUR advierte antes de nada', () => {
		expect(detalle).toContain("t('origen.aurNota')");
	});

	test('en el AUR el botón principal abre la receta, no compila', () => {
		// Compilar tiene que pasar por haber tenido el PKGBUILD delante: es lo
		// único que hace que «inseguro» signifique algo más que un cartel.
		const bloque = detalle.slice(detalle.indexOf('v-else-if="delAur"'));
		expect(bloque.slice(0, 200)).toContain('verReceta');
		expect(detalle).toContain("t('detalle.recetaNota')");
	});

	test('los textos explican qué es cada origen', () => {
		for (const clave of ['repositorioNota', 'aurNota', 'appimageNota', 'localNota']) {
			expect(es).toContain(`${clave}:`);
		}
	});
});
