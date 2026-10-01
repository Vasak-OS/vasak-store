<script lang="ts" setup>
/**
 * El ícono de un programa, prefiriendo el del sistema.
 *
 * Se prueban en orden los nombres del tema de íconos del escritorio —el mismo
 * que dibuja el menú y el lanzador, y que cambia cuando la persona cambia de
 * tema— y recién si ninguno existe se cae al archivo del catálogo, que es un
 * PNG en la caché y pasa por `convertFileSrc` porque la política de contenido
 * no deja cargar rutas del disco.
 *
 * Los nombres son varios porque los temas no se ponen de acuerdo: unos usan el
 * `Icon=` del `.desktop`, otros el identificador de AppStream y unos cuantos el
 * nombre del paquete.
 *
 * Por eso mismo éste **no puede ser `ThemeIcon`**: ese componente resuelve un
 * nombre, y acá hay una lista de candidatos y un archivo de respaldo. Lo que sí
 * sale de la librería es la versión del tema, que es lo único que este
 * componente necesitaba del composable propio: así se cuelga del oyente único
 * que la librería ya tiene en vez de registrar uno por instancia, que con una
 * lista de aplicaciones en pantalla son unos cuantos.
 */
import { convertFileSrc } from '@tauri-apps/api/core';
import { getIconSource } from '@vasakgroup/plugin-vicons';
import { usarLaVersionDelTema } from '@vasakgroup/vue-libvasak';
import { ref, toRef, watch } from 'vue';
import type { Icono } from '@/tools/api';

const props = withDefaults(defineProps<{ icono: Icono; tamano?: number }>(), { tamano: 40 });

const fuente = ref('');
const version = usarLaVersionDelTema();
const icono = toRef(props, 'icono');

let pedido = 0;

async function resolver() {
	const mio = ++pedido;
	for (const nombre of icono.value.tema ?? []) {
		try {
			const src = await getIconSource(nombre);
			if (mio !== pedido) {
				return;
			}
			if (src) {
				fuente.value = src;
				return;
			}
		} catch {
			// Ese nombre no está en el tema; se prueba el siguiente.
		}
	}
	if (mio !== pedido) {
		return;
	}
	fuente.value = icono.value.archivo ? convertFileSrc(icono.value.archivo) : '';
}

// Se vuelve a resolver cuando cambia el ícono **y** cuando cambia el tema. Lo
// primero hace falta porque Vue reusa el componente entre elementos de una
// lista: al desplazar la lista, las tarjetas nuevas se quedaban con el ícono de
// la fila que ocupaba ese lugar antes.
watch([icono, version], resolver, { immediate: true, deep: true });
</script>
<template>
  <img
    v-if="fuente"
    :src="fuente"
    :width="tamano"
    :height="tamano"
    class="shrink-0 object-contain"
    :style="{ width: `${tamano}px`, height: `${tamano}px` }"
    alt=""
    loading="lazy">
  <!-- Un hueco del mismo tamaño mientras no hay ícono: sin esto la tarjeta
       cambia de ancho cuando la imagen carga y la lista entera salta. -->
  <span v-else class="shrink-0" :style="{ width: `${tamano}px`, height: `${tamano}px` }" />
</template>
