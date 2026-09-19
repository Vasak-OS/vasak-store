<script lang="ts" setup>
/**
 * La ventana de la tienda.
 *
 * No dibuja nada propio: el borde, la esquina, el fondo, la barra y los tres
 * botones salen de `WindowFrame`, que es el mismo de todas las ventanas del
 * escritorio. Estaba copiado acá, y ya había derivado de las copias vecinas.
 *
 * De arriba viene además algo que esta copia no tenía: la barra puede ir
 * arriba, abajo, a la izquierda o a la derecha según `window.barPosition` en
 * `~/.config/vasak/vasak.conf`.
 *
 * # Por qué el selector no va en `centro`
 *
 * `centro` centra respecto de **la ventana entera**, que es lo que necesitan el
 * mes del calendario y la carpeta del correo. Acá el requisito es el otro: el
 * selector va centrado **en el espacio que queda** entre el logo y los botones.
 * Por eso vive en el contenido de la barra, dentro de un `flex-1` con el
 * contenido centrado, que es exactamente lo que hacía la barra propia.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { WindowFrame } from '@vasakgroup/vue-libvasak';
import LogoDeLaTienda from '@/components/barra/LogoDeLaTienda.vue';
import SelectorDeSeccion from '@/components/barra/SelectorDeSeccion.vue';
import { useTienda } from '@/stores/tienda';

const { t } = useI18n();
const tienda = useTienda();
</script>

<template>
  <WindowFrame
    :minimize-label="t('ventana.minimizar')"
    :maximize-label="t('ventana.maximizar')"
    :close-label="t('ventana.cerrar')">
    <template #identidad>
      <LogoDeLaTienda />
    </template>

    <template #barra>
      <div class="flex min-w-0 flex-1 items-center justify-center" data-tauri-drag-region>
        <SelectorDeSeccion :pendientes="tienda.pendientes" />
      </div>
    </template>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <slot />
    </div>
  </WindowFrame>
</template>
