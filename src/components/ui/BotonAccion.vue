<script lang="ts" setup>
/**
 * El botón de una acción.
 *
 * Tres tonos: el principal para lo que la pantalla propone, el suave para lo
 * secundario y el de peligro para lo que saca cosas.
 *
 * El radio es `rounded-corner`, el mismo que las tarjetas y los elementos de la
 * barra lateral, y el mismo que sale de lo que la persona configuró en el
 * escritorio. Estaba en `rounded-corner-sm`, que es el de los chips y las
 * insignias: al lado de cualquier otra cosa de la ventana se notaba que no era
 * de la misma familia. Deshabilitado cuando hay
 * una operación en curso, porque el demonio rechazaría la segunda de todos
 * modos y es mejor que el botón lo diga antes que un error después.
 */
const emit = defineEmits<{
	/**
	 * El clic del botón.
	 *
	 * Se declara en vez de dejarlo caer sobre el `<button>` de adentro. Caía y
	 * funcionaba —es cómo se instala, se actualiza y se desinstala— pero no
	 * estaba escrito en ningún lado, y con `strictTemplates` pasa a ser un
	 * error. Declarado, Vue lo saca de los atributos: el `@click` de abajo no
	 * es opcional, sin él ninguno de los veinticuatro botones responde.
	 */
	click: [evento: MouseEvent];
}>();

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
    class="rounded-corner border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
    :class="{
      'border-transparent bg-primary text-tx-on-primary hover:brightness-110': tono === 'principal',
      'border-ui-border-strong bg-ui-surface/60 hover:bg-ui-surface': tono === 'suave',
      'border-transparent bg-status-error text-tx-on-secondary hover:brightness-110': tono === 'peligro',
    }"
    @click="emit('click', $event)">
    <slot />
  </button>
</template>
