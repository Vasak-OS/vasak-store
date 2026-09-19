/**
 * La barra lateral de la tienda, que ya no es de la tienda.
 *
 * Era una copia de la de Configuración: tres componentes en
 * `src/components/sidebar/` con las clases copiadas a mano y una prueba que
 * leía el fuente para vigilar que siguieran iguales. Vigilar una copia es lo
 * que se hace cuando no se puede compartir; ahora se comparte, y la que se
 * monta es la de `@vasakgroup/vue-libvasak` — la misma que Configuración y el
 * monitor.
 *
 * Lo que se comprueba acá es lo de la tienda: que la búsqueda esté arriba de
 * todo, que las categorías del catálogo lleguen a la barra con su cuenta, que
 * elegir una se guarde en la ruta y que una búsqueda no deje ninguna marcada.
 * Cómo se pliega y cómo se ve es de la librería y se prueba allá.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { SideBar, SideButton } from '@vasakgroup/vue-libvasak';
import DescubrirView from '@/views/DescubrirView.vue';
import { olvidarTodo, responder } from './dobles';
import { unaApp } from './ejemplos';
import { asentar, montarVista } from './montar';

const portada = await Bun.file(new URL('../src/views/DescubrirView.vue', import.meta.url)).text();
const css = await Bun.file(new URL('../src/assets/main.css', import.meta.url)).text();

/** Dos categorías del catálogo, que es lo que la barra dibuja. */
const CATEGORIAS = [
	{ id: 'graficos', cuantas: 42, icono: 'applications-graphics' },
	{ id: 'juegos', cuantas: 7, icono: 'applications-games' },
];

async function abrirLaPortada(donde = '/descubrir') {
	responder('descubrir', { seleccion: [], novedades: [unaApp()], categorias: CATEGORIAS });
	responder('buscar', { resultados: [unaApp()], total: 1 });
	responder('de_categoria', { resultados: [unaApp()], total: 1 });
	responder('ajustes', { aur: false });
	const montada = await montarVista(DescubrirView, donde);
	await asentar();
	return montada;
}

/** El botón de la barra cuyo texto es esa categoría. */
function botonDe(vista: Awaited<ReturnType<typeof abrirLaPortada>>['vista'], texto: string) {
	return vista.findAllComponents(SideButton).find((boton) => boton.text().includes(texto));
}

beforeEach(() => {
	olvidarTodo();
});

describe('la barra', () => {
	test('es la compartida y no la copia que vivía acá', async () => {
		// El punto del cambio entero: las ventanas del escritorio se leen como
		// partes de lo mismo porque **son** lo mismo, no porque alguien se
		// acordó de copiar las clases cuando allá cambiaron.
		const { vista } = await abrirLaPortada();

		expect(vista.findComponent(SideBar).exists()).toBe(true);
	});

	test('la copia local ya no existe', async () => {
		// Con los tres archivos todavía en el árbol, un componente nuevo los
		// importa sin enterarse de que están muertos y la copia revive.
		for (const archivo of ['BarraLateral', 'BotonLateral', 'GrupoLateral']) {
			const existe = await Bun.file(
				new URL(`../src/components/sidebar/${archivo}.vue`, import.meta.url)
			).exists();
			expect(existe).toBe(false);
		}
		expect(portada).not.toContain('@/components/sidebar/');
	});

	test('la búsqueda va en la cabecera, antes que las categorías', async () => {
		// En una tienda, buscar es lo primero que alguien hace. Abajo de las
		// categorías hay que pasar por encima de todas para llegar.
		const { vista } = await abrirLaPortada();

		const cabecera = vista.findComponent(SideBar).find('header');
		expect(cabecera.exists()).toBe(true);
		expect(cabecera.find('input[type="search"]').exists()).toBe(true);
	});

	test('las categorías del catálogo llegan con su cuenta', async () => {
		// La cuenta es lo que hace que «Juegos (7)» se distinga de una
		// categoría vacía antes de entrar.
		const { vista } = await abrirLaPortada();

		const graficos = botonDe(vista, 'categorias.graficos');
		expect(graficos?.text()).toContain('42');
		expect(botonDe(vista, 'categorias.juegos')?.text()).toContain('7');
	});

	test('y «todo» adelante de todas', async () => {
		const { vista } = await abrirLaPortada();

		const textos = vista.findAllComponents(SideButton).map((boton) => boton.text());
		expect(textos[0]).toContain('descubrir.todo');
	});
});

