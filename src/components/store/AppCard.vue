<script lang="ts" setup>
/**
 * Un programa en una lista.
 *
 * Es un `<button>` entero y no un `<div>` con un `@click`: así entra en el
 * recorrido del teclado y se activa con Enter, que es lo que alguien que no usa
 * el ratón espera de algo que se abre al tocarlo.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { useRouter } from 'vue-router';
import IconoDeApp from '@/components/tienda/IconoDeApp.vue';
import InsigniaDeOrigen from '@/components/tienda/InsigniaDeOrigen.vue';
import type { Tarjeta } from '@/tools/api';
import { bytes } from '@/tools/formato';

const props = defineProps<{ app: Tarjeta }>();
const { t } = useI18n();
const router = useRouter();

function abrir() {
	router.push({
		name: 'detalle',
		params: { origen: props.app.origen, nombre: props.app.nombre },
	});
}
</script>
<template>
  <button
    type="button"
    class="flex w-full items-start gap-3 rounded-corner border border-ui-border bg-ui-surface/70 p-3 text-left transition-colors hover:bg-ui-surface"
    @click="abrir">
    <IconoDeApp :icono="app.icono" :tamano="40" />
    <span class="flex min-w-0 flex-1 flex-col gap-1">
      <span class="flex items-center gap-2">
        <span class="truncate font-medium text-sm">{{ app.titulo }}</span>
        <InsigniaDeOrigen :origen="app.origen" :repositorio="app.repositorio" />
      </span>
      <span class="line-clamp-2 text-tx-muted text-xs leading-snug">{{ app.resumen }}</span>
      <span class="flex flex-wrap items-center gap-2 text-tx-muted text-xs">
        <span v-if="app.version">{{ app.version }}</span>
        <span v-if="app.tamano > 0">{{ bytes(app.tamano) }}</span>
        <span v-if="app.votos !== undefined" :title="t('detalle.votos')">
          ★ {{ app.votos }}
        </span>
        <span v-if="app.instalada" class="text-status-success">{{ t('detalle.instalado') }}</span>
        <span v-if="app.actualizable" class="text-status-warning">
          {{ t('detalle.actualizar') }} → {{ app.actualizable }}
        </span>
      </span>
    </span>
  </button>
</template>
