<script lang="ts" setup>
/**
 * Qué arrastra la operación, antes de confirmarla.
 *
 * Se muestra siempre, incluso cuando no arrastra nada más que lo pedido: el
 * valor de esta pantalla es que la persona sepa **qué se lleva puesto** una
 * desinstalación, y eso sólo se aprende si el diálogo aparece también las veces
 * en que la respuesta es «nada».
 *
 * Los totales van en la `PropertyList` de la librería, en línea: la etiqueta y
 * el valor juntos, como estaban, y partiéndose en renglones si no entran.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { ActionButton, PropertyList } from '@vasakgroup/vue-libvasak';
import { computed } from 'vue';
import AppDialog from '@/components/ui/AppDialog.vue';
import type { Previsualizacion } from '@/tools/api';
import { bytes } from '@/tools/formato';

const props = defineProps<{ open: boolean; report: Previsualizacion | null; title: string }>();
const emit = defineEmits<{ close: []; confirm: [] }>();
const { t } = useI18n();

const groups = computed(() => {
	if (!props.report) {
		return [];
	}
	return [
		{ key: 'seInstalan', list: props.report.instalar },
		{ key: 'seActualizan', list: props.report.actualizar },
		{ key: 'seQuitan', list: props.report.quitar },
	].filter((group) => group.list.length > 0);
});

const allowed = computed(() => (props.report?.conflictos.length ?? 0) === 0);

const totals = computed(() => {
	const report = props.report;
	if (!report) {
		return [];
	}
	return [
		{ label: t('operacion.descarga'), value: bytes(report.descarga) },
		{
			label: report.espacio >= 0 ? t('operacion.espacioSuma') : t('operacion.espacioResta'),
			value: bytes(Math.abs(report.espacio)),
		},
	];
});
</script>
<template>
  <AppDialog :open="open" :title="title" @close="emit('close')">
    <div v-if="report" class="flex flex-col gap-4">
      <div v-if="report.conflictos.length > 0" class="flex flex-col gap-1">
        <p class="font-medium text-sm text-status-error">{{ t('operacion.conflictos') }}</p>
        <p v-for="reason in report.conflictos" :key="reason" class="text-sm leading-relaxed">
          {{ reason }}
        </p>
      </div>

      <section v-for="group in groups" :key="group.key" class="flex flex-col gap-1">
        <h3 class="font-medium text-sm">
          {{ t(`operacion.${group.key}`) }}
          <span class="text-tx-muted">({{ group.list.length }})</span>
        </h3>
        <ul class="flex flex-wrap gap-x-3 gap-y-1 text-tx-muted text-xs">
          <li v-for="pkg in group.list" :key="pkg.nombre">
            {{ pkg.nombre }}
            <span v-if="pkg.version_nueva">
              {{ pkg.version }} → {{ pkg.version_nueva }}
            </span>
            <span v-else>{{ pkg.version }}</span>
          </li>
        </ul>
      </section>

      <div class="border-ui-line-weak border-t pt-3">
        <PropertyList :items="totals" layout="inline" />
      </div>
    </div>

    <template #footer>
      <ActionButton variant="secondary" :label="t('comun.cancelar')" @click="emit('close')" />
      <ActionButton :label="t('operacion.confirmar')" :disabled="!allowed" @click="emit('confirm')" />
    </template>
  </AppDialog>
</template>
