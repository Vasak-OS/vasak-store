<script setup lang="ts">
/**
 * La portada de la tienda.
 *
 * Dos paneles: la barra lateral —la misma de Configuración— con la búsqueda
 * arriba y las categorías debajo, y a la derecha las aplicaciones con su ícono
 * y su botón de instalar.
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
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BarraLateral from '@/components/sidebar/BarraLateral.vue';
import BotonLateral from '@/components/sidebar/BotonLateral.vue';
import GrupoLateral from '@/components/sidebar/GrupoLateral.vue';
import BarraDeBusqueda from '@/components/tienda/BarraDeBusqueda.vue';
import DialogoDePrevisualizacion from '@/components/tienda/DialogoDePrevisualizacion.vue';
import TarjetaGrande from '@/components/tienda/TarjetaGrande.vue';
import BotonAccion from '@/components/ui/BotonAccion.vue';
import EstadoVacio from '@/components/ui/EstadoVacio.vue';
import IndicadorDeCarga from '@/components/ui/IndicadorDeCarga.vue';
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
const listado = ref<Tarjeta[]>([]);
const cargando = ref(true);
const falla = ref('');

const categoria = computed(() => String(ruta.query.cat ?? PORTADA));
const texto = computed(() => String(ruta.query.q ?? ''));
const buscando = computed(() => texto.value.trim().length > 0);

const ocupado = computed(() => operaciones.ocupado);

/** Cada búsqueda lleva su número, para descartar respuestas que llegan tarde. */
let ultima = 0;

async function cargar() {
	const mia = ++ultima;
	cargando.value = true;
	falla.value = '';
	try {
		if (buscando.value) {
			const pagina = await buscarEnLaTienda(texto.value, ajustes.aur);
			if (mia !== ultima) return;
			listado.value = pagina.resultados;
		} else if (categoria.value !== PORTADA) {
			const pagina = await deCategoria(categoria.value, 200);
			if (mia !== ultima) return;
			listado.value = pagina.resultados;
		} else {
			const datos = await descubrir();
			if (mia !== ultima) return;
			portada.value = datos;
			listado.value = [];
		}
	} catch (error) {
		if (mia === ultima) {
			falla.value = String(error);
		}
	} finally {
		if (mia === ultima) {
			cargando.value = false;
		}
	}
}

/** Cambia la ruta; el observador de abajo es el que recarga. */
function ir(cat: string, q = '') {
	router.push({ name: 'descubrir', query: { ...(cat ? { cat } : {}), ...(q ? { q } : {}) } });
}

function abrir(app: Tarjeta) {
	if (app.origen === 'appimage') {
		router.push({ name: 'instaladas' });
		return;
	}
	router.push({ name: 'detalle', params: { origen: app.origen, nombre: app.nombre } });
}

/** Las categorías que la barra lateral muestra, con sus cuentas. */
const categorias = computed(() => portada.value?.categorias ?? []);

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
	await cargar();

	// El AUR también: encenderlo desde Repositorios tiene que cambiar lo que se
	// ve acá sin volver a escribir la búsqueda.
	watch([categoria, texto, () => ajustes.aur], cargar);
});
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
  <div class="flex min-h-0 flex-1 gap-1 p-1">
    <BarraLateral :titulo="t('app.nombre')" :subtitulo="t('secciones.descubrir')">
      <template #busqueda>
        <BarraDeBusqueda
          :valor="texto"
          @buscar="(q: string) => ir(q ? '' : categoria, q)" />
      </template>

      <template #default="{ plegada }">
        <GrupoLateral :titulo="t('categorias.titulo')" :plegado="plegada">
          <BotonLateral
            :etiqueta="t('descubrir.todo')"
            icono="go-home"
            :plegado="plegada"
            :activo="categoria === PORTADA && !buscando"
            @click="ir(PORTADA)" />
          <BotonLateral
            v-for="grupo in categorias"
            :key="grupo.id"
            :etiqueta="t(`categorias.${grupo.id}`)"
            :icono="grupo.icono"
            :insignia="grupo.cuantas"
            :plegado="plegada"
            :activo="categoria === grupo.id && !buscando"
            @click="ir(grupo.id)" />
        </GrupoLateral>
      </template>
    </BarraLateral>

    <main
      class="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden rounded-corner border border-ui-border bg-ui-bg/80 p-4">
      <IndicadorDeCarga v-if="cargando" />

      <EstadoVacio
        v-else-if="falla"
        icono="dialog-error"
        :titulo="t('comun.noSePudoLeer')"
        :nota="falla">
        <BotonAccion @click="cargar">{{ t('comun.reintentar') }}</BotonAccion>
      </EstadoVacio>

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
            <TarjetaGrande
              v-for="app in portada.seleccion"
              :key="app.nombre"
              :app="app"
              con-captura
              :ocupado="ocupado"
              :en-cola="operaciones.enCola(app.nombre)"
              @abrir="abrir(app)"
              @instalar="operaciones.encolar(app.nombre)"
              @actualizar="operaciones.encolar(app.nombre)" />
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
            <TarjetaGrande
              v-for="app in portada.novedades"
              :key="app.nombre"
              :app="app"
              :ocupado="ocupado"
              :en-cola="operaciones.enCola(app.nombre)"
              @abrir="abrir(app)"
              @instalar="operaciones.encolar(app.nombre)"
              @actualizar="operaciones.encolar(app.nombre)" />
          </div>
        </section>
      </div>

      <EstadoVacio
        v-else-if="listado.length === 0"
        icono="system-search"
        :titulo="t('busqueda.sinResultados')"
        :nota="t('busqueda.sinResultadosNota')" />

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
                    t(`busqueda.${claveSegunCantidad('resultados', listado.length)}`),
                    listado.length
                  )
                : cuantas(listado.length)
            }}
          </span>
        </header>
        <div
          class="grid gap-3"
          style="grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr))">
          <TarjetaGrande
            v-for="app in listado"
            :key="`${app.origen}:${app.nombre}`"
            :app="app"
            :ocupado="ocupado"
            :en-cola="operaciones.enCola(app.nombre)"
            @abrir="abrir(app)"
            @instalar="operaciones.encolar(app.nombre)"
            @actualizar="operaciones.encolar(app.nombre)" />
        </div>
      </div>

      <p v-if="operaciones.falla" class="mt-3 text-sm text-status-error">
        {{ operaciones.falla }}
      </p>
    </main>

    <DialogoDePrevisualizacion
      :abierto="operaciones.preguntando"
      :informe="operaciones.informe"
      :titulo="t('operacion.previsualizacion')"
      @cerrar="operaciones.cancelar"
      @confirmar="operaciones.confirmar" />
  </div>
</template>
