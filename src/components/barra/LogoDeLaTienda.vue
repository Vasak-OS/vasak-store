<script lang="ts" setup>
/**
 * El logotipo de la ventana: el ícono, y nada más.
 *
 * El ícono sale del tema de íconos del escritorio y no de un SVG propio, para
 * que la tienda se vea como el resto de VasakOS cuando alguien cambia de tema.
 * `system-software-install` es el nombre estándar de freedesktop para esto, así
 * que existe en cualquier tema que se instale.
 *
 * El nombre escrito al lado se fue: la ventana ya se identifica por el ícono,
 * por el título que pone el gestor de ventanas y por la entrada del menú de
 * aplicaciones, y repetirlo en la barra le comía espacio al selector de
 * secciones, que es lo único que ahí hace falta.
 *
 * Pero se fue **de la vista**, no del todo: el `alt` lo conserva. Un ícono con
 * `alt` vacío es decoración, y un lector de pantalla no diría en qué aplicación
 * está parado.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { useReactiveIcons } from '@/composables/useReactiveIcon';

const { t } = useI18n();
const { logo } = useReactiveIcons({ logo: { name: 'system-software-install', type: 'icon' } });
</script>
<template>
  <img
    v-if="logo"
    :src="logo"
    class="h-7 w-7"
    :alt="t('app.nombre')"
    data-tauri-drag-region>
</template>
