<script setup lang="ts">
/**
 * Lo que hay en una categoría.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import RejillaDeApps from '@/components/tienda/RejillaDeApps.vue';
import EstadoVacio from '@/components/ui/EstadoVacio.vue';
import IndicadorDeCarga from '@/components/ui/IndicadorDeCarga.vue';
import { deCategoria, type Tarjeta } from '@/tools/api';

const { t } = useI18n();
const ruta = useRoute();

const apps = ref<Tarjeta[]>([]);
const cargando = ref(true);

async function cargar() {
	cargando.value = true;
	try {
		apps.value = (await deCategoria(String(ruta.params.id), 200)).resultados;
	} finally {
		cargando.value = false;
	}
}

onMounted(cargar);
watch(() => ruta.params.id, cargar);
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
    <h1 class="font-medium text-lg">{{ t(`categorias.${ruta.params.id}`) }}</h1>
    <IndicadorDeCarga v-if="cargando" />
    <EstadoVacio v-else-if="apps.length === 0" :titulo="t('busqueda.sinResultados')" />
    <RejillaDeApps v-else :apps="apps" />
  </div>
</template>
