/**
 * La búsqueda de la tienda, ahora con el campo compartido.
 *
 * La tienda tenía su propia barra de búsqueda, y por un motivo: es la única
 * aplicación del sistema donde buscar **cuesta caro**. Cada búsqueda recorre
 * quince mil paquetes y además consulta al AUR, así que una por tecla no sólo
 * tarda: deja que el resultado de la penúltima llegue después que el de la
 * última y la pise.
 *
 * Ese rebote pasó a ser una propiedad de `SearchField`, así que lo que se
 * comprueba acá no es el rebote —eso se prueba en la librería— sino **que la
 * tienda lo esté usando**: que escribir no dispare el backend hasta parar, y
 * que el campo de Descubrir siga a la ruta, que es lo que hace que el botón de
 * atrás vuelva a la búsqueda anterior con el texto puesto.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { SearchField } from '@vasakgroup/vue-libvasak';
import DescubrirView from '@/views/DescubrirView.vue';
import InstaladasView from '@/views/InstaladasView.vue';
import { olvidarTodo, pedidos, responder } from './dobles';
import { asentar, desmontarTodo, montarVista } from './montar';

/** Más que el rebote del campo, para que no quede una carrera en la prueba. */
const DE_SOBRA = 400;

const esperar = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

beforeEach(() => {
	olvidarTodo();
	responder('instaladas', { resultados: [], total: 0 });
	responder('appimages', []);
	responder('buscar', { resultados: [], total: 0 });
	responder('descubrir', { seleccion: [], novedades: [], categorias: [] });
	responder('destacados', []);
	responder('ajustes', { aur: false });
});

afterEach(desmontarTodo);

describe('en Instaladas', () => {
	test('escribir no vuelve a pedir la lista en cada tecla', async () => {
		const { vista } = await montarVista(InstaladasView, '/instaladas');
		await asentar();
		const alMontar = pedidos('instaladas').length;

		// Se escribe en el `input`, no se emite el evento desde afuera: lo que
		// arranca el rebote es el manejador de `SearchField`, y emitir por
		// encima lo saltea y no probaría nada.
		const campo = vista.find('input');
		await campo.setValue('gi');
		await campo.setValue('gimp');

		expect(pedidos('instaladas')).toHaveLength(alMontar);
	});

	test('y al parar de escribir pide una sola vez, con lo último', async () => {
		const { vista } = await montarVista(InstaladasView, '/instaladas');
		await asentar();
		const alMontar = pedidos('instaladas').length;

		const campo = vista.find('input');
		await campo.setValue('gi');
		await campo.setValue('gimp');
		await esperar(DE_SOBRA);
		await asentar();

		const nuevos = pedidos('instaladas').slice(alMontar);
		expect(nuevos).toHaveLength(1);
		expect(nuevos[0]?.argumentos.texto).toBe('gimp');
	});
});

describe('en Descubrir', () => {
	test('el campo arranca con lo que dice la ruta', async () => {
		// La búsqueda vive en la query: recargar con `?q=krita` tiene que dejar
		// el campo escrito, no vacío con resultados de algo que no se ve.
		const { vista } = await montarVista(DescubrirView, '/descubrir?q=krita');
		await asentar();

		expect(vista.findComponent(SearchField).props('modelValue')).toBe('krita');
	});

	test('y lo sigue cuando la ruta cambia sola', async () => {
		// Es el botón de atrás: vuelve a la búsqueda anterior, y el campo tiene
		// que acompañar. Sin esto queda escrito lo último que se tipeó mientras
		// la pantalla muestra otra cosa.
		const { vista, router } = await montarVista(DescubrirView, '/descubrir?q=krita');
		await asentar();

		await router.push({ name: 'descubrir', query: { q: 'gimp' } });
		await asentar();

		expect(vista.findComponent(SearchField).props('modelValue')).toBe('gimp');
	});

	test('escribir no busca en cada tecla', async () => {
		// Acá el rebote es lo que más importa de todo: cada búsqueda recorre
		// quince mil paquetes y encima consulta al AUR. Navegar por tecla
		// además llenaría el historial de entradas que nadie pidió.
		const { vista, router } = await montarVista(DescubrirView, '/descubrir');
		await asentar();

		const campo = vista.find('input');
		await campo.setValue('kr');
		await campo.setValue('krita');

		expect(router.currentRoute.value.query.q).toBeUndefined();

		await esperar(DE_SOBRA);
		await asentar();

		expect(router.currentRoute.value.query.q).toBe('krita');
	});

	test('buscar navega, que es donde vive el texto', async () => {
		const { vista, router } = await montarVista(DescubrirView, '/descubrir');
		await asentar();

		// Enter busca ya, sin esperar el rebote.
		const campo = vista.find('input');
		await campo.setValue('krita');
		await campo.trigger('keydown.enter');
		await asentar();

		expect(router.currentRoute.value.query.q).toBe('krita');
	});
});
