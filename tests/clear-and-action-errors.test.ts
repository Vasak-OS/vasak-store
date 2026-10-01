/**
 * Dos cosas que se veían bien y no andaban (las vio CodeRabbit en el PR #36):
 *
 * - **Vaciar la búsqueda con la cruz.** `SearchField` avisa `clear` y no
 *   `search`: el campo quedaba vacío y los resultados seguían siendo los de la
 *   búsqueda anterior.
 * - **El error de una acción sobre un AppImage.** Cada acción recarga la lista
 *   después, y la recarga limpiaba el error: si abrir o quitar fallaba, el
 *   aviso se borraba antes de verse.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { SearchField } from '@vasakgroup/vue-libvasak';
import DiscoverView from '@/views/DiscoverView.vue';
import InstalledView from '@/views/InstalledView.vue';
import { olvidarTodo, pedidos, responder } from './dobles';
import { unaApp } from './ejemplos';
import { asentar, desmontarTodo, montarVista } from './montar';

beforeEach(() => {
	olvidarTodo();
	responder('descubrir', { seleccion: [], novedades: [unaApp()], categorias: [] });
	responder('buscar', { resultados: [unaApp()], total: 1 });
	responder('ajustes', { aur: false });
	responder('instaladas', { resultados: [unaApp()], total: 1 });
	responder('appimages', [
		{ id: 'a', titulo: 'Krita', ruta: '/home/ana/krita.AppImage', tamano: 1, integrado: 0, en_el_menu: true, administrado: true },
	]);
});

afterEach(desmontarTodo);

describe('vaciar la búsqueda', () => {
	test('en Descubrir vuelve a la portada', async () => {
		const { vista, router } = await montarVista(DiscoverView, '/descubrir?q=krita');
		await asentar();
		expect(router.currentRoute.value.query.q).toBe('krita');

		vista.findComponent(SearchField).vm.$emit('clear');
		await asentar();

		expect(router.currentRoute.value.query.q).toBeUndefined();
	});

	test('en Instaladas vuelve a pedir la lista sin filtro', async () => {
		const { vista } = await montarVista(InstalledView, '/instaladas');
		await asentar();
		const antes = pedidos('instaladas').length;

		vista.findComponent(SearchField).vm.$emit('clear');
		await asentar();

		expect(pedidos('instaladas').length).toBe(antes + 1);
	});
});

describe('el error de una acción sobre un AppImage', () => {
	test('sigue a la vista después de recargar la lista', async () => {
		responder('ejecutar_appimage', () => {
			throw new Error('no se pudo abrir');
		});
		const { vista } = await montarVista(InstalledView, '/instaladas');
		await asentar();

		const abrir = vista.findAll('button').find((boton) => boton.text() === 'instaladas.ejecutar');
		await abrir?.trigger('click');
		await asentar();

		expect(pedidos('appimages').length).toBeGreaterThan(1);
		expect(vista.text()).toContain('no se pudo abrir');
	});

	test('y no se confunde con un error de lectura', async () => {
		// Un error de acción no reemplaza la lista por «no se pudo leer».
		responder('quitar_appimage', () => {
			throw new Error('ocupado');
		});
		const { vista } = await montarVista(InstalledView, '/instaladas');
		await asentar();

		const quitar = vista.findAll('button').find((boton) => boton.text() === 'instaladas.quitarAppimage');
		await quitar?.trigger('click');
		await asentar();

		expect(vista.text()).toContain('ocupado');
		expect(vista.text()).not.toContain('comun.noSePudoLeer');
	});
});
