/**
 * Los datos de ejemplo que las pruebas montadas le pasan a los componentes.
 *
 * Una `Tarjeta` tiene doce campos y casi ninguna prueba mira más de dos. Armarla
 * entera en cada prueba escondía cuál era el campo que importaba entre once que
 * daban igual; acá se arma una válida y cada prueba cambia sólo lo suyo.
 */

import type { Tarjeta } from '@/tools/api';

export function unaApp(cambios: Partial<Tarjeta> = {}): Tarjeta {
	return {
		nombre: 'krita',
		titulo: 'Krita',
		resumen: 'Pintura digital',
		version: '5.2.6-1',
		origen: 'repositorio',
		repositorio: 'extra',
		instalada: false,
		actualizable: null,
		tamano: 1024,
		icono: { tema: ['krita', 'package-x-generic'] },
		categorias: ['graficos'],
		...cambios,
	};
}

/** Una previsualización que no arrastra nada, para lo que no la mira. */
export function sinArrastre() {
	return { instalar: [], quitar: [], actualizar: [], conflictos: [], descarga: 0, espacio: 0 };
}
