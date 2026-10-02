/**
 * La ventana se arrastra desde toda la barra de arriba, menos los controles.
 *
 * La tienda no tiene decoración del compositor: lo único que deja mover la
 * ventana es `data-tauri-drag-region`. Y Tauri no mira si el atributo está
 * **en algún lado** de la barra, sino si el elemento que recibió el `mousedown`
 * lo es. Su guion (`tauri/src/window/scripts/drag.js`, 2.11 en adelante) sube
 * por el camino del evento desde el blanco y decide así:
 *
 * - un control —`a`, `button`, `input`, un `tabindex` o un rol de botón,
 *   enlace, pestaña…— sin el atributo **corta**: no se arrastra;
 * - sin atributo, sigue subiendo;
 * - `"false"` corta; `"deep"` arrastra desde cualquier lugar de adentro;
 * - el atributo pelado (`""`) arrastra **sólo si es el blanco mismo**.
 *
 * Esa última es la que rompió la 0.9.0: el envoltorio del selector lleva el
 * atributo pelado, pero el selector ocupa todo su ancho (`w-full`) con una caja
 * sin atributo, así que todo `mousedown` caía en esa caja y no en el
 * envoltorio. La barra entera quedaba sin agarre salvo el logo y los bordes.
 *
 * `happy-dom` no maqueta, así que no hay `elementFromPoint` que diga dónde cae
 * un clic. Lo que sí se puede atar es la regla: **todo** elemento de la barra
 * que pueda ser blanco de un clic tiene que arrastrar si no es un control, y
 * no arrastrar si lo es (que elegir una sección no mueva la ventana).
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { AppBar, olvidarLosIconosDelTema } from '@vasakgroup/vue-libvasak';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import WindowAppLayout from '@/layouts/WindowAppLayout.vue';
import { asentar, desmontarTodo, montarVista } from './montar';

const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');

afterEach(() => {
	desmontarTodo();
	if (original) Object.defineProperty(HTMLElement.prototype, 'clientWidth', original);
});

const CLICKABLE_TAGS = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'SUMMARY']);
const INTERACTIVE_ROLES = new Set(['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'switch', 'option']);

/** `isClickableElement` del guion de Tauri, tal cual. */
function isClickable(el: HTMLElement): boolean {
	return (
		CLICKABLE_TAGS.has(el.tagName) ||
		(el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false') ||
		(el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1') ||
		INTERACTIVE_ROLES.has(el.getAttribute('role') ?? '')
	);
}

/** `isDragRegion` del guion de Tauri, con el camino armado desde el blanco. */
function startsDrag(target: HTMLElement): boolean {
	for (let el: HTMLElement | null = target; el; el = el.parentElement) {
		const attr = el.getAttribute('data-tauri-drag-region');
		if (isClickable(el) && attr === null) return false;
		if (attr === null) continue;
		if (attr === 'false') return false;
		if (attr === 'deep') return true;
		if (attr === '' || attr === 'true') return el === target;
	}
	return false;
}

/** Si un clic puede caer en él: lo inerte y lo que no recibe el puntero, no. */
function canBeClicked(el: HTMLElement): boolean {
	for (let at: HTMLElement | null = el; at; at = at.parentElement) {
		if (at.hasAttribute('inert') || at.classList.contains('pointer-events-none')) return false;
	}
	return true;
}

/** Dentro de un control: ahí no se arrastra, y está bien. */
function insideControl(el: HTMLElement, bar: HTMLElement): boolean {
	for (let at: HTMLElement | null = el; at && at !== bar.parentElement; at = at.parentElement) {
		if (isClickable(at)) return true;
	}
	return false;
}

/** Los elementos de la barra que no dejan arrastrar sin ser controles. */
function deadZones(bar: HTMLElement): string[] {
	const all = [bar, ...bar.querySelectorAll<HTMLElement>('*')];
	return all
		.filter((el) => el instanceof HTMLElement && canBeClicked(el) && !insideControl(el, bar))
		.filter((el) => !startsDrag(el))
		.map((el) => `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}">`);
}

/** Los controles de la barra que, mal, moverían la ventana. */
function draggingControls(bar: HTMLElement): string[] {
	return [...bar.querySelectorAll<HTMLElement>('*')]
		.filter((el) => canBeClicked(el) && isClickable(el) && startsDrag(el))
		.map((el) => `<${el.tagName.toLowerCase()} ${el.getAttribute('aria-label') ?? el.textContent?.trim()}>`);
}

/** El selector mide `room` de lugar, sus nombres 420 y sus iconos 180. */
function room(width: number) {
	Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
		configurable: true,
		get(this: HTMLElement) {
			if (this.hasAttribute('data-shape')) return width;
			if (this.parentElement?.hasAttribute('inert')) {
				return this === this.parentElement.firstElementChild ? 420 : 180;
			}
			return 0;
		},
	});
}

async function theBar(width: number): Promise<HTMLElement> {
	olvidarLosIconosDelTema();
	room(width);
	const { vista } = await montarVista(WindowAppLayout);
	await asentar();
	return vista.findComponent(AppBar).element as HTMLElement;
}

describe('arrastrar la ventana desde la barra de arriba', () => {
	// Las tres formas del selector: con nombres, con iconos y el menú.
	for (const [shape, width] of [
		['labels', 900],
		['icons', 300],
		['menu', 120],
	] as const) {
		test(`arrastra desde todo lo que no es un control (${shape})`, async () => {
			const bar = await theBar(width);
			expect(bar.querySelector('[data-shape]')?.getAttribute('data-shape')).toBe(shape);

			expect(deadZones(bar)).toEqual([]);
		});

		test(`y elegir una sección no mueve la ventana (${shape})`, async () => {
			const bar = await theBar(width);
			const controls = [...bar.querySelectorAll<HTMLElement>('a, button')].filter(canBeClicked);
			expect(controls.length).toBeGreaterThan(0);

			expect(draggingControls(bar)).toEqual([]);
		});
	}

	test('el lugar que rodea al selector es zona de arrastre, aunque el selector lo cubra', async () => {
		// El caso exacto de la 0.9.0: la caja del selector ocupa todo el ancho
		// del envoltorio, así que el clic en el hueco cae en ella.
		const bar = await theBar(900);
		const switcherRoot = bar.querySelector<HTMLElement>('[data-shape]');
		expect(switcherRoot).not.toBeNull();

		expect(startsDrag(switcherRoot as HTMLElement)).toBe(true);
	});
});

describe('el permiso y la versión de Tauri que hacen falta', () => {
	test('la ventana tiene permiso para empezar a arrastrar', () => {
		// Sin él, `start_dragging` vuelve con error y la ventana no se mueve,
		// aunque el atributo esté donde tiene que estar.
		const capability = JSON.parse(
			readFileSync(resolve(import.meta.dir, '../src-tauri/capabilities/default.json'), 'utf8')
		) as { permissions: string[] };

		expect(capability.permissions).toContain('core:window:allow-start-dragging');
	});

	test('tauri pide al menos la 2.11, la que entiende `deep`', () => {
		// En un guion de arrastre que no conoce `deep`, el valor no es ni
		// pelado ni `true`, y la barra vuelve a quedar sin agarre.
		const manifest = readFileSync(resolve(import.meta.dir, '../src-tauri/Cargo.toml'), 'utf8');
		const version = manifest.match(/^tauri = \{ version = "(\d+)\.(\d+)/m);

		expect(version).not.toBeNull();
		expect(Number(version?.[1])).toBe(2);
		expect(Number(version?.[2])).toBeGreaterThanOrEqual(11);
	});
});
