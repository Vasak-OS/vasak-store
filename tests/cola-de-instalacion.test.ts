/**
 * La cola de instalación, ejercitada de verdad.
 *
 * El candado de pacman admite un solo dueño, así que el servicio rechaza la
 * segunda transacción. Eso se le mostraba a la persona como un error cuando lo
 * que había hecho era apretar instalar dos veces, que en una tienda es lo más
 * natural del mundo. La cola existe para eso, y lo que hay que comprobar de una
 * cola es qué sale de ella y en qué orden: nada de eso se lee en el fuente.
 *
 * Antes este archivo buscaba cadenas dentro de `operaciones.ts` —que apareciera
 * `cola.value.includes(nombre)`, que `confirmar` mencionara `sacarDeLaCola`—.
 * Pasaba con el fuente entero comentado. Ahora se le pide al store, y el
 * backend es un doble que anota lo que le llega (ver `tests/dobles.ts`).
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { createPinia, setActivePinia } from 'pinia';
import { useOperaciones } from '@/stores/operaciones';
import { emitir, olvidarTodo, pedidos, responder } from './dobles';
import { sinArrastre } from './ejemplos';

/** Una tienda recién abierta, con el backend contestando lo mínimo. */
function unaTienda() {
	setActivePinia(createPinia());
	olvidarTodo();
	responder('previsualizar', sinArrastre());
	responder('instalar', 'op-1');
	responder('instalar_del_aur', 'op-0');
	responder('quitar', 'op-2');
	return useOperaciones();
}

/** Los paquetes de cada previsualización que se pidió. */
function previsualizaciones() {
	return pedidos('previsualizar').map((una) => una.argumentos.paquetes);
}

beforeEach(() => {
	olvidarTodo();
});

describe('lo que entra a la cola', () => {
	test('el mismo paquete dos veces entra una sola', async () => {
		// Apretar dos veces el mismo botón es un solo pedido. Encolado dos veces,
		// pacman recibía el nombre repetido en la misma transacción.
		const ops = unaTienda();
		await ops.escuchar();
		await ops.compilarDelAur('yay', 'Yay');

		await ops.encolar('krita');
		await ops.encolar('krita');

		expect(ops.cola).toEqual(['krita']);
	});

	test('quitar no pasa por la cola', async () => {
		// Quitar tres paquetes de a uno no es lo mismo que quitarlos juntos: lo
		// que queda huérfano cambia según con qué se lo saque.
		const ops = unaTienda();
		await ops.escuchar();

		await ops.pedir('quitar', ['krita'], 'Krita');

		expect(ops.cola).toEqual([]);
		expect(pedidos('previsualizar')[0]?.argumentos.operacion).toBe('quitar');
	});

	test('actualizar el sistema con una lista de paquetes no se acepta', async () => {
		// Actualizar es del sistema entero; pedirlo con una lista es pedir otra
		// cosa con el nombre equivocado, y el backend haría lo otro sin avisar.
		const ops = unaTienda();

		await expect(ops.pedir('actualizar', ['krita'], 'Krita')).rejects.toThrow();
	});
});

