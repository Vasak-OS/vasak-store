/**
 * Qué forma del selector de secciones entra en el lugar que hay.
 *
 * Es la cuenta sola, sin DOM, para poder probarla en cualquier ancho: la barra
 * no se tiene que poder desplazar nunca, así que una forma va **sólo si entra
 * entera**, y si no, la siguiente más chica. El menú es el piso: un botón, que
 * por debajo de `COMPACT_BELOW` queda en el icono.
 *
 * Sin medidas —antes de maquetar, o en una prueba sin maquetación— va la de
 * siempre, la de los nombres: es la que corresponde al ancho habitual, y un
 * cero es «todavía no se midió», no «no hay lugar».
 */

export type SectionShape = 'labels' | 'icons' | 'menu';

export function pickSectionShape(room: number, labels: number, icons: number): SectionShape {
	if (room <= 0 || labels <= 0) return 'labels';
	if (labels <= room) return 'labels';
	// Sin la medida de los iconos no se sabe si entran: el menú entra seguro.
	if (icons > 0 && icons <= room) return 'icons';
	return 'menu';
}
