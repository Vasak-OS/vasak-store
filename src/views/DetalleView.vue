<script setup lang="ts">
/**
 * La ficha de un programa.
 *
 * Lo del AUR se ve distinto a propósito: además de la insignia, el botón de
 * instalar no instala —abre la receta—. La política de la distribución trata al
 * AUR como inseguro, y la manera de que eso signifique algo es que compilar
 * requiera haber tenido el PKGBUILD delante.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CarruselDeCapturas from '@/components/tienda/CarruselDeCapturas.vue';
import DialogoDePrevisualizacion from '@/components/tienda/DialogoDePrevisualizacion.vue';
import IconoDeApp from '@/components/tienda/IconoDeApp.vue';
import InsigniaDeOrigen from '@/components/tienda/InsigniaDeOrigen.vue';
import BotonAccion from '@/components/ui/BotonAccion.vue';
import EstadoVacio from '@/components/ui/EstadoVacio.vue';
import IndicadorDeCarga from '@/components/ui/IndicadorDeCarga.vue';
import ModalBase from '@/components/ui/ModalBase.vue';
import { useOperacion } from '@/composables/useOperacion';
import { useOperaciones } from '@/stores/operaciones';
import { type Detalle, ejecutarAppimage, detalle as pedirDetalle, recetaDelAur } from '@/tools/api';
import { bytes, fecha } from '@/tools/formato';

const { t } = useI18n();
const ruta = useRoute();
const router = useRouter();
const operaciones = useOperaciones();
const operacion = useOperacion();

const app = ref<Detalle | null>(null);
const cargando = ref(true);
const falla = ref('');
const receta = ref('');
const viendoReceta = ref(false);

const delAur = computed(() => ruta.params.origen === 'aur');

/**
 * El sitio del proyecto, si es una dirección que se puede abrir.
 *
 * El valor sale del catálogo de AppStream o de la base de pacman, o sea de
 * archivos que no escribimos nosotros. Puesto tal cual en un `href`, un
 * `javascript:` ahí adentro se ejecuta en la ventana al hacer clic. Sólo pasan
 * `http` y `https`.
 */
const web = computed(() => {
	const crudo = app.value?.web;
	if (!crudo) {
		return null;
	}
	try {
		const url = new URL(crudo);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
	} catch {
		return null;
	}
});

async function cargar() {
	cargando.value = true;
	falla.value = '';
	app.value = null;
	try {
		app.value = await pedirDetalle(String(ruta.params.nombre), delAur.value);
	} catch (error) {
		falla.value = String(error);
	} finally {
		cargando.value = false;
	}
}

async function verReceta() {
	falla.value = '';
	try {
		receta.value = await recetaDelAur(String(ruta.params.nombre));
		viendoReceta.value = true;
	} catch (error) {
		falla.value = String(error);
	}
}

async function compilar() {
	viendoReceta.value = false;
	await operacion.compilarDelAur(String(ruta.params.nombre), app.value?.titulo ?? '');
}

