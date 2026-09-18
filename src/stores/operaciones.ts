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
	/**
	 * Entre que se pide una operación y llega su identificador.
	 *
	 * Es una ventana corta pero real: durante ese `await`, `enCurso` todavía es
	 * nulo, así que sin esta marca la ventana se veía libre y un segundo botón
	 * podía arrancar otra operación encima. Si esa segunda fallaba, su `catch`
	 * dejaba `enCurso` en nulo mientras la primera seguía corriendo, y los
	 * avances de la primera pasaban a ignorarse: la barra se quedaba quieta para
	 * siempre sobre algo que estaba pasando.
	 */
	const iniciando = ref(false);
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

	const ocupado = computed(() => enCurso.value !== null || preparando.value || iniciando.value);

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
				const { id, error: problema } = evento.payload;
				if (id !== enCurso.value) {
					// Puede haber llegado antes de que `empezar` guardara el
					// identificador; se anota y `empezar` lo atiende.
					if (iniciando.value) {
						terminadasSinDuenio.add(id);
						erroresHuerfanos.set(id, problema);
					}
					return;
				}
				await cerrar(problema);
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
		if (ocupado.value || preguntando.value) {
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
			sacarDeLaCola(que.paquetes);
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
		// Sólo lo que se confirmó. Vaciando la cola entera se perdía lo que se
		// hubiera sumado después de calcular la previsualización, y eso no se
		// instalaba nunca.
		sacarDeLaCola(paquetes);
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
		const cancelados = pendiente?.paquetes ?? [];
		preguntando.value = false;
		pendiente = null;
		sacarDeLaCola(cancelados);
	}

	/** Saca de la cola lo que ya se atendió, dejando lo que llegó después. */
	function sacarDeLaCola(paquetes: string[]) {
		cola.value = cola.value.filter((nombre) => !paquetes.includes(nombre));
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
		if (enCurso.value || iniciando.value) {
			falla.value = 'ya hay una operación en curso';
			return;
		}
		iniciando.value = true;
		titulo.value = comoSeLlama;
		registro.value = [];
		error.value = '';
		falla.value = '';
		termino.value = false;
		hecho.value = 0;
		total.value = 0;
		fase.value = 'resolviendo';
		try {
			const id = await pedirlo();
			enCurso.value = id;
			// El final pudo llegar mientras se esperaba el identificador: una
			// operación que no tiene nada que hacer termina en milisegundos. Sin
			// esto, ese aviso se descartaba por no reconocer su id y la barra se
			// quedaba trabajando para siempre.
			if (terminadasSinDuenio.has(id)) {
				terminadasSinDuenio.delete(id);
				await cerrar(erroresHuerfanos.get(id) ?? '');
				erroresHuerfanos.delete(id);
			}
		} catch (problema) {
			enCurso.value = null;
			falla.value = String(problema);
		} finally {
			iniciando.value = false;
		}
	}

	/** Los finales que llegaron antes de que se supiera a quién pertenecían. */
	const terminadasSinDuenio = new Set<string>();
	const erroresHuerfanos = new Map<string, string>();

	/** Cierra una operación: deja el resultado, recarga y atiende la cola. */
	async function cerrar(problema: string) {
		error.value = problema;
		termino.value = problema === '';
		enCurso.value = null;
		fase.value = '';
		objetivo.value = '';
		// Las bases en memoria quedaron viejas: lo recién instalado seguiría
		// figurando como no instalado hasta reabrirlas.
		await recargar();
		if (cola.value.length > 0) {
			await preguntarPorLaCola();
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
		iniciando,
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