describe('lo que la cola le pide al backend', () => {
	test('sin nada corriendo, dos paquetes son una sola previsualización con los dos', async () => {
		// Dos tarjetas apretadas una atrás de la otra caen en el mismo tick.
		// Hasta que el store esperó ese microtask, la primera se llevaba la cola
		// con un solo paquete y la segunda se encontraba el cálculo ya empezado:
		// dos informes, dos diálogos y dos transacciones para algo que pacman
		// resuelve de una.
		const ops = unaTienda();
		await ops.escuchar();

		await Promise.all([ops.encolar('krita'), ops.encolar('gimp')]);

		expect(previsualizaciones()).toEqual([['krita', 'gimp']]);
		expect(ops.preguntando).toBe(true);
	});

	test('lo que llega con el diálogo abierto se suma al informe', async () => {
		// El botón de la tarjeta de atrás se puede apretar con el diálogo
		// abierto. Dejándolo afuera del informe, se confirmaba una transacción y
		// el otro paquete arrancaba la suya apenas terminaba la primera: dos
		// resoluciones de dependencias y dos corridas de ganchos.
		const ops = unaTienda();
		await ops.escuchar();
		await ops.encolar('krita');

		await ops.encolar('gimp');

		expect(previsualizaciones().at(-1)).toEqual(['krita', 'gimp']);

		await ops.confirmar();

		expect(pedidos('instalar')).toHaveLength(1);
		expect(pedidos('instalar')[0]?.argumentos.paquetes).toEqual(['krita', 'gimp']);
		expect(ops.cola).toEqual([]);
	});

	test('pero un diálogo de quitar no se lo lleva puesto un encolar', async () => {
		// Quitar no se junta con la cola. Recalculando encima, la persona leía
		// una desinstalación y confirmaba una instalación.
		const ops = unaTienda();
		await ops.escuchar();
		await ops.pedir('quitar', ['krita'], 'Krita');

		await ops.encolar('gimp');

		expect(previsualizaciones()).toEqual([['krita']]);
		expect(pedidos('previsualizar')[0]?.argumentos.operacion).toBe('quitar');
		expect(ops.cola).toEqual(['gimp']);
	});

	test('con algo corriendo, dos paquetes son una sola previsualización', async () => {
		// Es lo que hace que apretar dos botones mientras algo compila termine en
		// una transacción y no en dos: pacman resuelve las dependencias una vez,
		// baja una vez y corre los ganchos una vez.
		const ops = unaTienda();
		await ops.escuchar();
		await ops.compilarDelAur('yay', 'Yay');

		await ops.encolar('krita');
		await ops.encolar('gimp');
		// Nada se pregunta mientras la de arriba corre: el candado está tomado.
		expect(previsualizaciones()).toEqual([]);

		await emitir('tienda://terminada', { id: 'op-0', error: '' });

		expect(previsualizaciones()).toEqual([['krita', 'gimp']]);
	});

	test('y confirmarlas es una sola instalación', async () => {
		const ops = unaTienda();
		await ops.escuchar();
		await ops.compilarDelAur('yay', 'Yay');
		await ops.encolar('krita');
		await ops.encolar('gimp');
		await emitir('tienda://terminada', { id: 'op-0', error: '' });

		await ops.confirmar();

		expect(pedidos('instalar')).toHaveLength(1);
		expect(pedidos('instalar')[0]?.argumentos.paquetes).toEqual(['krita', 'gimp']);
	});

	test('al terminar una operación se atiende lo que esperaba', async () => {
		// Sin esto la cola se llenaba y no se vaciaba nunca: los paquetes
		// quedaban marcados «en cola» para siempre.
		const ops = unaTienda();
		await ops.escuchar();
		await ops.compilarDelAur('yay', 'Yay');
		await ops.encolar('krita');

		await emitir('tienda://terminada', { id: 'op-0', error: '' });

		expect(ops.preguntando).toBe(true);
		expect(previsualizaciones()).toEqual([['krita']]);
	});
});

