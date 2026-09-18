<script setup lang="ts">
/**
 * Un campo de texto, con el aspecto que ya tienen los de VasakOS.
 *
 * Las clases son las mismas que las de `TextInput` de Configuración, y eso es
 * el punto: el buscador de la tienda tenía su propio borde, su propio relleno y
 * ningún anillo de foco, así que al lado de cualquier otra ventana del
 * escritorio se veía de otra aplicación. Un campo que no se parece al resto
 * obliga a mirarlo dos veces para reconocer qué es.
 */
import { computed } from 'vue';

const props = withDefaults(
	defineProps<{
		modelValue: string;
		type?: 'text' | 'search' | 'url';
		placeholder?: string;
		/** Dibuja el borde de peligro, para un valor que quien llama juzgó inválido. */
		invalid?: boolean;
		/** Para valores donde la alineación importa: rutas, órdenes, reglas. */
		mono?: boolean;
		required?: boolean;
		etiqueta?: string;
	}>(),
	{ type: 'text', invalid: false, mono: false, required: false }
);

const emit = defineEmits<{ 'update:modelValue': [valor: string] }>();

const clases = computed(() => [
	'w-full rounded-corner border bg-ui-surface/50 px-3 py-2 text-sm text-tx-main transition-colors',
	'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
	'disabled:cursor-not-allowed disabled:opacity-50',
	props.invalid ? 'border-status-error' : 'border-ui-border',
	props.mono ? 'font-mono' : '',
]);
</script>

<template>
  <input
    :type="type"
    :value="modelValue"
    :placeholder="placeholder"
    :required="required"
    :aria-label="etiqueta"
    :class="clases"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)">
</template>
