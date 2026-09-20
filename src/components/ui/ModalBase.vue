<script lang="ts" setup>
/**
 * Una ventana modal de la tienda: la de la librería, con la disposición de acá.
 *
 * Lo difícil ya no vive en este archivo. El foco que entra al abrir, el Tab que
 * da la vuelta adentro en vez de seguir recorriendo lo que quedó detrás del
 * velo —invisible pero alcanzable—, el foco que vuelve a donde estaba al
 * cerrar, Escape, y el `aria-labelledby` atado al título: todo eso es de
 * `Dialog`. Esta copia declaraba `aria-modal` y cumplía sólo una parte.
 *
 * Lo que la tienda pone encima es su forma: más ancha que el diálogo por
 * omisión —adentro va la receta de un paquete y una captura de pantalla— y con
 * el cuerpo desplazándose por su cuenta entre una cabecera y un pie fijos, que
 * es lo que deja leer una receta larga sin perder los botones de vista.
 */
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@vasakgroup/vue-libvasak';

defineProps<{ abierto: boolean; titulo: string }>();
const emit = defineEmits<{ cerrar: [] }>();
</script>

<template>
  <Dialog :open="abierto" @update:open="(sigue: boolean) => !sigue && emit('cerrar')">
    <!-- `p-0` porque el relleno va por tramo: la cabecera y el pie lo llevan
         con su borde, y el cuerpo lo lleva adentro de lo que se desplaza. Con
         el relleno afuera, el contenido se iba por debajo del borde al rodar. -->
    <DialogContent class="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden p-0">
      <DialogHeader class="border-ui-border border-b px-4 py-3">
        <DialogTitle class="font-medium text-sm">{{ titulo }}</DialogTitle>
      </DialogHeader>
      <div class="min-h-0 flex-1 overflow-auto p-4">
        <slot />
      </div>
      <DialogFooter v-if="$slots.pie" class="border-ui-border border-t px-4 py-3">
        <slot name="pie" />
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
