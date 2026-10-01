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
import { ThemeIcon } from '@vasakgroup/vue-libvasak';

const { t } = useI18n();

/**
 * El atributo que deja arrastrar la ventana desde el logotipo.
 *
 * Va por `v-bind` y no escrito al lado de las demás propiedades porque
 * `strictTemplates` pasa los atributos de un **componente** a camelCase antes de
 * comprobarlos: `data-tauri-drag-region` llega al chequeo como
 * `dataTauriDragRegion`, que no coincide con el patrón `data-${string}` que
 * `tipos-de-plantilla.d.ts` declara. En un elemento normal no pasa.
 *
 * Al dibujar sí llega tal cual al `img` —`ThemeIcon` tiene una sola raíz y
 * reenvía lo que no declara—, y hay una prueba que lo comprueba, porque sin ese
 * atributo la ventana pierde zona de agarre sin que nada falle.
 */
const ARRASTRE = { 'data-tauri-drag-region': '' } as const;
</script>
<template>
  <!-- A color y no el glifo monocromo: es la identidad de la ventana, como en
       el resto del escritorio. `icon` es lo que `ThemeIcon` trae por omisión,
       pero va escrito porque es una decisión y no un descuido. -->
  <ThemeIcon
    name="system-software-install"
    type="icon"
    :size="28"
    :alt="t('app.nombre')"
    v-bind="ARRASTRE" />
</template>
