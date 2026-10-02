<script lang="ts" setup>
/**
 * Las cuatro secciones.
 *
 * Es el `SegmentedControl` de la librería en su modo de navegación: con un
 * `href` en cada opción dibuja un `<nav>` con enlaces y no un grupo de
 * pestañas, aunque se parezca a uno. Cada uno **cambia la ruta** y lo que hay
 * debajo es una pantalla entera, no un panel asociado; anunciarlo como pestañas
 * obliga a un lector de pantalla a buscar un `tabpanel` que no existe. La
 * sección en la que se está va con `aria-current="page"`, que pone el control.
 *
 * El enlace lleva el `href` del enrutador —con su `#`, porque la historia es
 * de hash— y el clic se resuelve con `router.push`: así se navega igual que con
 * el `RouterLink` de antes, sin recargar nada.
 *
 * # Cuando no entra
 *
 * Con la ventana en su ancho habitual se ve igual que siempre: los cuatro
 * nombres. Más angosta, la barra no tiene lugar para ellos —antes se cortaban
 * y había que desplazar la barra para llegar a «Repositorios»—, así que pasa a
 * los cuatro iconos con el nombre como globo, y si tampoco entran, a un solo
 * botón con la sección actual que abre el menú de las cuatro, como en una
 * aplicación de teléfono. Qué entra se decide **midiendo**: dos copias
 * invisibles del control dicen cuánto ocupa cada forma en el idioma que esté
 * puesto, y un `ResizeObserver` dice cuánto lugar hay (memoria
 * `webkitgtk-no-avisa-de-resize`).
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	ActionButton,
	Badge,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	SegmentedControl,
	type SegmentedOption,
} from '@vasakgroup/vue-libvasak';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { pickSectionShape, type SectionShape } from '@/components/bar/section-shape';
import { useElementWidth } from '@/composables/useElementWidth';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const SECTIONS = ['descubrir', 'instaladas', 'actualizaciones', 'repositorios'] as const;
type Section = (typeof SECTIONS)[number];

/** El icono de cada sección, para cuando el nombre no entra. */
const ICONS: Record<Section, string> = {
	descubrir: 'go-home-symbolic',
	instaladas: 'view-app-grid-symbolic',
	actualizaciones: 'software-update-available-symbolic',
	repositorios: 'network-server-symbolic',
};

/**
 * Qué sección se ve como activa.
 *
 * Las pantallas que cuelgan de una sección la mantienen encendida: mirando la
 * ficha de un programa que se llegó desde Descubrir, el selector sigue en
 * Descubrir en vez de apagarse entero.
 */
const active = computed<Section | null>(() => {
	const name = String(route.name ?? '');
	if (SECTIONS.includes(name as Section)) {
		return name as Section;
	}
	if (name === 'categoria' || name === 'detalle' || name === 'buscar') {
		return 'descubrir';
	}
	return null;
});

/** Cuántas actualizaciones hay, para la insignia. */
const props = defineProps<{ pending?: number }>();
const badge = computed(() => ((props.pending ?? 0) > 0 ? props.pending : undefined));

function options(iconOnly: boolean): SegmentedOption<Section>[] {
	return SECTIONS.map((section) => ({
		value: section,
		label: t(`secciones.${section}`),
		href: router.resolve({ name: section }).href,
		icon: iconOnly ? ICONS[section] : undefined,
		iconOnly,
		badge: section === 'actualizaciones' ? badge.value : undefined,
		badgeTone: 'warning',
	}));
}

const withLabels = computed(() => options(false));
const withIcons = computed(() => options(true));

function go(section: Section, event?: MouseEvent) {
	event?.preventDefault();
	router.push({ name: section });
}

const root = ref<HTMLElement | null>(null);
const labelsProbe = ref<HTMLElement | null>(null);
const iconsProbe = ref<HTMLElement | null>(null);
const available = useElementWidth(root);
// Las copias también se observan: la insignia aparece cuando llega la cuenta
// de actualizaciones, y con ella el control pasa a ocupar más.
const labelsWidth = useElementWidth(labelsProbe);
const iconsWidth = useElementWidth(iconsProbe);

/** La forma que entra, con el criterio de `section-shape.ts`. */
const shape = computed<SectionShape>(() =>
	pickSectionShape(available.value, labelsWidth.value, iconsWidth.value)
);

const activeLabel = computed(() => t(`secciones.${active.value ?? 'descubrir'}`));

/**
 * Por debajo de esto ni el botón del menú entra con su nombre: a 240 de
 * ventana se cortaba en «Descubri». Ahí queda el icono de la sección, con el
 * nombre como globo y como nombre accesible.
 */
const COMPACT_BELOW = 140;
const compact = computed(() => available.value > 0 && available.value < COMPACT_BELOW);
</script>
<template>
  <div ref="root" class="relative flex w-full min-w-0 justify-center" :data-shape="shape">
    <!-- Las dos copias que miden. Invisibles e inertes: no se ven, no se
         recorren con el teclado y un lector de pantalla no las lee. Y van en
         una caja de 0×0 que recorta: `invisible` y `absolute` no las sacan del
         desborde, y la barra de `AppBar` es `overflow-auto`, así que las dos
         copias apiladas le daban scroll siempre —el doble de alto— y la de los
         nombres, además, scroll de costado en cuanto no entraba. Recortadas
         miden lo mismo: cada una es `w-max` y no depende de su caja. -->
    <div aria-hidden="true" inert class="pointer-events-none invisible absolute top-0 left-0 flex size-0 flex-col overflow-hidden">
      <div ref="labelsProbe" class="w-max"><SegmentedControl :model-value="active" :options="withLabels" label="" /></div>
      <div ref="iconsProbe" class="w-max"><SegmentedControl :model-value="active" :options="withIcons" label="" /></div>
    </div>

    <DropdownMenu v-if="shape === 'menu'">
      <DropdownMenuTrigger as-child>
        <ActionButton
          :label="compact ? '' : activeLabel"
          :icon-alt="activeLabel"
          :title="compact ? activeLabel : t('secciones.navegacion')"
          variant="secondary"
          :icon="ICONS[active ?? 'descubrir']"
          class="max-w-full" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        <DropdownMenuItem
          v-for="section in SECTIONS"
          :key="section"
          :icon="ICONS[section]"
          toggle="radio"
          :checked="active === section"
          @select="go(section)">
          {{ t(`secciones.${section}`) }}
          <Badge v-if="section === 'actualizaciones' && badge" :label="badge" tone="warning" variant="solid" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <SegmentedControl
      v-else
      :model-value="active"
      :options="shape === 'icons' ? withIcons : withLabels"
      :label="t('secciones.navegacion')"
      @navigate="go" />
  </div>
</template>
