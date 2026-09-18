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
import { useOperacion } from '@/composables/useOperacion';
import { useOperaciones } from '@/stores/operaciones';
import { useTienda } from '@/stores/tienda';
import { actualizaciones as pedirActualizaciones, sincronizar, type Tarjeta } from '@/tools/api';
import { claveSegunCantidad, interpolar } from '@/tools/interpolar';

const { t } = useI18n();
const operaciones = useOperaciones();
const tienda = useTienda();
const operacion = useOperacion();

const lista = ref<Tarjeta[]>([]);
const cargando = ref(true);

async function cargar() {
	cargando.value = true;
	try {
		lista.value = await pedirActualizaciones();
		tienda.pendientes = lista.value.length;
	} finally {
		cargando.value = false;
	}
}

async function comprobar() {
	try {
		await operaciones.empezar(t('actualizaciones.sincronizar'), sincronizar);
	} catch {
		// El error queda en el panel de abajo, que es donde se mira.
	}
}

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
          :deshabilitado="lista.length === 0 || !!operaciones.enCurso || operacion.preparando.value"
          @click="operacion.pedir('actualizar', [], t('actualizaciones.actualizarTodo'))">
          {{ t('actualizaciones.actualizarTodo') }}
        </BotonAccion>
      </div>
    </div>

    <p v-if="operacion.falla.value" class="text-sm text-status-error">{{ operacion.falla.value }}</p>

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
        class="flex items-center gap-3 rounded-corner border border-ui-border bg-ui-surface/40 p-3">
        <IconoDeApp :icono="app.icono" :tamano="32" />
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate font-medium text-sm">{{ app.titulo }}</span>
          <span class="text-tx-muted text-xs">
            {{ interpolar(t('actualizaciones.desde'), app.version) }}
            {{ interpolar(t('actualizaciones.hasta'), app.actualizable ?? '') }}
          </span>
        </span>
        <BotonAccion
          :deshabilitado="!!operaciones.enCurso || operacion.preparando.value"
          @click="operacion.pedir('instalar', [app.nombre], app.titulo)">
          {{ t('actualizaciones.actualizar') }}
        </BotonAccion>
      </li>
    </ul>

    <DialogoDePrevisualizacion
      :abierto="operacion.abierto.value"
      :informe="operacion.informe.value"
      :titulo="t('operacion.previsualizacion')"
      @cerrar="operacion.cancelar"
      @confirmar="operacion.confirmar" />
  </div>
</template>
