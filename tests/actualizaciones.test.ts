/**
 * La pantalla de Actualizaciones, montada.
 *
 * «Comprobar de nuevo» baja las bases de datos de los repositorios, que es una
 * operación del demonio y pide autorización: mirar si hay actualizaciones
 * escribe en `/var/lib/pacman/sync`. Por eso no se hace sola al entrar — se
 * muestra lo que ya se sabe, que es instantáneo, y refrescar es una decisión.
 *
 * El botón no hacía nada durante seis versiones. Llamaba a una función que el
 * store no devolvía, así que era `undefined`, y el `TypeError` se lo comía un
 * `catch` vacío. Ni el typecheck lo veía —corría con `--bun` y no miraba los
 * `.vue`— ni había una prueba que lo apretara. Esta lo aprieta.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { useOperaciones } from '@/stores/operaciones';
import ActualizacionesView from '@/views/ActualizacionesView.vue';
import { emitir, olvidarTodo, pedidos, responder } from './dobles';
import { unaApp } from './ejemplos';
import { asentar, montarVista } from './montar';

/** Abre la pantalla con lo que el backend diga que se puede actualizar. */
async function laPantalla(pendientes = [unaApp({ instalada: true, actualizable: '5.3.0-1' })]) {
	responder('actualizaciones', pendientes);
	responder('sincronizar', 'op-sync');
	responder('actualizar_todo', 'op-all');
	const montada = await montarVista(ActualizacionesView, '/actualizaciones');
	// Los avisos del demonio los engancha `App.vue` al arrancar, no la pantalla.
	// Montada sola, sin esto no le llega ninguno y el aviso de «terminada» no
	// despierta a nadie.
	await useOperaciones().escuchar();
	await asentar();
	return montada;
}

/** El botón cuyo texto es esa clave. */
function elBoton(vista: Awaited<ReturnType<typeof laPantalla>>['vista'], clave: string) {
	return vista.findAll('button').find((boton) => boton.text() === clave);
}

beforeEach(() => {
	olvidarTodo();
});

describe('comprobar de nuevo', () => {
	test('baja las bases de los repositorios', async () => {
		// Lo que estaba roto: el botón existía, se apretaba, y no salía nada.
		const { vista } = await laPantalla();

		const boton = elBoton(vista, 'actualizaciones.sincronizar');
		expect(boton).toBeDefined();
		await boton?.trigger('click');
		await asentar();

		expect(pedidos('sincronizar')).toHaveLength(1);
	});

	test('y no se hace sola al entrar', async () => {
		// Pide autorización: hacerla al abrir la pantalla es pedirle la
		// contraseña a alguien que sólo quería mirar.
		await laPantalla();

		expect(pedidos('sincronizar')).toHaveLength(0);
		expect(pedidos('actualizaciones')).toHaveLength(1);
	});

	test('queda apagado mientras algo corre', async () => {
		// El candado de pacman admite un solo dueño.
		const { vista } = await laPantalla();
		await elBoton(vista, 'actualizaciones.sincronizar')?.trigger('click');
		await asentar();

		const boton = elBoton(vista, 'actualizaciones.sincronizar');
		expect((boton?.element as HTMLButtonElement).disabled).toBe(true);
	});

	test('al terminar se vuelve a mirar qué hay para actualizar', async () => {
		// Es el punto de haber sincronizado: con la lista vieja en pantalla, la
		// persona apretó y no cambió nada visible.
		const { vista } = await laPantalla();
		await elBoton(vista, 'actualizaciones.sincronizar')?.trigger('click');
		await asentar();
		const leidasAntes = pedidos('actualizaciones').length;

		await emitir('tienda://terminada', { id: 'op-sync', error: '' });
		await asentar();

		expect(pedidos('actualizaciones').length).toBeGreaterThan(leidasAntes);
	});
});

describe('la lista', () => {
	test('muestra lo que se puede actualizar', async () => {
		const { vista } = await laPantalla();

		expect(vista.text()).toContain('Krita');
	});

	test('y cuando no hay nada lo dice, en vez de quedar vacía', async () => {
		const { vista } = await laPantalla([]);

		expect(vista.text()).toContain('actualizaciones');
		expect(vista.find('article, li').exists()).toBe(false);
	});

	test('si la lectura falla, no se lee como «estás al día»', async () => {
		// Es el peor mensaje posible para un error: la lista queda vacía y la
		// pantalla dice que no hay nada que actualizar.
		responder('actualizaciones', () => {
			throw new Error('el demonio no contesta');
		});
		responder('sincronizar', 'op-sync');
		const { vista } = await montarVista(ActualizacionesView, '/actualizaciones');
		await asentar();

		expect(vista.text()).toContain('el demonio no contesta');
	});
});
