/**
 * La barra de arriba no se desplaza nunca.
 *
 * El contenido de la barra de `AppBar` es `overflow-auto`, y el selector de
 * secciones mide sus dos formas con dos copias invisibles adentro de esa caja.
 * `invisible` y `absolute` no sacan a nadie del desborde: las dos copias
 * apiladas le daban a la barra el doble de su alto —scroll vertical a
 * cualquier ancho, medido 76 contra 38 de 200 a 1200 px— y la de los nombres,
 * más ancha que el lugar, también scroll de costado en cuanto la forma pasaba
 * a iconos o a menú.
 *
 * `happy-dom` no maqueta, así que el desborde en sí se midió en el banco
 * (`scrollWidth`/`scrollHeight` contra `clientWidth`/`clientHeight` de la caja,
 * en 40 anchos entre 200 y 1366). Acá se ata lo que lo causa: que las copias
 * vivan en una caja que recorta, y que la forma elegida entre siempre.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mount, type VueWrapper } from '@vue/test-utils';
import SectionSwitcher from '@/components/bar/SectionSwitcher.vue';
import { pickSectionShape } from '@/components/bar/section-shape';
import { asentar, desmontarTodo, unRouter } from './montar';

const sueltos: VueWrapper[] = [];

afterEach(() => {
	for (const vista of sueltos.splice(0)) vista.unmount();
	desmontarTodo();
});

describe('las copias que miden el selector', () => {
	test('van en una caja de 0×0 que recorta, para no desbordar la barra', async () => {
		const router = await unRouter('/descubrir');
		const vista = mount(SectionSwitcher, {
			props: { pending: 3 },
			global: { plugins: [router] },
			attachTo: document.body,
		});
		sueltos.push(vista);
		await asentar();

		const copias = vista.get('[inert]');
		const clases = copias.classes();
		// Fuera del flujo y sin tamaño propio…
		expect(clases).toContain('absolute');
		expect(clases).toContain('size-0');
		// …y recortando: sin esto el contenido `w-max` y apilado sigue
		// contando para el desborde de la caja con scroll de arriba.
		expect(clases).toContain('overflow-hidden');
		// Las dos copias siguen siendo hijas directas y `w-max`: así miden su
		// ancho de verdad aunque la caja que las contiene mida cero.
		expect(copias.element.children).toHaveLength(2);
		for (const copia of copias.element.children) {
			expect(copia.classList.contains('w-max')).toBe(true);
		}
	});
});

describe('la forma del selector', () => {
	// Lo que miden las dos formas en el banco, con la insignia de 3
	// actualizaciones y los textos en español.
	const LABELS = 453;
	const ICONS = 213;
	const WIDTH = { labels: LABELS, icons: ICONS } as const;

	test('a cualquier ancho, la forma elegida entra entera', () => {
		for (let room = 1; room <= 1400; room++) {
			const shape = pickSectionShape(room, LABELS, ICONS);
			if (shape !== 'menu') {
				expect({ room, needs: WIDTH[shape] <= room }).toEqual({ room, needs: true });
			}
		}
	});

	test('y es la más grande que entra', () => {
		expect(pickSectionShape(1200, LABELS, ICONS)).toBe('labels');
		expect(pickSectionShape(LABELS, LABELS, ICONS)).toBe('labels');
		expect(pickSectionShape(LABELS - 1, LABELS, ICONS)).toBe('icons');
		expect(pickSectionShape(ICONS, LABELS, ICONS)).toBe('icons');
		expect(pickSectionShape(ICONS - 1, LABELS, ICONS)).toBe('menu');
		expect(pickSectionShape(40, LABELS, ICONS)).toBe('menu');
	});

	test('sin medidas va la de siempre, y sin la de los iconos no se arriesga', () => {
		// Cero es «todavía no se maquetó», no «no hay lugar».
		expect(pickSectionShape(0, LABELS, ICONS)).toBe('labels');
		expect(pickSectionShape(300, 0, 0)).toBe('labels');
		// Sabiendo que los nombres no entran pero no cuánto miden los iconos,
		// el menú es lo único que entra seguro.
		expect(pickSectionShape(300, LABELS, 0)).toBe('menu');
	});
});

describe('las superficies de la ventana', () => {
	/**
	 * La ventana es transparente y Wayfire desenfoca lo que hay detrás, así
	 * que lo que se apoya en ella tiene que dejarlo pasar: una superficie
	 * opaca anula el desenfoque (memoria
	 * `superficies-translucidas-blur-de-wayfire`). La franja de la operación
	 * había quedado en `bg-ui-surface` lisa al sacarle el `backdrop-blur`.
	 */
	test('ninguna va en superficie opaca', async () => {
		const archivos = [
			...new Bun.Glob('**/*.vue').scanSync({ cwd: new URL('../src', import.meta.url).pathname }),
		];
		// Sin esto, un glob que no encuentra nada deja la prueba en verde.
		expect(archivos.length).toBeGreaterThan(15);

		const opacas: string[] = [];
		for (const archivo of archivos) {
			const fuente = await Bun.file(new URL(`../src/${archivo}`, import.meta.url)).text();
			for (const clase of fuente.match(/(?<![\w-])bg-ui-surface(?![\w/-])/g) ?? []) {
				opacas.push(`${archivo}: ${clase}`);
			}
		}
		expect(opacas).toEqual([]);
	});

	test('la franja de la operación es del mismo material que el resto', async () => {
		const fuente = await Bun.file(
			new URL('../src/components/store/OperationPanel.vue', import.meta.url)
		).text();
		// Sólo la plantilla: el comentario de arriba explica por qué no lleva
		// `backdrop-blur`, y lo nombra.
		const plantilla = fuente.slice(fuente.indexOf('<template>'));
		expect(plantilla).toContain('bg-ui-surface/70');
		expect(plantilla).not.toContain('backdrop-blur');
	});
});
