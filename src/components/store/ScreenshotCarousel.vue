<script lang="ts" setup>
/**
 * Las capturas de una aplicación, todas a la vez.
 *
 * Una strip que se desplaza en horizontal, con las miniaturas en su tamaño real
 * y ancladas —cada una se detiene alineada al borde—. Antes se veía **una
 * sola** y había que apretar una flecha para saber que existían más; mostrando
 * la tira, que hay cuatro capturas se ve de entrada, que es la mitad de para
 * qué están.
 *
 * Al hacer clic, la captura se abre en grande. Es lo que uno espera de una
 * imagen chica que muestra una pantalla llena de detalles.
 *
 * Las flechas se quedan para el teclado y para los paneles táctiles donde el
 * desplazamiento horizontal no está configurado, y aparecen sólo cuando hay
 * algo hacia donde ir.
 *
 * El riel es propio —es una pieza única en el taller (§5 del inventario de
 * vue-libvasak#74)—, pero sus botones no: las flechas son `ActionButton` sobre
 * el medio (`overlay`) con `go-previous`/`go-next` del tema, en lugar de «‹ ›»
 * escritos, y la miniatura ya no se levanta al pasar por encima.
 *
 * Una miniatura nunca es más ancha que la tira: en una ventana angosta se
 * achica en vez de salirse por el costado.
 */
import { convertFileSrc } from '@tauri-apps/api/core';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { ActionButton } from '@vasakgroup/vue-libvasak';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import AppDialog from '@/components/ui/AppDialog.vue';
import type { Captura } from '@/tools/api';

const props = defineProps<{ screenshots: Captura[] }>();
const { t } = useI18n();

const strip = ref<HTMLElement | null>(null);
const canGoLeft = ref(false);
const canGoRight = ref(false);
const enlarged = ref<Captura | null>(null);

const sources = computed(() =>
	props.screenshots.map((shot) => ({ ...shot, src: convertFileSrc(shot.ruta) }))
);

function check() {
	const box = strip.value;
	if (!box) {
		return;
	}
	canGoLeft.value = box.scrollLeft > 4;
	// El margen de cuatro píxeles evita que el redondeo del navegador deje la
	// flecha encendida para siempre al final de la tira.
	canGoRight.value = box.scrollLeft + box.clientWidth < box.scrollWidth - 4;
}

function move(direction: number) {
	const box = strip.value;
	if (!box) {
		return;
	}
	box.scrollBy({ left: direction * box.clientWidth * 0.8, behavior: 'smooth' });
}

// Las flechas dependen de cuánto mide la tira, y eso cambia después de montar:
// las imágenes van con `loading="lazy"` y ocupan su lugar recién al cargar, y
// la ventana se puede redimensionar. Mirando sólo al montar, la flecha derecha
// se quedaba escondida sobre una tira que sí se podía desplazar.
let observer: ResizeObserver | null = null;

onMounted(() => {
	check();
	if (typeof ResizeObserver === 'undefined' || !strip.value) {
		return;
	}
	observer = new ResizeObserver(check);
	observer.observe(strip.value);
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div v-if="sources.length > 0" class="relative">
    <div
      ref="strip"
      class="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
      @scroll="check">
      <figure
        v-for="shot in sources"
        :key="shot.ruta"
        class="flex max-w-[min(36rem,100%)] shrink-0 snap-start flex-col gap-1">
        <button
          type="button"
          class="overflow-hidden rounded-corner-l border border-ui-line bg-ui-surface/70 transition-colors duration-200 ease-ui hover:border-ui-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-focus"
          :aria-label="shot.titulo || t('detalle.capturas')"
          @click="enlarged = shot">
          <img
            :src="shot.src"
            :alt="shot.titulo"
            loading="lazy"
            class="h-56 w-auto max-w-full object-cover"
            @load="check">
        </button>
        <figcaption v-if="shot.titulo" class="truncate text-tx-muted text-xs">
          {{ shot.titulo }}
        </figcaption>
      </figure>
    </div>

    <ActionButton
      v-if="canGoLeft"
      label=""
      variant="overlay"
      icon="go-previous-symbolic"
      :icon-alt="t('detalle.capturaAnterior')"
      :title="t('detalle.capturaAnterior')"
      class="-translate-y-1/2 absolute top-1/2 left-1"
      @click="move(-1)" />
    <ActionButton
      v-if="canGoRight"
      label=""
      variant="overlay"
      icon="go-next-symbolic"
      :icon-alt="t('detalle.capturaSiguiente')"
      :title="t('detalle.capturaSiguiente')"
      class="-translate-y-1/2 absolute top-1/2 right-1"
      @click="move(1)" />

    <AppDialog
      :open="enlarged !== null"
      :title="enlarged?.titulo || t('detalle.capturas')"
      @close="enlarged = null">
      <img
        v-if="enlarged"
        :src="convertFileSrc(enlarged.ruta)"
        :alt="enlarged.titulo"
        class="mx-auto max-h-[70vh] w-auto rounded-corner-m">
    </AppDialog>
  </div>
</template>
