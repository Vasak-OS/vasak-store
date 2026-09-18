/**
 * El AUR se enciende desde Repositorios, no desde el buscador.
 *
 * Prender el AUR no es una forma de buscar: es agregar una fuente de paquetes
 * con otro nivel de confianza. Al lado del buscador era además una opción que
 * se olvidaba al cerrar la ventana.
 *
 * Esto se comprobaba leyendo los fuentes y buscando cadenas —que
 * `BarraDeBusqueda` no dijera `InterruptorDeOpcion`, que el store dijera
 * `const aur = ref(false)`—. De lo que importa, eso no decía casi nada: que el
 * conmutador no mienta cuando no se pudo guardar es qué valor queda, no qué
 * línea está escrita, y que los ajustes se lean antes de empezar a observar es
 * cuántas consultas salen al abrir la pantalla.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import BarraDeBusqueda from '@/components/tienda/BarraDeBusqueda.vue';
import { useAjustes } from '@/stores/ajustes';
import DescubrirView from '@/views/DescubrirView.vue';
import RepositoriosView from '@/views/RepositoriosView.vue';
import { olvidarTodo, pedidos, responder } from './dobles';
import { asentar, montarVista } from './montar';

/** Un repositorio de los que vienen de `pacman.conf`. */
function unRepositorio(cambios: Record<string, unknown> = {}) {
	return {
		nombre: 'vasakos',
		activo: true,
		servidores: ['https://repo.vasak.net.ar/$arch'],
		protegido: false,
		...cambios,
	};
}

beforeEach(() => {
	olvidarTodo();
	setActivePinia(createPinia());
});

describe('el ajuste, que sobrevive a cerrar la ventana', () => {
	test('de fábrica está apagado', () => {
		// Mientras no se hayan leído los ajustes, la respuesta prudente a
		// «¿consulto una fuente que la distribución marca como insegura?» es no.
		const ajustes = useAjustes();

		expect(ajustes.aur).toBe(false);
		expect(ajustes.cargado).toBe(false);
	});

	test('al abrir se lee del disco', async () => {
		responder('ajustes', { aur: true });
		const ajustes = useAjustes();

		await ajustes.cargar();

		expect(ajustes.aur).toBe(true);
		expect(ajustes.cargado).toBe(true);
	});

	test('si no se pudo leer, queda apagado y se dice por qué', async () => {
		responder('ajustes', () => {
			throw new Error('no se pudo abrir ajustes.json');
		});
		const ajustes = useAjustes();

		await ajustes.cargar();

		expect(ajustes.aur).toBe(false);
		expect(ajustes.falla).toContain('no se pudo abrir');
		// Y se deja de esperar: si no, el conmutador queda apagado para siempre
		// y sin forma de tocarlo.
		expect(ajustes.cargado).toBe(true);
	});

	test('se queda con lo que el backend contestó y no con lo que se pidió', async () => {
		// Es el backend el que escribe el archivo y el que decide qué quedó
		// puesto. Creerle al pedido es mostrar un estado que nadie confirmó.
		responder('guardar_aur', { aur: false });
		const ajustes = useAjustes();

		await ajustes.cambiarAur(true);

		expect(ajustes.aur).toBe(false);
		expect(pedidos('guardar_aur')[0]?.argumentos.activo).toBe(true);
	});

	test('si no se pudo guardar, el conmutador no miente', async () => {
		// Moverlo igual sería decir que quedó puesto algo que no quedó, y lo que
		// está en juego es si se consulta una fuente que la distribución marca
		// como insegura.
		responder('ajustes', { aur: true });
		responder('guardar_aur', () => {
			throw new Error('el disco está lleno');
		});
		const ajustes = useAjustes();
		await ajustes.cargar();

		await ajustes.cambiarAur(false);

		expect(ajustes.aur).toBe(true);
		expect(ajustes.falla).toContain('el disco está lleno');
	});
});

describe('dónde está el interruptor', () => {
	test('ya no está en el buscador', async () => {
		// Estuvo, y era el lugar equivocado: ahí era una opción de esa búsqueda
		// y no una fuente de paquetes, y se olvidaba al cerrar la ventana.
		const busqueda = mount(BarraDeBusqueda, { props: { valor: '' } });

		expect(busqueda.find('[role="switch"]').exists()).toBe(false);
	});

	test('está en Repositorios, con su advertencia', async () => {
		responder('repositorios', []);
		responder('ajustes', { aur: false });
		const { vista } = await montarVista(RepositoriosView, '/repositorios');
		await asentar();

		const conmutador = vista.get('[role="switch"][aria-label="origen.aur"]');
		expect(conmutador.attributes('aria-checked')).toBe('false');
		expect(vista.text()).toContain('repositorios.aurNota');
		expect(vista.text()).toContain('repositorios.sinRevisar');
	});

	test('refleja lo que estaba guardado', async () => {
		responder('repositorios', []);
		responder('ajustes', { aur: true });
		const { vista } = await montarVista(RepositoriosView, '/repositorios');
		await asentar();

		expect(
			vista.get('[role="switch"][aria-label="origen.aur"]').attributes('aria-checked')
		).toBe('true');
	});

	test('no se puede tocar hasta saber cómo estaba', async () => {
		// Antes de leer los ajustes el conmutador se dibuja apagado; tocarlo ahí
		// guardaría «encendido» sobre un estado que todavía no se conocía.
		let contestarLosAjustes: (ajustes: unknown) => void = () => {};
		responder('repositorios', []);
		responder(
			'ajustes',
			() =>
				new Promise((listo) => {
					contestarLosAjustes = listo;
				})
		);
		const { vista } = await montarVista(RepositoriosView, '/repositorios');
		await asentar(2);

		const conmutador = vista.get('[role="switch"][aria-label="origen.aur"]');
		expect((conmutador.element as HTMLButtonElement).disabled).toBe(true);

		contestarLosAjustes({ aur: false });
		await asentar();

		expect((conmutador.element as HTMLButtonElement).disabled).toBe(false);
	});

	test('y tocarlo lo guarda', async () => {
		responder('repositorios', []);
		responder('ajustes', { aur: false });
		responder('guardar_aur', { aur: true });
		const { vista } = await montarVista(RepositoriosView, '/repositorios');
		await asentar();

		await vista.get('[role="switch"][aria-label="origen.aur"]').trigger('click');
		await asentar();

		expect(pedidos('guardar_aur')[0]?.argumentos.activo).toBe(true);
		expect(
			vista.get('[role="switch"][aria-label="origen.aur"]').attributes('aria-checked')
		).toBe('true');
	});
});

