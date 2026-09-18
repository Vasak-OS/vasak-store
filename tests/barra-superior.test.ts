/**
 * La barra de arriba: el logo a la izquierda y el selector centrado.
 *
 * Es un requisito explícito del diseño y es de los que se pierden en el primer
 * refactor de clases, sin que nada se rompa visiblemente en una captura chica.
 */

import { describe, expect, test } from 'bun:test';

const barra = await Bun.file(
	new URL('../src/components/topbar/TopBarComponent.vue', import.meta.url)
).text();
const selector = await Bun.file(
	new URL('../src/components/topbar/SelectorDeSeccion.vue', import.meta.url)
).text();
const layout = await Bun.file(
	new URL('../src/layouts/WindowAppLayout.vue', import.meta.url)
).text();
const logo = await Bun.file(
	new URL('../src/components/topbar/LogoDeLaTienda.vue', import.meta.url)
).text();

describe('la barra superior', () => {
	test('tiene una zona para el logo y otra para el resto', () => {
		expect(barra).toContain('name="logo"');
	});

	test('la zona central centra su contenido y ocupa lo que sobra', () => {
		// `justify-center` y no `justify-between`: con éste el selector se corre
		// a la izquierda, porque el logo y los tres botones de ventana no miden
		// lo mismo.
		// Se mira sólo la plantilla: el comentario de arriba nombra
		// `justify-between` para explicar por qué no está, y buscarlo en el
		// archivo entero daría un falso positivo.
		const plantilla = barra.slice(barra.indexOf('<template>'));
		const central = plantilla.slice(plantilla.indexOf('flex-1'));
		expect(central).toContain('justify-center');
		expect(plantilla).not.toContain('justify-between');
	});

	test('el logo no se encoge cuando la ventana es angosta', () => {
		expect(barra).toContain('shrink-0');
	});

	test('el layout pone el logo de la tienda y el selector en la barra', () => {
		expect(layout).toContain('LogoDeLaTienda');
		expect(layout).toContain('SelectorDeSeccion');
	});
});

describe('el selector', () => {
	test('lleva las cuatro secciones y en ese orden', () => {
		expect(selector).toContain(
			"['descubrir', 'instaladas', 'actualizaciones', 'repositorios']"
		);
	});

	test('se anuncia como navegación y no como pestañas', () => {
		// Cada uno cambia la ruta y lo que hay debajo es una pantalla entera, no
		// un panel: anunciarlo como pestañas manda al lector de pantalla a
		// buscar un `tabpanel` que no existe.
		expect(selector).toContain('<nav');
		expect(selector).toContain('RouterLink');
		expect(selector).toContain('aria-current');
		expect(selector).not.toContain('role="tablist"');
	});

	test('las pantallas que cuelgan de una sección la dejan encendida', () => {
		expect(selector).toContain("nombre === 'categoria'");
		expect(selector).toContain("nombre === 'detalle'");
	});
});

describe('el logotipo', () => {
	test('es sólo el ícono, sin el nombre escrito al lado', () => {
		// El nombre le comía espacio al selector de secciones, que es lo único
		// que en esa barra hace falta; la ventana ya se identifica por el ícono
		// y por el título que pone el gestor de ventanas.
		const plantilla = logo.slice(logo.indexOf('<template>'));
		expect(plantilla).not.toContain('<span');
	});

	test('el nombre sigue estando para quien no ve el ícono', () => {
		// Con `alt` vacío el ícono sería decoración, y un lector de pantalla no
		// diría en qué aplicación está parado.
		expect(logo).toContain(":alt=\"t('app.nombre')\"");
		expect(logo).not.toContain('alt=""');
	});
});
