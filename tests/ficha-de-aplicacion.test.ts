/**
 * La ficha de una aplicación, montada.
 *
 * Era una lista de pares sin jerarquía, con el enlace al sitio perdido entre el
 * texto y las capturas de a una. Esto fija lo que la hace legible — y, sobre
 * todo, lo que la hace segura: el enlace sale de archivos que no escribimos
 * nosotros.
 *
 * Antes se comprobaba leyendo el `.vue` y buscando cadenas. Para el `href` eso
 * era especialmente poco: que en el archivo aparezca escrito
 * `url.protocol === 'https:'` no dice que un `javascript:` no llegue al DOM.
 * Acá se le pasa uno y se mira si hay enlace.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ActionButton, PropertyList } from '@vasakgroup/vue-libvasak';
import { mount } from '@vue/test-utils';
import ScreenshotCarousel from '@/components/store/ScreenshotCarousel.vue';
import DetailView from '@/views/DetailView.vue';
import { olvidarTodo, pedidos, responder } from './dobles';
import { sinArrastre, unaFicha, unasCapturas } from './ejemplos';
import { asentar, desmontarTodo, elDialogo, hayDialogo, montarVista, nombreDelDialogo } from './montar';


/** Abre la ficha de algo y espera a que cargue. */
async function abrirLaFicha(ficha = unaFicha(), donde = '/app/repositorio/krita') {
	responder('detalle', ficha);
	responder('previsualizar', sinArrastre());
	const montada = await montarVista(DetailView, donde);
	await asentar();
	return montada;
}

beforeEach(() => {
	olvidarTodo();
});

afterEach(desmontarTodo);

describe('el enlace al sitio', () => {
	test('se dibuja cuando la dirección es https', async () => {
		const { vista } = await abrirLaFicha(unaFicha({ web: 'https://krita.org' }));

		const enlace = vista.get('a[target="_blank"]');
		expect(enlace.attributes('href')).toBe('https://krita.org/');
		// Sin esto, la pestaña que se abre puede tocar la que la abrió.
		expect(enlace.attributes('rel')).toContain('noopener');
	});

	test('y con http también, que es lo que tienen los proyectos viejos', async () => {
		const { vista } = await abrirLaFicha(unaFicha({ web: 'http://xmms.org' }));

		expect(vista.get('a[target="_blank"]').attributes('href')).toBe('http://xmms.org/');
	});

	test('un `javascript:` no llega al DOM', async () => {
		// El valor sale del catálogo de AppStream o de la base de pacman, o sea
		// de archivos que no escribimos nosotros. Puesto tal cual en un `href`,
		// se ejecuta en la ventana al hacer clic — y la ventana es la que habla
		// con el servicio que instala paquetes.
		const { vista } = await abrirLaFicha(unaFicha({ web: 'javascript:alert(1)' }));

		expect(vista.find('a[target="_blank"]').exists()).toBe(false);
		expect(vista.html()).not.toContain('javascript:');
	});

	test('un `file:` tampoco', async () => {
		const { vista } = await abrirLaFicha(unaFicha({ web: 'file:///etc/shadow' }));

		expect(vista.find('a[target="_blank"]').exists()).toBe(false);
	});

	test('y una dirección que no se puede leer no rompe la ficha', async () => {
		// `new URL` lanza con cualquier cosa que no sea una dirección; sin
		// atraparlo, la ficha entera se queda sin dibujar.
		const { vista } = await abrirLaFicha(unaFicha({ web: 'no es una dirección' }));

		expect(vista.find('a[target="_blank"]').exists()).toBe(false);
		expect(vista.text()).toContain('Krita');
	});
});

