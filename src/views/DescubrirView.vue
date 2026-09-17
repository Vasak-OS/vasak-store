<script setup lang="ts">
/**
 * La portada.
 *
 * Dos filas y las categorías. Los nombres de las filas dicen lo que las filas
 * son: «Para descubrir» es un sorteo diario y «Actualizados hace poco» es la
 * fecha de construcción del paquete. No hay «más descargadas» ni «tendencias»
 * porque ese dato no existe en la máquina —nadie lleva la cuenta de qué instala
 * la gente— y ponerle ese título a otra cosa sería inventarlo.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import BarraDeBusqueda from '@/components/tienda/BarraDeBusqueda.vue';
import RejillaDeApps from '@/components/tienda/RejillaDeApps.vue';
import EstadoVacio from '@/components/ui/EstadoVacio.vue';
import IndicadorDeCarga from '@/components/ui/IndicadorDeCarga.vue';
import { useReactiveIcons } from '@/composables/useReactiveIcon';
import { type Descubrimiento, descubrir } from '@/tools/api';
import { claveSegunCantidad, interpolar } from '@/tools/interpolar';

const { t } = useI18n();
const router = useRouter();

const datos = ref<Descubrimiento | null>(null);
const cargando = ref(true);

const { juegos, desarrollo, productividad, multimedia, sistema, utilidades } = useReactiveIcons({
	juegos: { name: 'applications-games', type: 'icon' },
	desarrollo: { name: 'applications-development', type: 'icon' },
	productividad: { name: 'applications-office', type: 'icon' },
	multimedia: { name: 'applications-multimedia', type: 'icon' },
	sistema: { name: 'applications-system', type: 'icon' },
	utilidades: { name: 'applications-utilities', type: 'icon' },
});
const iconos: Record<string, { value: string }> = {
	juegos,
	desarrollo,
	productividad,
	multimedia,
	sistema,
	utilidades,
};

onMounted(async () => {
	try {
		datos.value = await descubrir();
	} finally {
		cargando.value = false;
	}
});

function buscar(texto: string) {
	if (texto.trim()) {
		router.push({ name: 'buscar', query: { q: texto } });
	}
}

function cuantas(n: number) {
	return interpolar(t(`categorias.${claveSegunCantidad('cuantas', n)}`), n);
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-4">
    <BarraDeBusqueda :valor="''" :con-aur="false" @buscar="buscar" />

    <IndicadorDeCarga v-if="cargando" />

    <EstadoVacio
      v-else-if="!datos || datos.categorias.every((c) => c.cuantas === 0)"
      icono="system-software-install"
      :titulo="t('descubrir.vacio')"
      :nota="t('descubrir.vacioNota')" />

    <template v-else>
      <section class="flex flex-col gap-2">
        <h2 class="font-medium text-base">{{ t('categorias.titulo') }}</h2>
        <div
          class="grid gap-2"
          style="grid-template-columns: repeat(auto-fill, minmax(min(100%, 12rem), 1fr))">
          <button
            v-for="categoria in datos.categorias"
            :key="categoria.id"
            type="button"
            class="flex items-center gap-3 rounded-corner border border-ui-border bg-ui-surface/40 p-3 text-left transition-colors hover:bg-ui-surface"
            @click="router.push({ name: 'categoria', params: { id: categoria.id } })">
            <img v-if="iconos[categoria.id]?.value" :src="iconos[categoria.id].value" class="h-7 w-7" alt="">
            <span class="flex min-w-0 flex-col">
              <span class="truncate font-medium text-sm">{{ t(`categorias.${categoria.id}`) }}</span>
              <span class="text-tx-muted text-xs">{{ cuantas(categoria.cuantas) }}</span>
            </span>
          </button>
        </div>
      </section>

      <section v-if="datos.seleccion.length > 0" class="flex flex-col gap-2">
        <h2 class="font-medium text-base">{{ t('descubrir.seleccion') }}</h2>
        <p class="text-tx-muted text-xs leading-relaxed">{{ t('descubrir.seleccionNota') }}</p>
        <RejillaDeApps :apps="datos.seleccion" />
      </section>

      <section v-if="datos.novedades.length > 0" class="flex flex-col gap-2">
        <h2 class="font-medium text-base">{{ t('descubrir.novedades') }}</h2>
        <p class="text-tx-muted text-xs leading-relaxed">{{ t('descubrir.novedadesNota') }}</p>
        <RejillaDeApps :apps="datos.novedades" />
      </section>
    </template>
  </div>
</template>
