<script setup lang="ts">
/**
 * La portada de la tienda.
 *
 * Dos paneles: la barra lateral —la de `@vasakgroup/vue-libvasak`, la misma que
 * usan Configuración y el monitor— con la búsqueda arriba y las categorías
 * debajo, y a la derecha las aplicaciones con su ícono y su botón de instalar.
 *
 * # Por qué instalar no pasa por la ficha
 *
 * Porque no hace falta. Lo que la ficha agrega —las capturas, las
 * dependencias, el empaquetador— sirve para decidir sobre algo que no se
 * conoce; para lo que ya se fue a buscar, es un paso de más. El botón está en
 * la tarjeta y la previsualización sigue estando: confirmar qué arrastra la
 * operación no se saltea nunca.
 *
 * # Por qué el estado vive en la ruta
 *
 * La categoría y el texto van en la query. Guardados sólo en memoria, el botón
 * de atrás salía de Descubrir en lugar de volver a la categoría anterior, y una
 * ventana reabierta perdía dónde estaba.
 *
 * # Una columna por vez cuando la ventana es angosta
 *
 * Por debajo de su ancho habitual la barra lateral no entra al lado del
 * contenido: se plegaba a una tira de iconos, la búsqueda desaparecía y las
 * tarjetas quedaban aplastadas. Ahí la pantalla pasa a una columna, como una
 * aplicación de teléfono: arriba la búsqueda y un botón de «Categorías», que
 * cambia el contenido por la lista de categorías con un «Volver». Elegir una
 * vuelve al contenido. El ancho se mide sobre la fila de la pantalla con un
 * `ResizeObserver` —en WebKitGTK no llegan ni `matchMedia` ni `resize`—, y el
 * corte es el mismo en que `SideBar` se pliega sola: 48rem.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	ActionButton,
	EmptyState,
	ListGroup,
	ListRow,
	LoadingState,
	SearchField,
	SideBar,
	type SidebarCategory,
} from '@vasakgroup/vue-libvasak';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import FeaturedCard from '@/components/store/FeaturedCard.vue';
import PreviewDialog from '@/components/store/PreviewDialog.vue';
import { useElementWidth } from '@/composables/useElementWidth';
import { useAjustes } from '@/stores/ajustes';
import { useOperaciones } from '@/stores/operaciones';
import {
	buscar as buscarEnLaTienda,
	type Descubrimiento,
	deCategoria,
	descubrir,
	type Tarjeta,
} from '@/tools/api';
import { claveSegunCantidad, interpolar } from '@/tools/interpolar';

const { t } = useI18n();
const ruta = useRoute();
const router = useRouter();
const operaciones = useOperaciones();
const ajustes = useAjustes();

/** El identificador de «todo», que no es una categoría del catálogo. */
const PORTADA = '';

const portada = ref<Descubrimiento | null>(null);
const listing = ref<Tarjeta[]>([]);
const loading = ref(true);
const failure = ref('');

const categoria = computed(() => String(ruta.query.cat ?? PORTADA));
const texto = computed(() => String(ruta.query.q ?? ''));

/**
 * Cuánto se espera tras la última tecla antes de buscar.
 *
 * Cada búsqueda recorre quince mil paquetes y además consulta al AUR: una por
 * tecla no sólo cuesta, además deja que el resultado de la penúltima llegue
 * después que el de la última y la pise.
 */
const ESPERA = 250;

/**
 * Lo que se está escribiendo, que no es lo mismo que lo que se está buscando.
 *
 * Lo buscado vive en la query y por eso `texto` es de sólo lectura; el campo
 * necesita algo donde escribir. Van atados en un sentido: el botón de atrás
 * vuelve a la búsqueda anterior y el campo tiene que acompañar.
 */
const draft = ref(texto.value);
watch(texto, (now) => {
	draft.value = now;
});
const buscando = computed(() => texto.value.trim().length > 0);

const busy = computed(() => operaciones.ocupado);

/** Cada búsqueda lleva su número, para descartar respuestas que llegan tarde. */
let ultima = 0;

async function load() {
	const mia = ++ultima;
	loading.value = true;
	failure.value = '';
	try {
		if (buscando.value) {
			const pagina = await buscarEnLaTienda(texto.value, ajustes.aur);
			if (mia !== ultima) return;
			listing.value = pagina.resultados;
		} else if (categoria.value !== PORTADA) {
			const pagina = await deCategoria(categoria.value, 200);
			if (mia !== ultima) return;
			listing.value = pagina.resultados;
		} else {
			const datos = await descubrir();
			if (mia !== ultima) return;
			portada.value = datos;
			listing.value = [];
		}
	} catch (error) {
		if (mia === ultima) {
			failure.value = String(error);
		}
	} finally {
		if (mia === ultima) {
			loading.value = false;
		}
	}
}

/** Cambia la ruta; el observador de abajo es el que recarga. */
function go(cat: string, q = '') {
	router.push({ name: 'descubrir', query: { ...(cat ? { cat } : {}), ...(q ? { q } : {}) } });
}

