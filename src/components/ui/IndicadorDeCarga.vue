<script lang="ts" setup>
/**
 * Que algo está en camino.
 *
 * La animación respeta `prefers-reduced-motion` por la regla global de
 * `main.css`, que la reduce a una iteración: quien pidió menos movimiento no ve
 * un círculo girando para siempre.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';

const { t } = useI18n();
</script>
<template>
  <div class="flex items-center justify-center gap-3 py-16 text-sm text-tx-muted" role="status">
    <span
      class="h-4 w-4 animate-spin rounded-full border-2 border-ui-border-strong border-t-primary" />
    {{ t('comun.cargando') }}
  </div>
</template>
