/**
 * La ventana angosta: una columna por vez, como una aplicación de teléfono.
 *
 * Decisión del 01/10: por debajo de su ancho habitual, una pantalla con barra
 * lateral y contenido pasa a una sola columna con navegación y volver, y a 240
 * o 360 píxeles nada se corta ni desaparece. El ancho se lee con un
 * `ResizeObserver` sobre la fila de la pantalla (en WebKitGTK no llegan ni
 * `matchMedia` ni `resize`), así que acá se le da a cada elemento el ancho que
 * tendría y se mira qué forma toma.
 *
 * `happy-dom` no maqueta: `clientWidth` da cero siempre. Se reemplaza el
 * captador del prototipo por uno que decide el ancho según el elemento, y se
 * devuelve el original al terminar.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { DropdownMenuTrigger, ListRow, SegmentedControl, SideBar } from '@vasakgroup/vue-libvasak';
import { mount } from '@vue/test-utils';
import SectionSwitcher from '@/components/bar/SectionSwitcher.vue';
import DiscoverView from '@/views/DiscoverView.vue';
import { olvidarTodo, responder } from './dobles';
import { unaApp } from './ejemplos';
import { asentar, desmontarTodo, montarVista, unRouter } from './montar';

const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');

/** Le da a cada elemento el ancho que devuelva `medir`, y cero al resto. */
function anchoDe(medir: (elemento: HTMLElement) => number | undefined) {
	Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
		configurable: true,
		get(this: HTMLElement) {
			return medir(this) ?? 0;
		},
	});
}

const CATEGORIAS = [
	{ id: 'juegos', cuantas: 12, icono: 'applications-games' },
	{ id: 'multimedia', cuantas: 30, icono: 'applications-multimedia' },
];

beforeEach(() => {
	olvidarTodo();
	responder('descubrir', { seleccion: [], novedades: [unaApp()], categorias: CATEGORIAS });
	responder('de_categoria', { resultados: [unaApp()], total: 1 });
	responder('ajustes', { aur: false });
});

afterEach(() => {
	if (original) Object.defineProperty(HTMLElement.prototype, 'clientWidth', original);
	desmontarTodo();
});

/** La fila de Descubrir mide `ancho`; lo demás, cero. */
async function descubrirA(ancho: number) {
	anchoDe((elemento) => (elemento.hasAttribute('data-narrow') ? ancho : undefined));
	const montada = await montarVista(DiscoverView, '/descubrir');
	await asentar();
	return montada;
}

describe('Descubrir', () => {
	test('en su ancho habitual sigue con la barra lateral al lado del contenido', async () => {
		const { vista } = await descubrirA(1180);

		expect(vista.findComponent(SideBar).exists()).toBe(true);
		expect(vista.find('[data-pane="toolbar"]').exists()).toBe(false);
	});

	for (const ancho of [240, 360, 600]) {
		test(`a ${ancho} píxeles es una sola columna y la búsqueda sigue a mano`, async () => {
			const { vista } = await descubrirA(ancho);

			expect(vista.findComponent(SideBar).exists()).toBe(false);
			const arriba = vista.get('[data-pane="toolbar"]');
			// La búsqueda no desaparece: pasa arriba del contenido.
			expect(arriba.find('input').exists()).toBe(true);
			expect(arriba.find('button[aria-label="categorias.titulo"]').exists()).toBe(true);
		});
	}

	test('las categorías se abren en su propia columna, con volver', async () => {
		const { vista } = await descubrirA(360);

		await vista.get('button[aria-label="categorias.titulo"]').trigger('click');

		const columna = vista.get('[data-pane="categories"]');
		expect(vista.find('main').exists()).toBe(false);
		// «Todo» más las dos del catálogo, ninguna perdida en el camino.
		expect(columna.findAllComponents(ListRow)).toHaveLength(3);

		const volver = columna.findAll('button').find((boton) => boton.text() === 'comun.volver');
		await volver?.trigger('click');
		expect(vista.find('main').exists()).toBe(true);
	});

	test('elegir una categoría vuelve al contenido, ya en esa categoría', async () => {
		const { vista, router } = await descubrirA(360);
		await vista.get('button[aria-label="categorias.titulo"]').trigger('click');

		const multimedia = vista
			.findAllComponents(ListRow)
			.find((fila) => fila.props('title') === 'categorias.multimedia');
		await multimedia?.trigger('click');
		await asentar();

		expect(router.currentRoute.value.query.cat).toBe('multimedia');
		expect(vista.find('main').exists()).toBe(true);
	});
});

describe('el selector de secciones', () => {
	/**
	 * Monta el selector con `lugar` píxeles para él. Las dos copias que miden
	 * dicen cuánto ocupan los nombres (420) y los iconos (180).
	 */
	async function selectorCon(lugar: number) {
		anchoDe((elemento) => {
			if (elemento.hasAttribute('data-shape')) return lugar;
			if (elemento.parentElement?.hasAttribute('inert')) {
				return elemento === elemento.parentElement.firstElementChild ? 420 : 180;
			}
			return undefined;
		});
		const router = await unRouter('/instaladas');
		const vista = mount(SectionSwitcher, {
			props: { pending: 3 },
			global: { plugins: [router] },
			attachTo: document.body,
		});
		await asentar();
		return vista;
	}

	test('con lugar muestra los cuatro nombres, como siempre', async () => {
		const vista = await selectorCon(600);

		expect(vista.attributes('data-shape')).toBe('labels');
	});

	test('sin lugar para los nombres pasa a los iconos, con el nombre de globo', async () => {
		const vista = await selectorCon(300);

		expect(vista.attributes('data-shape')).toBe('icons');
		const visible = vista.findAllComponents(SegmentedControl).at(-1);
		const enlaces = visible?.findAll('a') ?? [];
		expect(enlaces.map((enlace) => enlace.attributes('title'))).toEqual([
			'secciones.descubrir',
			'secciones.instaladas',
			'secciones.actualizaciones',
			'secciones.repositorios',
		]);
	});

	test('y sin lugar para los iconos, un botón con la sección actual que abre el menú', async () => {
		const vista = await selectorCon(150);

		expect(vista.attributes('data-shape')).toBe('menu');
		expect(vista.findComponent(DropdownMenuTrigger).text()).toContain('secciones.instaladas');
	});

	test('las copias que miden no se recorren ni se leen', async () => {
		const vista = await selectorCon(600);
		const copias = vista.get('[inert]');

		expect(copias.attributes('aria-hidden')).toBe('true');
	});
});

describe('el selector, en lo más angosto', () => {
	test('el botón del menú queda en el icono, con el nombre de globo', async () => {
		// A 240 de ventana el botón con el nombre se cortaba en «Descubri».
		Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
			configurable: true,
			get(this: HTMLElement) {
				if (this.hasAttribute('data-shape')) return 100;
				if (this.parentElement?.hasAttribute('inert')) {
					return this === this.parentElement.firstElementChild ? 420 : 180;
				}
				return 0;
			},
		});
		const router = await unRouter('/descubrir');
		const vista = mount(SectionSwitcher, { global: { plugins: [router] }, attachTo: document.body });
		await asentar();

		const boton = vista.findComponent(DropdownMenuTrigger).get('button');
		expect(boton.text()).toBe('');
		expect(boton.attributes('aria-label')).toBe('secciones.descubrir');
		expect(boton.attributes('title')).toBe('secciones.descubrir');
	});
});
