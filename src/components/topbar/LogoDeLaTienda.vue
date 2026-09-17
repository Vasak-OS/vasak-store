<script lang="ts" setup>
/**
 * El logotipo: el ícono del tema y el nombre.
 *
 * El ícono sale del tema de íconos del escritorio y no de un SVG propio, para
 * que la tienda se vea como el resto de VasakOS cuando alguien cambia de tema.
 * `system-software-install` es el nombre estándar de freedesktop para esto, así
 * que existe en cualquier tema que se instale.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { useReactiveIcons } from '@/composables/useReactiveIcon';

const { t } = useI18n();
const { logo } = useReactiveIcons({ logo: { name: 'system-software-install', type: 'icon' } });
</script>
<template>
  <img v-if="logo" :src="logo" class="h-7 w-7" alt="" data-tauri-drag-region>
  <span class="select-none pr-1 font-semibold text-sm" data-tauri-drag-region>
    {{ t('app.nombre') }}
  </span>
</template>
