<script lang="ts" setup>
import LogoDeLaTienda from '@/components/topbar/LogoDeLaTienda.vue';
import SelectorDeSeccion from '@/components/topbar/SelectorDeSeccion.vue';
import TopBarComponent from '@/components/topbar/TopBarComponent.vue';
import { useTienda } from '@/stores/tienda';

const tienda = useTienda();
</script>
<template>
  <div
    class="flex h-screen w-screen flex-col overflow-hidden rounded-corner-window border border-ui-border bg-ui-bg/80">
    <TopBarComponent>
      <template #logo>
        <LogoDeLaTienda />
      </template>
      <SelectorDeSeccion :pendientes="tienda.pendientes" />
    </TopBarComponent>
    <div class="flex min-h-0 flex-1 flex-col">
      <slot />
    </div>
  </div>
</template>
