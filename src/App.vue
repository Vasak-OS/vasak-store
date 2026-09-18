<script setup lang="ts">
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useConfigStore } from '@vasakgroup/plugin-config-manager';
import { onMounted, onUnmounted, type Ref, ref } from 'vue';
import PanelDeOperacion from '@/components/tienda/PanelDeOperacion.vue';
import WindowAppLayout from '@/layouts/WindowAppLayout.vue';
import { useOperaciones } from '@/stores/operaciones';
import { useTienda } from '@/stores/tienda';

const unListenConfig: Ref<UnlistenFn | null> = ref(null);
const operaciones = useOperaciones();
const tienda = useTienda();

onMounted(async () => {
	// Los eventos del backend se escuchan desde acá, una sola vez: una
	// instalación empezada en una sección se sigue mirando desde otra, y si la
	// suscripción viviera en la pantalla se perderían los eventos del medio.
	await operaciones.escuchar();
	await tienda.contar();

	// Los dos `try` son separados a propósito. Con uno solo, un fallo al
	// suscribirse dejaba la configuración sin cargar aunque la carga hubiera
	// salido bien, y la ventana abría con los colores y las fuentes de reserva.
	const configStore = useConfigStore();
	try {
		await configStore.loadConfig();
	} catch (error: unknown) {
		console.error('Error al cargar configuración en App.vue', error);
	}

	try {
		unListenConfig.value = await listen('config-changed', async () => {
			document.startViewTransition(() => {
				configStore.loadConfig();
			});
		});
	} catch (error: unknown) {
		console.error('No se pudo escuchar los cambios de configuración', error);
	}
});

onUnmounted(() => {
	unListenConfig.value?.();
	operaciones.soltarTodo();
});
</script>

<template>
  <WindowAppLayout>
    <RouterView />
    <!-- El panel de la operación vive en el marco y no en una pantalla: sigue
         ahí al cambiar de sección, que es justo lo que hace falta mientras algo
         se instala. -->
    <PanelDeOperacion />
  </WindowAppLayout>
</template>
