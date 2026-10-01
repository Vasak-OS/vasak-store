<script setup lang="ts">
/**
 * Qué se puede actualizar.
 *
 * «Comprobar de nuevo» baja las bases de datos, que es una operación del
 * demonio y pide autorización: mirar si hay actualizaciones escribe en
 * `/var/lib/pacman/sync`. Por eso no se hace sola al entrar — se muestra lo que
 * ya se sabe, que es instantáneo, y refrescar es una decisión.
 *
 * La cabecera es la `PageHeader` de la librería, con la cuenta como
 * descripción y los dos botones como acciones; en una ventana angosta las
 * acciones bajan debajo del título. Cada fila es una `ListCard` que se parte:
 * el nombre y las versiones conservan un ancho mínimo y el botón baja a la
 * línea siguiente antes de aplastarlos.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	ActionButton,
	EmptyState,
	ListCard,
	LoadingState,
	PageHeader,
} from '@vasakgroup/vue-libvasak';
import { computed, onMounted, ref, watch } from 'vue';
import AppIcon from '@/components/store/AppIcon.vue';
import PreviewDialog from '@/components/store/PreviewDialog.vue';
import { useOperaciones } from '@/stores/operaciones';
import { useTienda } from '@/stores/tienda';
import { actualizaciones as pedirActualizaciones, type Tarjeta } from '@/tools/api';
import { claveSegunCantidad, interpolar } from '@/tools/interpolar';

const { t } = useI18n();

const countText = computed(() =>
	list.value.length > 0
		? interpolar(
				t(`actualizaciones.${claveSegunCantidad('disponibles', list.value.length)}`),
				list.value.length
			)
		: undefined
);
const operaciones = useOperaciones();
const tienda = useTienda();

const list = ref<Tarjeta[]>([]);
const loading = ref(true);
/** El error de la lectura, que deja la pantalla sin nada que mostrar. */
const failure = ref('');

async function load() {
	loading.value = true;
	failure.value = '';
	try {
		list.value = await pedirActualizaciones();
		tienda.pendientes = list.value.length;
	} catch (error) {
		// Sin esto, un fallo del backend se veía igual que «el sistema está al
		// día»: la lista quedaba vacía y la pantalla decía que no hay nada que
		// actualizar. Es el peor mensaje posible para un error.
		failure.value = String(error);
	} finally {
		loading.value = false;
	}
}

// El error no se atrapa acá: el store lo deja en `operaciones.falla` y el panel
// de abajo lo muestra. Un `catch` vacío alrededor de esto es lo que escondió que
// la función que se llamaba no existiera.
const check = () => operaciones.comprobarActualizaciones(t('actualizaciones.sincronizar'));

onMounted(load);
// Al terminar cualquier operación, lo que se puede actualizar cambió.
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
    <PageHeader :title="t('actualizaciones.titulo')" :description="countText">
      <template #actions>
        <ActionButton
          variant="secondary"
          :label="t('actualizaciones.sincronizar')"
          :disabled="!!operaciones.enCurso"
          @click="check" />
        <ActionButton
          :label="t('actualizaciones.actualizarTodo')"
          :disabled="list.length === 0 || !!operaciones.enCurso || operaciones.preparando"
          @click="operaciones.pedir('actualizar', [], t('actualizaciones.actualizarTodo'))" />
      </template>
    </PageHeader>

    <p v-if="operaciones.falla" class="text-sm text-status-error">{{ operaciones.falla }}</p>

    <LoadingState v-if="loading" size="sm" :label="t('comun.cargando')" />
    <EmptyState
      v-else-if="failure"
      icon="dialog-error"
      :title="t('comun.noSePudoLeer')"
      :note="failure">
      <ActionButton variant="secondary" :label="t('comun.reintentar')" @click="load" />
    </EmptyState>
    <EmptyState
      v-else-if="list.length === 0"
      icon="emblem-ok"
      :title="t('actualizaciones.ninguna')"
      :note="t('actualizaciones.ningunaNota')" />

    <ul v-else class="flex flex-col gap-2">
      <li v-for="app in list" :key="app.nombre">
        <ListCard custom-class="flex-wrap justify-start!">
          <AppIcon :icon="app.icono" :size="32" />
          <span class="flex min-w-32 flex-1 flex-col">
            <span class="truncate font-medium text-sm">{{ app.titulo }}</span>
            <span class="text-tx-muted text-xs">
              {{ interpolar(t('actualizaciones.desde'), app.version) }}
              {{ interpolar(t('actualizaciones.hasta'), app.actualizable ?? '') }}
            </span>
          </span>
          <ActionButton
            variant="secondary"
            class="ms-auto"
            :label="t('actualizaciones.actualizar')"
            :disabled="!!operaciones.enCurso || operaciones.preparando"
            @click="operaciones.pedir('instalar', [app.nombre], app.titulo)" />
        </ListCard>
      </li>
    </ul>

    <PreviewDialog
      :open="operaciones.preguntando"
      :report="operaciones.informe"
      :title="t('operacion.previsualizacion')"
      @close="operaciones.cancelar"
      @confirm="operaciones.confirmar" />
  </div>
</template>
