<script lang="ts" setup>
/**
 * Las capturas de una aplicación.
 *
 * Con flechas y no sólo arrastre: el arrastre lateral no existe con teclado, y
 * en un panel táctil hace falta un gesto que no todo el mundo tiene configurado.
 * Las imágenes vienen del disco —se bajaron antes— así que pasan por
 * `convertFileSrc`.
 */
import { convertFileSrc } from '@tauri-apps/api/core';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, ref } from 'vue';
import type { Captura } from '@/tools/api';

const props = defineProps<{ capturas: Captura[] }>();
const { t } = useI18n();

const actual = ref(0);
const captura = computed(() => props.capturas[actual.value]);

function mover(cuanto: number) {
	const cuantas = props.capturas.length;
	actual.value = (actual.value + cuanto + cuantas) % cuantas;
}
</script>
<template>
  <div v-if="capturas.length > 0" class="flex flex-col gap-2">
    <div class="relative overflow-hidden rounded-corner border border-ui-border bg-ui-surface/40">
      <img
        :src="convertFileSrc(captura.ruta)"
        :alt="captura.titulo"
        class="mx-auto max-h-80 w-auto object-contain">
      <template v-if="capturas.length > 1">
        <button
          type="button"
          class="-translate-y-1/2 absolute top-1/2 left-2 rounded-full border border-ui-border bg-ui-bg/90 px-2 py-1 text-sm"
          :aria-label="t('detalle.capturaAnterior')"
          @click="mover(-1)">
          ‹
        </button>
        <button
          type="button"
          class="-translate-y-1/2 absolute top-1/2 right-2 rounded-full border border-ui-border bg-ui-bg/90 px-2 py-1 text-sm"
          :aria-label="t('detalle.capturaSiguiente')"
          @click="mover(1)">
          ›
        </button>
      </template>
    </div>
    <p v-if="captura.titulo" class="text-center text-tx-muted text-xs">{{ captura.titulo }}</p>
  </div>
</template>