function open(app: Tarjeta) {
	if (app.origen === 'appimage') {
		router.push({ name: 'instaladas' });
		return;
	}
	router.push({ name: 'detalle', params: { origen: app.origen, nombre: app.nombre } });
}

/** Las categorías que la barra lateral muestra, con sus cuentas. */
const categorias = computed(() => portada.value?.categorias ?? []);

/**
 * Las categorías como las pide la barra compartida: un grupo con «todo»
 * adelante y cada categoría del catálogo detrás, con su cuenta de insignia.
 */
const grupos = computed<SidebarCategory[]>(() => [
	{
		id: 'categorias',
		title: t('categorias.titulo'),
		items: [
			{ id: PORTADA, label: t('descubrir.todo'), icon: 'go-home' },
			...categorias.value.map((grupo) => ({
				id: grupo.id,
				label: t(`categorias.${grupo.id}`),
				icon: grupo.icono,
				badge: grupo.cuantas,
			})),
		],
	},
]);

/**
 * Qué elemento de la barra queda marcado.
 *
 * Buscando no es ninguno, y eso no se puede decir con la categoría vacía
 * porque la categoría vacía **es** «todo». De ahí el identificador que no
 * existe en la lista: con él, ningún botón se marca mientras hay una
 * búsqueda puesta, que es lo que corresponde — los resultados no salen de una
 * categoría.
 */
const SIN_SELECCION = '\u0000buscando';
const seleccionada = computed(() => (buscando.value ? SIN_SELECCION : categoria.value));

const hayPortada = computed(
	() => !buscando.value && categoria.value === PORTADA && portada.value !== null
);

function cuantas(n: number) {
	return interpolar(t(`categorias.${claveSegunCantidad('cuantas', n)}`), n);
}

onMounted(async () => {
	// Los ajustes primero, y **antes de empezar a observar**: leer el archivo
	// puede cambiar `ajustes.aur`, y con el observador ya puesto ese cambio
	// dispara una carga idéntica a la que viene abajo. Con el AUR encendido eso
	// son dos consultas a la red por abrir la pantalla.
	if (!ajustes.cargado) {
		await ajustes.cargar();
	}

	// La portada se pide siempre en el primer arranque aunque se entre con una
	// categoría puesta: de ahí salen las categorías de la barra lateral.
	if (categoria.value !== PORTADA || buscando.value) {
		descubrir()
			.then((datos) => {
				portada.value = datos;
			})
			.catch(() => {});
	}
	await load();

	// El AUR también: encenderlo desde Repositorios tiene que cambiar lo que se
	// ve acá sin volver a escribir la búsqueda.
	watch([categoria, texto, () => ajustes.aur], load);
});
watch(
	() => operaciones.enCurso,
	(now, before) => {
		if (before && !now) {
			load();
		}
	}
);

/** Por debajo de esto la barra lateral no entra al lado del contenido. */
const NARROW_BELOW = 768;

const row = ref<HTMLElement | null>(null);
const rowWidth = useElementWidth(row);
/** Cero es «todavía sin maquetar»: ahí va la forma de siempre. */
const narrow = computed(() => rowWidth.value > 0 && rowWidth.value < NARROW_BELOW);

/** Qué columna se ve cuando hay lugar para una sola. */
const pane = ref<'content' | 'categories'>('content');

/** Elegir en la lista angosta: va a la categoría y vuelve al contenido. */
function pick(id: string) {
	pane.value = 'content';
	go(id);
}

/** Buscar desde cualquiera de las dos formas. */
function search(q: string) {
	pane.value = 'content';
	go(q ? '' : categoria.value, q);
}
</script>

