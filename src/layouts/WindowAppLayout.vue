<script lang="ts" setup>
/**
 * La ventana de la tienda.
 *
 * No dibuja nada propio: el borde, la esquina, el fondo, la barra y los tres
 * botones salen de `WindowFrame`, que es el mismo de todas las ventanas del
 * escritorio. Estaba copiado acá, y ya había derivado de las copias vecinas.
 *
 * Tampoco les pasa las etiquetas a los tres botones: los controles las
 * resuelven solos contra `ventana.minimizar`, `ventana.maximizar` y
 * `ventana.cerrar` del catálogo de esta aplicación, que son justo las tres que
 * esto les estaba pasando.
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
 *
 * # Por qué el envoltorio arrastra con `deep`
 *
 * Tauri arrastra cuando el elemento que recibió el `mousedown` **es** el que
 * tiene `data-tauri-drag-region` pelado; un hijo sin el atributo no cuenta. El
 * selector ocupa todo el ancho del envoltorio con una caja propia, así que con
 * el atributo pelado cada clic caía en esa caja y la barra quedaba sin agarre
 * salvo el logo y los bordes (0.9.0). Con `deep` arrastra desde cualquier
 * lugar de adentro, y los controles —los enlaces de las secciones, el botón
 * del menú— lo siguen cortando solos, porque el guion de Tauri no arrastra
 * desde un `a` o un `button` sin el atributo. Pide tauri 2.11 o más nueva,
 * que es la que entiende el valor: `tests/top-bar-drag.test.ts` lo ata.
 */
import { WindowFrame } from '@vasakgroup/vue-libvasak';
import SectionSwitcher from '@/components/bar/SectionSwitcher.vue';
import StoreLogo from '@/components/bar/StoreLogo.vue';
import { useTienda } from '@/stores/tienda';

const tienda = useTienda();
</script>

<template>
  <WindowFrame>
    <template #identidad>
      <StoreLogo />
    </template>

    <template #barra>
      <div class="flex min-w-0 flex-1 items-center justify-center" data-tauri-drag-region="deep">
        <SectionSwitcher :pending="tienda.pendientes" />
      </div>
    </template>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <slot />
    </div>
  </WindowFrame>
</template>
