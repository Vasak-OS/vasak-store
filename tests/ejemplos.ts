/**
 * Los datos de ejemplo que las pruebas montadas le pasan a los componentes.
 *
 * Una `Tarjeta` tiene doce campos y casi ninguna prueba mira más de dos. Armarla
 * entera en cada prueba escondía cuál era el campo que importaba entre once que
 * daban igual; acá se arma una válida y cada prueba cambia sólo lo suyo.
 */

import type { Captura, Detalle, Tarjeta } from '@/tools/api';

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

/** La ficha entera, que es la tarjeta más todo lo que sólo se ve en el detalle. */
export function unaFicha(cambios: Partial<Detalle> = {}): Detalle {
	return {
		...unaApp(),
		descripcion: 'Un estudio de pintura digital y de dibujo.',
		capturas: [],
		web: 'https://krita.org',
		licencia: 'GPL-3.0-or-later',
		autor: 'KDE',
		empaquetador: 'Antonio Rojas',
		arquitectura: 'x86_64',
		descarga: 89_128_960,
		construido: 1_700_000_000,
		instalado_el: null,
		dependencias: ['qt5-base', 'kseexpr'],
		opcionales: [],
		requerido_por: [],
		...cambios,
	};
}

/** Unas capturas, ya bajadas a la caché. */
export function unasCapturas(cuantas = 3): Captura[] {
	return Array.from({ length: cuantas }, (_, i) => ({
		ruta: `/var/cache/tienda/krita-${i + 1}.png`,
		titulo: `Captura ${i + 1}`,
	}));
}
