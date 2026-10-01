<script lang="ts" setup>
/**
 * Una aplicación, en grande.
 *
 * Ícono de 56 píxeles, nombre, resumen en dos líneas y el botón de instalar a
 * la derecha. Es la `ListCard` de la librería que se aprieta: al pasar por
 * encima toma el velo de estado de todas las superficies del taller, que es la
 * señal de que se puede abrir, sin necesidad de un «ver más». Antes se
 * levantaba y la portada se agrandaba (`-translate-y`, `scale-105`); la forma
 * de Once UI no mueve lo que se toca.
 *
 * En una columna angosta el texto no se aplasta: tiene un ancho mínimo, y si
 * con el botón no entra, el botón baja a la línea siguiente.
 *
 * El botón va **dentro** de la tarjeta y no en la ficha, que es el cambio de
 * fondo: instalar algo de la portada no debería pedir entrar a ningún lado.
 * Como la tarjeta también es clickeable, el botón corta la propagación.
 */
import { convertFileSrc } from '@tauri-apps/api/core';
import { ListCard } from '@vasakgroup/vue-libvasak';
import { computed } from 'vue';
import InstallButton from '@/components/store/InstallButton.vue';
import AppIcon from '@/components/store/AppIcon.vue';
import OriginBadge from '@/components/store/OriginBadge.vue';
import type { Tarjeta } from '@/tools/api';

const props = withDefaults(
	defineProps<{ app: Tarjeta; busy?: boolean; withScreenshot?: boolean; queued?: boolean }>(),
	{ busy: false, withScreenshot: false, queued: false }
);
const emit = defineEmits<{ open: []; install: []; update: [] }>();

const screenshot = computed(() =>
	props.withScreenshot && props.app.captura ? convertFileSrc(props.app.captura) : ''
);
</script>

<template>
  <ListCard
    clickable
    custom-class="flex-col! items-stretch! justify-start! gap-0! overflow-hidden p-0!"
    @click="emit('open')">
    <!-- La portada. Cuando no hay captura queda el degradado solo, que es
         suficiente para que la fila destacada no se vea como una lista. -->
    <div
      v-if="withScreenshot"
      class="relative h-32 w-full overflow-hidden bg-linear-to-br from-primary/30 to-secondary/30">
      <img
        v-if="screenshot"
        :src="screenshot"
        alt=""
        loading="lazy"
        class="h-full w-full object-cover">
    </div>

    <div class="flex flex-wrap items-start gap-3 p-3">
      <AppIcon :icon="app.icono" :size="56" />
      <div class="flex min-w-32 flex-1 flex-col gap-1">
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <h3 class="min-w-0 truncate font-semibold text-sm">{{ app.titulo }}</h3>
          <OriginBadge :origin="app.origen" :repository="app.repositorio" />
        </div>
        <p class="line-clamp-2 text-tx-muted text-xs leading-snug">{{ app.resumen }}</p>
      </div>
      <!-- Lo del AUR abre la ficha: el control de la receta vive ahí. -->
      <InstallButton
        :app="app"
        :busy="busy"
        :queued="queued"
        class="ms-auto"
        @install="emit('install')"
        @update="emit('update')"
        @recipe="emit('open')" />
    </div>
  </ListCard>
</template>
