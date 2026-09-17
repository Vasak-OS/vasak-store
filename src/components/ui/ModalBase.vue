<script lang="ts" setup>
/**
 * Una ventana modal.
 *
 * Con Escape para cerrar y el foco puesto adentro al abrir: sin eso el Tab
 * sigue recorriendo lo que quedó atrás, que es invisible pero alcanzable, y el
 * teclado se pierde.
 */
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

const props = defineProps<{ abierto: boolean; titulo: string }>();
const emit = defineEmits<{ cerrar: [] }>();

const caja = ref<HTMLElement | null>(null);

function alTeclear(evento: KeyboardEvent) {
	if (evento.key === 'Escape' && props.abierto) {
		emit('cerrar');
	}
}

watch(
	() => props.abierto,
	async (abierto) => {
		if (abierto) {
			await nextTick();
			caja.value?.focus();
		}
	}
);

onMounted(() => document.addEventListener('keydown', alTeclear));
onUnmounted(() => document.removeEventListener('keydown', alTeclear));
</script>
<template>
  <div
    v-if="abierto"
    class="absolute inset-0 z-50 flex items-center justify-center bg-ui-border-dark/40 p-6"
    @click.self="emit('cerrar')">
    <div
      ref="caja"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      :aria-label="titulo"
      class="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-corner border border-ui-border bg-ui-bg shadow-lg">
      <header class="flex items-center justify-between border-ui-border border-b px-4 py-3">
        <h2 class="font-medium text-sm">{{ titulo }}</h2>
        <slot name="acciones" />
      </header>
      <div class="min-h-0 flex-1 overflow-auto p-4">
        <slot />
      </div>
      <footer v-if="$slots.pie" class="flex justify-end gap-2 border-ui-border border-t px-4 py-3">
        <slot name="pie" />
      </footer>
    </div>
  </div>
</template>
