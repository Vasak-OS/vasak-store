/**
 * Ninguna pantalla se dibuja sus propios controles.
 *
 * El buscador tenía su propio borde, su propio relleno y ningún anillo de foco,
 * así que al lado de cualquier otra ventana del escritorio se veía de otra
 * aplicación. La respuesta de entonces fue un componente compartido **dentro de
 * la tienda**, con las clases copiadas de las de Configuración.
 *
 * Copiadas: ése era el techo de esa solución. Ahora el campo, el buscador, el
 * estado vacío, el interruptor y el diálogo vienen de `@vasakgroup/vue-libvasak`
 * y son literalmente los mismos que usan las demás ventanas, así que las clases
 * y su prueba se mudaron allá.
 *
 * Lo que queda por vigilar acá es lo que la mudanza puede deshacer sin avisar:
 * que una pantalla vuelva a escribirse un `<input>`, un `role="switch"` o un
 * `role="dialog"` propios. Nada de eso falla ni avisa —simplemente se ve
 * distinto—, y es exactamente como empezó la vez anterior.
 */

import { describe, expect, test } from 'bun:test';
import { Glob } from 'bun';

const raiz = new URL('../src/', import.meta.url).pathname;

/** Cada `.vue` de la aplicación, con su ruta relativa y su texto. */
const pantallas = await Promise.all(
	[...new Glob('**/*.vue').scanSync(raiz)].map(async (ruta) => ({
		ruta,
		texto: await Bun.file(raiz + ruta).text(),
	}))
);

/** Las que escriben a mano algo que la librería ya da hecho. */
function conteniendo(patron: RegExp): string[] {
	return pantallas.filter(({ texto }) => patron.test(texto)).map(({ ruta }) => ruta);
}

describe('los controles vienen de la librería', () => {
	test('ninguna pantalla se escribe un `<input>`', () => {
		// Es como empezó la vez anterior: un campo propio en el buscador, con
		// otro borde y sin anillo de foco.
		expect(conteniendo(/<input\b/)).toEqual([]);
	});

	test('ni un interruptor propio', () => {
		// El de la librería lleva `role="switch"`, `aria-checked` y nombre
		// accesible, y el pulgar con el contraste que hace ver en qué estado
		// está. Uno escrito a mano empieza sin nada de eso.
		expect(conteniendo(/role="switch"/)).toEqual([]);
	});

	test('ni un diálogo propio', () => {
		// El de la librería atrapa el Tab adentro, devuelve el foco al cerrar y
		// ata su nombre al título. La copia que había acá declaraba `aria-modal`
		// y cumplía sólo una parte.
		expect(conteniendo(/role="dialog"/)).toEqual([]);
	});

	test('y el buscador de la tienda es el compartido', () => {
		// Con el rebote que esta aplicación necesita —cada búsqueda recorre
		// quince mil paquetes y consulta al AUR— pero que ya no se escribe acá.
		const descubrir = pantallas.find(({ ruta }) => ruta.endsWith('DescubrirView.vue'));
		expect(descubrir?.texto).toContain('<SearchField');
		expect(descubrir?.texto).toContain('debounce');
	});
});

describe('y el guardia encuentra lo que busca', () => {
	test('sus patrones reconocen lo que vendrían a atajar', () => {
		// Sin esto, un patrón que dejara de reconocer la forma que busca dejaría
		// las pruebas de arriba en verde sin haber mirado nada.
		const plantado = '<input class="x"> <b role="switch"> <b role="dialog">';
		for (const patron of [/<input\b/, /role="switch"/, /role="dialog"/]) {
			expect(patron.test(plantado)).toBe(true);
		}
	});
});
