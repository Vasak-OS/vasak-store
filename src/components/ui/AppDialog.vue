<script lang="ts" setup>
/**
 * Una ventana modal de la tienda: la de la librería, armada con sus piezas.
 *
 * Lo difícil no vive en este archivo. El foco que entra al abrir, el Tab que
 * da la vuelta adentro en vez de seguir recorriendo lo que quedó detrás del
 * velo, el foco que vuelve a donde estaba al cerrar, Escape, y el
 * `aria-labelledby` atado al título: todo eso es de `Dialog`.
 *
 * Lo que la tienda elige es la composición: el ancho grande (`lg`) —adentro va
 * la receta de un paquete y una captura de pantalla—, el botón de cerrar en la
 * cabecera (`DialogHeader closable`) y el cuerpo en `DialogBody`, que se
 * desplaza por su cuenta entre una cabecera y un pie fijos: así se lee una
 * receta larga sin perder los botones de vista. Ya no dibuja bordes ni
 * rellenos propios entre los tramos; el espaciado es el de la librería.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@vasakgroup/vue-libvasak';

defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
</script>

<template>
  <Dialog :open="open" @update:open="(stillOpen: boolean) => !stillOpen && emit('close')">
    <DialogContent size="lg" class="max-h-[85vh]">
      <DialogHeader closable :close-label="t('comun.cerrar')">
        <DialogTitle>{{ title }}</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <slot />
      </DialogBody>
      <DialogFooter v-if="$slots.footer">
        <slot name="footer" />
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
