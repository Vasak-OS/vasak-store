/**
 * Números y fechas, como se leen.
 */

/**
 * Bytes en algo que una persona pueda leer.
 *
 * En base 1024 y con las unidades de siempre —KB, MB, GB— que es lo que pacman
 * muestra y lo que dice la etiqueta de cualquier disco. Usar KiB sería más
 * correcto y nadie lo reconocería.
 */
export function bytes(cantidad: number): string {
	const signo = cantidad < 0 ? '-' : '';
	let resto = Math.abs(cantidad);
	const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
	let unidad = 0;
	while (resto >= 1024 && unidad < unidades.length - 1) {
		resto /= 1024;
		unidad += 1;
	}
	// Sin decimales para los bytes sueltos: «512,0 B» no informa nada más que
	// «512 B» y ocupa más.
	const decimales = unidad === 0 ? 0 : resto < 10 ? 1 : 0;
	return `${signo}${resto.toFixed(decimales)} ${unidades[unidad]}`;
}

/**
 * Una fecha de época en segundos, como día.
 *
 * Con el idioma de la sesión, que es lo que hace que un 03/04 no se lea como
 * abril en una máquina y como marzo en otra.
 */
export function fecha(segundos: number | null | undefined, idioma = 'es'): string {
	if (!segundos) {
		return '';
	}
	return new Date(segundos * 1000).toLocaleDateString(idioma, {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
}

/**
 * Qué parte de la operación se lleva hecha, entre 0 y 1.
 *
 * Devuelve `null` cuando no se puede saber —total en cero— para que la barra
 * pueda mostrarse indeterminada en vez de clavada en 0 %, que se lee como
 * «trabado».
 */
export function avance(hecho: number, total: number): number | null {
	if (!total || total <= 0) {
		return null;
	}
	return Math.min(1, Math.max(0, hecho / total));
}
