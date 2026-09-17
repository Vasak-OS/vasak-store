<script lang="ts" setup>
/**
 * Qué arrastra la operación, antes de confirmarla.
 *
 * Se muestra siempre, incluso cuando no arrastra nada más que lo pedido: el
 * valor de esta pantalla es que la persona sepa **qué se lleva puesto** una
 * desinstalación, y eso sólo se aprende si el diálogo aparece también las veces
 * en que la respuesta es «nada».
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { computed } from 'vue';
import BotonAccion from '@/components/ui/BotonAccion.vue';
import ModalBase from '@/components/ui/ModalBase.vue';
import type { Previsualizacion } from '@/tools/api';
import { bytes } from '@/tools/formato';

const props = defineProps<{ abierto: boolean; informe: Previsualizacion | null; titulo: string }>();
const emit = defineEmits<{ cerrar: []; confirmar: [] }>();
const { t } = useI18n();

const grupos = computed(() => {
	if (!props.informe) {
		return [];
	}
	return [
		{ clave: 'seInstalan', lista: props.informe.instalar },
		{ clave: 'seActualizan', lista: props.informe.actualizar },
		{ clave: 'seQuitan', lista: props.informe.quitar },
	].filter((grupo) => grupo.lista.length > 0);
});

const sePuede = computed(() => (props.informe?.conflictos.length ?? 0) === 0);
</script>
<template>
  <ModalBase :abierto="abierto" :titulo="titulo" @cerrar="emit('cerrar')">
    <div v-if="informe" class="flex flex-col gap-4">
      <div v-if="informe.conflictos.length > 0" class="flex flex-col gap-1">
        <p class="font-medium text-sm text-status-error">{{ t('operacion.conflictos') }}</p>
        <p v-for="motivo in informe.conflictos" :key="motivo" class="text-sm leading-relaxed">
          {{ motivo }}
        </p>
      </div>

      <section v-for="grupo in grupos" :key="grupo.clave" class="flex flex-col gap-1">
        <h3 class="font-medium text-sm">
          {{ t(`operacion.${grupo.clave}`) }}
          <span class="text-tx-muted">({{ grupo.lista.length }})</span>
        </h3>
        <ul class="flex flex-wrap gap-x-3 gap-y-1 text-tx-muted text-xs">
          <li v-for="paquete in grupo.lista" :key="paquete.nombre">
            {{ paquete.nombre }}
            <span v-if="paquete.version_nueva">
              {{ paquete.version }} → {{ paquete.version_nueva }}
            </span>
            <span v-else>{{ paquete.version }}</span>
          </li>
        </ul>
      </section>

      <dl class="flex flex-wrap gap-x-6 gap-y-1 border-ui-border border-t pt-3 text-sm">
        <div class="flex gap-2">
          <dt class="text-tx-muted">{{ t('operacion.descarga') }}</dt>
          <dd>{{ bytes(informe.descarga) }}</dd>
        </div>
        <div class="flex gap-2">
          <dt class="text-tx-muted">
            {{ informe.espacio >= 0 ? t('operacion.espacioSuma') : t('operacion.espacioResta') }}
          </dt>
          <dd>{{ bytes(Math.abs(informe.espacio)) }}</dd>
        </div>
      </dl>
    </div>

    <template #pie>
      <BotonAccion @click="emit('cerrar')">{{ t('comun.cancelar') }}</BotonAccion>
      <BotonAccion tono="principal" :deshabilitado="!sePuede" @click="emit('confirmar')">
        {{ t('operacion.confirmar') }}
      </BotonAccion>
    </template>
  </ModalBase>
</template>
