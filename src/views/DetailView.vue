<script setup lang="ts">
/**
 * La ficha de un programa.
 *
 * Lo del AUR se ve distinto a propósito: además de la insignia, el botón de
 * instalar no instala —abre la receta—. La política de la distribución trata al
 * AUR como inseguro, y la manera de que eso signifique algo es que compilar
 * requiera haber tenido el PKGBUILD delante.
 *
 * Las piezas son de la librería: los datos van en `PropertyList` por filas, la
 * receta en `CodeBlock`, el sitio del proyecto es un `ActionButton` con `href`
 * y el icono `external-link` del tema en lugar de la flecha escrita, y
 * «Instalado» es un `Badge`.
 *
 * La cabecera sigue al ancho que tiene (consulta de contenedor): en una
 * ventana angosta el icono, el texto y los botones se apilan en una columna en
 * vez de dejar el resumen en una tira de dos palabras por renglón.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	ActionButton,
	Badge,
	CodeBlock,
	EmptyState,
	LoadingState,
	PropertyList,
} from '@vasakgroup/vue-libvasak';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ScreenshotCarousel from '@/components/store/ScreenshotCarousel.vue';
import PreviewDialog from '@/components/store/PreviewDialog.vue';
import AppIcon from '@/components/store/AppIcon.vue';
import OriginBadge from '@/components/store/OriginBadge.vue';
import AppDialog from '@/components/ui/AppDialog.vue';
import { useOperaciones } from '@/stores/operaciones';
import { type Detalle, detalle as pedirDetalle, recetaDelAur } from '@/tools/api';
import { bytes, fecha } from '@/tools/formato';

const { t } = useI18n();
const ruta = useRoute();
const router = useRouter();
const operaciones = useOperaciones();

const app = ref<Detalle | null>(null);
const loading = ref(true);
const failure = ref('');
const recipe = ref('');
const showingRecipe = ref(false);

const fromAur = computed(() => ruta.params.origen === 'aur');

/**
 * El sitio del proyecto, si es una dirección que se puede abrir.
 *
 * El valor sale del catálogo de AppStream o de la base de pacman, o sea de
 * archivos que no escribimos nosotros. Puesto tal cual en un `href`, un
 * `javascript:` ahí adentro se ejecuta en la ventana al hacer clic. Sólo pasan
 * `http` y `https`.
 */
const web = computed(() => {
	const raw = app.value?.web;
	if (!raw) {
		return null;
	}
	try {
		const url = new URL(raw);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
	} catch {
		return null;
	}
});

async function load() {
	loading.value = true;
	failure.value = '';
	app.value = null;
	try {
		app.value = await pedirDetalle(String(ruta.params.nombre), fromAur.value);
	} catch (error) {
		failure.value = String(error);
	} finally {
		loading.value = false;
	}
}

async function showRecipe() {
	failure.value = '';
	try {
		recipe.value = await recetaDelAur(String(ruta.params.nombre));
		showingRecipe.value = true;
	} catch (error) {
		failure.value = String(error);
	}
}

async function build() {
	showingRecipe.value = false;
	await operaciones.compilarDelAur(String(ruta.params.nombre), app.value?.titulo ?? '');
}

/**
 * Los datos de la ficha, como filas.
 *
 * Armados en el guión y no repetidos en la plantilla: eran once bloques
 * iguales con un `v-if` cada uno, y agregar un dato significaba copiar el
 * doceavo. Acá la lista es una lista y la plantilla la recorre.
 */
const facts = computed(() => {
	const sheet = app.value;
	if (!sheet) {
		return [];
	}
	const rows: { label: string; value: string }[] = [
		{ label: t('detalle.version'), value: sheet.version },
		{ label: t('detalle.tamano'), value: sheet.tamano > 0 ? bytes(sheet.tamano) : '' },
		{ label: t('detalle.descarga'), value: sheet.descarga > 0 ? bytes(sheet.descarga) : '' },
		{ label: t('detalle.licencia'), value: sheet.licencia ?? '' },
		{ label: t('detalle.autor'), value: sheet.autor ?? '' },
		{ label: t('detalle.empaquetador'), value: sheet.empaquetador ?? '' },
		{ label: t('detalle.arquitectura'), value: sheet.arquitectura ?? '' },
		{ label: t('detalle.construido'), value: fecha(sheet.construido) },
		{ label: t('detalle.instaladoEl'), value: fecha(sheet.instalado_el) },
		{
			label: t('detalle.votos'),
			value:
				sheet.votos === undefined ? '' : `${sheet.votos} · ${(sheet.popularidad ?? 0).toFixed(2)}`,
		},
		{ label: t('detalle.actualizadoEl'), value: fecha(sheet.actualizado) },
	];
	// Lo que no hay no ocupa una fila vacía: una tabla con la mitad de los
	// valores en blanco se lee como datos que faltan y no como datos que ese
	// paquete no tiene.
	return rows.filter((row) => row.value !== '');
});

