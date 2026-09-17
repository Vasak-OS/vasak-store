<script lang="ts" setup>
/**
 * El ícono de un programa, venga de donde venga.
 *
 * Dos fuentes: el tema de íconos del escritorio —para lo instalado, que es lo
 * que se ve también en el menú— y un archivo de la caché, que es adonde van a
 * parar los íconos del catálogo después de convertirlos desde JPEG XL. El
 * archivo pasa por `convertFileSrc` porque la política de contenido de la
 * ventana no deja cargar rutas del disco directamente.
 */
import { convertFileSrc } from '@tauri-apps/api/core';
import { getIconSource } from '@vasakgroup/plugin-vicons';
import { computed } from 'vue';
import { useReactiveIcon } from '@/composables/useReactiveIcon';
import type { Icono } from '@/tools/api';

const props = withDefaults(defineProps<{ icono: Icono; tamano?: number }>(), { tamano: 40 });

const delTema = useReactiveIcon(async () =>
	props.icono.tipo === 'tema' ? await getIconSource(props.icono.valor) : ''
);

const fuente = computed(() =>
	props.icono.tipo === 'archivo' ? convertFileSrc(props.icono.valor) : delTema.value
);
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
