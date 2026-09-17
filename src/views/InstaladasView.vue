<script setup lang="ts">
/**
 * Lo que está instalado, y los AppImage.
 *
 * Los dos juntos porque son la misma pregunta —«qué tengo»— aunque sean dos
 * mecanismos distintos. Los AppImage van en su propio bloque, con lo que se
 * puede hacer con ellos: abrirlos, sacarlos, o sumar uno soltándolo acá.
 */

import type { UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { onMounted, onUnmounted, ref, watch } from 'vue';
import BarraDeBusqueda from '@/components/tienda/BarraDeBusqueda.vue';
import DialogoDePrevisualizacion from '@/components/tienda/DialogoDePrevisualizacion.vue';
import IconoDeApp from '@/components/tienda/IconoDeApp.vue';
import RejillaDeApps from '@/components/tienda/RejillaDeApps.vue';
import BotonAccion from '@/components/ui/BotonAccion.vue';
import EstadoVacio from '@/components/ui/EstadoVacio.vue';
import IndicadorDeCarga from '@/components/ui/IndicadorDeCarga.vue';
import InterruptorDeOpcion from '@/components/ui/InterruptorDeOpcion.vue';
import { useOperacion } from '@/composables/useOperacion';
import { useOperaciones } from '@/stores/operaciones';
import {
	type AppImage,
	ejecutarAppimage,
	integrarAppimage,
	appimages as pedirAppimages,
	instaladas as pedirInstaladas,
	quitarAppimage,
	type Tarjeta,
} from '@/tools/api';

const { t } = useI18n();
const operaciones = useOperaciones();
const operacion = useOperacion();

const filtro = ref('');
const lista = ref<Tarjeta[]>([]);
const portables = ref<AppImage[]>([]);
const cargando = ref(true);
const conHuerfanas = ref(true);
const soltando = ref(false);
let soltar: UnlistenFn | null = null;

async function cargar() {
	cargando.value = true;
	try {
		const [instaladas, appimages] = await Promise.all([
			pedirInstaladas(filtro.value),
			pedirAppimages(),
		]);
		lista.value = instaladas.resultados;
		portables.value = appimages;
	} finally {
		cargando.value = false;
	}
}

async function integrar(rutas: string[]) {
	for (const ruta of rutas) {
		try {
			await integrarAppimage(ruta);
		} catch (error) {
			operacion.falla.value = String(error);
		}
	}
	await cargar();
}

onMounted(async () => {
	await cargar();
	// Soltar un archivo en la ventana. Es un evento del WebView de Tauri y no el
	// `drop` del navegador: el WebView no recibe la ruta real del archivo, sólo
	// un objeto `File` sin ruta, y para copiarlo hace falta la ruta.
	soltar = await getCurrentWebview().onDragDropEvent(async (evento) => {
		if (evento.payload.type === 'over') {
			soltando.value = true;
			return;
		}
		if (evento.payload.type === 'drop') {
			soltando.value = false;
			await integrar(evento.payload.paths.filter((ruta) => /\.appimage$/i.test(ruta)));
			return;
		}
		soltando.value = false;
	});
});

onUnmounted(() => soltar?.());

watch(
	() => operaciones.enCurso,
	(ahora, antes) => {
		if (antes && !ahora) {
			cargar();
		}
	}
);
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="font-medium text-lg">{{ t('instaladas.titulo') }}</h1>
      <label class="ml-auto flex items-center gap-2 text-sm" :title="t('instaladas.conHuerfanas')">
        <InterruptorDeOpcion
          :valor="conHuerfanas"
          :etiqueta="t('instaladas.conHuerfanas')"
          @cambiar="(valor) => (conHuerfanas = valor)" />
        {{ t('instaladas.conHuerfanas') }}
      </label>
    </div>

    <BarraDeBusqueda
      :valor="filtro"
      :con-aur="false"
      :marcador="t('instaladas.filtro')"
      @buscar="(texto) => { filtro = texto; cargar(); }" />

    <p v-if="operacion.falla.value" class="text-sm text-status-error">{{ operacion.falla.value }}</p>

    <section
      class="flex flex-col gap-2 rounded-corner border border-dashed p-3 transition-colors"
      :class="soltando ? 'border-primary bg-primary/10' : 'border-ui-border-strong'">
      <h2 class="font-medium text-base">{{ t('instaladas.appimages') }}</h2>
      <p class="text-tx-muted text-xs leading-relaxed">{{ t('instaladas.appimagesNota') }}</p>

      <ul v-if="portables.length > 0" class="flex flex-col gap-2">
        <li
          v-for="portable in portables"
          :key="portable.id"
          class="flex items-center gap-3 rounded-corner border border-ui-border bg-ui-surface/40 p-2">
          <IconoDeApp :icono="{ tipo: 'tema', valor: 'application-x-executable' }" :tamano="28" />
          <span class="min-w-0 flex-1 truncate text-sm">{{ portable.titulo }}</span>
          <BotonAccion @click="ejecutarAppimage(portable.id)">
            {{ t('instaladas.ejecutar') }}
          </BotonAccion>
          <BotonAccion tono="peligro" @click="quitarAppimage(portable.id).then(cargar)">
            {{ t('instaladas.quitarAppimage') }}
          </BotonAccion>
        </li>
      </ul>
      <p v-else class="text-sm text-tx-muted">
        {{ t('instaladas.sinAppimages') }} — {{ t('instaladas.soltarAqui') }}
      </p>
    </section>

    <IndicadorDeCarga v-if="cargando" />
    <EstadoVacio v-else-if="lista.length === 0" :titulo="t('instaladas.vacio')" />
    <RejillaDeApps v-else :apps="lista" />

    <DialogoDePrevisualizacion
      :abierto="operacion.abierto.value"
      :informe="operacion.informe.value"
      :titulo="t('operacion.previsualizacion')"
      @cerrar="operacion.cancelar"
      @confirmar="operacion.confirmar" />
  </div>
</template>
