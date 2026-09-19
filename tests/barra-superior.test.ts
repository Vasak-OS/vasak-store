/**
 * La barra de la ventana: el logo pegado al principio y el selector centrado.
 *
 * Es un requisito explícito del diseño y es de los que se pierden en el primer
 * refactor de clases, sin que nada se rompa visiblemente en una captura chica.
 *
 * La barra en sí ya no se dibuja acá —es la compartida de la librería—, así que
 * lo que queda por comprobar es lo que la tienda le pone adentro y **dónde**.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { AppBar, WindowControls, WindowFrame } from '@vasakgroup/vue-libvasak';
import { mount, type VueWrapper } from '@vue/test-utils';
import LogoDeLaTienda from '@/components/barra/LogoDeLaTienda.vue';
import SelectorDeSeccion from '@/components/barra/SelectorDeSeccion.vue';
import WindowAppLayout from '@/layouts/WindowAppLayout.vue';
import { montarVista } from './montar';

/** La ventana entera, con el router y pinia que el layout necesita. */
async function montarLaVentana() {
	const abierta = await montarVista(WindowAppLayout);
	abiertas.push(abierta.vista);
	return abierta;
}

/** Lo que cada llamada a `ranura()` dejó montado, para desmontarlo después. */
const sueltos: VueWrapper[] = [];

/**
 * Lo que se dibuja dentro de una ranura de la barra.
 *
 * Monta un componente aparte, así que lo que devuelve **no** cuelga de `vista`
 * y no se va con ella: se anota acá y el `afterEach` lo desmonta. Sin eso cada
 * prueba deja un componente vivo, con sus oyentes puestos, hasta que termina el
 * archivo.
 */
function ranura(ventana: VueWrapper, nombre: string) {
	const barra = ventana.findComponent(AppBar);
	const dibujar = (barra.vm.$slots as Record<string, (() => unknown) | undefined>)[nombre];
	if (!dibujar) return null;
	const suelto = mount({ render: () => dibujar() });
	sueltos.push(suelto);
	return suelto;
}

/** Y la ventana, que se monta en cada prueba de este bloque. */
const abiertas: VueWrapper[] = [];

afterEach(() => {
	for (const suelto of sueltos.splice(0)) suelto.unmount();
	for (const abierta of abiertas.splice(0)) abierta.unmount();
});

const selector = await Bun.file(
	new URL('../src/components/barra/SelectorDeSeccion.vue', import.meta.url)
).text();
const layout = await Bun.file(
	new URL('../src/layouts/WindowAppLayout.vue', import.meta.url)
).text();
const logo = await Bun.file(
	new URL('../src/components/barra/LogoDeLaTienda.vue', import.meta.url)
).text();

describe('la barra de la ventana', () => {
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

describe('la ventana', () => {
	test('usa el marco compartido y no uno propio', async () => {
		const { vista } = await montarLaVentana();

		expect(vista.findComponent(WindowFrame).exists()).toBe(true);
		// `rounded-corner-window` es la esquina de la ventana y sale del marco.
		// Con dos, el borde y el fondo se dibujan dos veces y se ven los dos.
		expect(vista.findAll('.rounded-corner-window').length).toBe(1);
	});

	test('con los tres botones y su nombre traducido', async () => {
		const { vista } = await montarLaVentana();

		expect(
			vista
				.findComponent(WindowControls)
				.findAll('button')
				.map((boton) => boton.attributes('aria-label'))
		).toEqual(['ventana.minimizar', 'ventana.maximizar', 'ventana.cerrar']);
	});

	test('el logo va en `identidad`, pegado al principio', async () => {
		// En el contenido de la barra se desplazaría con el selector cuando la
		// ventana es angosta: `identidad` es la única zona que no scrollea.
		const { vista } = await montarLaVentana();
		const dentro = ranura(vista, 'identidad');

		expect(dentro?.findComponent(LogoDeLaTienda).exists()).toBe(true);
	});

	test('el selector va centrado en lo que sobra, y no en la ventana', async () => {
		// Acá el requisito **no** es la ranura `centro`, que centra respecto de
		// la ventana entera. Es el otro: centrado en el espacio que queda entre
		// el logo y los botones. Por eso va en el contenido de la barra, dentro
		// de un `flex-1` con el contenido centrado.
		const { vista } = await montarLaVentana();
		const selector = vista.findComponent(SelectorDeSeccion);

		expect(vista.findComponent(AppBar).findComponent(SelectorDeSeccion).exists()).toBe(true);
		const caja = selector.element.parentElement as HTMLElement;
		expect(caja.className).toContain('flex-1');
		expect(caja.className).toContain('justify-center');
	});

	test('y la ventana se puede arrastrar desde donde está el selector', async () => {
		// Sin decoración del compositor, `data-tauri-drag-region` es lo único
		// que deja mover la ventana. El envoltorio que centra el selector cubre
		// casi toda la barra, así que perderlo ahí deja la ventana casi sin
		// zona de agarre.
		const { vista } = await montarLaVentana();
		const caja = vista.findComponent(SelectorDeSeccion).element.parentElement as HTMLElement;

		expect(caja.hasAttribute('data-tauri-drag-region')).toBe(true);
	});
});
