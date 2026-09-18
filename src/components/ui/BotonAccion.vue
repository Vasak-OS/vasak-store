<script lang="ts" setup>
/**
 * El botón de una acción.
 *
 * Tres tonos: el principal para lo que la pantalla propone, el suave para lo
 * secundario y el de peligro para lo que saca cosas. Deshabilitado cuando hay
 * una operación en curso, porque el demonio rechazaría la segunda de todos
 * modos y es mejor que el botón lo diga antes que un error después.
 */
withDefaults(
	defineProps<{
		tono?: 'principal' | 'suave' | 'peligro';
		deshabilitado?: boolean;
		titulo?: string;
	}>(),
	{ tono: 'suave', deshabilitado: false, titulo: undefined }
);
</script>
<template>
  <button
    type="button"
    :disabled="deshabilitado"
    :title="titulo"
    class="rounded-corner-sm border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
    :class="{
      'border-transparent bg-primary text-tx-on-primary hover:brightness-110': tono === 'principal',
      'border-ui-border-strong bg-ui-surface/60 hover:bg-ui-surface': tono === 'suave',
      'border-transparent bg-status-error text-tx-on-secondary hover:brightness-110': tono === 'peligro',
    }">
    <slot />
  </button>
</template>
