import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyTheme, saveTheme, THEME_KEY } from '../src/tools/theme-cache';

/** Un `Storage` de prueba en memoria: las pruebas no tocan el `localStorage` global. */
function fakeStorage(): Storage {
	const data = new Map<string, string>();
	return {
		get length() {
			return data.size;
		},
		clear: () => data.clear(),
		getItem: (key: string) => data.get(key) ?? null,
		key: (index: number) => Array.from(data.keys())[index] ?? null,
		removeItem: (key: string) => void data.delete(key),
		setItem: (key: string, value: string) => void data.set(key, String(value)),
	};
}

/** Un `Storage` que tira en todo, como un `localStorage` bloqueado. */
function brokenStorage(): Storage {
	const fail = () => {
		throw new Error('localStorage bloqueado');
	};
	return {
		length: 0,
		clear: fail,
		getItem: fail,
		key: fail,
		removeItem: fail,
		setItem: fail,
	};
}

describe('theme-cache', () => {
	test('la clave es la que comparte con index.html', () => {
		expect(THEME_KEY).toBe('vsk-theme');
	});

	test('saveTheme guarda la clase oscura y sólo las variables --*', () => {
		const root = document.createElement('div');
		root.classList.add('dark');
		root.style.setProperty('--ui-background', '#101010');
		root.style.setProperty('--primary', '#abcdef');
		root.style.setProperty('color', 'red');
		const storage = fakeStorage();

		saveTheme(root, storage);

		expect(JSON.parse(storage.getItem(THEME_KEY) as string)).toEqual({
			dark: true,
			vars: { '--ui-background': '#101010', '--primary': '#abcdef' },
		});
	});

	test('saveTheme sin clase oscura guarda dark en false', () => {
		const storage = fakeStorage();
		saveTheme(document.createElement('div'), storage);
		expect(JSON.parse(storage.getItem(THEME_KEY) as string).dark).toBe(false);
	});

	test('applyTheme reaplica la clase oscura y las variables recordadas', () => {
		const storage = fakeStorage();
		storage.setItem(THEME_KEY, JSON.stringify({ dark: true, vars: { '--primary': '#123456' } }));
		const root = document.createElement('div');

		applyTheme(root, storage);

		expect(root.classList.contains('dark')).toBe(true);
		expect(root.style.getPropertyValue('--primary')).toBe('#123456');
	});

	test('ida y vuelta: lo guardado de una raíz se reaplica en otra', () => {
		const storage = fakeStorage();
		const first = document.createElement('div');
		first.classList.add('dark');
		first.style.setProperty('--ui-line', '#222222');
		saveTheme(first, storage);

		const second = document.createElement('div');
		applyTheme(second, storage);

		expect(second.classList.contains('dark')).toBe(true);
		expect(second.style.getPropertyValue('--ui-line')).toBe('#222222');
	});

	test('sin clave guardada applyTheme no toca nada', () => {
		const root = document.createElement('div');
		applyTheme(root, fakeStorage());
		expect(root.classList.contains('dark')).toBe(false);
		expect(root.getAttribute('style')).toBeNull();
	});

	test('un JSON inválido no lanza ni toca la raíz', () => {
		const storage = fakeStorage();
		storage.setItem(THEME_KEY, '{no es json');
		const root = document.createElement('div');

		expect(() => applyTheme(root, storage)).not.toThrow();
		expect(root.classList.contains('dark')).toBe(false);
	});

	test('un Storage que tira no rompe ni al guardar ni al aplicar', () => {
		const root = document.createElement('div');
		expect(() => saveTheme(root, brokenStorage())).not.toThrow();
		expect(() => applyTheme(root, brokenStorage())).not.toThrow();
	});
});

/**
 * Guardas de cableado, de fuente: el módulo solo no sirve si nadie lo llama o si
 * el `<head>` no reaplica el tema antes de montar.
 */
describe('cableado del tema recordado', () => {
	const read = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf8');

	test('index.html reaplica el tema en el <head> antes del módulo', () => {
		const html = read('index.html');
		const head = html.slice(0, html.indexOf('</head>'));

		expect(head).toContain('"vsk-theme"');
		expect(head).toContain('classList.add("dark")');
		expect(head).toContain('setProperty');
		expect(html.indexOf('vsk-theme')).toBeLessThan(html.indexOf('type="module"'));
	});

	test('App.vue guarda el tema tras cargar la configuración, al montar y al cambiar', () => {
		const app = read('src/App.vue');

		expect(app).toContain("from '@/tools/theme-cache'");
		expect(app.match(/loadConfig\(\)\.then\(\(\) => saveTheme\(\)\)/g)?.length).toBe(2);
	});
});
