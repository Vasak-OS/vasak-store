/**
 * Apretar instalar varias veces encola, y lo que no arrancó se junta.
 *
 * El candado de pacman admite un solo dueño, así que el servicio rechaza la
 * segunda transacción. Eso se le mostraba a la persona como un error cuando lo
 * que había hecho era apretar instalar dos veces, que en una tienda es lo más
 * natural del mundo.
 */

import { describe, expect, test } from 'bun:test';

const store = await Bun.file(new URL('../src/stores/operaciones.ts', import.meta.url)).text();
const boton = await Bun.file(
	new URL('../src/components/tienda/BotonInstalar.vue', import.meta.url)
).text();

describe('la cola', () => {
	test('acumula sin repetir', () => {
		expect(store).toContain('cola.value.includes(nombre)');
	});

	test('con algo corriendo, espera en vez de fallar', () => {
		const encolar = store.slice(store.indexOf('async function encolar'));
		expect(encolar.slice(0, 400)).toContain('ocupado.value');
		expect(encolar.slice(0, 400)).toContain('return;');
	});

	test('sin nada corriendo, pregunta por la cola entera y no por uno', () => {
		// Es lo que hace que tres clics seguidos sean una sola transacción:
		// pacman resuelve las dependencias una vez, baja una vez y corre los
		// ganchos una vez.
		expect(store).toContain('const paquetes = [...cola.value];');
		const preguntar = store.slice(store.indexOf('async function preguntarPorLaCola'));
		expect(preguntar.slice(0, 600)).toContain("clase: 'instalar'");
		expect(preguntar.slice(0, 600)).toContain('paquetes,');
	});

	test('al terminar una operación se atiende lo que esperaba', () => {
		// El cierre es uno solo —lo comparten el aviso normal y el que llega
		// antes de tiempo— y es ahí donde se mira la cola.
		const cerrar = store.slice(store.indexOf('async function cerrar'));
		expect(cerrar.slice(0, 700)).toContain('cola.value.length > 0');
		expect(cerrar.slice(0, 700)).toContain('preguntarPorLaCola()');
	});

	test('confirmar saca de la cola lo confirmado', () => {
		// Si no se sacara, lo confirmado vuelve a encolarse al terminar y se
		// instala dos veces.
		const confirmar = store.slice(store.indexOf('async function confirmar'));
		expect(confirmar.slice(0, 800)).toContain('sacarDeLaCola(paquetes)');
	});

	test('cancelar también, y sólo lo que estaba en el diálogo', () => {
		const cancelar = store.slice(store.indexOf('function cancelar()'));
		expect(cancelar.slice(0, 400)).toContain('sacarDeLaCola(cancelados)');
	});

	test('quitar y actualizar no entran a la cola', () => {
		// Quitar tres paquetes de a uno no es lo mismo que quitarlos juntos —lo
		// que queda huérfano cambia— y actualizar es del sistema, no de una lista.
		const pedir = store.slice(store.indexOf('async function pedir'));
		expect(pedir.slice(0, 600)).not.toContain('cola.value.push');
	});

	test('el botón dice que está en cola', () => {
		expect(boton).toContain("return 'enCola'");
		expect(boton).toContain("estado === 'enCola'");
	});
});

describe('el arranque de una operación', () => {
	test('se marca antes del primer await', () => {
		// Entre pedir la operación y recibir su identificador, `enCurso` es
		// nulo: sin esta marca la ventana se ve libre y un segundo botón puede
		// arrancar otra encima. Si esa segunda falla, su catch deja `enCurso`
		// en nulo mientras la primera sigue corriendo, y los avances de la
		// primera pasan a ignorarse.
		expect(store).toContain('const iniciando = ref(false);');
		expect(store).toContain('iniciando.value');
		const ocupado = store.slice(store.indexOf('const ocupado = computed'));
		expect(ocupado.slice(0, 200)).toContain('iniciando.value');
	});

	test('no se arranca una segunda encima de la primera', () => {
		const empezar = store.slice(store.indexOf('async function empezar'));
		expect(empezar.slice(0, 300)).toContain('if (enCurso.value || iniciando.value)');
	});

	test('un final que llega antes que su identificador no se pierde', () => {
		// Una operación sin nada que hacer termina en milisegundos, y su aviso
		// puede llegar antes de que se sepa a quién pertenece. Descartado, la
		// barra se queda trabajando para siempre.
		expect(store).toContain('terminadasSinDuenio');
		const alTerminar = store.slice(store.indexOf("listen<FinalDeOperacion>"));
		expect(alTerminar.slice(0, 900)).toContain('terminadasSinDuenio.add(id)');
	});

	test('lo que se sumó después de la previsualización no se pierde', () => {
		// Vaciar la cola entera descartaba lo que hubiera llegado después de
		// calcular qué arrastra la operación, y eso no se instalaba nunca.
		expect(store).toContain('function sacarDeLaCola');
		expect(store).toContain(
			'cola.value = cola.value.filter((nombre) => !paquetes.includes(nombre));'
		);
		const confirmar = store.slice(store.indexOf('async function confirmar'));
		expect(confirmar.slice(0, 800)).toContain('sacarDeLaCola(paquetes)');
	});
});
