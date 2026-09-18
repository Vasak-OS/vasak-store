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
import TarjetaGrande from '@/components/tienda/TarjetaGrande.vue';
import { unaApp } from './ejemplos';

describe('abrir la ficha', () => {
	test('el clic en el botón no la abre', async () => {
		// El botón en la tarjeta ahorra entrar a la ficha; si además entrara, no
		// ahorraría nada y encima dejaría a la persona en otra pantalla mientras
		// arranca la instalación.
		const tarjeta = mount(TarjetaGrande, { props: { app: unaApp() } });

		await tarjeta.get('button').trigger('click');

		expect(tarjeta.emitted('instalar')).toHaveLength(1);
		expect(tarjeta.emitted('abrir')).toBeUndefined();
	});

	test('el Enter en el botón tampoco', async () => {
		const tarjeta = mount(TarjetaGrande, { props: { app: unaApp() } });

		await tarjeta.get('button').trigger('keydown.enter');

		expect(tarjeta.emitted('abrir')).toBeUndefined();
	});

	test('el clic en la tarjeta sí', async () => {
		// El control de los dos de arriba: si la tarjeta no abriera nunca, los
		// dos pasarían igual y no estarían comprobando nada.
		const tarjeta = mount(TarjetaGrande, { props: { app: unaApp() } });

		await tarjeta.get('article').trigger('click');

		expect(tarjeta.emitted('abrir')).toHaveLength(1);
	});

	test('y el teclado sobre la tarjeta también', async () => {
		// Sin esto no hay forma de abrir una aplicación sin ratón: la tarjeta es
		// un `article`, que no recibe foco ni se activa solo.
		const tarjeta = mount(TarjetaGrande, { props: { app: unaApp() } });
		const articulo = tarjeta.get('article');

		expect(articulo.attributes('tabindex')).toBe('0');
		expect(articulo.attributes('role')).toBe('button');

		await articulo.trigger('keydown.enter');
		await articulo.trigger('keydown.space');

		expect(tarjeta.emitted('abrir')).toHaveLength(2);
	});

	test('el botón de lo del AUR abre la ficha en vez de instalar', async () => {
		// El control de la receta vive en la ficha, así que el botón de la tarjeta
		// lleva ahí. Que el hijo emita `receta` no alcanza: lo que importa es en
		// qué lo convierte la tarjeta.
		const tarjeta = mount(TarjetaGrande, {
			props: { app: unaApp({ origen: 'aur', repositorio: 'aur' }) },
		});

		await tarjeta.get('button').trigger('click');

		expect(tarjeta.emitted('abrir')).toHaveLength(1);
		expect(tarjeta.emitted('instalar')).toBeUndefined();
	});

	test('lo que tiene versión nueva sube como actualizar', async () => {
		const tarjeta = mount(TarjetaGrande, {
			props: { app: unaApp({ instalada: true, actualizable: '5.3.0-1' }) },
		});

		await tarjeta.get('button').trigger('click');

		expect(tarjeta.emitted('actualizar')).toHaveLength(1);
		expect(tarjeta.emitted('instalar')).toBeUndefined();
	});
});

describe('la portada de la tarjeta', () => {
	test('la captura no se carga del disco crudo', async () => {
		// La política de contenido no deja cargar rutas del disco: sin pasar por
		// el protocolo de Tauri, la imagen queda rota y la fila destacada se ve
		// como una lista cualquiera.
		const tarjeta = mount(TarjetaGrande, {
			props: { app: unaApp({ captura: '/var/cache/tienda/krita.png' }), conCaptura: true },
		});

		const fuente = tarjeta.get('img').attributes('src') ?? '';
		expect(fuente).toStartWith('tienda://');
		expect(fuente).not.toBe('/var/cache/tienda/krita.png');
	});

	test('sin captura no queda una imagen rota', async () => {
		// Un `img` con `src` vacío es un ícono de imagen fallada; el degradado
		// solo alcanza para que la fila se vea destacada.
		const tarjeta = mount(TarjetaGrande, { props: { app: unaApp(), conCaptura: true } });

		expect(tarjeta.find('img').exists()).toBe(false);
	});
});
