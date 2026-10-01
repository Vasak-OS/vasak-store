<script lang="ts" setup>
/**
 * De dónde sale un programa, a simple vista.
 *
 * La del AUR es la que importa: la distribución lo trata como inseguro, y una
 * insignia que se distinga sólo por un tono de gris no comunica eso. Va en
 * color de advertencia y con el texto explicándolo al pasar por encima.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import type { Origen } from '@/tools/api';

defineProps<{ origen: Origen; repositorio?: string }>();
const { t } = useI18n();
</script>
<template>
  <span
    class="shrink-0 rounded-corner-sm border px-1.5 py-0.5 text-xs"
    :title="t(`origen.${origen}Nota`)"
    :class="{
      'border-status-warning text-status-warning': origen === 'aur',
      'border-ui-border-strong text-tx-muted': origen === 'repositorio' || origen === 'local',
      'border-secondary text-secondary': origen === 'appimage',
    }">
    {{ origen === 'repositorio' && repositorio ? repositorio : t(`origen.${origen}`) }}
  </span>
</template>
