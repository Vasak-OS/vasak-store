<script lang="ts" setup>
/**
 * El campo de búsqueda, con el interruptor del AUR al lado.
 *
 * Con espera antes de buscar: cada tecla dispararía un recorrido de quince mil
 * paquetes y una consulta al AUR, y el resultado de la penúltima podría llegar
 * después que el de la última y pisarla.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { onUnmounted, ref, watch } from 'vue';
import InterruptorDeOpcion from '@/components/ui/InterruptorDeOpcion.vue';

/** Cuánto se espera tras la última tecla. */
const ESPERA = 250;

const props = withDefaults(
	defineProps<{ valor: string; aur?: boolean; conAur?: boolean; marcador?: string }>(),
	{ aur: false, conAur: true, marcador: undefined }
);
const emit = defineEmits<{ buscar: [texto: string]; cambiarAur: [valor: boolean] }>();
const { t } = useI18n();

const texto = ref(props.valor);
let temporizador: ReturnType<typeof setTimeout> | undefined;

watch(texto, (ahora) => {
	clearTimeout(temporizador);
	temporizador = setTimeout(() => emit('buscar', ahora), ESPERA);
});

onUnmounted(() => clearTimeout(temporizador));
</script>
<template>
  <div class="flex flex-wrap items-center gap-3">
    <input
      v-model="texto"
      type="search"
      :placeholder="marcador ?? t('busqueda.marcador')"
      :aria-label="marcador ?? t('busqueda.marcador')"
      class="min-w-0 flex-1 rounded-corner-sm border border-ui-border-strong bg-ui-bg px-3 py-1.5 text-sm outline-none focus:border-primary"
      @keydown.enter="emit('buscar', texto)">
    <label v-if="conAur" class="flex items-center gap-2 text-sm" :title="t('busqueda.incluirAurNota')">
      <InterruptorDeOpcion
        :valor="aur"
        :etiqueta="t('busqueda.incluirAur')"
        @cambiar="(valor) => emit('cambiarAur', valor)" />
      {{ t('busqueda.incluirAur') }}
    </label>
  </div>
</template>