describe('confirmar y cancelar', () => {
	test('confirmar saca de la cola lo confirmado y deja lo que llegó después', async () => {
		// Vaciando la cola entera se perdía lo que se hubiera sumado mientras la
		// operación se mandaba —que es cuando ya no hay informe donde sumarlo— y
		// eso no se instalaba nunca.
		const ops = unaTienda();
		await ops.escuchar();
		let soltar: (id: string) => void = () => {};
		responder(
			'instalar',
			() =>
				new Promise<string>((listo) => {
					soltar = listo;
				})
		);
		await Promise.all([ops.encolar('krita'), ops.encolar('gimp')]);

		const enviando = ops.confirmar();
		await ops.encolar('inkscape');
		soltar('op-1');
		await enviando;

		expect(pedidos('instalar')[0]?.argumentos.paquetes).toEqual(['krita', 'gimp']);
		expect(ops.cola).toEqual(['inkscape']);
	});

	test('lo que quedó esperando se pregunta al terminar', async () => {
		// La otra mitad de lo de arriba: dejarlo en la cola no alcanza si después
		// nadie lo vuelve a mirar. Quedaba marcado «en cola» para siempre.
		const ops = unaTienda();
		await ops.escuchar();
		let soltar: (id: string) => void = () => {};
		responder(
			'instalar',
			() =>
				new Promise<string>((listo) => {
					soltar = listo;
				})
		);
		await Promise.all([ops.encolar('krita'), ops.encolar('gimp')]);
		const enviando = ops.confirmar();
		await ops.encolar('inkscape');
		soltar('op-1');
		await enviando;

		await emitir('tienda://terminada', { id: 'op-1', error: '' });

		expect(previsualizaciones()).toEqual([['krita', 'gimp'], ['inkscape']]);
	});

	test('confirmar mientras se está juntando no pregunta por el resto encima', async () => {
		// Con el diálogo abierto y otro botón recién apretado, la persona puede
		// confirmar antes de que el recálculo arranque. Lo que quedó en la cola
		// no se pregunta ahí: el candado de pacman ya está tomado, y el segundo
		// diálogo aparecía encima de la operación corriendo.
		const ops = unaTienda();
		await ops.escuchar();
		await ops.encolar('krita');

		const juntando = ops.encolar('gimp');
		await ops.confirmar();
		await juntando;

		expect(previsualizaciones()).toEqual([['krita']]);
		expect(ops.preguntando).toBe(false);
		expect(pedidos('instalar')).toHaveLength(1);
		expect(ops.cola).toEqual(['gimp']);
	});

	test('confirmar durante un recálculo manda lo que el diálogo estaba mostrando', async () => {
		// El recálculo tarda lo que tarde el backend, y el diálogo sigue abierto
		// con el informe anterior mientras tanto. Si `pendiente` se adelantara a
		// `informe`, confirmar mandaba la cola nueva sobre un informe que hablaba
		// de la vieja: la persona leía «se instala krita» y se instalaban dos.
		// Que la pantalla diga qué se lleva puesto es todo el punto del diálogo.
		const ops = unaTienda();
		await ops.escuchar();
		await ops.encolar('krita');
		let soltarInforme: (informe: unknown) => void = () => {};
		responder(
			'previsualizar',
			() =>
				new Promise((listo) => {
					soltarInforme = listo;
				})
		);

		const juntando = ops.encolar('gimp');
		// Deja que el recálculo arranque y se quede esperando al backend.
		await Promise.resolve();
		await ops.confirmar();

		expect(pedidos('instalar')).toHaveLength(1);
		expect(pedidos('instalar')[0]?.argumentos.paquetes).toEqual(['krita']);
		// Y lo otro no se pierde: espera a que ésta termine.
		expect(ops.cola).toEqual(['gimp']);

		soltarInforme(sinArrastre());
		await juntando;

		// El informe que llega después no abre nada encima de la operación.
		expect(ops.preguntando).toBe(false);
	});

	test('cancelar cierra el diálogo y suelta lo que estaba por confirmarse', async () => {
		// Colgado en la cola, la tarjeta lo mostraba «en cola» después de que la
		// persona dijera que no.
		const ops = unaTienda();
		await ops.escuchar();
		await Promise.all([ops.encolar('krita'), ops.encolar('gimp')]);

		ops.cancelar();

		expect(ops.preguntando).toBe(false);
		expect(ops.cola).toEqual([]);
	});

	test('si la previsualización falla, el paquete no se queda en la cola', async () => {
		// Colgado ahí, la tarjeta lo mostraba «en cola» para siempre y no había
		// forma de volver a intentarlo.
		const ops = unaTienda();
		await ops.escuchar();
		responder('previsualizar', () => {
			throw new Error('no se pudo resolver');
		});

		await ops.encolar('krita');

		expect(ops.cola).toEqual([]);
		expect(ops.falla).toContain('no se pudo resolver');
	});
});

