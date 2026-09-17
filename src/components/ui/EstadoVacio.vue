<script lang="ts" setup>
/**
 * Cuando no hay nada que mostrar.
 *
 * Con un texto que diga **por qué** no hay nada y, cuando corresponde, qué
 * hacer. Una lista vacía sin explicación se lee como una aplicación rota.
 */
import { useReactiveIcons } from '@/composables/useReactiveIcon';

const props = withDefaults(defineProps<{ icono?: string; titulo: string; nota?: string }>(), {
	icono: 'dialog-information',
	nota: undefined,
});

const { simbolo } = useReactiveIcons({ simbolo: { name: props.icono, type: 'icon' } });
</script>
<template>
  <div class="flex flex-col items-center justify-center gap-3 px-8 py-16 text-center">
    <img v-if="simbolo" :src="simbolo" class="h-12 w-12 opacity-60" alt="">
    <p class="font-medium text-base">{{ titulo }}</p>
    <p v-if="nota" class="max-w-md text-sm text-tx-muted leading-relaxed">{{ nota }}</p>
    <slot />
  </div>
</template>
