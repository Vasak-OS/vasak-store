/**
 * Lo que varias pantallas necesitan saber a la vez.
 *
 * Hoy es una sola cosa —cuántas actualizaciones hay— y está en un store porque
 * la muestra el selector de la barra, que vive en el marco y no en ninguna
 * pantalla. Recalcularla en cada vista haría que la insignia dijera una cosa
 * distinta según dónde se esté parado.
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { actualizaciones } from '@/tools/api';

export const useTienda = defineStore('tienda', () => {
	const pendientes = ref(0);
	/** Si el servicio de paquetes contestó alguna vez. */
	const conServicio = ref(true);

	async function contar() {
		try {
			pendientes.value = (await actualizaciones()).length;
		} catch {
			pendientes.value = 0;
		}
	}

	return { pendientes, conServicio, contar };
});
