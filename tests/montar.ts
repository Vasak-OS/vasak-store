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

import { mount } from '@vue/test-utils';
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
export async function montarVista(vista: Component, donde = '/descubrir') {
	const router = await unRouter(donde);
	const pinia = createPinia();
	// Activo además de instalado: así una prueba puede pedir el store con
	// `useOperaciones()` y mirar lo mismo que está mirando la vista.
	setActivePinia(pinia);
	const vino = mount(vista, { global: { plugins: [pinia, router] } });
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
