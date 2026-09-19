<script setup lang="ts">
/**
 * Qué se puede actualizar.
 *
 * «Comprobar de nuevo» baja las bases de datos, que es una operación del
 * demonio y pide autorización: mirar si hay actualizaciones escribe en
 * `/var/lib/pacman/sync`. Por eso no se hace sola al entrar — se muestra lo que
 * ya se sabe, que es instantáneo, y refrescar es una decisión.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { onMounted, ref, watch } from 'vue';
import DialogoDePrevisualizacion from '@/components/tienda/DialogoDePrevisualizacion.vue';
import IconoDeApp from '@/components/tienda/IconoDeApp.vue';
import BotonAccion from '@/components/ui/BotonAccion.vue';
import EstadoVacio from '@/components/ui/EstadoVacio.vue';
import IndicadorDeCarga from '@/components/ui/IndicadorDeCarga.vue';
import { useOperaciones } from '@/stores/operaciones';
import { useTienda } from '@/stores/tienda';
import { actualizaciones as pedirActualizaciones, type Tarjeta } from '@/tools/api';
import { claveSegunCantidad, interpolar } from '@/tools/interpolar';

const { t } = useI18n();
const operaciones = useOperaciones();
const tienda = useTienda();

const lista = ref<Tarjeta[]>([]);
const cargando = ref(true);
/** El error de la lectura, que deja la pantalla sin nada que mostrar. */
const falla = ref('');

async function cargar() {
	cargando.value = true;
	falla.value = '';
	try {
		lista.value = await pedirActualizaciones();
		tienda.pendientes = lista.value.length;
	} catch (error) {
		// Sin esto, un fallo del backend se veía igual que «el sistema está al
		// día»: la lista quedaba vacía y la pantalla decía que no hay nada que
		// actualizar. Es el peor mensaje posible para un error.
		falla.value = String(error);
	} finally {
		cargando.value = false;
	}
}

// El error no se atrapa acá: el store lo deja en `operaciones.falla` y el panel
// de abajo lo muestra. Un `catch` vacío alrededor de esto es lo que escondió que
// la función que se llamaba no existiera.
const comprobar = () => operaciones.comprobarActualizaciones(t('actualizaciones.sincronizar'));

onMounted(cargar);
// Al terminar cualquier operación, lo que se puede actualizar cambió.
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
      <h1 class="font-medium text-lg">{{ t('actualizaciones.titulo') }}</h1>
      <span v-if="lista.length > 0" class="text-sm text-tx-muted">
        {{ interpolar(t(`actualizaciones.${claveSegunCantidad('disponibles', lista.length)}`), lista.length) }}
      </span>
      <div class="ml-auto flex gap-2">
        <BotonAccion :deshabilitado="!!operaciones.enCurso" @click="comprobar">
          {{ t('actualizaciones.sincronizar') }}
        </BotonAccion>
        <BotonAccion
          tono="principal"
          :deshabilitado="lista.length === 0 || !!operaciones.enCurso || operaciones.preparando"
          @click="operaciones.pedir('actualizar', [], t('actualizaciones.actualizarTodo'))">
          {{ t('actualizaciones.actualizarTodo') }}
        </BotonAccion>
      </div>
    </div>

    <p v-if="operaciones.falla" class="text-sm text-status-error">{{ operaciones.falla }}</p>

    <IndicadorDeCarga v-if="cargando" />
    <EstadoVacio
      v-else-if="falla"
      icono="dialog-error"
      :titulo="t('comun.noSePudoLeer')"
      :nota="falla">
      <BotonAccion @click="cargar">{{ t('comun.reintentar') }}</BotonAccion>
    </EstadoVacio>
    <EstadoVacio
      v-else-if="lista.length === 0"
      icono="emblem-ok"
      :titulo="t('actualizaciones.ninguna')"
      :nota="t('actualizaciones.ningunaNota')" />

    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="app in lista"
        :key="app.nombre"
        class="flex items-center gap-3 rounded-corner border border-ui-border bg-ui-surface/70 p-3">
        <IconoDeApp :icono="app.icono" :tamano="32" />
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate font-medium text-sm">{{ app.titulo }}</span>
          <span class="text-tx-muted text-xs">
            {{ interpolar(t('actualizaciones.desde'), app.version) }}
            {{ interpolar(t('actualizaciones.hasta'), app.actualizable ?? '') }}
          </span>
        </span>
        <BotonAccion
          :deshabilitado="!!operaciones.enCurso || operaciones.preparando"
          @click="operaciones.pedir('instalar', [app.nombre], app.titulo)">
          {{ t('actualizaciones.actualizar') }}
        </BotonAccion>
      </li>
    </ul>

    <DialogoDePrevisualizacion
      :abierto="operaciones.preguntando"
      :informe="operaciones.informe"
      :titulo="t('operacion.previsualizacion')"
      @cerrar="operaciones.cancelar"
      @confirmar="operaciones.confirmar" />
  </div>
</template>
