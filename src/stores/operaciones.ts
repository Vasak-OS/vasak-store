/**
 * Las operaciones de paquetes: la que corre, la cola, y lo que dijo.
 *
 * # Por qué hay una cola
 *
 * El candado de pacman admite un solo dueño, así que dos transacciones a la vez
 * no se pueden y el servicio rechaza la segunda. Hasta acá eso se le mostraba a
 * la persona como un error —«hay una operación de paquetes en curso»— cuando lo
 * que había hecho era apretar instalar dos veces, que es lo más natural del
 * mundo en una tienda.
 *
 * Ahora se encolan. Y cuando ninguna arrancó todavía no se encolan: se **juntan
 * en una sola transacción**, que es lo que hace pacman cuando se le pasan
 * varios paquetes — resuelve las dependencias una vez, baja una vez y corre los
 * ganchos una vez.
 *
 * # Por qué la cola vive acá y no en una pantalla
 *
 * Porque la operación sobrevive a cambiar de sección: se puede encolar algo en
 * Descubrir y mirar el registro desde Instaladas. Y porque hay una sola: un
 * store es un singleton y eso es exactamente lo que se quiere modelar.
 */

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
	actualizarTodo,
	type FinalDeOperacion,
	instalar,
	instalarDelAur,
	type Linea,
	type Paso,
	type Previsualizacion,
	previsualizar,
	quitar,
	recargar,
} from '@/tools/api';

/** Cuántas líneas de registro se guardan. */
const LINEAS_MAXIMAS = 2000;

type Clase = 'instalar' | 'quitar' | 'actualizar';

