<script lang="ts" setup>
/**
 * El botón de instalar de una tarjeta.
 *
 * En píldora y con el color de marca en claro, como el de una tienda: es la
 * acción que la tarjeta ofrece y tiene que verse antes que el resto del texto.
 *
 * Cuatro estados, y los cuatro dicen algo distinto:
 *
 * - no instalado → **Instalar**, en primer plano;
 * - hay versión nueva → **Actualizar**, con el color de aviso;
 * - instalado y al día → **Instalado**, apagado y sin acción, que informa sin
 *   ofrecer nada;
 * - con una operación en curso → todos deshabilitados, porque el candado de
 *   pacman admite un solo dueño y el servicio rechazaría la segunda.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed } from 'vue';
import type { Tarjeta } from '@/tools/api';

const props = defineProps<{ app: Tarjeta; ocupado: boolean }>();
const emit = defineEmits<{ instalar: []; actualizar: [] }>();
const { t } = useI18n();

const estado = computed(() => {
	if (props.app.actualizable) {
		return 'actualizar';
	}
	return props.app.instalada ? 'instalada' : 'instalar';
});

function apretar() {
	if (estado.value === 'actualizar') {
		emit('actualizar');
		return;
	}
	if (estado.value === 'instalar') {
		emit('instalar');
	}
}
</script>

<template>
  <button
    type="button"
    :disabled="ocupado || estado === 'instalada'"
    class="shrink-0 rounded-full px-4 py-1.5 font-semibold text-xs transition-all disabled:cursor-not-allowed disabled:opacity-60"
    :class="{
      'bg-primary/15 text-primary hover:bg-primary hover:text-tx-on-primary': estado === 'instalar',
      'bg-status-warning/20 text-status-warning hover:bg-status-warning hover:text-tx-on-primary':
        estado === 'actualizar',
      'bg-ui-surface text-tx-muted': estado === 'instalada',
    }"
    @click.stop="apretar">
    {{ t(`tarjeta.${estado}`) }}
  </button>
</template>
