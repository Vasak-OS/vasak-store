<script lang="ts" setup>
/**
 * Un elemento de la barra lateral.
 *
 * Mismas clases que el de Configuración, y a propósito: las dos aplicaciones
 * son del mismo escritorio y un elemento de lista que se ve distinto obliga a
 * mirarlo dos veces para reconocer qué es.
 */

import { getIconSource } from '@vasakgroup/plugin-vicons';
import { useReactiveIcon } from '@/composables/useReactiveIcon';

const props = withDefaults(
	defineProps<{
		etiqueta: string;
		icono?: string;
		activo?: boolean;
		plegado?: boolean;
		insignia?: string | number;
	}>(),
	{ icono: '', activo: false, plegado: false, insignia: '' }
);

defineEmits<{ click: [] }>();

const fuente = useReactiveIcon(async () => (props.icono ? await getIconSource(props.icono) : ''));
</script>

<template>
  <button
    type="button"
    :title="plegado ? etiqueta : undefined"
    :aria-current="activo ? 'true' : undefined"
    class="group relative flex w-full items-center gap-3 rounded-corner border px-3 py-2 text-left text-sm transition-all duration-200"
    :class="[
      activo
        ? 'border-secondary bg-primary/15 text-tx-main shadow-sm'
        : 'border-transparent bg-ui-bg/30 hover:border-ui-border hover:bg-ui-surface/70',
      plegado ? 'justify-center px-2' : '',
    ]"
    @click="$emit('click')">
    <span
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-corner text-xs font-semibold uppercase"
      :class="activo ? 'border-secondary bg-primary/20' : ''"
      aria-hidden="true">
      <img v-if="fuente" :src="fuente" alt="" class="h-8 w-8 object-contain">
      <span v-else>{{ etiqueta.charAt(0).toUpperCase() }}</span>
    </span>

    <span v-if="!plegado" class="min-w-0 flex-1 truncate font-medium">{{ etiqueta }}</span>

    <span
      v-if="!plegado && insignia !== ''"
      class="rounded-corner bg-ui-surface px-2 py-0.5 font-semibold text-tx-muted text-xs">
      {{ insignia }}
    </span>
  </button>
</template>