<template>
  <div ref="row" class="flex min-h-0 min-w-0 flex-1 gap-1 p-1" :data-narrow="narrow">
    <SideBar
      v-if="!narrow"
      :title="t('app.nombre')"
      :subtitle="t('secciones.descubrir')"
      :categories="grupos"
      :model-value="seleccionada"
      :collapse-label="t('barraLateral.plegar')"
      :expand-label="t('barraLateral.desplegar')"
      @change="(id: string) => go(id)">
      <!-- La búsqueda va en la cabecera, antes que cualquier categoría: en una
           tienda, buscar es lo primero que alguien hace. -->
      <template #header>
        <SearchField
          v-model="draft"
          :label="t('busqueda.marcador')"
          :debounce="ESPERA"
          @search="search" />
      </template>
    </SideBar>

    <!-- La lista de categorías, cuando la ventana es angosta y se la pidió. -->
    <section
      v-if="narrow && pane === 'categories'"
      class="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto rounded-corner-l border border-ui-line bg-ui-surface/70 p-3"
      data-pane="categories">
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <ActionButton
          variant="secondary"
          icon="go-previous-symbolic"
          :label="t('comun.volver')"
          @click="pane = 'content'" />
        <h2 class="min-w-0 break-words font-semibold text-lg">{{ t('categorias.titulo') }}</h2>
      </div>
      <ListGroup role="group" :label="t('categorias.titulo')">
        <ListRow
          v-for="item in grupos[0]?.items ?? []"
          :key="item.id"
          role="button"
          :title="item.label"
          :icon="item.icon"
          :meta="item.badge === undefined ? undefined : String(item.badge)"
          :selected="seleccionada === item.id"
          @click="pick(item.id)" />
      </ListGroup>
    </section>

    <main
      v-else
      class="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden rounded-corner-l border border-ui-line bg-ui-surface/70 p-4">
      <!-- Angosta, la búsqueda y la entrada a las categorías van arriba del
           contenido: la barra lateral que las tenía no entra. -->
      <div v-if="narrow" class="mb-4 flex min-w-0 items-center gap-2" data-pane="toolbar">
        <div class="min-w-0 flex-1">
          <SearchField
            v-model="draft"
            :label="t('busqueda.marcador')"
            :debounce="ESPERA"
            @search="search" />
        </div>
        <ActionButton
          variant="secondary"
          label=""
          icon="view-list-symbolic"
          :icon-alt="t('categorias.titulo')"
          :title="t('categorias.titulo')"
          @click="pane = 'categories'" />
      </div>

      <LoadingState v-if="loading" size="sm" :label="t('comun.cargando')" />

      <EmptyState
        v-else-if="failure"
        icon="dialog-error"
        :title="t('comun.noSePudoLeer')"
        :note="failure">
        <ActionButton variant="secondary" :label="t('comun.reintentar')" @click="load" />
      </EmptyState>

      <!-- La portada: la fila destacada con capturas y la de lo recién
           actualizado. -->
      <div v-else-if="hayPortada" class="flex flex-col gap-8">
        <section v-if="portada?.seleccion.length" class="flex flex-col gap-3">
          <header class="flex flex-col gap-1">
            <h2 class="font-semibold text-lg">{{ t('descubrir.seleccion') }}</h2>
            <p class="text-tx-muted text-xs leading-relaxed">{{ t('descubrir.seleccionNota') }}</p>
          </header>
          <div
            class="grid gap-4"
            style="grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr))">
            <FeaturedCard
              v-for="app in portada.seleccion"
              :key="app.nombre"
              :app="app"
              with-screenshot
              :busy="busy"
              :queued="operaciones.enCola(app.nombre)"
              @open="open(app)"
              @install="operaciones.encolar(app.nombre)"
              @update="operaciones.encolar(app.nombre)" />
          </div>
        </section>

        <section v-if="portada?.novedades.length" class="flex flex-col gap-3">
          <header class="flex flex-col gap-1">
            <h2 class="font-semibold text-lg">{{ t('descubrir.novedades') }}</h2>
            <p class="text-tx-muted text-xs leading-relaxed">{{ t('descubrir.novedadesNota') }}</p>
          </header>
          <div
            class="grid gap-3"
            style="grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr))">
            <FeaturedCard
              v-for="app in portada.novedades"
              :key="app.nombre"
              :app="app"
              :busy="busy"
              :queued="operaciones.enCola(app.nombre)"
              @open="open(app)"
              @install="operaciones.encolar(app.nombre)"
              @update="operaciones.encolar(app.nombre)" />
          </div>
        </section>
      </div>

      <EmptyState
        v-else-if="listing.length === 0"
        icon="system-search"
        :title="t('busqueda.sinResultados')"
        :note="t('busqueda.sinResultadosNota')" />

      <!-- Una categoría, o los resultados de una búsqueda. -->
      <div v-else class="flex flex-col gap-3">
        <header class="flex flex-wrap items-baseline gap-2">
          <h2 class="font-semibold text-lg">
            {{ buscando ? t('comun.buscar') : t(`categorias.${categoria}`) }}
          </h2>
          <span class="text-tx-muted text-xs">
            {{
              buscando
                ? interpolar(
                    t(`busqueda.${claveSegunCantidad('resultados', listing.length)}`),
                    listing.length
                  )
                : cuantas(listing.length)
            }}
          </span>
        </header>
        <div
          class="grid gap-3"
          style="grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr))">
          <FeaturedCard
            v-for="app in listing"
            :key="`${app.origen}:${app.nombre}`"
            :app="app"
            :busy="busy"
            :queued="operaciones.enCola(app.nombre)"
            @open="open(app)"
            @install="operaciones.encolar(app.nombre)"
            @update="operaciones.encolar(app.nombre)" />
        </div>
      </div>

      <p v-if="operaciones.falla" class="mt-3 text-sm text-status-error">
        {{ operaciones.falla }}
      </p>
    </main>

    <PreviewDialog
      :open="operaciones.preguntando"
      :report="operaciones.informe"
      :title="t('operacion.previsualizacion')"
      @close="operaciones.cancelar"
      @confirm="operaciones.confirmar" />
  </div>
</template>
