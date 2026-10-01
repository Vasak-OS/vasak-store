/**
 * Cuánto mide de ancho un elemento, y que se entere cuando cambia.
 *
 * En el WebView de WebKitGTK no llegan ni `matchMedia` ni `resize` (memoria
 * `webkitgtk-no-avisa-de-resize`), así que lo que cambia con el ancho no puede
 * colgarse de la ventana: se cuelga de un `ResizeObserver` sobre el elemento,
 * que además es lo correcto —un componente no sabe en qué ventana vive—.
 *
 * Sin `ResizeObserver` (una prueba sin DOM completo) se lee una vez al montar y
 * queda ahí. Un ancho de cero es «todavía no se maquetó» y no «es angosto»:
 * quien decide con esto tiene que tratar el cero como desconocido.
 */

import { onBeforeUnmount, onMounted, type Ref, ref, watch } from 'vue';

export function useElementWidth(target: Ref<HTMLElement | null>): Ref<number> {
	const width = ref(0);
	let observer: ResizeObserver | null = null;

	function measure() {
		width.value = target.value?.clientWidth ?? 0;
	}

	function observe(element: HTMLElement | null) {
		observer?.disconnect();
		measure();
		if (!element || typeof ResizeObserver === 'undefined') return;
		observer = new ResizeObserver(measure);
		observer.observe(element);
	}

	onMounted(() => observe(target.value));
	// El elemento puede llegar después —un `v-if`— o cambiar de nodo.
	watch(target, (element) => observe(element));
	onBeforeUnmount(() => observer?.disconnect());

	return width;
}
