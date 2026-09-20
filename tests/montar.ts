/**
 * Montar una vista, que no se monta sola.
 *
 * Una vista pide dos cosas que un componente suelto no: el router —`useRoute`
 * para leer la ruta, `useRouter` para navegar— y pinia. Sin ellas el montaje
 * falla en el `setup`, antes de llegar a nada que valga la pena comprobar.
 *
 * El router es uno de memoria con las mismas rutas por nombre que el de verdad,
 * pero apuntando a componentes vacíos: lo que se comprueba de navegar es **a
 * dónde** se va, no qué se dibuja al llegar. Y de memoria y no con hash porque
 * `happy-dom` no tiene barra de direcciones que recordar.
 */

import { DOMWrapper, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { type Component, h } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

const Nada: Component = { render: () => h('div') };

/** Las rutas del router de verdad, con el destino vacío. */
const RUTAS = [
	{ path: '/', redirect: '/descubrir' },
	{ path: '/descubrir', name: 'descubrir', component: Nada },
	{ path: '/instaladas', name: 'instaladas', component: Nada },
	{ path: '/actualizaciones', name: 'actualizaciones', component: Nada },
	{ path: '/repositorios', name: 'repositorios', component: Nada },
	{ path: '/app/:origen/:nombre', name: 'detalle', component: Nada },
];

export async function unRouter(donde = '/descubrir'): Promise<Router> {
	const router = createRouter({ history: createMemoryHistory(), routes: RUTAS });
	await router.push(donde);
	await router.isReady();
	return router;
}

/**
 * Monta una vista en una ruta.
 *
 * Devuelve también el router, que es donde se mira a dónde llevó un clic.
 */
/** Lo montado por acá, para poder desmontarlo pase lo que pase. */
const montadas = new Set<VueWrapper>();

/**
 * Desmonta todo lo que se montó y deja el `body` limpio.
 *
 * Va en un `afterEach`, no al final de cada prueba: una aserción que falla se
 * saltea lo que venga después. Y hace falta desde que los diálogos se
 * teletransportan al `body`: un panel que queda puesto es el que encuentra la
 * prueba siguiente al preguntar por `[role="dialog"]`, que entonces falla por
 * algo que no tiene nada que ver con ella.
 */
export function desmontarTodo() {
	for (const vista of montadas) vista.unmount();
	montadas.clear();
	for (const suelto of document.body.querySelectorAll('[role="dialog"]')) {
		suelto.parentElement?.remove();
	}
}

/**
 * El diálogo abierto, que no cuelga del montaje.
 *
 * Se teletransporta al `body` para no quedar recortado por el `overflow` de la
 * lista que lo abrió, así que buscarlo dentro de la vista no lo encuentra.
 */
export function elDialogo(): DOMWrapper<HTMLElement> {
	const panel = document.body.querySelector<HTMLElement>('[role="dialog"]');
	if (!panel) {
		throw new Error('no hay ningún diálogo abierto');
	}
	return new DOMWrapper(panel);
}

/**
 * Cómo se anuncia el diálogo abierto.
 *
 * Por `aria-labelledby` apuntando a su título y no por un `aria-label` puesto a
 * mano: así el nombre que oye un lector de pantalla es **el mismo texto** que
 * se ve, y no puede quedar desfasado del que se dibuja.
 */
export function nombreDelDialogo(): string | undefined {
	const id = elDialogo().attributes('aria-labelledby');
	return id ? (document.getElementById(id)?.textContent ?? undefined) : undefined;
}

/** Si hay alguno abierto, sin reventar cuando no. */
export function hayDialogo(): boolean {
	return document.body.querySelector('[role="dialog"]') !== null;
}

export async function montarVista(vista: Component, donde = '/descubrir') {
	const router = await unRouter(donde);
	const pinia = createPinia();
	// Activo además de instalado: así una prueba puede pedir el store con
	// `useOperaciones()` y mirar lo mismo que está mirando la vista.
	setActivePinia(pinia);
	const vino = mount(vista, { global: { plugins: [pinia, router] }, attachTo: document.body });
	montadas.add(vino);
	return { vista: vino, router };
}

/**
 * Deja que terminen las promesas pendientes del montaje.
 *
 * Una vista pide sus datos en `onMounted` y encadena varios `await`, así que un
 * solo `nextTick` deja el DOM a mitad de camino.
 */
export async function asentar(vueltas = 8) {
	for (let i = 0; i < vueltas; i++) {
		await Promise.resolve();
		await new Promise((sigue) => setTimeout(sigue, 0));
	}
}
