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
		{
			path: '/buscar',
			name: 'buscar',
			component: () => import('@/views/BuscarView.vue'),
		},
		{
			path: '/categoria/:id',
			name: 'categoria',
			component: () => import('@/views/CategoriaView.vue'),
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
