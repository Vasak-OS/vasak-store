<script lang="ts" setup>
/**
 * El botón de instalar de una tarjeta.
 *
 * Es el `ActionButton` de la librería, chico. La píldora propia que tenía
 * (`rounded-full`, con el primario en claro) pasó a la forma del resto de los
 * botones del taller, `rounded-corner-m`; el estado se dice con la variante:
 * lo que la tarjeta ofrece va en `primary` y se ve antes que el resto del
 * texto, lo que sólo informa va apagado, y lo que espera su turno, `loading`.
 *
 * Seis estados, y los seis dicen algo distinto:
 *
 * - no instalado → **Instalar**, en primer plano;
 * - ya apretado, esperando su turno → **En cola**, apagado: el candado de
 *   pacman admite un solo dueño, así que lo que se apreta mientras algo corre
 *   espera en vez de fallar;
 * - hay versión nueva → **Actualizar**, con el color de aviso;
 * - instalado y al día → **Instalado**, apagado y sin acción, que informa sin
 *   ofrecer nada;
 * - **del AUR → «Ver la receta»**, que abre la ficha en vez de instalar;
 * - con una operación en curso → todos deshabilitados, porque el candado de
 *   pacman admite un solo dueño y el servicio rechazaría la segunda.
 *
 * # Por qué el AUR no tiene botón de instalar
 *
 * Porque instalar algo del AUR es compilar un guión que subió cualquiera, y la
 * política de la distribución pide tener el PKGBUILD delante antes. Ese control
 * vive en la ficha. Un botón «Instalar» acá lo saltearía —o, peor, fallaría con
 * «no hay ningún paquete llamado X», porque el servicio sólo instala de los
 * repositorios— y en los dos casos estaría ofreciendo algo que no hace.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { ActionButton } from '@vasakgroup/vue-libvasak';
import { computed, withKeys, withModifiers } from 'vue';
import type { Tarjeta } from '@/tools/api';

const props = withDefaults(defineProps<{ app: Tarjeta; busy: boolean; queued?: boolean }>(), {
	queued: false,
});
const emit = defineEmits<{ install: []; update: []; recipe: [] }>();
const { t } = useI18n();

type State = 'receta' | 'enCola' | 'actualizar' | 'instalada' | 'instalar';

/** El estado, con el nombre de su texto en el catálogo (`tarjeta.*`). */
const state = computed<State>(() => {
	if (props.app.origen === 'aur') {
		return 'receta';
	}
	if (props.queued) {
		return 'enCola';
	}
	if (props.app.actualizable) {
		return 'actualizar';
	}
	return props.app.instalada ? 'instalada' : 'instalar';
});

const VARIANT: Record<State, 'primary' | 'secondary' | 'ghost'> = {
	instalar: 'primary',
	actualizar: 'primary',
	receta: 'secondary',
	enCola: 'secondary',
	instalada: 'ghost',
};

/**
 * Enter y espacio no suben a la tarjeta, que se abre con las mismas teclas; el
 * clic tampoco (`stop-propagation`): sin cortarlo, instalar abría además la
 * ficha.
 *
 * Va por `v-bind` y no como `@keydown.enter.stop`: `ActionButton` no declara
 * `keydown` —le llega como atributo y lo pone en su `<button>`— y
 * `strictTemplates` mide contra las propiedades declaradas.
 */
const KEYS = {
	onKeydown: withKeys(
		withModifiers(() => {}, ['stop']),
		['enter', 'space']
	),
};

function press() {
	if (state.value === 'receta') {
		emit('recipe');
		return;
	}
	if (state.value === 'actualizar') {
		emit('update');
		return;
	}
	if (state.value === 'instalar') {
		emit('install');
	}
}
</script>

<template>
  <ActionButton
    :label="t(`tarjeta.${state}`)"
    :variant="VARIANT[state]"
    size="sm"
    class="shrink-0"
    :loading="state === 'enCola'"
    :disabled="state === 'instalada' || (busy && state !== 'receta')"
    stop-propagation
    v-bind="KEYS"
    @click="press" />
</template>