describe('la ficha de datos', () => {
	test('un dato que el paquete no tiene no ocupa una fila vacía', async () => {
		// Una tabla con la mitad de los valores en blanco se lee como datos que
		// faltan y no como datos que ese paquete no tiene.
		const { vista } = await abrirLaFicha(
			unaFicha({ licencia: null, autor: null, empaquetador: null, arquitectura: null })
		);

		const etiquetas = vista.findAll('dt').map((celda) => celda.text());
		expect(etiquetas).not.toContain('detalle.licencia');
		expect(etiquetas).not.toContain('detalle.autor');
		expect(etiquetas).toContain('detalle.version');
		// Y ninguna fila queda con el valor en blanco.
		expect(vista.findAll('dd').map((celda) => celda.text())).not.toContain('');
	});

	test('los que sí están se ven, con su valor', async () => {
		const { vista } = await abrirLaFicha();

		const filas = vista.findAll('dl > div');
		expect(filas.length).toBeGreaterThan(3);
		const porEtiqueta = new Map(
			filas.map((fila) => [fila.get('dt').text(), fila.get('dd').text()])
		);
		expect(porEtiqueta.get('detalle.licencia')).toBe('GPL-3.0-or-later');
		expect(porEtiqueta.get('detalle.version')).toBe('5.2.6-1');
	});

	test('las filas llevan separador salvo la primera', async () => {
		// Es lo que la hace una lista y no una rejilla de pares sueltos. Una
		// línea arriba de la primera duplicaría el borde de la caja. El
		// separador lo pone ahora `PropertyList` por filas: `divide-y` dibuja
		// la línea entre una fila y la siguiente, nunca arriba de la primera.
		const { vista } = await abrirLaFicha();

		const lista = vista.get('dl');
		expect(lista.classes()).toContain('divide-y');
		expect(lista.findAll(':scope > div').length).toBeGreaterThan(1);
	});
});

describe('la cabecera', () => {
	test('lleva la presentación, y los datos quedan afuera', async () => {
		// Es la tarjeta de presentación de la aplicación y conviene que se
		// separe de la ficha de datos: mezcladas, el nombre era un renglón más
		// entre la arquitectura y el empaquetador.
		const { vista } = await abrirLaFicha();

		const cabecera = vista.get('header');
		expect(cabecera.get('h1').text()).toBe('Krita');
		expect(cabecera.text()).toContain('Pintura digital');
		expect(cabecera.find('dl').exists()).toBe(false);
		expect(vista.find('dl').exists()).toBe(true);
	});
});

describe('lo del AUR', () => {
	test('no ofrece instalar: ofrece ver la receta', async () => {
		// La política de la distribución lo trata como inseguro, y la manera de
		// que eso signifique algo es que compilar requiera haber tenido el
		// PKGBUILD delante.
		const { vista } = await abrirLaFicha(
			unaFicha({ nombre: 'yay', titulo: 'Yay', origen: 'aur', repositorio: 'aur' }),
			'/app/aur/yay'
		);

		const textos = vista.findAll('button').map((boton) => boton.text());
		expect(textos).toContain('detalle.verReceta');
		expect(textos).not.toContain('detalle.instalar');
		expect(vista.text()).toContain('origen.aurNota');
	});

	test('compilar pasa por la receta, y la receta se muestra antes', async () => {
		responder('receta_del_aur', 'pkgname=yay\nbuild() { go build; }');
		responder('instalar_del_aur', 'op-9');
		const { vista } = await abrirLaFicha(
			unaFicha({ nombre: 'yay', titulo: 'Yay', origen: 'aur', repositorio: 'aur' }),
			'/app/aur/yay'
		);

		await vista.get('header button[class*="bg-primary"]').trigger('click');
		await asentar();

		// Primero la receta, y todavía nada instalándose.
		expect(pedidos('receta_del_aur')).toHaveLength(1);
		expect(elDialogo().text()).toContain('pkgname=yay');
		expect(pedidos('instalar_del_aur')).toHaveLength(0);

		const dialogo = elDialogo();
		const compilar = dialogo
			.findAll('button')
			.find((boton) => boton.text() === 'detalle.compilarEInstalar');
		expect(compilar).toBeDefined();
		await compilar?.trigger('click');
		await asentar();

		expect(pedidos('instalar_del_aur')[0]?.argumentos.nombre).toBe('yay');
	});

	test('y no se previsualiza: no hay nada que previsualizar todavía', async () => {
		// Qué arrastra se sabe recién después de resolver contra la RPC, y eso
		// es parte de la compilación. Lo que reemplaza a la previsualización acá
		// es la receta.
		responder('receta_del_aur', 'pkgname=yay');
		responder('instalar_del_aur', 'op-9');
		const { vista } = await abrirLaFicha(
			unaFicha({ nombre: 'yay', titulo: 'Yay', origen: 'aur', repositorio: 'aur' }),
			'/app/aur/yay'
		);

		await vista.get('header button[class*="bg-primary"]').trigger('click');
		await asentar();
		const compilar = elDialogo()
			.findAll('button')
			.find((boton) => boton.text() === 'detalle.compilarEInstalar');
		expect(compilar).toBeDefined();
		await compilar?.trigger('click');
		await asentar();

		// Primero que la compilación haya arrancado de verdad: esta prueba
		// afirma una ausencia, y sin esto pasaría sola el día que el botón deje
		// de estar —que es justo uno de los cambios que tendría que atajar—.
		expect(pedidos('instalar_del_aur')).toHaveLength(1);
		expect(pedidos('previsualizar')).toHaveLength(0);
	});
});

