<script lang="ts" setup>
/**
 * De dónde sale un programa, a simple vista.
 *
 * Es el `Badge` de la librería con contorno. La del AUR es la que importa: la
 * distribución lo trata como inseguro, y una insignia que se distinga sólo por
 * un tono de gris no comunica eso. Va con el tono de advertencia y con el texto
 * explicándolo al pasar por encima.
 *
 * La de los AppImage conserva el color secundario del esquema que tenía, por
 * `color`: el `Badge` no tiene un tono «secundario», y pasarla al primario la
 * confundiría con lo seleccionado.
 *
 * La nota va por `v-bind` porque `Badge` no declara `title`: le llega como
 * atributo a su raíz, y `strictTemplates` mide contra las propiedades.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { Badge, type BadgeTone } from '@vasakgroup/vue-libvasak';
import { computed } from 'vue';
import type { Origen } from '@/tools/api';

const props = defineProps<{ origin: Origen; repository?: string }>();
const { t } = useI18n();

const tone = computed<BadgeTone>(() => (props.origin === 'aur' ? 'warning' : 'neutral'));
const color = computed(() => (props.origin === 'appimage' ? 'var(--color-secondary)' : undefined));
const label = computed(() =>
	props.origin === 'repositorio' && props.repository
		? props.repository
		: t(`origen.${props.origin}`)
);
</script>
<template>
  <Badge
    variant="outline"
    :tone="tone"
    :color="color"
    :label="label"
    v-bind="{ title: t(`origen.${origin}Nota`) }" />
</template>
