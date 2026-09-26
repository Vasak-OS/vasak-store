/**
 * El botón de instalar, montado.
 *
 * Antes esto se comprobaba leyendo el `.vue` y buscando cadenas: que dijera
 * `@click.stop`, que en algún lado apareciera `emit('receta')`. Eso alcanza para
 * que un refactor no borre la línea, pero no dice nada de lo que pasa al
 * apretar el botón — que es lo que se rompe. Acá se aprieta.
 *
 * Los tres fallos que ataja son reales y los tres se vieron:
 *
 * - el botón del AUR ofreciendo instalar algo que el servicio no instala;
 * - apretarlo y que además se abriera la ficha, porque el evento subía a la
 *   tarjeta, que entera es clickeable;
 * - apretar dos veces lo mismo y que la segunda pareciera no hacer nada.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { mount } from '@vue/test-utils';
import { defineComponent, h, type PropType } from 'vue';
import BotonInstalar from '@/components/tienda/BotonInstalar.vue';
import type { Tarjeta } from '@/tools/api';
import { unaApp } from './ejemplos';

/**
 * Lo que la tarjeta que contiene al botón vería subir.
 *
 * Un contador suelto en vez de un evento del componente: lo que se comprueba es
 * que **no** llegue nada, y un cero es más difícil de leer mal que un `emitted()`
 * indefinido, que también da indefinido cuando el montaje se armó mal.
 */
let llegadasALaTarjeta = 0;

const Anfitrion = defineComponent({
	props: {
		app: { type: Object as PropType<Tarjeta>, required: true },
		ocupado: { type: Boolean, default: false },
		enCola: { type: Boolean, default: false },
	},
	setup(props) {
		const contar = () => {
			llegadasALaTarjeta++;
		};
		return () =>
			h('div', { onClick: contar, onKeydown: contar }, [
				h(BotonInstalar, { app: props.app, ocupado: props.ocupado, enCola: props.enCola }),
			]);
	},
});

beforeEach(() => {
	llegadasALaTarjeta = 0;
});

describe('lo que emite', () => {
	test('lo del AUR manda a la receta y no ofrece instalar', async () => {
		// Instalar del AUR es compilar un guión que subió cualquiera, y la
		// política de la distribución pide tener el PKGBUILD delante antes. Ese
		// control vive en la ficha. Un botón «Instalar» acá lo saltearía —o, peor,
		// fallaría con «no hay ningún paquete llamado X», porque el servicio sólo
		// instala de los repositorios—.
		const boton = mount(BotonInstalar, {
			props: { app: unaApp({ origen: 'aur', repositorio: 'aur' }), ocupado: false },
		});

		await boton.get('button').trigger('click');

		expect(boton.emitted('receta')).toHaveLength(1);
		expect(boton.emitted('instalar')).toBeUndefined();
		expect(boton.text()).toBe('tarjeta.receta');
	});

	test('lo de los repositorios instala', async () => {
		const boton = mount(BotonInstalar, { props: { app: unaApp(), ocupado: false } });

		await boton.get('button').trigger('click');

		expect(boton.emitted('instalar')).toHaveLength(1);
		expect(boton.emitted('receta')).toBeUndefined();
	});

	test('lo que tiene versión nueva actualiza, no instala de nuevo', async () => {
		const boton = mount(BotonInstalar, {
			props: { app: unaApp({ instalada: true, actualizable: '5.3.0-1' }), ocupado: false },
		});

		await boton.get('button').trigger('click');

		expect(boton.emitted('actualizar')).toHaveLength(1);
		expect(boton.emitted('instalar')).toBeUndefined();
		expect(boton.text()).toBe('tarjeta.actualizar');
	});

	test('lo instalado y al día no emite nada', async () => {
		// Informa, no ofrece. Emitir acá mandaba a reinstalar algo que ya estaba.
		const boton = mount(BotonInstalar, {
			props: { app: unaApp({ instalada: true }), ocupado: false },
		});

		await boton.get('button').trigger('click');

		expect(boton.emitted('instalar')).toBeUndefined();
		expect(boton.text()).toBe('tarjeta.instalada');
	});
});

describe('cuándo se apaga', () => {
	test('con el paquete esperando su turno', async () => {
		// El candado de pacman admite un solo dueño, así que lo que se aprieta
		// mientras algo corre espera en vez de fallar. Si el botón siguiera
		// ofreciendo «Instalar», apretarlo otra vez no haría nada visible y la
		// única lectura posible sería que la tienda se colgó.
		const boton = mount(BotonInstalar, {
			props: { app: unaApp(), ocupado: true, enCola: true },
		});

		expect((boton.get('button').element as HTMLButtonElement).disabled).toBe(true);
		expect(boton.text()).toBe('tarjeta.enCola');

		await boton.get('button').trigger('click');
		expect(boton.emitted('instalar')).toBeUndefined();
	});

	test('con una operación en curso, aunque el paquete no esté en la cola', async () => {
		const boton = mount(BotonInstalar, { props: { app: unaApp(), ocupado: true } });

		expect((boton.get('button').element as HTMLButtonElement).disabled).toBe(true);
	});

	test('pero el de la receta no: leerla no toca nada', async () => {
		// Es el único que sigue vivo con algo corriendo, porque no pide el candado.
		const boton = mount(BotonInstalar, {
			props: { app: unaApp({ origen: 'aur', repositorio: 'aur' }), ocupado: true },
		});

		expect((boton.get('button').element as HTMLButtonElement).disabled).toBe(false);

		await boton.get('button').trigger('click');
		expect(boton.emitted('receta')).toHaveLength(1);
	});
});

describe('lo que no sube a la tarjeta', () => {
	/**
	 * Las tres maneras de apretar el botón, que no deben llegar a la tarjeta.
	 *
	 * La tarjeta entera es clickeable, así que sin cortar la propagation instalar
	 * además navegaba a la ficha — y con el teclado era peor: un Enter disparaba
	 * el clic **y** el `keydown`, o sea una acción, dos navegaciones. Los tres
	 * tests eran el mismo montaje con otro disparador, así que van en una tabla.
	 *
	 * El `nombre` va en la tabla y no en un `for` porque sin él un fallo sale
	 * como «esperaba 0 y llegó 1» y no dice cuál de los tres disparadores lo
	 * hizo subir. Los nombres se dejan como estaban: «tampoco» y «tampoco» se
	 * leen mal sueltos, pero son los que ya identifican estos casos en el
	 * informe, y el `describe` es el que les da el contexto.
	 */
	const DISPARADORES = [
		{ nombre: 'el clic se queda en el botón', evento: 'click' },
		{ nombre: 'el Enter tampoco', evento: 'keydown.enter' },
		{ nombre: 'la barra espaciadora tampoco', evento: 'keydown.space' },
	];

	test.each(DISPARADORES)('$nombre', async ({ evento }) => {
		const anfitrion = mount(Anfitrion, { props: { app: unaApp() } });

		await anfitrion.get('button').trigger(evento);

		expect(llegadasALaTarjeta).toBe(0);
	});

	test('y la tarjeta sí escucha lo que no viene del botón', async () => {
		// El control de los tres de arriba: sin esto, un anfitrión mal armado los
		// daría por buenos porque nunca contó nada.
		const anfitrion = mount(Anfitrion, { props: { app: unaApp() } });

		await anfitrion.get('div').trigger('click');
		await anfitrion.get('div').trigger('keydown.enter');

		expect(llegadasALaTarjeta).toBe(2);
	});
});