export const useOperaciones = defineStore('operaciones', () => {
	/** El identificador de la operación en curso, o nada. */
	const enCurso = ref<string | null>(null);
	const titulo = ref('');
	const fase = ref('');
	const objetivo = ref('');
	const hecho = ref(0);
	const total = ref(0);
	const registro = ref<string[]>([]);
	/** El error de la última operación, si falló. */
	const error = ref('');
	/** Si la última terminó bien. Se usa para el aviso de «listo». */
	const termino = ref(false);

	/** Los paquetes que esperan para instalarse, sin repetidos. */
	const cola = ref<string[]>([]);
	/** Lo que la operación pendiente arrastra, ya calculado. */
	const informe = ref<Previsualizacion | null>(null);
	const preguntando = ref(false);
	const preparando = ref(false);
	/** El error de armar o pedir una operación, que no es el de ejecutarla. */
	const falla = ref('');

	/** Qué se va a hacer al confirmar. */
	let pendiente: {
		clase: Clase;
		paquetes: string[];
		conHuerfanas: boolean;
		titulo: string;
	} | null = null;

	let soltar: UnlistenFn[] = [];

	const ocupado = computed(() => enCurso.value !== null || preparando.value);

	/** Si un paquete está esperando su turno. */
	function enCola(nombre: string) {
		return cola.value.includes(nombre);
	}

	async function escuchar() {
		if (soltar.length > 0) {
			return;
		}
		soltar = await Promise.all([
			listen<Paso>('tienda://avance', (evento) => {
				if (evento.payload.id !== enCurso.value) {
					return;
				}
				fase.value = evento.payload.fase;
				objetivo.value = evento.payload.objetivo;
				hecho.value = evento.payload.hecho;
				total.value = evento.payload.total;
			}),
			listen<Linea>('tienda://registro', (evento) => {
				if (evento.payload.id !== enCurso.value) {
					return;
				}
				registro.value.push(evento.payload.texto);
				// Una actualización grande imprime miles de líneas; lo que
				// importa es el final, que es donde está el error.
				if (registro.value.length > LINEAS_MAXIMAS) {
					registro.value.splice(0, registro.value.length - LINEAS_MAXIMAS);
				}
			}),
			listen<FinalDeOperacion>('tienda://terminada', async (evento) => {
				if (evento.payload.id !== enCurso.value) {
					return;
				}
				error.value = evento.payload.error;
				termino.value = evento.payload.error === '';
				enCurso.value = null;
				fase.value = '';
				objetivo.value = '';
				// Las bases en memoria quedaron viejas: lo recién instalado
				// seguiría figurando como no instalado hasta reabrirlas.
				await recargar();
				// Y ahora que el motor está libre, lo que esperaba.
				if (cola.value.length > 0) {
					await preguntarPorLaCola();
				}
			}),
		]);
	}

	function soltarTodo() {
		for (const fn of soltar) {
			fn();
		}
		soltar = [];
	}

	/**
	 * Suma un paquete a lo que se va a instalar.
	 *
	 * Si no hay nada corriendo, pregunta en el acto por todo lo acumulado. Si hay
	 * algo corriendo, se queda esperando y la tarjeta lo muestra como en cola.
	 */
	async function encolar(nombre: string) {
		if (!cola.value.includes(nombre)) {
			cola.value.push(nombre);
		}
		if (enCurso.value || preguntando.value || preparando.value) {
			return;
		}
		await preguntarPorLaCola();
	}

	/** Calcula qué arrastra la cola entera y abre el diálogo. */
	async function preguntarPorLaCola() {
		if (cola.value.length === 0) {
			return;
		}
		const paquetes = [...cola.value];
		await preparar({
			clase: 'instalar',
			paquetes,
			conHuerfanas: false,
			// Los nombres, separados por coma. La barra los recorta si no
			// entran; un «3 programas» obligaría a abrir el detalle para saber
			// cuáles son justo cuando hace falta saberlo.
			titulo: paquetes.join(', '),
		});
	}

	/**
	 * Una operación que no se encola: quitar, o actualizar el sistema entero.
	 *
	 * Van aparte de la cola porque no se juntan con nada: quitar tres paquetes
	 * de a uno no es lo mismo que quitarlos juntos —lo que queda huérfano
	 * cambia—, y actualizar es del sistema y no de una lista.
	 */
	async function pedir(
		clase: Clase,
		paquetes: string[],
		comoSeLlama: string,
		conHuerfanas = false
	) {
		if (clase === 'actualizar' && paquetes.length > 0) {
			throw new Error('actualizar es del sistema entero; para uno solo, instalar');
		}
		await preparar({ clase, paquetes, conHuerfanas, titulo: comoSeLlama });
	}

	async function preparar(que: {
		clase: Clase;
		paquetes: string[];
		conHuerfanas: boolean;
		titulo: string;
	}) {
		falla.value = '';
		preparando.value = true;
		pendiente = que;
		try {
			informe.value = await previsualizar(que.clase, que.paquetes, que.conHuerfanas);
			preguntando.value = true;
		} catch (error) {
			falla.value = String(error);
			pendiente = null;
			cola.value = [];
		} finally {
			preparando.value = false;
		}
	}

	/** Lo confirma y lo manda. */
	async function confirmar() {
		if (!pendiente) {
			return;
		}
		const { clase, paquetes, conHuerfanas, titulo: comoSeLlama } = pendiente;
		preguntando.value = false;
		pendiente = null;
		cola.value = [];
		await empezar(comoSeLlama, () => {
			if (clase === 'instalar') {
				return instalar(paquetes);
			}
			if (clase === 'quitar') {
				return quitar(paquetes, conHuerfanas);
			}
			return actualizarTodo();
		});
	}

	function cancelar() {
		preguntando.value = false;
		pendiente = null;
		cola.value = [];
	}

	/**
	 * Compilar del AUR no pasa por la cola ni por la previsualización.
	 *
	 * No hay nada que previsualizar todavía: qué arrastra se sabe recién después
	 * de resolver contra la RPC, y eso es parte de la compilación. Lo que
	 * reemplaza a la previsualización ahí es la receta, que la ficha muestra
	 * antes de dejar apretar el botón.
	 */
	async function compilarDelAur(nombre: string, comoSeLlama: string) {
		await empezar(comoSeLlama, () => instalarDelAur(nombre));
	}

	/**
	 * Marca que arrancó una operación.
	 *
	 * El identificador queda registrado **antes** de que puedan llegar eventos:
	 * entre el `await` y la asignación hay lugar para que llegue el primero.
	 */
	async function empezar(comoSeLlama: string, pedirlo: () => Promise<string>) {
		titulo.value = comoSeLlama;
		registro.value = [];
		error.value = '';
		falla.value = '';
		termino.value = false;
		hecho.value = 0;
		total.value = 0;
		fase.value = 'resolviendo';
		try {
			enCurso.value = await pedirlo();
		} catch (problema) {
			enCurso.value = null;
			falla.value = String(problema);
		}
	}

	/** Olvida el resultado de la última, para que el aviso se pueda cerrar. */
	function limpiar() {
		error.value = '';
		falla.value = '';
		termino.value = false;
		registro.value = [];
	}

	return {
		enCurso,
		titulo,
		fase,
		objetivo,
		hecho,
		total,
		registro,
		error,
		termino,
		cola,
		informe,
		preguntando,
		preparando,
		falla,
		ocupado,
		enCola,
		escuchar,
		soltarTodo,
		encolar,
		pedir,
		confirmar,
		cancelar,
		compilarDelAur,
		limpiar,
	};
});
