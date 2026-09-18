/**
 * La portada: barra lateral, búsqueda arriba, categorías al costado y las
 * aplicaciones con su botón.
 *
 * Son requisitos de forma, y los de forma son los que se pierden callados: un
 * refactor de clases no rompe ninguna prueba de comportamiento y deja la
 * ventana pareciéndose a otra aplicación.
 */

import { describe, expect, test } from 'bun:test';

const barra = await Bun.file(
	new URL('../src/components/sidebar/BarraLateral.vue', import.meta.url)
).text();
const boton = await Bun.file(
	new URL('../src/components/sidebar/BotonLateral.vue', import.meta.url)
).text();
const portada = await Bun.file(new URL('../src/views/DescubrirView.vue', import.meta.url)).text();
const tarjeta = await Bun.file(
	new URL('../src/components/tienda/TarjetaGrande.vue', import.meta.url)
).text();
const instalar = await Bun.file(
	new URL('../src/components/tienda/BotonInstalar.vue', import.meta.url)
).text();
const router = await Bun.file(new URL('../src/router/index.ts', import.meta.url)).text();

describe('la barra lateral', () => {
	test('usa las clases de la de Configuración', () => {
		// Copiadas de `SidebarComponent` de vasak-settings. Si allá cambian, acá
		// hay que seguirlas: el punto es que las dos ventanas se lean como
		// partes del mismo escritorio.
		for (const clase of [
			'rounded-corner',
			'border-ui-border',
			'bg-ui-bg/80',
			'w-[84px]',
			'md:w-72',
		]) {
			expect(barra).toContain(clase);
		}
	});

	test('se pliega, y plegada no deja un campo de texto ilegible', () => {
		expect(barra).toContain('plegada');
		// El ancho plegado es el del ícono; un campo de búsqueda ahí no se podría
		// ni leer ni escribir.
		const cabecera = barra.slice(barra.indexOf('<header'), barra.indexOf('</header>'));
		expect(cabecera).toContain('v-if="!plegada"');
		expect(cabecera).toContain('name="busqueda"');
	});

	test('la búsqueda va antes que las categorías', () => {
		const busqueda = barra.indexOf('name="busqueda"');
		const contenido = barra.indexOf('<slot :plegada="plegada"');
		expect(busqueda).toBeGreaterThan(-1);
		expect(contenido).toBeGreaterThan(busqueda);
	});

	test('el elemento activo se marca para quien no ve el color', () => {
		expect(boton).toContain('aria-current');
	});
});

describe('la portada', () => {
	test('pone la búsqueda en la barra lateral y no sobre el contenido', () => {
		const lateral = portada.slice(
			portada.indexOf('<BarraLateral'),
			portada.indexOf('</BarraLateral>')
		);
		expect(lateral).toContain('BarraDeBusqueda');
		expect(portada.indexOf('BarraDeBusqueda')).toBeLessThan(portada.indexOf('<main'));
	});

	test('las categorías son elementos de la barra lateral', () => {
		const lateral = portada.slice(
			portada.indexOf('<BarraLateral'),
			portada.indexOf('</BarraLateral>')
		);
		expect(lateral).toContain('v-for="grupo in categorias"');
		expect(lateral).toContain('BotonLateral');
	});

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
		expect(portada).toContain("operacion.pedir('instalar'");
		expect(portada).toContain('DialogoDePrevisualizacion');
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

	test('el botón no abre la ficha al apretarlo', () => {
		// La tarjeta entera es clickeable; sin cortar la propagación, instalar
		// además navegaba.
		expect(instalar).toContain('@click.stop');
	});

	test('la tarjeta se puede abrir con el teclado', () => {
		expect(tarjeta).toContain('tabindex="0"');
		expect(tarjeta).toContain('@keydown.enter');
	});
});

describe('el botón de instalar', () => {
	test('dice algo distinto en cada estado', () => {
		for (const estado of ['instalar', 'actualizar', 'instalada']) {
			expect(instalar).toContain(`'${estado}'`);
		}
		expect(instalar).toContain('t(`tarjeta.${estado}`)');
	});

	test('se apaga con una operación en curso', () => {
		// El candado de pacman admite un solo dueño: el servicio rechazaría la
		// segunda y es mejor que el botón lo diga antes.
		expect(instalar).toContain(':disabled="ocupado');
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
