<script lang="ts" setup>
/**
 * Las cuatro secciones.
 *
 * Es un `<nav>` con enlaces y no un grupo de pestañas, aunque se parezca a uno:
 * cada uno **cambia la ruta** y lo que hay debajo es una pantalla entera, no un
 * panel asociado. Anunciarlo como pestañas obliga a un lector de pantalla a
 * buscar un `tabpanel` que no existe y hace esperar el recorrido con flechas que
 * las pestañas de verdad tienen. La sección en la que se está va con
 * `aria-current="page"`, que es lo que corresponde a una navegación.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const { t } = useI18n();
const ruta = useRoute();

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
  <nav
    class="flex items-center gap-1 rounded-corner border border-ui-border bg-ui-surface/60 p-0.5"
    :aria-label="t('secciones.navegacion')">
    <RouterLink
      v-for="seccion in SECCIONES"
      :key="seccion"
      :to="{ name: seccion }"
      :aria-current="activa === seccion ? 'page' : undefined"
      class="flex items-center gap-1.5 rounded-corner-sm px-3 py-1 text-sm transition-colors"
      :class="activa === seccion
        ? 'bg-primary text-tx-on-primary'
        : 'hover:bg-ui-bg/60'">
      {{ t(`secciones.${seccion}`) }}
      <span
        v-if="seccion === 'actualizaciones' && pendientes > 0"
        class="rounded-corner-sm bg-status-warning px-1.5 text-tx-on-primary text-xs">
        {{ pendientes }}
      </span>
    </RouterLink>
  </nav>
</template>
