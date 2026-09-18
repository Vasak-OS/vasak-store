<script lang="ts" setup>
/**
 * El botón de instalar de una tarjeta.
 *
 * En píldora y con el color de marca en claro, como el de una tienda: es la
 * acción que la tarjeta ofrece y tiene que verse antes que el resto del texto.
 *
 * Cinco estados, y los cinco dicen algo distinto:
 *
 * - no instalado → **Instalar**, en primer plano;
 * - hay versión nueva → **Actualizar**, con el color de aviso;
 * - instalado y al día → **Instalado**, apagado y sin acción, que informa sin
 *   ofrecer nada;
 * - **del AUR → «Ver la receta»**, que abre la ficha en vez de instalar;
 * - con una operación en curso → todos deshabilitados, porque el candado de
 *   pacman admite un solo dueño y el servicio rechazaría la segunda.
 *
 * # Por qué el AUR no tiene botón de instalar
 *
 * Porque instalar algo del AUR es compilar un guión que subió cualquiera, y la
 * política de la distribución pide tener el PKGBUILD delante antes. Ese control
 * vive en la ficha. Un botón «Instalar» acá lo saltearía —o, peor, fallaría con
 * «no hay ningún paquete llamado X», porque el servicio sólo instala de los
 * repositorios— y en los dos casos estaría ofreciendo algo que no hace.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed } from 'vue';
import type { Tarjeta } from '@/tools/api';

const props = defineProps<{ app: Tarjeta; ocupado: boolean }>();
const emit = defineEmits<{ instalar: []; actualizar: []; receta: [] }>();
const { t } = useI18n();

const estado = computed(() => {
	if (props.app.origen === 'aur') {
		return 'receta';
	}
	if (props.app.actualizable) {
		return 'actualizar';
	}
	return props.app.instalada ? 'instalada' : 'instalar';
});

function apretar() {
	if (estado.value === 'receta') {
		emit('receta');
		return;
	}
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
    :disabled="estado === 'instalada' || (ocupado && estado !== 'receta')"
    class="shrink-0 rounded-full px-4 py-1.5 font-semibold text-xs transition-all disabled:cursor-not-allowed disabled:opacity-60"
    :class="{
      'bg-primary/15 text-primary hover:bg-primary hover:text-tx-on-primary': estado === 'instalar',
      'bg-status-warning/20 text-status-warning hover:bg-status-warning hover:text-tx-on-primary':
        estado === 'actualizar',
      'bg-ui-surface text-tx-muted': estado === 'instalada',
      'bg-status-warning/15 text-status-warning hover:bg-status-warning hover:text-tx-on-primary':
        estado === 'receta',
    }"
    @click.stop="apretar"
    @keydown.enter.stop
    @keydown.space.stop>
    {{ t(`tarjeta.${estado}`) }}
  </button>
</template>
