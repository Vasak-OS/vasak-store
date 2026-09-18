<script lang="ts" setup>
/**
 * Un grupo de la barra lateral, con su título plegable.
 */
import { ref, watch } from 'vue';

const props = withDefaults(defineProps<{ titulo: string; plegado?: boolean }>(), {
	plegado: false,
});

const abierto = ref(true);

// Con la barra plegada no hay título que tocar, así que el grupo se abre: si
// no, sus elementos quedarían escondidos sin manera de mostrarlos.
watch(
	() => props.plegado,
	(valor) => {
		if (valor) {
			abierto.value = true;
		}
	}
);
</script>

<template>
  <section class="flex flex-col gap-2">
    <button
      v-if="!plegado"
      type="button"
      class="flex w-full items-center justify-between rounded-corner px-2 py-1 text-tx-muted text-xs uppercase tracking-[0.08em] hover:bg-ui-surface/60"
      :aria-expanded="abierto"
      @click="abierto = !abierto">
      <span>{{ titulo }}</span>
      <span class="text-[10px] transition-transform duration-200" :class="abierto ? 'rotate-180' : ''">
        v
      </span>
    </button>

    <div v-if="abierto" class="flex flex-col gap-1">
      <slot />
    </div>
  </section>
</template>