describe('instalar y quitar desde la ficha', () => {
	test('instalar sigue pasando por la previsualización', async () => {
		const { vista } = await abrirLaFicha();

		const instalar = vista
			.findAll('header button')
			.find((boton) => boton.text() === 'detalle.instalar');
		await instalar?.trigger('click');
		await asentar();

		expect(pedidos('previsualizar')[0]?.argumentos.paquetes).toEqual(['krita']);
		expect(pedidos('instalar')).toHaveLength(0);
	});

	test('quitar pide llevarse las huérfanas', async () => {
		// Lo que quedó instalado sólo porque esto lo necesitaba no tiene por qué
		// quedarse. El diálogo muestra la lista antes de confirmar.
		const { vista } = await abrirLaFicha(unaFicha({ instalada: true }));

		const quitar = vista
			.findAll('header button')
			.find((boton) => boton.text() === 'detalle.quitar');
		await quitar?.trigger('click');
		await asentar();

		const pedido = pedidos('previsualizar')[0];
		expect(pedido?.argumentos.operacion).toBe('quitar');
		expect(pedido?.argumentos.conHuerfanas).toBe(true);
	});

	test('lo instalado y al día no ofrece instalar de nuevo', async () => {
		const { vista } = await abrirLaFicha(unaFicha({ instalada: true }));

		const textos = vista.findAll('header button').map((boton) => boton.text());
		expect(textos).not.toContain('detalle.instalar');
		expect(vista.text()).toContain('detalle.instalado');
	});
});

describe('las capturas', () => {
	test('se ven todas a la vez y no de a una', async () => {
		// Con una sola a la vista, que existan más se descubría apretando una
		// flecha, que es la mitad de para qué están.
		const carrusel = mount(ScreenshotCarousel, { props: { screenshots: unasCapturas(4) } });

		expect(carrusel.findAll('figure')).toHaveLength(4);
	});

	test('las rutas del disco pasan por el protocolo de Tauri', async () => {
		// La política de contenido no deja cargar rutas del disco crudas.
		const carrusel = mount(ScreenshotCarousel, { props: { screenshots: unasCapturas(1) } });

		const fuente = carrusel.get('figure img').attributes('src') ?? '';
		expect(fuente).toStartWith('tienda://');
	});

	test('una captura se abre en grande', async () => {
		// Es lo que uno espera de una imagen chica que muestra una pantalla
		// llena de detalles.
		const carrusel = mount(ScreenshotCarousel, { props: { screenshots: unasCapturas(3) } });
		expect(hayDialogo()).toBe(false);

		await carrusel.findAll('figure button')[1]?.trigger('click');

		expect(nombreDelDialogo()).toBe('Captura 2');
	});

	test('sin capturas no dibuja nada', async () => {
		const carrusel = mount(ScreenshotCarousel, { props: { screenshots: [] } });

		expect(carrusel.find('figure').exists()).toBe(false);
	});
});