onMounted(load);
watch(() => [ruta.params.nombre, ruta.params.origen], load);
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
  <div class="flex min-h-0 flex-1 flex-col overflow-auto">
    <LoadingState v-if="loading" size="sm" :label="t('comun.cargando')" />
    <EmptyState
      v-else-if="!app"
      icon="dialog-error"
      :title="t('busqueda.sinResultados')"
      :note="failure" />

    <template v-else>
      <!-- La cabecera, sobre un fondo propio: es la tarjeta de presentación de
           la aplicación y conviene que se separe de la ficha de datos. -->
      <header class="@container border-ui-border border-b bg-ui-surface/30 px-6 pt-3 pb-6">
        <ActionButton
          variant="secondary"
          class="mb-4"
          :label="t('comun.volver')"
          @click="router.back()" />

        <div class="flex flex-col items-start gap-5 @lg:flex-row @lg:flex-wrap">
          <AppIcon :icon="app.icono" :size="96" />
          <div class="flex w-full min-w-0 flex-col gap-2 @lg:w-auto @lg:flex-1">
            <div class="flex min-w-0 flex-wrap items-center gap-3">
              <h1 class="min-w-0 break-words font-semibold text-2xl">{{ app.titulo }}</h1>
              <OriginBadge :origin="app.origen" :repository="app.repositorio" />
            </div>
            <p class="text-base text-tx-muted leading-snug">{{ app.resumen }}</p>
            <p v-if="app.autor" class="text-tx-muted text-xs">{{ app.autor }}</p>

            <ActionButton
              v-if="web"
              :href="web"
              target="_blank"
              variant="secondary"
              size="sm"
              class="mt-1 w-fit"
              :label="t('detalle.web')"
              icon="external-link-symbolic"
              icon-right />
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <ActionButton v-if="fromAur" :label="t('detalle.verReceta')" @click="showRecipe" />
            <template v-else>
              <ActionButton
                v-if="app.actualizable || !app.instalada"
                :label="app.actualizable ? t('detalle.actualizar') : t('detalle.instalar')"
                :disabled="operaciones.ocupado || operaciones.enCola(app.nombre)"
                @click="operaciones.encolar(app.nombre)" />
              <Badge v-else size="md" :label="t('detalle.instalado')" />
              <ActionButton
                v-if="app.instalada"
                variant="danger"
                :label="t('detalle.quitar')"
                :disabled="operaciones.ocupado"
                @click="operaciones.pedir('quitar', [app.nombre], app.titulo, true)" />
            </template>
          </div>
        </div>

        <p v-if="fromAur" class="mt-3 text-status-warning text-xs leading-relaxed">
          {{ t('origen.aurNota') }}
        </p>
      </header>

      <div class="flex min-w-0 flex-col gap-6 p-6">
        <p v-if="operaciones.falla || failure" class="text-sm text-status-error">
          {{ operaciones.falla || failure }}
        </p>

        <section v-if="app.capturas.length > 0" class="flex min-w-0 flex-col gap-2">
          <h2 class="font-semibold text-sm">{{ t('detalle.capturas') }}</h2>
          <ScreenshotCarousel :screenshots="app.capturas" />
        </section>
        <p v-else-if="!fromAur" class="text-tx-muted text-xs">{{ t('detalle.sinCapturas') }}</p>

        <p v-if="app.descripcion" class="whitespace-pre-line text-sm leading-relaxed">
          {{ app.descripcion }}
        </p>

        <!-- La ficha de datos: filas con separador, la etiqueta a la izquierda
             y el valor a la derecha. -->
        <section v-if="facts.length > 0" class="flex flex-col gap-2">
          <h2 class="font-semibold text-sm">{{ t('detalle.informacion') }}</h2>
          <div class="rounded-corner-l border border-ui-line bg-ui-surface/30 px-4">
            <PropertyList :items="facts" layout="rows" />
          </div>
        </section>

        <section v-if="app.dependencias.length > 0" class="flex flex-col gap-1">
          <h2 class="font-semibold text-sm">{{ t('detalle.dependencias') }}</h2>
          <p class="text-tx-muted text-xs leading-relaxed">{{ app.dependencias.join(', ') }}</p>
        </section>
        <section v-if="app.requerido_por.length > 0" class="flex flex-col gap-1">
          <h2 class="font-semibold text-sm">{{ t('detalle.requeridoPor') }}</h2>
          <p class="text-tx-muted text-xs leading-relaxed">{{ app.requerido_por.join(', ') }}</p>
        </section>
      </div>
    </template>

    <AppDialog :open="showingRecipe" :title="t('detalle.receta')" @close="showingRecipe = false">
      <p class="mb-3 text-sm text-status-warning leading-relaxed">{{ t('detalle.recetaNota') }}</p>
      <CodeBlock :text="recipe" :wrap="false" :label="t('detalle.receta')" />
      <template #footer>
        <ActionButton variant="secondary" :label="t('comun.cancelar')" @click="showingRecipe = false" />
        <ActionButton :label="t('detalle.compilarEInstalar')" :disabled="operaciones.ocupado" @click="build" />
      </template>
    </AppDialog>

    <PreviewDialog
      :open="operaciones.preguntando"
      :report="operaciones.informe"
      :title="t('operacion.previsualizacion')"
      @close="operaciones.cancelar"
      @confirm="operaciones.confirmar" />
  </div>
</template>
