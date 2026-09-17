/**
 * Pedir una operación: previsualizar, confirmar, ejecutar.
 *
 * Los tres pasos van juntos en un composable porque separarlos deja el del
 * medio como opcional, y la previsualización es justo lo que no puede ser
 * opcional: es el único momento en el que se ve qué se lleva puesto una
 * desinstalación antes de que se la lleve.
 */

import { ref } from 'vue';
import { useOperaciones } from '@/stores/operaciones';
import {
	actualizarTodo,
	instalar,
	instalarDelAur,
	type Previsualizacion,
	previsualizar,
	quitar,
} from '@/tools/api';

type Clase = 'instalar' | 'quitar' | 'actualizar';

export function useOperacion() {
	const operaciones = useOperaciones();
	const informe = ref<Previsualizacion | null>(null);
	const abierto = ref(false);
	const preparando = ref(false);
	const falla = ref('');

	let pendiente: {
		clase: Clase;
		paquetes: string[];
		conHuerfanas: boolean;
		titulo: string;
	} | null = null;

	/** Primer paso: calcular y mostrar. */
	async function pedir(clase: Clase, paquetes: string[], titulo: string, conHuerfanas = false) {
		falla.value = '';
		preparando.value = true;
		pendiente = { clase, paquetes, conHuerfanas, titulo };
		try {
			informe.value = await previsualizar(clase, paquetes, conHuerfanas);
			abierto.value = true;
		} catch (error) {
			falla.value = String(error);
			pendiente = null;
		} finally {
			preparando.value = false;
		}
	}

	/** Segundo paso: hacerlo. */
	async function confirmar() {
		if (!pendiente) {
			return;
		}
		const { clase, paquetes, conHuerfanas, titulo } = pendiente;
		abierto.value = false;
		pendiente = null;
		try {
			await operaciones.empezar(titulo, () => {
				if (clase === 'instalar') {
					return instalar(paquetes);
				}
				if (clase === 'quitar') {
					return quitar(paquetes, conHuerfanas);
				}
				return actualizarTodo();
			});
		} catch (error) {
			falla.value = String(error);
		}
	}

	function cancelar() {
		abierto.value = false;
		pendiente = null;
	}

	/**
	 * El AUR no pasa por acá.
	 *
	 * No hay nada que previsualizar todavía: qué arrastra se sabe recién después
	 * de resolver contra la RPC, y eso es parte de la compilación. Lo que
	 * reemplaza a la previsualización ahí es la receta, que la ficha muestra
	 * antes de dejar apretar este botón.
	 */
	async function compilarDelAur(nombre: string, titulo: string) {
		falla.value = '';
		try {
			await operaciones.empezar(titulo, () => instalarDelAur(nombre));
		} catch (error) {
			falla.value = String(error);
		}
	}

	return { informe, abierto, preparando, falla, pedir, confirmar, cancelar, compilarDelAur };
}
