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
 * Es la `ProgressBar` de la librería, y el registro, su `CodeBlock` de
 * registro, que se sigue solo mientras quien lo lee esté al final.
 *
 * La franja es translúcida y sin `backdrop-blur`: la ventana deja ver el
 * escritorio y el desenfoque lo pone Wayfire, así que opaca lo anulaba. Va en
 * `bg-ui-surface/70`, el mismo material que el resto de lo que se apoya en la
 * ventana (memorias `superficies-translucidas-blur-de-wayfire` y
 * `tokens-de-fondo`).
 *
 * En una ventana angosta la fila se parte: el texto conserva un ancho mínimo y
 * los botones bajan a la línea siguiente en vez de comerse el título.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { ActionButton, CodeBlock, ProgressBar } from '@vasakgroup/vue-libvasak';
import { computed, ref, watch } from 'vue';
import { useOperaciones } from '@/stores/operaciones';
import { useTienda } from '@/stores/tienda';
import { avance, bytes } from '@/tools/formato';

const { t } = useI18n();
const operaciones = useOperaciones();
const tienda = useTienda();

const expanded = ref(false);

const visible = computed(
	() => operaciones.enCurso !== null || operaciones.error !== '' || operaciones.termino
);

/** El avance en porcentaje, o nada cuando no se puede contar. */
const percent = computed(() => {
	const fraction = avance(operaciones.hecho, operaciones.total);
	return fraction === null ? null : fraction * 100;
});

/** En la descarga los números son bytes; en el resto, paquetes. */
const count = computed(() => {
	if (!operaciones.total) {
		return '';
	}
	if (operaciones.fase === 'descargando') {
		return `${bytes(operaciones.hecho)} / ${bytes(operaciones.total)}`;
	}
	return `${operaciones.hecho} / ${operaciones.total}`;
});

const log = computed(() => operaciones.registro.join('\n'));

// Al terminar, la cuenta de actualizaciones de la barra cambió.
watch(
	() => operaciones.enCurso,
	(now, before) => {
		if (before && !now) {
			tienda.contar();
		}
	}
);
</script>
<template>
  <div
    v-if="visible"
    class="shrink-0 border-ui-border border-t bg-ui-surface/70"
    role="status"
    aria-live="polite">
    <div class="flex flex-wrap items-center gap-3 px-4 py-2">
      <span class="min-w-40 flex-1">
        <span class="flex min-w-0 flex-wrap items-center gap-x-2 text-sm">
          <span class="min-w-0 truncate font-medium">{{ operaciones.titulo }}</span>
          <span v-if="operaciones.fase" class="min-w-0 truncate text-tx-muted text-xs">
            {{ t(`fases.${operaciones.fase}`) }}
            <template v-if="operaciones.objetivo"> — {{ operaciones.objetivo }}</template>
          </span>
        </span>
        <ProgressBar
          v-if="operaciones.enCurso"
          class="mt-1"
          size="sm"
          :value="percent"
          :label="operaciones.titulo" />
        <span v-if="count" class="mt-0.5 block text-tx-muted text-xs">{{ count }}</span>
      </span>

      <span v-if="operaciones.error" class="min-w-0 break-words text-sm text-status-error">
        {{ t('operacion.fallo') }}: {{ operaciones.error }}
      </span>
      <span v-else-if="operaciones.termino" class="text-sm text-status-success">
        {{ t('operacion.termino') }}
      </span>

      <span class="flex flex-wrap items-center gap-2">
        <ActionButton
          variant="secondary"
          :label="expanded ? t('operacion.ocultarRegistro') : t('operacion.verRegistro')"
          :pressed="expanded"
          @click="expanded = !expanded" />
        <ActionButton
          v-if="!operaciones.enCurso"
          variant="secondary"
          :label="t('comun.cerrar')"
          @click="operaciones.limpiar()" />
      </span>
    </div>

    <div v-if="expanded" class="border-ui-border border-t px-4 py-2">
      <CodeBlock
        variant="log"
        :text="log"
        :max-height="224"
        follow
        :label="t('operacion.registro')" />
    </div>
  </div>
</template>
