/**
 * Lo que la tienda recuerda entre sesiones.
 *
 * Hoy es uno solo: si el AUR cuenta como fuente de paquetes. Está en un store y
 * no en la pantalla que lo cambia porque lo **lee** otra: Repositorios lo
 * enciende y Descubrir decide con él si consulta el AUR al buscar. Guardado en
 * cada una, las dos se contradirían.
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { guardarAur, ajustes as pedirAjustes } from '@/tools/api';

export const useAjustes = defineStore('ajustes', () => {
	/**
	 * Si el AUR está encendido.
	 *
	 * Apagado hasta que se sepa lo contrario: mientras no se hayan leído los
	 * ajustes, la respuesta prudente para «¿consulto una fuente que la
	 * distribución marca como insegura?» es que no.
	 */
	const aur = ref(false);
	const cargado = ref(false);
	const falla = ref('');

	async function cargar() {
		try {
			aur.value = (await pedirAjustes()).aur;
			falla.value = '';
		} catch (error) {
			falla.value = String(error);
		} finally {
			cargado.value = true;
		}
	}

	async function cambiarAur(activo: boolean) {
		falla.value = '';
		try {
			aur.value = (await guardarAur(activo)).aur;
		} catch (error) {
			// Se deja como estaba: mostrar el conmutador movido cuando no se
			// pudo guardar es decir que quedó puesto algo que no quedó.
			falla.value = String(error);
		}
	}

	return { aur, cargado, falla, cargar, cambiarAur };
});
