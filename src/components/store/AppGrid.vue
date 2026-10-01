<script lang="ts" setup>
/**
 * Una lista de programas.
 *
 * La rejilla se adapta sola con `auto-fill`: en una ventana angosta queda una
 * columna y en una ancha tres o cuatro, sin puntos de corte escritos a mano.
 */
import TarjetaDeApp from '@/components/tienda/TarjetaDeApp.vue';
import type { Tarjeta } from '@/tools/api';

defineProps<{ apps: Tarjeta[] }>();
</script>
<template>
  <div
    class="grid gap-3"
    style="grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr))">
    <TarjetaDeApp v-for="app in apps" :key="`${app.origen}:${app.nombre}`" :app="app" />
  </div>
</template>