describe('el arranque de una operación', () => {
	test('el aviso de terminada que llega antes que el identificador no se pierde', async () => {
		// Una operación que no tiene nada que hacer termina en milisegundos, y su
		// aviso puede llegar mientras todavía se está esperando el identificador.
		// Descartado por no reconocer su id, la barra se quedaba trabajando para
		// siempre sobre algo que ya había terminado.
		const ops = unaTienda();
		await ops.escuchar();
		responder('instalar', async () => {
			await emitir('tienda://terminada', { id: 'op-7', error: '' });
			return 'op-7';
		});
		await ops.encolar('krita');

		await ops.confirmar();

		expect(ops.enCurso).toBeNull();
		expect(ops.ocupado).toBe(false);
		expect(ops.termino).toBe(true);
		expect(ops.error).toBe('');
	});

	test('y si el que llegó antes traía un error, el error se conserva', async () => {
		// Perderlo era peor que perder el final: la operación se daba por buena.
		const ops = unaTienda();
		await ops.escuchar();
		responder('instalar', async () => {
			await emitir('tienda://terminada', { id: 'op-8', error: 'conflicto de archivos' });
			return 'op-8';
		});
		await ops.encolar('krita');

		await ops.confirmar();

		expect(ops.error).toBe('conflicto de archivos');
		expect(ops.termino).toBe(false);
	});

	test('mientras se espera el identificador, la tienda ya está ocupada', async () => {
		// Durante ese `await`, `enCurso` todavía es nulo: sin la marca de
		// iniciando, la ventana se ve libre y un segundo botón arranca otra
		// operación encima. Si esa segunda falla, su `catch` deja `enCurso` en
		// nulo mientras la primera sigue corriendo, y los avances de la primera
		// pasan a ignorarse.
		const ops = unaTienda();
		await ops.escuchar();
		let soltar: (id: string) => void = () => {};
		responder('instalar', () => new Promise<string>((listo) => {
			soltar = listo;
		}));
		await ops.encolar('krita');

		const enviando = ops.confirmar();
		expect(ops.enCurso).toBeNull();
		expect(ops.ocupado).toBe(true);

		soltar('op-1');
		await enviando;
		expect(ops.enCurso).toBe('op-1');
	});

	test('no se arranca una segunda encima de la primera', async () => {
		const ops = unaTienda();
		await ops.escuchar();
		await ops.compilarDelAur('yay', 'Yay');

		await ops.compilarDelAur('paru', 'Paru');

		expect(pedidos('instalar_del_aur')).toHaveLength(1);
		expect(ops.falla).toBe('ya hay una operación en curso');
	});
});

describe('los eventos de una operación ajena', () => {
	test('el avance de otra operación no mueve la barra de ésta', async () => {
		// Con dos ventanas de la tienda abiertas el backend emite para las dos;
		// sin mirar el identificador, una mostraba el progreso de la otra.
		const ops = unaTienda();
		await ops.escuchar();
		await ops.compilarDelAur('yay', 'Yay');

		await emitir('tienda://avance', {
			id: 'otra',
			fase: 'bajando',
			objetivo: 'nada',
			hecho: 7,
			total: 9,
		});

		expect(ops.hecho).toBe(0);
		expect(ops.objetivo).toBe('');
	});

	test('el avance de la propia sí', async () => {
		const ops = unaTienda();
		await ops.escuchar();
		await ops.compilarDelAur('yay', 'Yay');

		await emitir('tienda://avance', {
			id: 'op-0',
			fase: 'bajando',
			objetivo: 'yay',
			hecho: 7,
			total: 9,
		});

		expect(ops.fase).toBe('bajando');
		expect(ops.hecho).toBe(7);
		expect(ops.total).toBe(9);
	});
});