describe('elegir una categoría', () => {
	test('la guarda en la ruta y no sólo en memoria', async () => {
		// Guardada en memoria, el botón de atrás salía de Descubrir en vez de
		// volver a la categoría anterior, y una ventana reabierta perdía dónde
		// estaba.
		const { vista, router } = await abrirLaPortada();

		await botonDe(vista, 'categorias.juegos')?.trigger('click');
		await asentar();

		expect(router.currentRoute.value.query.cat).toBe('juegos');
	});

	test('«todo» vuelve a la portada, sin categoría puesta', async () => {
		const { vista, router } = await abrirLaPortada('/descubrir?cat=juegos');

		await botonDe(vista, 'descubrir.todo')?.trigger('click');
		await asentar();

		expect(router.currentRoute.value.query.cat).toBeUndefined();
	});

	test('la elegida queda marcada para quien no ve el color', async () => {
		const { vista } = await abrirLaPortada('/descubrir?cat=graficos');

		expect(botonDe(vista, 'categorias.graficos')?.attributes('aria-current')).toBe('page');
		expect(botonDe(vista, 'categorias.juegos')?.attributes('aria-current')).toBeUndefined();
	});
});

describe('buscando', () => {
	test('ninguna categoría queda marcada', async () => {
		// El identificador de «todo» es la cadena vacía, que es también el
		// valor de «ninguna categoría». Pasándole la categoría cruda a la
		// barra, una búsqueda —que no sale de ninguna categoría— dejaba «todo»
		// marcado mientras el panel mostraba resultados de otra cosa.
		const { vista } = await abrirLaPortada('/descubrir?q=krita');

		const marcados = vista
			.findAllComponents(SideButton)
			.filter((boton) => boton.attributes('aria-current') === 'page');
		expect(marcados).toHaveLength(0);
	});
});

describe('el color de los paneles', () => {
	test('el contenido va en superficie, no en el fondo de la ventana', () => {
		// `--ui-background` es el token de **la ventana**; lo que se apoya
		// encima va en superficie. Con el fondo de ventana puesto, el panel se
		// lee como un rectángulo apenas más claro en vez de un panel.
		const contenido = portada.slice(portada.indexOf('<main'), portada.indexOf('</main>'));
		expect(contenido).toContain('bg-ui-surface/70');
		expect(contenido).not.toContain('bg-ui-bg');
	});

	test('y las tarjetas en el mismo valor que la barra', async () => {
		// La barra y las tarjetas están apoyadas sobre la misma ventana: dos
		// opacidades distintas se ven como dos materiales distintos.
		const vistos = [
			...new Bun.Glob('**/*.vue').scanSync({ cwd: new URL('../src', import.meta.url).pathname }),
		];
		// Sin esto, un glob que no encuentra nada deja la prueba en verde.
		expect(vistos.length).toBeGreaterThan(20);

		for (const archivo of vistos) {
			const fuente = await Bun.file(
				new URL(`../src/${archivo}`, import.meta.url)
			).text();
			expect(fuente).not.toContain('bg-ui-surface/40');
		}
	});
});

describe('la hoja de estilos', () => {
	test('escanea la librería, o la barra llega sin ninguna de sus reglas', () => {
		// Tailwind v4 no mira dentro de `node_modules`. Sin esta línea, las
		// clases que sólo existen en los componentes de la librería no entran
		// nunca en la hoja: la ventana abre con el marcado puesto y sin
		// paddings, sin anchos y con los iconos a tamaño natural. Pasó.
		expect(css).toContain('@source');
		expect(css).toContain('@vasakgroup/vue-libvasak');
	});
});

describe('la versión de la librería', () => {
	test('trae el arreglo de la barra que abría plegada', async () => {
		// En WebKitGTK el `change` de `matchMedia` no llega cuando la ventana
		// pasa de angosta a ancha al terminar de abrirse: la barra se montaba
		// con el WebView todavía sin tamaño y se quedaba plegada para siempre
		// en una ventana de 1280 que nadie había plegado. Se arregló en la
		// 0.3.5 de la librería —y del todo en la 0.3.6, porque el `resize` de la
		// ventana tampoco llega y hizo falta un `ResizeObserver`—, así que
		// volver atrás de ahí lo trae de vuelta.
		const manifiesto = (await Bun.file(
			new URL('../package.json', import.meta.url)
		).json()) as { dependencies: Record<string, string> };
		const pedido = manifiesto.dependencies['@vasakgroup/vue-libvasak'];
		expect(pedido).toBeDefined();

		const [mayor, menor, parche] = pedido
			.replace(/^[^\d]*/, '')
			.split('.')
			.map(Number);
		const numero = mayor * 1_000_000 + menor * 1_000 + parche;
		expect(numero).toBeGreaterThanOrEqual(0 * 1_000_000 + 3 * 1_000 + 6);
	});
});
