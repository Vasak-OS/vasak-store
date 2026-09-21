/**
 * Los íconos salen del tema del sistema siempre que se pueda.
 *
 * Es lo que hace que la tienda se vea como el resto del escritorio y que cambie
 * cuando la persona cambia de tema. El archivo del catálogo —un PNG convertido
 * desde JPEG XL— es el respaldo para lo que el tema no tenga.
 *
 * Antes esto se comprobaba leyendo el `.vue`: que `getIconSource` apareciera
 * antes que `convertFileSrc` dentro de `resolver`, que hubiera un `++pedido`.
 * El orden de dos llamadas en el fuente no es el orden en que resuelven, y un
 * testigo escrito no es un testigo que funcione. Acá se monta el componente y
 * se mira qué `src` queda.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { olvidarLosIconosDelTema } from '@vasakgroup/vue-libvasak';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import IconoDeApp from '@/components/tienda/IconoDeApp.vue';
import { emitir, olvidarTodo, ponerEnElTema } from './dobles';

const lector = await Bun.file(new URL('../src-tauri/src/lector.rs', import.meta.url)).text();

/**
 * Deja que terminen las promesas pendientes.
 *
 * `resolver` prueba los nombres de a uno y con un `await` cada uno, así que no
 * alcanza un `nextTick`: hay que dejar correr la cadena entera antes de mirar
 * el DOM.
 */
async function asentar(vueltas = 6) {
	for (let i = 0; i < vueltas; i++) {
		await nextTick();
	}
}

beforeEach(() => {
	olvidarTodo();
	// La memoria y la cuenta de oyentes de la librería viven en su módulo y se
	// comparten entre archivos de prueba.
	olvidarLosIconosDelTema();
});

afterEach(() => {
	olvidarLosIconosDelTema();
});

describe('de dónde sale el ícono', () => {
	test('del tema, aunque haya un archivo en la caché', async () => {
		// El del tema es el que la persona eligió y el que cambia cuando cambia
		// de tema; el del catálogo es un PNG fijo. Al revés, la tienda se vería
		// igual con cualquier tema puesto.
		ponerEnElTema('krita', 'data:image/png;base64,DELTEMA');
		const icono = mount(IconoDeApp, {
			props: { icono: { tema: ['krita'], archivo: '/var/cache/tienda/krita.png' } },
		});

		await asentar();

		expect(icono.get('img').attributes('src')).toBe('data:image/png;base64,DELTEMA');
	});

	test('se prueban los nombres en orden hasta que uno esté', async () => {
		// Los temas no se ponen de acuerdo en cómo se llama cada ícono, así que
		// el backend manda varios. Quedándose en el primero, lo que no usa ese
		// nombre no muestra ícono nunca.
		ponerEnElTema('org.kde.krita', 'data:image/png;base64,ELSEGUNDO');
		const icono = mount(IconoDeApp, {
			props: { icono: { tema: ['krita', 'org.kde.krita', 'package-x-generic'] } },
		});

		await asentar();

		expect(icono.get('img').attributes('src')).toBe('data:image/png;base64,ELSEGUNDO');
	});

	test('si el tema no tiene ninguno, cae al archivo y lo pasa por el protocolo', async () => {
		// La política de contenido no deja cargar rutas del disco: cargada cruda,
		// la imagen queda rota.
		const icono = mount(IconoDeApp, {
			props: { icono: { tema: ['krita'], archivo: '/var/cache/tienda/krita.png' } },
		});

		await asentar();

		const fuente = icono.get('img').attributes('src') ?? '';
		expect(fuente).toStartWith('tienda://');
		expect(fuente).not.toBe('/var/cache/tienda/krita.png');
	});

	test('y vuelve a buscar cuando la persona cambia de tema', async () => {
		// Es lo único que este componente necesitaba del composable propio, y
		// ahora lo da la librería con `usarLaVersionDelTema()`. Sin eso, el
		// ícono se queda con el del tema anterior hasta reabrir la ventana — y
		// no falla nada: se ve mal y nada más.
		//
		// La prueba mira el comportamiento y no el texto del `.vue`: comprobar
		// que el archivo nombra el composable pasa igual si alguien saca la
		// versión del `watch`, que es justo la forma de romperlo. Medido.
		ponerEnElTema('krita', 'data:image/png;base64,TEMAVIEJO');
		const icono = mount(IconoDeApp, { props: { icono: { tema: ['krita'] } } });
		await asentar();
		expect(icono.get('img').attributes('src')).toBe('data:image/png;base64,TEMAVIEJO');

		ponerEnElTema('krita', 'data:image/png;base64,TEMANUEVO');
		await emitir('vicons:theme-changed', undefined);
		await asentar();

		expect(icono.get('img').attributes('src')).toBe('data:image/png;base64,TEMANUEVO');
	});

	test('sin tema ni archivo no queda una imagen rota, queda el hueco', async () => {
		// Un `img` con `src` vacío es el ícono de imagen fallada. Y el hueco tiene
		// que ocupar lo mismo: sin él la tarjeta cambia de ancho cuando la imagen
		// carga y la lista entera salta.
		const icono = mount(IconoDeApp, { props: { icono: { tema: [] }, tamano: 56 } });

		await asentar();

		expect(icono.find('img').exists()).toBe(false);
		expect(icono.get('span').attributes('style')).toContain('56px');
	});
});

