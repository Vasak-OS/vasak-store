<script lang="ts" setup>
/**
 * Un programa en una lista.
 *
 * Es la `ListCard` de la librería en su forma que se aprieta: entra en el
 * recorrido del teclado como un botón y se activa con Enter o con espacio,
 * que es lo que alguien que no usa el ratón espera de algo que se abre al
 * tocarlo. Lo de adentro sigue siendo propio.
 *
 * Los datos de abajo van en una línea que se parte (`flex-wrap`), y el título
 * se corta con puntos: en una columna angosta nada se monta encima de nada.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { ListCard, ThemeIcon } from '@vasakgroup/vue-libvasak';
import { useRouter } from 'vue-router';
import AppIcon from '@/components/store/AppIcon.vue';
import OriginBadge from '@/components/store/OriginBadge.vue';
import type { Tarjeta } from '@/tools/api';
import { bytes } from '@/tools/formato';

const props = defineProps<{ app: Tarjeta }>();
const { t } = useI18n();
const router = useRouter();

function open() {
	router.push({
		name: 'detalle',
		params: { origen: props.app.origen, nombre: props.app.nombre },
	});
}
</script>
<template>
  <ListCard clickable custom-class="items-start! justify-start! text-left" @click="open">
    <AppIcon :icon="app.icono" :size="40" />
    <span class="flex min-w-0 flex-1 flex-col gap-1">
      <span class="flex min-w-0 flex-wrap items-center gap-2">
        <span class="min-w-0 truncate font-medium text-sm">{{ app.titulo }}</span>
        <OriginBadge :origin="app.origen" :repository="app.repositorio" />
      </span>
      <span class="line-clamp-2 text-tx-muted text-xs leading-snug">{{ app.resumen }}</span>
      <span class="flex flex-wrap items-center gap-2 text-tx-muted text-xs">
        <span v-if="app.version">{{ app.version }}</span>
        <span v-if="app.tamano > 0">{{ bytes(app.tamano) }}</span>
        <span v-if="app.votos !== undefined" class="inline-flex items-center gap-1" :title="t('detalle.votos')">
          <ThemeIcon name="starred-symbolic" type="symbol" :size="12" />
          {{ app.votos }}
        </span>
        <span v-if="app.instalada" class="text-status-success">{{ t('detalle.instalado') }}</span>
        <span v-if="app.actualizable" class="text-status-warning">
          {{ t('detalle.actualizar') }} → {{ app.actualizable }}
        </span>
      </span>
    </span>
  </ListCard>
</template>
