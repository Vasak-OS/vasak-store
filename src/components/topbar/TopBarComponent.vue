<script lang="ts" setup>
/**
 * La barra de la ventana.
 *
 * Tres zonas, y la del medio es la que tiene la gracia: el logo a la izquierda
 * ocupa lo que ocupa, los controles de ventana a la derecha también, y el
 * selector va centrado **en el espacio que queda**, no en la ventana. Por eso
 * la zona central es `flex-1` con el contenido centrado y no un `justify-between`
 * repartiendo: con eso el selector se corría a la izquierda, porque el logo y
 * los tres botones no miden lo mismo.
 */
import ActionControlsComponent from '@/components/topbar/ActionControlsComponent.vue';
</script>
<template>
  <div class="flex items-center gap-2 p-1 font-title" data-tauri-drag-region>
    <div class="flex shrink-0 items-center gap-2 px-1" data-tauri-drag-region>
      <slot name="logo" />
    </div>
    <div class="flex min-w-0 flex-1 items-center justify-center" data-tauri-drag-region>
      <slot />
    </div>
    <ActionControlsComponent />
  </div>
</template>
