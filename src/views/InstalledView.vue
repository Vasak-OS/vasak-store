<script setup lang="ts">
/**
 * Lo que está instalado, y los AppImage.
 *
 * Los dos juntos porque son la misma pregunta —«qué tengo»— aunque sean dos
 * mecanismos distintos. Los AppImage van en su propio bloque, con lo que se
 * puede hacer con ellos: abrirlos, sacarlos, o sumar uno soltándolo acá.
 *
 * El bloque de los AppImage es además la zona donde se sueltan: mientras se
 * arrastra un archivo encima, la librería pone su `DropZone` sobre el bloque,
 * con el velo y el aviso de «soltá acá». El contorno punteado de siempre se
 * queda, porque es lo que dice que ahí se puede soltar antes de arrastrar.
 */

import type { UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	ActionButton,
	DropZone,
	EmptyState,
	ListCard,
	LoadingState,
	PageHeader,
	SearchField,
	SwitchToggle,
} from '@vasakgroup/vue-libvasak';
import { onMounted, onUnmounted, ref, watch } from 'vue';
import AppGrid from '@/components/store/AppGrid.vue';
import AppIcon from '@/components/store/AppIcon.vue';
import PreviewDialog from '@/components/store/PreviewDialog.vue';
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
import { bytes } from '@/tools/formato';

const { t } = useI18n();
const operaciones = useOperaciones();

/** Cuánto se espera tras la última tecla antes de volver a pedir la lista. */
const ESPERA = 250;

const filter = ref('');
const list = ref<Tarjeta[]>([]);
const portables = ref<AppImage[]>([]);
const loading = ref(true);
const withOrphans = ref(true);
const dropping = ref(false);
/** El error de la lectura, que deja la pantalla sin nada que mostrar. */
const failure = ref('');
/**
 * El error de una acción sobre un AppImage (abrir, integrar, quitar).
 *
 * Aparte del de la lectura: `load()` limpia `failure` al empezar, y como cada
 * acción recarga la lista después, el aviso de lo que falló se borraba antes
 * de verse.
 */
const actionError = ref('');
let stopDropping: UnlistenFn | null = null;

async function load() {
	loading.value = true;
	failure.value = '';
	try {
		const [instaladas, appimages] = await Promise.all([
			pedirInstaladas(filter.value),
			pedirAppimages(),
		]);
		list.value = instaladas.resultados;
		portables.value = appimages;
	} catch (error) {
		// Un fallo acá se veía como «no hay nada instalado», que en esta pantalla
		// es una mentira alarmante.
		failure.value = String(error);
	} finally {
		loading.value = false;
	}
}

/** Corre una acción sobre un AppImage y deja el error a la vista si falla. */
async function withNotice(action: () => Promise<unknown>) {
	actionError.value = '';
	let error = '';
	try {
		await action();
	} catch (caught) {
		error = String(caught);
	}
	await load();
	actionError.value = error;
}

/**
 * Integra todo lo que se soltó de una vez: cada archivo por su cuenta, los
 * errores juntos y la lista recargada una sola vez al final.
 */
async function integrate(paths: string[]) {
	if (paths.length === 0) return;
	actionError.value = '';
	const errors: string[] = [];
	for (const path of paths) {
		try {
			await integrarAppimage(path);
		} catch (error) {
			errors.push(String(error));
		}
	}
	await load();
	actionError.value = errors.join('\n');
}

onMounted(async () => {
	await load();
	// Soltar un archivo en la ventana. Es un evento del WebView de Tauri y no el
	// `drop` del navegador: el WebView no recibe la ruta real del archivo, sólo
	// un objeto `File` sin ruta, y para copiarlo hace falta la ruta.
	stopDropping = await getCurrentWebview().onDragDropEvent(async (event) => {
		if (event.payload.type === 'over') {
			dropping.value = true;
			return;
		}
		if (event.payload.type === 'drop') {
			dropping.value = false;
			await integrate(event.payload.paths.filter((path) => /\.appimage$/i.test(path)));
			return;
		}
		dropping.value = false;
	});
});

