<script lang="ts" setup>
/**
 * Las cuatro secciones.
 *
 * Es un grupo de botones y no una lista de enlaces sueltos porque son
 * excluyentes: en cualquier momento se está en una y sólo una. Va con
 * `role="tablist"` para que un lector de pantalla lo anuncie así y no como
 * cuatro botones sin relación, y el que está activo lleva `aria-selected`.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const { t } = useI18n();
const ruta = useRoute();
const router = useRouter();

const SECCIONES = ['descubrir', 'instaladas', 'actualizaciones', 'repositorios'] as const;

/**
 * Qué sección se ve como activa.
 *
 * Las pantallas que cuelgan de una sección la mantienen encendida: mirando la
 * ficha de un programa que se llegó desde Descubrir, el selector sigue en
 * Descubrir en vez de apagarse entero.
 */
const activa = computed(() => {
	const nombre = String(ruta.name ?? '');
	if (SECCIONES.includes(nombre as (typeof SECCIONES)[number])) {
		return nombre;
	}
	if (nombre === 'categoria' || nombre === 'detalle' || nombre === 'buscar') {
		return 'descubrir';
	}
	return '';
});

/** Cuántas actualizaciones hay, para la insignia. */
const props = defineProps<{ pendientes?: number }>();
const pendientes = computed(() => props.pendientes ?? 0);
</script>
<template>
  <div
    class="flex items-center gap-1 rounded-corner border border-ui-border bg-ui-surface/60 p-0.5"
    role="tablist"
    :aria-label="t('secciones.descubrir')">
    <button
      v-for="seccion in SECCIONES"
      :key="seccion"
      type="button"
      role="tab"
      :aria-selected="activa === seccion"
      class="flex items-center gap-1.5 rounded-corner-sm px-3 py-1 text-sm transition-colors"
      :class="activa === seccion
        ? 'bg-primary text-tx-on-primary'
        : 'hover:bg-ui-bg/60'"
      @click="router.push({ name: seccion })">
      {{ t(`secciones.${seccion}`) }}
      <span
        v-if="seccion === 'actualizaciones' && pendientes > 0"
        class="rounded-corner-sm bg-status-warning px-1.5 text-tx-on-primary text-xs">
        {{ pendientes }}
      </span>
    </button>
  </div>
</template>
