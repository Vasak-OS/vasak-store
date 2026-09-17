<script setup lang="ts">
/**
 * Los resultados de una búsqueda.
 *
 * Con el filtro por origen al lado del campo. El del AUR es un interruptor
 * aparte y no una opción más del filtro porque no filtra: **consulta otra
 * fuente**, que tarda y necesita red.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BarraDeBusqueda from '@/components/tienda/BarraDeBusqueda.vue';
import RejillaDeApps from '@/components/tienda/RejillaDeApps.vue';
import EstadoVacio from '@/components/ui/EstadoVacio.vue';
import IndicadorDeCarga from '@/components/ui/IndicadorDeCarga.vue';
import { buscar as buscarEnLaTienda, type Origen, type Tarjeta } from '@/tools/api';
import { claveSegunCantidad, interpolar } from '@/tools/interpolar';

const { t } = useI18n();
const ruta = useRoute();
const router = useRouter();

const texto = ref(String(ruta.query.q ?? ''));
const conAur = ref(false);
const cargando = ref(false);
const resultados = ref<Tarjeta[]>([]);
const filtro = ref<Origen | 'todos'>('todos');

const ORIGENES: (Origen | 'todos')[] = ['todos', 'repositorio', 'aur', 'appimage'];

const visibles = computed(() =>
	filtro.value === 'todos'
		? resultados.value
		: resultados.value.filter((app) => app.origen === filtro.value)
);

async function correr() {
	if (!texto.value.trim()) {
		resultados.value = [];
		return;
	}
	cargando.value = true;
	try {
		resultados.value = (await buscarEnLaTienda(texto.value, conAur.value)).resultados;
	} finally {
		cargando.value = false;
	}
}

function nuevaBusqueda(nuevo: string) {
	texto.value = nuevo;
	router.replace({ name: 'buscar', query: { q: nuevo } });
	correr();
}

watch(conAur, correr);
onMounted(correr);
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
    <BarraDeBusqueda
      :valor="texto"
      :aur="conAur"
      @buscar="nuevaBusqueda"
      @cambiar-aur="(valor) => (conAur = valor)" />

    <div class="flex flex-wrap items-center gap-2">
      <span class="text-tx-muted text-xs">{{ t('busqueda.filtroOrigen') }}</span>
      <button
        v-for="origen in ORIGENES"
        :key="origen"
        type="button"
        class="rounded-corner-sm border px-2 py-0.5 text-xs transition-colors"
        :class="filtro === origen
          ? 'border-transparent bg-primary text-tx-on-primary'
          : 'border-ui-border-strong hover:bg-ui-surface'"
        @click="filtro = origen">
        {{ origen === 'todos' ? t('busqueda.todos') : t(`origen.${origen}`) }}
      </button>
      <span v-if="visibles.length > 0" class="ml-auto text-tx-muted text-xs">
        {{ interpolar(t(`busqueda.${claveSegunCantidad('resultados', visibles.length)}`), visibles.length) }}
      </span>
    </div>

    <IndicadorDeCarga v-if="cargando" />
    <EstadoVacio
      v-else-if="visibles.length === 0"
      icono="system-search"
      :titulo="t('busqueda.sinResultados')"
      :nota="t('busqueda.sinResultadosNota')" />
    <RejillaDeApps v-else :apps="visibles" />
  </div>
</template>
