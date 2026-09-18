/**
 * Las cuatro secciones, más las pantallas que cuelgan de ellas.
 *
 * Con `createWebHashHistory` y no con la de HTML5: la ventana carga desde
 * `tauri://localhost` sin servidor detrás, así que una recarga con una ruta
 * `/instaladas` en la barra pediría un archivo que no existe. Con hash, todo
 * queda del lado del cliente.
 */

import { createRouter, createWebHashHistory } from 'vue-router';

const router = createRouter({
	history: createWebHashHistory(),
	routes: [
		{ path: '/', redirect: '/descubrir' },
		{
			path: '/descubrir',
			name: 'descubrir',
			component: () => import('@/views/DescubrirView.vue'),
		},
		{
			path: '/instaladas',
			name: 'instaladas',
			component: () => import('@/views/InstaladasView.vue'),
		},
		{
			path: '/actualizaciones',
			name: 'actualizaciones',
			component: () => import('@/views/ActualizacionesView.vue'),
		},
		{
			path: '/repositorios',
			name: 'repositorios',
			component: () => import('@/views/RepositoriosView.vue'),
		},
		// Buscar y navegar una categoría son Descubrir con otro estado, y ese
		// estado vive en la query para que atrás y adelante funcionen. Las dos
		// rutas viejas siguen existiendo y redirigen: hay enlaces guardados y
		// una ruta que deja de existir manda a una pantalla en blanco.
		{
			path: '/buscar',
			name: 'buscar',
			redirect: (a) => ({ name: 'descubrir', query: { q: a.query.q } }),
		},
		{
			path: '/categoria/:id',
			name: 'categoria',
			redirect: (a) => ({ name: 'descubrir', query: { cat: a.params.id } }),
		},
		{
			// El origen va en la ruta y no sólo en el estado: una ficha del AUR
			// y una del repositorio pueden llamarse igual, y sin esto volver
			// atrás desde una lista mixta abría la que no era.
			path: '/app/:origen/:nombre',
			name: 'detalle',
			component: () => import('@/views/DetalleView.vue'),
		},
	],
});

export default router;
