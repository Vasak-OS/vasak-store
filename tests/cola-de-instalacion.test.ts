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
		expect(encolar.slice(0, 400)).toContain('enCurso.value');
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
		const alTerminar = store.slice(store.indexOf("listen<FinalDeOperacion>"));
		expect(alTerminar.slice(0, 1200)).toContain('cola.value.length > 0');
		expect(alTerminar.slice(0, 1200)).toContain('preguntarPorLaCola()');
	});

	test('confirmar vacía la cola', () => {
		// Si no, lo confirmado vuelve a encolarse al terminar y se instala dos
		// veces.
		const confirmar = store.slice(store.indexOf('async function confirmar'));
		expect(confirmar.slice(0, 700)).toContain('cola.value = [];');
	});

	test('cancelar también', () => {
		const cancelar = store.slice(store.indexOf('function cancelar'));
		expect(cancelar.slice(0, 300)).toContain('cola.value = [];');
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
