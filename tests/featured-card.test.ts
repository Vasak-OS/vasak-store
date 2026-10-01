/**
 * La tarjeta grande de la portada, montada.
 *
 * La tarjeta entera es clickeable y adentro tiene un botón que hace otra cosa.
 * Ese es todo el riesgo: que apretar «Instalar» además abra la ficha, o que el
 * botón se coma el clic de la tarjeta. Leyendo el fuente se puede comprobar que
 * el `.stop` está escrito; sólo montando se comprueba que alcanza, porque quien
 * lo tiene que cortar es el hijo y quien escucha es el padre.
 */

import { describe, expect, test } from 'bun:test';
import { mount } from '@vue/test-utils';
import FeaturedCard from '@/components/store/FeaturedCard.vue';
import { unaApp } from './ejemplos';

describe('abrir la ficha', () => {
	test('el clic en el botón no la abre', async () => {
		// El botón en la tarjeta ahorra entrar a la ficha; si además entrara, no
		// ahorraría nada y encima dejaría a la persona en otra pantalla mientras
		// arranca la instalación.
		const tarjeta = mount(FeaturedCard, { props: { app: unaApp() } });

		await tarjeta.get('button').trigger('click');

		expect(tarjeta.emitted('install')).toHaveLength(1);
		expect(tarjeta.emitted('open')).toBeUndefined();
	});

	test('el Enter en el botón tampoco', async () => {
		const tarjeta = mount(FeaturedCard, { props: { app: unaApp() } });

		await tarjeta.get('button').trigger('keydown.enter');

		expect(tarjeta.emitted('open')).toBeUndefined();
	});

	test('el clic en la tarjeta sí', async () => {
		// El control de los dos de arriba: si la tarjeta no abriera nunca, los
		// dos pasarían igual y no estarían comprobando nada.
		const tarjeta = mount(FeaturedCard, { props: { app: unaApp() } });

		await tarjeta.get('[role="button"]').trigger('click');

		expect(tarjeta.emitted('open')).toHaveLength(1);
	});

	test('y el teclado sobre la tarjeta también', async () => {
		// Sin esto no hay forma de abrir una aplicación sin ratón: la tarjeta es
		// la `ListCard` de la librería, que recibe foco y se activa con Enter y con espacio.
		const tarjeta = mount(FeaturedCard, { props: { app: unaApp() } });
		const articulo = tarjeta.get('[role="button"]');

		expect(articulo.attributes('tabindex')).toBe('0');
		expect(articulo.attributes('role')).toBe('button');

		await articulo.trigger('keydown.enter');
		await articulo.trigger('keydown.space');

		expect(tarjeta.emitted('open')).toHaveLength(2);
	});

	test('el botón de lo del AUR abre la ficha en vez de instalar', async () => {
		// El control de la receta vive en la ficha, así que el botón de la tarjeta
		// lleva ahí. Que el hijo emita `recipe` no alcanza: lo que importa es en
		// qué lo convierte la tarjeta.
		const tarjeta = mount(FeaturedCard, {
			props: { app: unaApp({ origen: 'aur', repositorio: 'aur' }) },
		});

		await tarjeta.get('button').trigger('click');

		expect(tarjeta.emitted('open')).toHaveLength(1);
		expect(tarjeta.emitted('install')).toBeUndefined();
	});

	test('lo que tiene versión nueva sube como actualizar', async () => {
		const tarjeta = mount(FeaturedCard, {
			props: { app: unaApp({ instalada: true, actualizable: '5.3.0-1' }) },
		});

		await tarjeta.get('button').trigger('click');

		expect(tarjeta.emitted('update')).toHaveLength(1);
		expect(tarjeta.emitted('install')).toBeUndefined();
	});
});

describe('la portada de la tarjeta', () => {
	test('la captura no se carga del disco crudo', async () => {
		// La política de contenido no deja cargar rutas del disco: sin pasar por
		// el protocolo de Tauri, la imagen queda rota y la fila destacada se ve
		// como una lista cualquiera.
		const tarjeta = mount(FeaturedCard, {
			props: { app: unaApp({ captura: '/var/cache/tienda/krita.png' }), withScreenshot: true },
		});

		const fuente = tarjeta.get('img').attributes('src') ?? '';
		expect(fuente).toStartWith('tienda://');
		expect(fuente).not.toBe('/var/cache/tienda/krita.png');
	});

	test('sin captura no queda una imagen rota', async () => {
		// Un `img` con `src` vacío es un ícono de imagen fallada; el degradado
		// solo alcanza para que la fila se vea destacada.
		const tarjeta = mount(FeaturedCard, { props: { app: unaApp(), withScreenshot: true } });

		expect(tarjeta.find('img').exists()).toBe(false);
	});
});

describe('la forma', () => {
	test('es la tarjeta de la librería y no se mueve al pasar por encima', async () => {
		// La forma de Once UI no levanta ni agranda lo que se toca: el estado lo
		// dice el velo de `ListCard`. Antes la tarjeta subía (`-translate-y`) y
		// la portada se agrandaba (`scale-105`).
		const { ListCard } = await import('@vasakgroup/vue-libvasak');
		const tarjeta = mount(FeaturedCard, {
			props: { app: unaApp({ captura: '/var/cache/tienda/krita.png' }), withScreenshot: true },
		});

		expect(tarjeta.findComponent(ListCard).exists()).toBe(true);
		expect(tarjeta.html()).not.toMatch(/(?:hover|group-hover):-?(?:translate|scale)/);
	});

	test('en una columna angosta el botón baja en vez de aplastar el texto', () => {
		// El texto tiene un ancho mínimo y la fila se parte: así, a 240 o 360
		// píxeles, el resumen no queda en una tira de una palabra por renglón.
		const tarjeta = mount(FeaturedCard, { props: { app: unaApp() } });
		const fila = tarjeta.get('h3').element.closest('.flex-wrap.items-start') as HTMLElement | null;

		expect(fila).not.toBeNull();
		expect(tarjeta.get('h3').element.parentElement?.parentElement?.className).toContain('min-w-32');
	});
});
