<script lang="ts" setup>
/**
 * Un interruptor de encendido y apagado.
 *
 * Es un `<button>` con `role="switch"` y no una casilla estilizada: así el
 * teclado lo alcanza con Tab, la barra espaciadora lo cambia y un lector de
 * pantalla dice «activado» o «desactivado» en vez de leer un `<div>` sin
 * significado.
 */
defineProps<{ valor: boolean; deshabilitado?: boolean; etiqueta: string }>();
const emit = defineEmits<{ cambiar: [valor: boolean] }>();
</script>
<template>
  <button
    type="button"
    role="switch"
    :aria-checked="valor"
    :aria-label="etiqueta"
    :disabled="deshabilitado"
    class="relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50"
    :class="valor ? 'border-transparent bg-primary' : 'border-ui-border-strong bg-ui-surface'"
    @click="emit('cambiar', !valor)">
    <span
      class="absolute top-0.5 h-4 w-4 rounded-full bg-ui-bg transition-all"
      :class="valor ? 'left-6' : 'left-1'" />
  </button>
</template>