describe('las flechas del carrusel', () => {
	/** Le da a la tira un tamaño, que `happy-dom` no calcula solo. */
	function medirLaTira(tira: HTMLElement, desplazada: number, ancho = 400, total = 1200) {
		for (const [propiedad, valor] of [
			['scrollLeft', desplazada],
			['clientWidth', ancho],
			['scrollWidth', total],
		] as const) {
			Object.defineProperty(tira, propiedad, { value: valor, configurable: true });
		}
	}

	test('al principio de la tira sólo se puede ir a la derecha', async () => {
		const carrusel = mount(ScreenshotCarousel, { props: { screenshots: unasCapturas(6) } });
		const tira = carrusel.get('.overflow-x-auto');

		medirLaTira(tira.element as HTMLElement, 0);
		await tira.trigger('scroll');

		const flechas = carrusel.findAll('button[aria-label^="detalle.captura"]');
		expect(flechas.map((flecha) => flecha.attributes('aria-label'))).toEqual([
			'detalle.capturaSiguiente',
		]);
	});

	test('en el medio se puede ir a los dos lados', async () => {
		const carrusel = mount(ScreenshotCarousel, { props: { screenshots: unasCapturas(6) } });
		const tira = carrusel.get('.overflow-x-auto');

		medirLaTira(tira.element as HTMLElement, 400);
		await tira.trigger('scroll');

		expect(carrusel.findAll('button[aria-label^="detalle.captura"]')).toHaveLength(2);
	});

	test('al final no se ofrece seguir a la derecha', async () => {
		// El margen de cuatro píxeles es para que el redondeo del navegador no
		// deje la flecha encendida para siempre sobre el final de la tira.
		const carrusel = mount(ScreenshotCarousel, { props: { screenshots: unasCapturas(6) } });
		const tira = carrusel.get('.overflow-x-auto');

		medirLaTira(tira.element as HTMLElement, 800);
		await tira.trigger('scroll');

		const flechas = carrusel.findAll('button[aria-label^="detalle.captura"]');
		expect(flechas.map((flecha) => flecha.attributes('aria-label'))).toEqual([
			'detalle.capturaAnterior',
		]);
	});

	test('si la tira entra entera, no hay flechas', async () => {
		const carrusel = mount(ScreenshotCarousel, { props: { screenshots: unasCapturas(2) } });
		const tira = carrusel.get('.overflow-x-auto');

		medirLaTira(tira.element as HTMLElement, 0, 400, 400);
		await tira.trigger('scroll');

		expect(carrusel.findAll('button[aria-label^="detalle.captura"]')).toHaveLength(0);
	});
});

describe('las piezas de la ficha', () => {
	// Los botones eran un `BotonAccion` propio con su radio; ahora son los de la
	// librería, que llevan el radio derivado del que eligió la persona. Se mira
	// montado: que estén todos, no que el fuente nombre el componente.
	test('cada botón es el `ActionButton` de la librería', async () => {
		const { vista } = await abrirLaFicha();

		const propios = vista.findAll('header button');
		expect(propios.length).toBeGreaterThan(0);
		expect(vista.findAllComponents(ActionButton).length).toBeGreaterThanOrEqual(propios.length);
	});

	test('el sitio del proyecto lleva el icono del tema y no una flecha escrita', async () => {
		const { vista } = await abrirLaFicha();

		const enlace = vista.get('a[target="_blank"]');
		expect(enlace.text()).not.toContain('↗');
	});

	test('los datos van en la lista de propiedades, por filas', async () => {
		const { vista } = await abrirLaFicha();

		const lista = vista.findComponent(PropertyList);
		expect(lista.exists()).toBe(true);
		expect(lista.props('layout')).toBe('rows');
		expect(lista.findAll('dt').length).toBeGreaterThan(0);
	});
});
