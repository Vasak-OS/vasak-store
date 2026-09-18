/**
 * La operación en curso: en qué va, qué dijo y si terminó.
 *
 * Hay una sola a la vez —el candado de pacman admite un solo dueño y el demonio
 * rechaza la segunda— así que esto no es una cola: es el estado de la única que
 * puede haber. Está en un store y no en una pantalla porque la operación
 * sobrevive a cambiar de sección: se puede empezar una instalación en Descubrir
 * y mirar el registro desde Instaladas.
 */

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { FinalDeOperacion, Linea, Paso } from '@/tools/api';
import { recargar } from '@/tools/api';

/** Cuántas líneas de registro se guardan. */
const LINEAS_MAXIMAS = 2000;

export const useOperaciones = defineStore('operaciones', () => {
	/** El identificador de la operación en curso, o nada. */
	const enCurso = ref<string | null>(null);
	/** Qué se está haciendo, para el título. */
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

	let soltar: UnlistenFn[] = [];

	/**
	 * Empieza a escuchar los eventos del backend.
	 *
	 * Se llama una sola vez, desde la raíz de la aplicación. Escuchar desde cada
	 * pantalla haría que una operación empezada en una y mirada desde otra
	 * perdiera los eventos del medio.
	 */
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
				// Una actualización grande imprime miles de líneas y guardarlas
				// todas hace crecer la memoria sin límite; lo que importa es el
				// final, que es donde está el error.
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
				// Las bases de datos en memoria quedaron viejas: lo que se acaba
				// de instalar sigue figurando como no instalado hasta que se
				// reabren.
				await recargar();
			}),
		]);
	}

	/** Deja de escuchar. */
	function soltarTodo() {
		for (const fn of soltar) {
			fn();
		}
		soltar = [];
	}

	/**
	 * Marca que arrancó una operación.
	 *
	 * Recibe la promesa del comando, no su resultado: el identificador tiene que
	 * quedar registrado **antes** de que puedan llegar eventos, y entre el
	 * `await` y la asignación hay lugar para que llegue el primero.
	 */
	async function empezar(nombre: string, pedir: () => Promise<string>) {
		if (enCurso.value) {
			throw new Error('ya hay una operación en curso');
		}
		titulo.value = nombre;
		registro.value = [];
		error.value = '';
		termino.value = false;
		hecho.value = 0;
		total.value = 0;
		fase.value = 'resolviendo';
		try {
			enCurso.value = await pedir();
		} catch (falla) {
			enCurso.value = null;
			error.value = String(falla);
			throw falla;
		}
	}

	/** Olvida el resultado de la última, para que el aviso se pueda cerrar. */
	function limpiar() {
		error.value = '';
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
		escuchar,
		soltarTodo,
		empezar,
		limpiar,
	};
});
