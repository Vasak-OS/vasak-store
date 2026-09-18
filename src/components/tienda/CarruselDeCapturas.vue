<script lang="ts" setup>
/**
 * Las capturas de una aplicación, todas a la vez.
 *
 * Una tira que se desplaza en horizontal, con las miniaturas en su tamaño real
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
 */
import { convertFileSrc } from '@tauri-apps/api/core';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import ModalBase from '@/components/ui/ModalBase.vue';
import type { Captura } from '@/tools/api';

const props = defineProps<{ capturas: Captura[] }>();
const { t } = useI18n();

const tira = ref<HTMLElement | null>(null);
const puedeIzquierda = ref(false);
const puedeDerecha = ref(false);
const ampliada = ref<Captura | null>(null);

const fuentes = computed(() =>
	props.capturas.map((captura) => ({ ...captura, src: convertFileSrc(captura.ruta) }))
);

function revisar() {
	const caja = tira.value;
	if (!caja) {
		return;
	}
	puedeIzquierda.value = caja.scrollLeft > 4;
	// El margen de cuatro píxeles evita que el redondeo del navegador deje la
	// flecha encendida para siempre al final de la tira.
	puedeDerecha.value = caja.scrollLeft + caja.clientWidth < caja.scrollWidth - 4;
}

function mover(hacia: number) {
	const caja = tira.value;
	if (!caja) {
		return;
	}
	caja.scrollBy({ left: hacia * caja.clientWidth * 0.8, behavior: 'smooth' });
}

// Las flechas dependen de cuánto mide la tira, y eso cambia después de montar:
// las imágenes van con `loading="lazy"` y ocupan su lugar recién al cargar, y
// la ventana se puede redimensionar. Mirando sólo al montar, la flecha derecha
// se quedaba escondida sobre una tira que sí se podía desplazar.
let observador: ResizeObserver | null = null;

onMounted(() => {
	revisar();
	if (typeof ResizeObserver === 'undefined' || !tira.value) {
		return;
	}
	observador = new ResizeObserver(revisar);
	observador.observe(tira.value);
});

onBeforeUnmount(() => observador?.disconnect());
</script>

<template>
  <div v-if="fuentes.length > 0" class="relative">
    <div
      ref="tira"
      class="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
      @scroll="revisar">
      <figure
        v-for="captura in fuentes"
        :key="captura.ruta"
        class="flex shrink-0 snap-start flex-col gap-1">
        <button
          type="button"
          class="overflow-hidden rounded-corner border border-ui-border bg-ui-surface/40 transition-transform hover:-translate-y-0.5 hover:shadow-lg"
          :aria-label="captura.titulo || t('detalle.capturas')"
          @click="ampliada = captura">
          <img
            :src="captura.src"
            :alt="captura.titulo"
            loading="lazy"
            class="h-56 w-auto max-w-[36rem] object-cover"
            @load="revisar">
        </button>
        <figcaption v-if="captura.titulo" class="max-w-[36rem] truncate text-tx-muted text-xs">
          {{ captura.titulo }}
        </figcaption>
      </figure>
    </div>

    <button
      v-if="puedeIzquierda"
      type="button"
      class="-translate-y-1/2 absolute top-1/2 left-1 rounded-full border border-ui-border bg-ui-bg/90 px-2 py-1 text-sm shadow-sm"
      :aria-label="t('detalle.capturaAnterior')"
      @click="mover(-1)">
      ‹
    </button>
    <button
      v-if="puedeDerecha"
      type="button"
      class="-translate-y-1/2 absolute top-1/2 right-1 rounded-full border border-ui-border bg-ui-bg/90 px-2 py-1 text-sm shadow-sm"
      :aria-label="t('detalle.capturaSiguiente')"
      @click="mover(1)">
      ›
    </button>

    <ModalBase
      :abierto="ampliada !== null"
      :titulo="ampliada?.titulo || t('detalle.capturas')"
      @cerrar="ampliada = null">
      <img
        v-if="ampliada"
        :src="convertFileSrc(ampliada.ruta)"
        :alt="ampliada.titulo"
        class="mx-auto max-h-[70vh] w-auto rounded-corner">
    </ModalBase>
  </div>
</template>
