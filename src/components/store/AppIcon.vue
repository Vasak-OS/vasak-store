<script lang="ts" setup>
/**
 * El ícono de un programa, prefiriendo el del sistema.
 *
 * Es `ThemeIcon` con su lista de respaldos: se prueban en orden los nombres
 * del tema de íconos del escritorio —el mismo que dibuja el menú y el
 * lanzador, y que cambia cuando la persona cambia de tema— y recién si ninguno
 * existe se cae al archivo del catálogo, que es un PNG en la caché y pasa por
 * `convertFileSrc` porque la política de contenido no deja cargar rutas del
 * disco.
 *
 * Los nombres son varios porque los temas no se ponen de acuerdo: unos usan el
 * `Icon=` del `.desktop`, otros el identificador de AppStream y unos cuantos el
 * nombre del paquete. Esa búsqueda la hacía este archivo a mano; desde la 2.1
 * la sabe la librería (`fallbacks` y `fallbackSrc`), con la memoria compartida
 * por nombre, el pedido en vuelo compartido y un solo oyente del cambio de
 * tema para toda la ventana. Cuando cambia el ícono —Vue reusa el componente
 * entre elementos de una lista— `ThemeIcon` vuelve a resolver solo.
 *
 * Mientras no hay ícono, `ThemeIcon` deja un hueco del mismo tamaño: sin eso la
 * tarjeta cambia de ancho cuando la imagen carga y la lista entera salta.
 */
import { convertFileSrc } from '@tauri-apps/api/core';
import { ThemeIcon } from '@vasakgroup/vue-libvasak';
import { computed } from 'vue';
import type { Icono } from '@/tools/api';

const props = withDefaults(defineProps<{ icon: Icono; size?: number }>(), { size: 40 });

const names = computed(() => props.icon.tema ?? []);
const file = computed(() => (props.icon.archivo ? convertFileSrc(props.icon.archivo) : ''));
</script>
<template>
  <ThemeIcon
    :name="names[0] ?? ''"
    :fallbacks="names.slice(1)"
    :fallback-src="file"
    :size="size" />
</template>