onUnmounted(() => stopDropping?.());

watch(
	() => operaciones.enCurso,
	(now, before) => {
		if (before && !now) {
			load();
		}
	}
);
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
    <PageHeader :title="t('instaladas.titulo')">
      <template #actions>
        <label class="flex min-w-0 items-center gap-2 text-sm" :title="t('instaladas.conHuerfanas')">
          <SwitchToggle
            :model-value="withOrphans"
            :label="t('instaladas.conHuerfanas')"
            @update:model-value="(value) => (withOrphans = value)" />
          <span class="min-w-0 break-words">{{ t('instaladas.conHuerfanas') }}</span>
        </label>
      </template>
    </PageHeader>

    <!-- El filtro se escribe acá y se consulta al backend cuando se deja de
         escribir: `load` pide la lista instalada, que no es gratis. -->
    <SearchField
      v-model="filter"
      :label="t('instaladas.filtro')"
      :debounce="ESPERA"
      @search="load"
      @clear="load" />

    <p v-if="operaciones.falla || actionError || failure" class="whitespace-pre-line text-sm text-status-error">
      {{ operaciones.falla || actionError || failure }}
    </p>

    <section
      class="relative flex flex-col gap-2 rounded-corner-l border border-ui-border-strong border-dashed p-3">
      <h2 class="font-medium text-base">{{ t('instaladas.appimages') }}</h2>
      <p class="text-tx-muted text-xs leading-relaxed">{{ t('instaladas.appimagesNota') }}</p>

      <ul v-if="portables.length > 0" class="flex flex-col gap-2">
        <li v-for="portable in portables" :key="portable.ruta">
          <ListCard custom-class="flex-wrap justify-start! p-2!">
            <AppIcon :icon="{ tema: ['application-x-executable'] }" :size="28" />
            <span class="flex min-w-32 flex-1 flex-col">
              <span class="truncate text-sm">{{ portable.titulo }}</span>
              <span class="text-tx-muted text-xs" :title="portable.ruta">
                {{ portable.administrado ? t('instaladas.integrado') : t('instaladas.suelto') }}
                · {{ bytes(portable.tamano) }}
              </span>
            </span>
            <span class="ms-auto flex flex-wrap items-center gap-2">
              <ActionButton
                variant="secondary"
                :label="t('instaladas.ejecutar')"
                @click="withNotice(() => ejecutarAppimage(portable.ruta))" />
              <ActionButton
                v-if="!portable.administrado"
                :label="t('instaladas.integrar')"
                :title="t('instaladas.integrarNota')"
                @click="withNotice(() => integrarAppimage(portable.ruta))" />
              <ActionButton
                v-else
                variant="danger"
                :label="t('instaladas.quitarAppimage')"
                @click="withNotice(() => quitarAppimage(portable.ruta))" />
            </span>
          </ListCard>
        </li>
      </ul>
      <p v-else class="text-sm text-tx-muted">
        {{ t('instaladas.sinAppimages') }} — {{ t('instaladas.soltarAqui') }}
      </p>

      <DropZone overlay :active="dropping" :label="t('instaladas.soltarAqui')" />
    </section>

    <LoadingState v-if="loading" size="sm" :label="t('comun.cargando')" />
    <EmptyState
      v-else-if="failure"
      icon="dialog-error"
      :title="t('comun.noSePudoLeer')"
      :note="failure">
      <ActionButton variant="secondary" :label="t('comun.reintentar')" @click="load" />
    </EmptyState>
    <EmptyState v-else-if="list.length === 0" :title="t('instaladas.vacio')" />
    <AppGrid v-else :apps="list" />

    <PreviewDialog
      :open="operaciones.preguntando"
      :report="operaciones.informe"
      :title="t('operacion.previsualizacion')"
      @close="operaciones.cancelar"
      @confirm="operaciones.confirmar" />
  </div>
</template>
