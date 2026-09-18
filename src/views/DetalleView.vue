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
import { useOperaciones } from '@/stores/operaciones';
import { type Detalle, detalle as pedirDetalle, recetaDelAur } from '@/tools/api';
import { bytes, fecha } from '@/tools/formato';

const { t } = useI18n();
const ruta = useRoute();
const router = useRouter();
const operaciones = useOperaciones();

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
	await operaciones.compilarDelAur(String(ruta.params.nombre), app.value?.titulo ?? '');
}

/**
 * Los datos de la ficha, como filas.
 *
 * Armados en el guión y no repetidos en la plantilla: eran once bloques
 * iguales con un `v-if` cada uno, y agregar un dato significaba copiar el
 * doceavo. Acá la lista es una lista y la plantilla la recorre.
 */
const datos = computed(() => {
	const ficha = app.value;
	if (!ficha) {
		return [];
	}
	const filas: { etiqueta: string; valor: string }[] = [
		{ etiqueta: t('detalle.version'), valor: ficha.version },
		{ etiqueta: t('detalle.tamano'), valor: ficha.tamano > 0 ? bytes(ficha.tamano) : '' },
		{ etiqueta: t('detalle.descarga'), valor: ficha.descarga > 0 ? bytes(ficha.descarga) : '' },
		{ etiqueta: t('detalle.licencia'), valor: ficha.licencia ?? '' },
		{ etiqueta: t('detalle.autor'), valor: ficha.autor ?? '' },
		{ etiqueta: t('detalle.empaquetador'), valor: ficha.empaquetador ?? '' },
		{ etiqueta: t('detalle.arquitectura'), valor: ficha.arquitectura ?? '' },
		{ etiqueta: t('detalle.construido'), valor: fecha(ficha.construido) },
		{ etiqueta: t('detalle.instaladoEl'), valor: fecha(ficha.instalado_el) },
		{
			etiqueta: t('detalle.votos'),
			valor:
				ficha.votos === undefined ? '' : `${ficha.votos} · ${(ficha.popularidad ?? 0).toFixed(2)}`,
		},
		{ etiqueta: t('detalle.actualizadoEl'), valor: fecha(ficha.actualizado) },
	];
	// Lo que no hay no ocupa una fila vacía: una tabla con la mitad de los
	// valores en blanco se lee como datos que faltan y no como datos que ese
	// paquete no tiene.
	return filas.filter((fila) => fila.valor !== '');
});

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
  <div class="flex min-h-0 flex-1 flex-col overflow-auto">
    <IndicadorDeCarga v-if="cargando" />
    <EstadoVacio
      v-else-if="!app"
      icono="dialog-error"
      :titulo="t('busqueda.sinResultados')"
      :nota="falla" />

    <template v-else>
      <!-- La cabecera, sobre un fondo propio: es la tarjeta de presentación de
           la aplicación y conviene que se separe de la ficha de datos. -->
      <header class="border-ui-border border-b bg-ui-surface/30 px-6 pt-3 pb-6">
        <BotonAccion class="mb-4" @click="router.back()">{{ t('comun.volver') }}</BotonAccion>

        <div class="flex flex-wrap items-start gap-5">
          <IconoDeApp :icono="app.icono" :tamano="96" />
          <div class="flex min-w-0 flex-1 flex-col gap-2">
            <div class="flex flex-wrap items-center gap-3">
              <h1 class="font-semibold text-2xl">{{ app.titulo }}</h1>
              <InsigniaDeOrigen :origen="app.origen" :repositorio="app.repositorio" />
            </div>
            <p class="text-base text-tx-muted leading-snug">{{ app.resumen }}</p>
            <p v-if="app.autor" class="text-tx-muted text-xs">{{ app.autor }}</p>

            <a
              v-if="web"
              :href="web"
              target="_blank"
              rel="noreferrer noopener"
              class="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 font-semibold text-primary text-xs transition-colors hover:bg-primary hover:text-tx-on-primary">
              {{ t('detalle.web') }}
              <span aria-hidden="true">↗</span>
            </a>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <BotonAccion v-if="delAur" tono="principal" @click="verReceta">
              {{ t('detalle.verReceta') }}
            </BotonAccion>
            <template v-else>
              <BotonAccion
                v-if="app.actualizable || !app.instalada"
                tono="principal"
                :deshabilitado="operaciones.ocupado || operaciones.enCola(app.nombre)"
                @click="operaciones.encolar(app.nombre)">
                {{ app.actualizable ? t('detalle.actualizar') : t('detalle.instalar') }}
              </BotonAccion>
              <span
                v-else
                class="rounded-full bg-ui-surface px-3 py-1.5 font-semibold text-tx-muted text-xs">
                {{ t('detalle.instalado') }}
              </span>
              <BotonAccion
                v-if="app.instalada"
                tono="peligro"
                :deshabilitado="operaciones.ocupado"
                @click="operaciones.pedir('quitar', [app.nombre], app.titulo, true)">
                {{ t('detalle.quitar') }}
              </BotonAccion>
            </template>
          </div>
        </div>

        <p v-if="delAur" class="mt-3 text-status-warning text-xs leading-relaxed">
          {{ t('origen.aurNota') }}
        </p>
      </header>

      <div class="flex flex-col gap-6 p-6">
        <p v-if="operaciones.falla || falla" class="text-sm text-status-error">
          {{ operaciones.falla || falla }}
        </p>

        <section v-if="app.capturas.length > 0" class="flex flex-col gap-2">
          <h2 class="font-semibold text-sm">{{ t('detalle.capturas') }}</h2>
          <CarruselDeCapturas :capturas="app.capturas" />
        </section>
        <p v-else-if="!delAur" class="text-tx-muted text-xs">{{ t('detalle.sinCapturas') }}</p>

        <p v-if="app.descripcion" class="whitespace-pre-line text-sm leading-relaxed">
          {{ app.descripcion }}
        </p>

        <!-- La ficha de datos: filas con separador, la etiqueta a la izquierda
             y el valor a la derecha. Antes era una rejilla de pares sueltos, sin
             jerarquía y sin una línea que guiara la lectura. -->
        <section v-if="datos.length > 0" class="flex flex-col gap-2">
          <h2 class="font-semibold text-sm">{{ t('detalle.informacion') }}</h2>
          <dl class="overflow-hidden rounded-corner border border-ui-border bg-ui-surface/30">
            <div
              v-for="(fila, indice) in datos"
              :key="fila.etiqueta"
              class="flex items-baseline justify-between gap-6 px-4 py-2.5 text-sm"
              :class="indice > 0 ? 'border-ui-border border-t' : ''">
              <dt class="shrink-0 text-tx-muted">{{ fila.etiqueta }}</dt>
              <dd class="min-w-0 truncate text-right font-medium">{{ fila.valor }}</dd>
            </div>
          </dl>
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

    <ModalBase :abierto="viendoReceta" :titulo="t('detalle.receta')" @cerrar="viendoReceta = false">
      <p class="mb-3 text-sm text-status-warning leading-relaxed">{{ t('detalle.recetaNota') }}</p>
      <pre class="overflow-auto rounded-corner-sm bg-ui-surface/60 p-3 font-mono text-xs leading-relaxed">{{ receta }}</pre>
      <template #pie>
        <BotonAccion @click="viendoReceta = false">{{ t('comun.cancelar') }}</BotonAccion>
        <BotonAccion tono="principal" :deshabilitado="operaciones.ocupado" @click="compilar">
          {{ t('detalle.compilarEInstalar') }}
        </BotonAccion>
      </template>
    </ModalBase>

    <DialogoDePrevisualizacion
      :abierto="operaciones.preguntando"
      :informe="operaciones.informe"
      :titulo="t('operacion.previsualizacion')"
      @cerrar="operaciones.cancelar"
      @confirmar="operaciones.confirmar" />
  </div>
</template>