describe('cuándo se vuelve a resolver', () => {
	test('al cambiar el ícono, porque Vue reusa el componente entre filas', async () => {
		// Al desplazar una lista, Vue reusa el componente para otra fila. Sin
		// volver a resolver, las tarjetas nuevas se quedaban con el ícono de la
		// que ocupaba ese lugar antes.
		ponerEnElTema('krita', 'data:image/png;base64,KRITA');
		ponerEnElTema('gimp', 'data:image/png;base64,GIMP');
		const icono = mount(IconoDeApp, { props: { icono: { tema: ['krita'] } } });
		await asentar();
		expect(icono.get('img').attributes('src')).toBe('data:image/png;base64,KRITA');

		await icono.setProps({ icono: { tema: ['gimp'] } });
		await asentar();

		expect(icono.get('img').attributes('src')).toBe('data:image/png;base64,GIMP');
	});

	test('y la resolución vieja no pisa a la nueva cuando llega tarde', async () => {
		// Dos cambios seguidos resuelven en paralelo. Sin el testigo, la lenta
		// contesta última y deja puesto el ícono de la fila anterior — que es el
		// mismo síntoma que se venía a arreglar, pero más difícil de ver porque
		// depende de cuál tarde más.
		let soltarLaVieja: (fuente: string) => void = () => {};
		ponerEnElTema(
			'krita',
			() =>
				new Promise<string>((listo) => {
					soltarLaVieja = listo;
				})
		);
		ponerEnElTema('gimp', 'data:image/png;base64,GIMP');

		const icono = mount(IconoDeApp, { props: { icono: { tema: ['krita'] } } });
		await nextTick();
		await icono.setProps({ icono: { tema: ['gimp'] } });
		await asentar();

		// La nueva ya está puesta; ahora contesta la vieja.
		expect(icono.get('img').attributes('src')).toBe('data:image/png;base64,GIMP');

		soltarLaVieja('data:image/png;base64,KRITA');
		await asentar();

		expect(icono.get('img').attributes('src')).toBe('data:image/png;base64,GIMP');
	});
});

describe('los nombres que el backend ofrece', () => {
	test('son varios y terminan en el genérico', () => {
		// Esto vive en Rust, así que se lee: no hay nada que montar. Lo que se
		// comprueba del lado de la ventana es que se prueben en orden, arriba.
		expect(lector).toContain('strip_suffix(".desktop")');
		expect(lector).toContain('tema.push(paquete.to_string())');
		expect(lector).toContain('"package-x-generic"');
	});
});
