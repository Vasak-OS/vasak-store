<script lang="ts" setup>
/**
 * Lo que pasa mientras una operación corre.
 *
 * Una franja abajo con la fase y la barra, y el registro plegado. Plegado y no
 * escondido: el detalle de una instalación es lo que dice por qué falló, y
 * tenerlo a un clic evita que la única respuesta a «no anduvo» sea abrir una
 * terminal.
 *
 * La barra se pone indeterminada cuando no hay total —resolver dependencias no
 * tiene pasos contables—, porque una barra clavada en cero se lee como colgada.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, nextTick, ref, watch } from 'vue';
import BotonAccion from '@/components/ui/BotonAccion.vue';
import { useOperaciones } from '@/stores/operaciones';
import { useTienda } from '@/stores/tienda';
import { avance, bytes } from '@/tools/formato';

const { t } = useI18n();
const operaciones = useOperaciones();
const tienda = useTienda();

const desplegado = ref(false);
const consola = ref<HTMLElement | null>(null);

const visible = computed(
	() => operaciones.enCurso !== null || operaciones.error !== '' || operaciones.termino
);

const porcentaje = computed(() => avance(operaciones.hecho, operaciones.total));

/** En la descarga los números son bytes; en el resto, paquetes. */
const cuenta = computed(() => {
	if (!operaciones.total) {
		return '';
	}
	if (operaciones.fase === 'descargando') {
		return `${bytes(operaciones.hecho)} / ${bytes(operaciones.total)}`;
	}
	return `${operaciones.hecho} / ${operaciones.total}`;
});

// El registro se sigue solo mientras está desplegado: leer un registro que no
// avanza hasta que uno lo arrastra es peor que no verlo.
watch(
	() => operaciones.registro.length,
	async () => {
		if (!desplegado.value) {
			return;
		}
		await nextTick();
		consola.value?.scrollTo({ top: consola.value.scrollHeight });
	}
);

// Al terminar, la cuenta de actualizaciones de la barra cambió.
watch(
	() => operaciones.enCurso,
	(ahora, antes) => {
		if (antes && !ahora) {
			tienda.contar();
		}
	}
);
</script>
<template>
  <div
    v-if="visible"
    class="shrink-0 border-ui-border border-t bg-ui-surface/80 backdrop-blur"
    role="status"
    aria-live="polite">
    <div class="flex items-center gap-3 px-4 py-2">
      <span class="min-w-0 flex-1">
        <span class="flex items-center gap-2 text-sm">
          <span class="truncate font-medium">{{ operaciones.titulo }}</span>
          <span v-if="operaciones.fase" class="truncate text-tx-muted text-xs">
            {{ t(`fases.${operaciones.fase}`) }}
            <template v-if="operaciones.objetivo"> — {{ operaciones.objetivo }}</template>
          </span>
        </span>
        <span
          v-if="operaciones.enCurso"
          class="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-ui-bg">
          <span
            class="block h-full bg-primary transition-all"
            :class="porcentaje === null ? 'w-1/3 animate-pulse' : ''"
            :style="porcentaje === null ? undefined : { width: `${porcentaje * 100}%` }" />
        </span>
        <span v-if="cuenta" class="mt-0.5 block text-tx-muted text-xs">{{ cuenta }}</span>
      </span>

      <span v-if="operaciones.error" class="truncate text-sm text-status-error">
        {{ t('operacion.fallo') }}: {{ operaciones.error }}
      </span>
      <span v-else-if="operaciones.termino" class="text-sm text-status-success">
        {{ t('operacion.termino') }}
      </span>

      <BotonAccion @click="desplegado = !desplegado">
        {{ desplegado ? t('operacion.ocultarRegistro') : t('operacion.verRegistro') }}
      </BotonAccion>
      <BotonAccion v-if="!operaciones.enCurso" @click="operaciones.limpiar()">
        {{ t('comun.cerrar') }}
      </BotonAccion>
    </div>

    <pre
      v-if="desplegado"
      ref="consola"
      class="max-h-56 overflow-auto border-ui-border border-t bg-ui-bg px-4 py-2 font-mono text-xs leading-relaxed"
      :aria-label="t('operacion.registro')">{{ operaciones.registro.join('\n') }}</pre>
  </div>
</template>
