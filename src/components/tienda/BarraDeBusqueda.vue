<script lang="ts" setup>
/**
 * El campo de búsqueda.
 *
 * Con espera antes de buscar: cada tecla dispararía un recorrido de quince mil
 * paquetes y una consulta al AUR, y el resultado de la penúltima podría llegar
 * después que el de la última y pisarla.
 *
 * El interruptor del AUR **no está acá**. Estuvo, y era el lugar equivocado:
 * prender el AUR no es una forma de buscar sino agregar una fuente de paquetes
 * con otro nivel de confianza, y eso es el tema de la pantalla de Repositorios.
 * Acá era además una opción que se olvidaba al cerrar la ventana.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { onUnmounted, ref, watch } from 'vue';
import CampoDeTexto from '@/components/ui/CampoDeTexto.vue';

/** Cuánto se espera tras la última tecla. */
const ESPERA = 250;

const props = withDefaults(defineProps<{ valor: string; marcador?: string }>(), {
	marcador: undefined,
});
const emit = defineEmits<{ buscar: [texto: string] }>();
const { t } = useI18n();

const texto = ref(props.valor);
let temporizador: ReturnType<typeof setTimeout> | undefined;

watch(texto, (ahora) => {
	clearTimeout(temporizador);
	temporizador = setTimeout(() => emit('buscar', ahora), ESPERA);
});

/**
 * Buscar ya, sin esperar.
 *
 * Cancela lo que hubiera pendiente: sin eso, apretar Enter dispara la búsqueda
 * y doscientos milisegundos después el temporizador dispara **otra** con el
 * mismo texto.
 */
function ahora() {
	clearTimeout(temporizador);
	emit('buscar', texto.value);
}

onUnmounted(() => clearTimeout(temporizador));
</script>
<template>
  <CampoDeTexto
    v-model="texto"
    type="search"
    :placeholder="marcador ?? t('busqueda.marcador')"
    :etiqueta="marcador ?? t('busqueda.marcador')"
    @keydown.enter="ahora" />
</template>