describe('los repositorios de la lista', () => {
	test('uno protegido no se puede apagar con un clic', async () => {
		// Se puede editar `/etc/pacman.conf` a mano, pero un clic no puede dejar
		// la máquina sin actualizaciones de seguridad.
		responder('ajustes', { aur: false });
		responder('repositorios', [
			unRepositorio({ nombre: 'core', protegido: true }),
			unRepositorio(),
		]);
		const { vista } = await montarVista(RepositoriosView, '/repositorios');
		await asentar();

		const core = vista.get('[role="switch"][aria-label="core"]');
		expect((core.element as HTMLButtonElement).disabled).toBe(true);
		expect(vista.text()).toContain('repositorios.protegidoNota');

		const vasakos = vista.get('[role="switch"][aria-label="vasakos"]');
		expect((vasakos.element as HTMLButtonElement).disabled).toBe(false);
	});

	test('apagar uno lo manda y vuelve a leer la lista', async () => {
		// Sin releer, la pantalla muestra lo que se pidió y no lo que quedó en
		// el archivo — que es lo que van a usar pacman y la búsqueda.
		responder('ajustes', { aur: false });
		responder('repositorios', [unRepositorio()]);
		const { vista } = await montarVista(RepositoriosView, '/repositorios');
		await asentar();
		const leidasAlAbrir = pedidos('repositorios').length;

		await vista.get('[role="switch"][aria-label="vasakos"]').trigger('click');
		await asentar();

		expect(pedidos('cambiar_repositorio')[0]?.argumentos).toEqual({
			nombre: 'vasakos',
			activo: false,
		});
		expect(pedidos('repositorios').length).toBeGreaterThan(leidasAlAbrir);
	});
});

describe('qué hace el ajuste en la portada', () => {
	test('buscar lleva el AUR puesto cuando está encendido', async () => {
		responder('ajustes', { aur: true });
		responder('buscar', { resultados: [], total: 0 });
		responder('descubrir', { seleccion: [], novedades: [], categorias: [] });

		await montarVista(DescubrirView, '/descubrir?q=krita');
		await asentar();

		expect(pedidos('buscar')[0]?.argumentos.incluirAur).toBe(true);
	});

	test('y no lo lleva cuando está apagado', async () => {
		responder('ajustes', { aur: false });
		responder('buscar', { resultados: [], total: 0 });
		responder('descubrir', { seleccion: [], novedades: [], categorias: [] });

		await montarVista(DescubrirView, '/descubrir?q=krita');
		await asentar();

		expect(pedidos('buscar')[0]?.argumentos.incluirAur).toBe(false);
	});

	test('abrir la pantalla con una búsqueda puesta consulta una sola vez', async () => {
		// Los ajustes se leen **antes** de empezar a observar. Con el observador
		// ya puesto, leer el archivo cambia `ajustes.aur` y ese cambio dispara
		// una carga idéntica a la inicial: con el AUR encendido, dos consultas a
		// la red por abrir la pantalla.
		responder('ajustes', { aur: true });
		responder('buscar', { resultados: [], total: 0 });
		responder('descubrir', { seleccion: [], novedades: [], categorias: [] });

		await montarVista(DescubrirView, '/descubrir?q=krita');
		await asentar();

		expect(pedidos('buscar')).toHaveLength(1);
	});

	test('encenderlo desde Repositorios rehace la búsqueda', async () => {
		// Si no, hay que volver a escribir el texto para ver lo que apareció, y
		// nada en la pantalla dice que haga falta.
		responder('ajustes', { aur: false });
		responder('guardar_aur', { aur: true });
		responder('buscar', { resultados: [], total: 0 });
		responder('descubrir', { seleccion: [], novedades: [], categorias: [] });
		await montarVista(DescubrirView, '/descubrir?q=krita');
		await asentar();
		expect(pedidos('buscar')).toHaveLength(1);

		await useAjustes().cambiarAur(true);
		await asentar();

		expect(pedidos('buscar')).toHaveLength(2);
		expect(pedidos('buscar')[1]?.argumentos.incluirAur).toBe(true);
	});
});