onMounted(cargar);
watch(() => [ruta.params.nombre, ruta.params.origen], cargar);
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
    <BotonAccion class="self-start" @click="router.back()">{{ t('comun.volver') }}</BotonAccion>

    <IndicadorDeCarga v-if="cargando" />
    <EstadoVacio v-else-if="!app" :titulo="t('busqueda.sinResultados')" :nota="falla" />

    <template v-else>
      <header class="flex flex-wrap items-start gap-4">
        <IconoDeApp :icono="app.icono" :tamano="64" />
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="font-medium text-xl">{{ app.titulo }}</h1>
            <InsigniaDeOrigen :origen="app.origen" :repositorio="app.repositorio" />
          </div>
          <p class="text-sm text-tx-muted">{{ app.resumen }}</p>
          <p v-if="delAur" class="text-status-warning text-xs leading-relaxed">
            {{ t('origen.aurNota') }}
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <BotonAccion v-if="delAur" tono="principal" @click="verReceta">
            {{ t('detalle.verReceta') }}
          </BotonAccion>
          <template v-else>
            <BotonAccion
              v-if="app.actualizable"
              tono="principal"
              :deshabilitado="!!operaciones.enCurso || operacion.preparando.value"
              @click="operacion.pedir('instalar', [app.nombre], app.titulo)">
              {{ t('detalle.actualizar') }}
            </BotonAccion>
            <BotonAccion
              v-else-if="!app.instalada"
              tono="principal"
              :deshabilitado="!!operaciones.enCurso || operacion.preparando.value"
              @click="operacion.pedir('instalar', [app.nombre], app.titulo)">
              {{ t('detalle.instalar') }}
            </BotonAccion>
            <BotonAccion
              v-if="app.instalada"
              tono="peligro"
              :deshabilitado="!!operaciones.enCurso || operacion.preparando.value"
              @click="operacion.pedir('quitar', [app.nombre], app.titulo, true)">
              {{ t('detalle.quitar') }}
            </BotonAccion>
          </template>
        </div>
      </header>

      <p v-if="operacion.falla.value || falla" class="text-sm text-status-error">
        {{ operacion.falla.value || falla }}
      </p>

      <CarruselDeCapturas v-if="app.capturas.length > 0" :capturas="app.capturas" />
      <p v-else-if="!delAur" class="text-tx-muted text-xs">
        {{ t('detalle.sinCapturas') }}
      </p>

      <p v-if="app.descripcion" class="whitespace-pre-line text-sm leading-relaxed">
        {{ app.descripcion }}
      </p>

      <dl class="grid gap-x-6 gap-y-2 text-sm" style="grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr))">
        <div v-if="app.version" class="flex flex-col">
          <dt class="text-tx-muted text-xs">{{ t('detalle.version') }}</dt>
          <dd>{{ app.version }}</dd>
        </div>
        <div v-if="app.tamano > 0" class="flex flex-col">
          <dt class="text-tx-muted text-xs">{{ t('detalle.tamano') }}</dt>
          <dd>{{ bytes(app.tamano) }}</dd>
        </div>
        <div v-if="app.descarga > 0" class="flex flex-col">
          <dt class="text-tx-muted text-xs">{{ t('detalle.descarga') }}</dt>
          <dd>{{ bytes(app.descarga) }}</dd>
        </div>
        <div v-if="app.licencia" class="flex flex-col">
          <dt class="text-tx-muted text-xs">{{ t('detalle.licencia') }}</dt>
          <dd class="truncate">{{ app.licencia }}</dd>
        </div>
        <div v-if="app.autor" class="flex flex-col">
          <dt class="text-tx-muted text-xs">{{ t('detalle.autor') }}</dt>
          <dd class="truncate">{{ app.autor }}</dd>
        </div>
        <div v-if="app.empaquetador" class="flex flex-col">
          <dt class="text-tx-muted text-xs">{{ t('detalle.empaquetador') }}</dt>
          <dd class="truncate">{{ app.empaquetador }}</dd>
        </div>
        <div v-if="app.arquitectura" class="flex flex-col">
          <dt class="text-tx-muted text-xs">{{ t('detalle.arquitectura') }}</dt>
          <dd>{{ app.arquitectura }}</dd>
        </div>
        <div v-if="app.construido" class="flex flex-col">
          <dt class="text-tx-muted text-xs">{{ t('detalle.construido') }}</dt>
          <dd>{{ fecha(app.construido) }}</dd>
        </div>
        <div v-if="app.instalado_el" class="flex flex-col">
          <dt class="text-tx-muted text-xs">{{ t('detalle.instaladoEl') }}</dt>
          <dd>{{ fecha(app.instalado_el) }}</dd>
        </div>
        <div v-if="app.votos !== undefined" class="flex flex-col">
          <dt class="text-tx-muted text-xs">{{ t('detalle.votos') }}</dt>
          <dd>{{ app.votos }} · {{ (app.popularidad ?? 0).toFixed(2) }}</dd>
        </div>
        <div v-if="app.actualizado" class="flex flex-col">
          <dt class="text-tx-muted text-xs">{{ t('detalle.actualizadoEl') }}</dt>
          <dd>{{ fecha(app.actualizado) }}</dd>
        </div>
      </dl>

      <a
        v-if="web"
        :href="web"
        target="_blank"
        rel="noreferrer noopener"
        class="text-primary text-sm underline">
        {{ t('detalle.web') }}
      </a>

      <section v-if="app.dependencias.length > 0" class="flex flex-col gap-1">
        <h2 class="font-medium text-sm">{{ t('detalle.dependencias') }}</h2>
        <p class="text-tx-muted text-xs leading-relaxed">{{ app.dependencias.join(', ') }}</p>
      </section>
      <section v-if="app.requerido_por.length > 0" class="flex flex-col gap-1">
        <h2 class="font-medium text-sm">{{ t('detalle.requeridoPor') }}</h2>
        <p class="text-tx-muted text-xs leading-relaxed">{{ app.requerido_por.join(', ') }}</p>
      </section>
    </template>

    <ModalBase :abierto="viendoReceta" :titulo="t('detalle.receta')" @cerrar="viendoReceta = false">
      <p class="mb-3 text-sm text-status-warning leading-relaxed">{{ t('detalle.recetaNota') }}</p>
      <pre class="overflow-auto rounded-corner-sm bg-ui-surface/60 p-3 font-mono text-xs leading-relaxed">{{ receta }}</pre>
      <template #pie>
        <BotonAccion @click="viendoReceta = false">{{ t('comun.cancelar') }}</BotonAccion>
        <BotonAccion tono="principal" :deshabilitado="!!operaciones.enCurso" @click="compilar">
          {{ t('detalle.compilarEInstalar') }}
        </BotonAccion>
      </template>
    </ModalBase>

    <DialogoDePrevisualizacion
      :abierto="operacion.abierto.value"
      :informe="operacion.informe.value"
      :titulo="t('operacion.previsualizacion')"
      @cerrar="operacion.cancelar"
      @confirmar="operacion.confirmar" />
  </div>
</template>
