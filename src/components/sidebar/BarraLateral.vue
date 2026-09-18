<script lang="ts" setup>
/**
 * La barra lateral de la tienda.
 *
 * Es la de Configuración: mismo `aside` con borde y esquina redondeada, mismo
 * plegado a 84 píxeles, mismos grupos con título. No es una copia por pereza —
 * es lo que hace que las dos ventanas se lean como partes del mismo escritorio.
 *
 * Lo propio de acá es que arriba de todo va la búsqueda, antes que cualquier
 * categoría: en una tienda, buscar es lo primero que alguien hace.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';

withDefaults(defineProps<{ titulo?: string; subtitulo?: string }>(), {
	titulo: '',
	subtitulo: '',
});

const plegadaAMano = ref(false);
const esAngosta = ref(false);
const plegada = ref(false);
let consulta: MediaQueryList | null = null;

function revisar() {
	esAngosta.value = consulta?.matches ?? false;
	plegada.value = esAngosta.value || plegadaAMano.value;
}

function alternar() {
	plegadaAMano.value = !plegadaAMano.value;
	revisar();
}

onMounted(() => {
	consulta = window.matchMedia('(max-width: 767px)');
	revisar();
	consulta.addEventListener('change', revisar);
});

onBeforeUnmount(() => consulta?.removeEventListener('change', revisar));

defineExpose({ plegada });
</script>

<template>
  <aside
    class="relative z-30 flex h-full shrink-0 flex-col rounded-corner border border-ui-border bg-ui-bg/80 transition-all duration-300"
    :class="['w-[84px]', plegada ? 'md:w-[84px]' : 'md:w-72']">
    <header class="flex flex-col gap-2 border-ui-border border-b p-2">
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="hidden h-10 w-10 items-center justify-center rounded-corner border border-ui-border bg-ui-surface/70 font-semibold text-sm md:inline-flex"
          :aria-label="titulo"
          @click="alternar">
          {{ plegada ? '&gt;' : '&lt;' }}
        </button>
        <div v-if="!plegada" class="min-w-0 flex-1">
          <p class="truncate font-semibold text-sm">{{ titulo }}</p>
          <p class="truncate text-tx-muted text-xs">{{ subtitulo }}</p>
        </div>
      </div>

      <!-- La búsqueda, arriba de todo. Con la barra plegada no entra un campo
           de texto, así que se esconde: el ancho de 84 píxeles es el del ícono
           y un campo ahí no se podría ni leer ni escribir. -->
      <div v-if="!plegada">
        <slot name="busqueda" />
      </div>
    </header>

    <div class="flex-1 space-y-3 overflow-y-auto p-2">
      <slot :plegada="plegada" />
    </div>
  </aside>
</template>
