/**
 * Los campos de texto se ven como los del resto de VasakOS.
 *
 * El buscador tenía su propio borde, su propio relleno y ningún anillo de foco,
 * así que al lado de cualquier otra ventana del escritorio se veía de otra
 * aplicación. Esto fija el acuerdo: hay un solo componente de campo y las
 * pantallas lo usan.
 */

import { describe, expect, test } from 'bun:test';

const campo = await Bun.file(
	new URL('../src/components/ui/CampoDeTexto.vue', import.meta.url)
).text();
const busqueda = await Bun.file(
	new URL('../src/components/tienda/BarraDeBusqueda.vue', import.meta.url)
).text();
const repositorios = await Bun.file(
	new URL('../src/views/RepositoriosView.vue', import.meta.url)
).text();

describe('el campo de texto', () => {
	test('usa las clases del resto del escritorio', () => {
		// Las mismas que `TextInput` de Configuración: borde, fondo de
		// superficie al 50 %, y el anillo de foco.
		for (const clase of [
			'rounded-corner',
			'border-ui-border',
			'bg-ui-surface/50',
			'px-3',
			'py-2',
			'focus:border-primary',
			'focus:ring-2',
			'focus:ring-primary/20',
		]) {
			expect(campo).toContain(clase);
		}
	});

	test('el foco se ve', () => {
		// `outline-none` a secas deja el recorrido con Tab a ciegas; acá se
		// reemplaza por el anillo, que es lo que WCAG 2.4.7 pide.
		expect(campo).toContain('focus:outline-none');
		expect(campo).toContain('focus:ring');
	});
});

describe('las pantallas', () => {
	test('el buscador usa el campo compartido y no uno propio', () => {
		expect(busqueda).toContain('CampoDeTexto');
		expect(busqueda).not.toMatch(/<input\b/);
	});

	test('el formulario de repositorios también', () => {
		expect(repositorios).toContain('CampoDeTexto');
		expect(repositorios).not.toMatch(/<input\b/);
	});
});
