<script lang="ts" setup>
/**
 * Una aplicación, en grande.
 *
 * Ícono de 56 píxeles, nombre, resumen en dos líneas y el botón de instalar a
 * la derecha. La tarjeta entera se levanta al pasar por encima: es la señal de
 * que se puede abrir, sin necesidad de un «ver más».
 *
 * El botón va **dentro** de la tarjeta y no en la ficha, que es el cambio de
 * fondo: instalar algo de la portada no debería pedir entrar a ningún lado.
 * Como la tarjeta también es clickeable, el botón corta la propagación.
 */
import { convertFileSrc } from '@tauri-apps/api/core';
import { computed } from 'vue';
import BotonInstalar from '@/components/tienda/BotonInstalar.vue';
import IconoDeApp from '@/components/tienda/IconoDeApp.vue';
import InsigniaDeOrigen from '@/components/tienda/InsigniaDeOrigen.vue';
import type { Tarjeta } from '@/tools/api';

const props = withDefaults(
	defineProps<{ app: Tarjeta; ocupado?: boolean; conCaptura?: boolean }>(),
	{ ocupado: false, conCaptura: false }
);
const emit = defineEmits<{ abrir: []; instalar: []; actualizar: [] }>();

const captura = computed(() =>
	props.conCaptura && props.app.captura ? convertFileSrc(props.app.captura) : ''
);
</script>

<template>
  <article
    class="group flex cursor-pointer flex-col overflow-hidden rounded-corner border border-ui-border bg-ui-surface/40 transition-all duration-200 hover:-translate-y-0.5 hover:border-ui-border-strong hover:bg-ui-surface hover:shadow-lg"
    tabindex="0"
    role="button"
    @click="emit('abrir')"
    @keydown.enter="emit('abrir')"
    @keydown.space.prevent="emit('abrir')">
    <!-- La portada. Cuando no hay captura queda el degradado solo, que es
         suficiente para que la fila destacada no se vea como una lista. -->
    <div
      v-if="conCaptura"
      class="relative h-32 w-full overflow-hidden bg-gradient-to-br from-primary/30 to-secondary/30">
      <img
        v-if="captura"
        :src="captura"
        alt=""
        loading="lazy"
        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105">
    </div>

    <div class="flex items-start gap-3 p-3">
      <IconoDeApp :icono="app.icono" :tamano="56" />
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <div class="flex items-center gap-2">
          <h3 class="truncate font-semibold text-sm">{{ app.titulo }}</h3>
          <InsigniaDeOrigen :origen="app.origen" :repositorio="app.repositorio" />
        </div>
        <p class="line-clamp-2 text-tx-muted text-xs leading-snug">{{ app.resumen }}</p>
      </div>
      <!-- Lo del AUR abre la ficha: el control de la receta vive ahí. -->
      <BotonInstalar
        :app="app"
        :ocupado="ocupado"
        @instalar="emit('instalar')"
        @actualizar="emit('actualizar')"
        @receta="emit('abrir')" />
    </div>
  </article>
</template>
