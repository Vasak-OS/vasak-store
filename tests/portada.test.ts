/**
 * La portada: barra lateral, búsqueda arriba, categorías al costado y las
 * aplicaciones con su botón.
 *
 * Son requisitos de forma, y los de forma son los que se pierden callados: un
 * refactor de clases no rompe ninguna prueba de comportamiento y deja la
 * ventana pareciéndose a otra aplicación. Por eso acá se lee el fuente y no se
 * monta nada: lo que se comprueba **es** la forma.
 *
 * Lo que la tarjeta y el botón *hacen* —qué emiten, qué se apaga, qué no sube
 * al padre— se fue a `tests/tarjeta-grande.test.ts` y `tests/boton-instalar.test.ts`,
 * que los montan. Buscarlo acá como cadenas pasaba con el componente entero
 * comentado.
 *
 * Y la barra lateral se fue entera a `tests/barra-lateral-compartida.test.ts`,
 * que la monta: lo que había acá vigilaba que la copia local siguiera igual a
 * la de Configuración, y ya no hay copia que vigilar — es la misma de
 * `@vasakgroup/vue-libvasak`.
 */

import { describe, expect, test } from 'bun:test';

const portada = await Bun.file(new URL('../src/views/DescubrirView.vue', import.meta.url)).text();
const tarjeta = await Bun.file(
	new URL('../src/components/tienda/TarjetaGrande.vue', import.meta.url)
).text();
const router = await Bun.file(new URL('../src/router/index.ts', import.meta.url)).text();

describe('la portada', () => {
	test('la categoría y el texto viven en la ruta', () => {
		// Guardados sólo en memoria, el botón de atrás salía de Descubrir en vez
		// de volver a la categoría anterior.
		expect(portada).toContain("ruta.query.cat");
		expect(portada).toContain("ruta.query.q");
		expect(portada).toContain("router.push({ name: 'descubrir', query:");
	});

	test('instalar desde la tarjeta sigue pasando por la previsualización', () => {
		// El botón en la tarjeta ahorra entrar a la ficha; lo que no se saltea
		// nunca es ver qué arrastra la operación.
		expect(portada).toContain('operaciones.encolar(app.nombre)');
		expect(portada).toContain('DialogoDePrevisualizacion');
	});

	test('la tarjeta muestra lo que está esperando su turno', () => {
		expect(portada).toContain('operaciones.enCola(app.nombre)');
	});
});

describe('la tarjeta', () => {
	test('lleva el ícono y el botón de instalar', () => {
		expect(tarjeta).toContain('IconoDeApp');
		expect(tarjeta).toContain('BotonInstalar');
	});

	test('el ícono es grande', () => {
		expect(tarjeta).toContain(':tamano="56"');
	});
});

describe('las rutas viejas', () => {
	test('siguen existiendo y redirigen', () => {
		// Una ruta que deja de existir manda a una pantalla en blanco.
		const buscar = router.slice(router.indexOf("path: '/buscar'"));
		expect(buscar.slice(0, 200)).toContain('redirect');
		const categoria = router.slice(router.indexOf("path: '/categoria/:id'"));
		expect(categoria.slice(0, 200)).toContain('redirect');
	});
});
