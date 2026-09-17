import { describe, expect, test } from 'bun:test';
import { avance, bytes, fecha } from '../src/tools/formato';

describe('bytes', () => {
	test('los bytes sueltos van sin decimales', () => {
		expect(bytes(0)).toBe('0 B');
		expect(bytes(512)).toBe('512 B');
	});

	test('sube de unidad en base 1024', () => {
		expect(bytes(1024)).toBe('1.0 KB');
		expect(bytes(1024 * 1024)).toBe('1.0 MB');
		expect(bytes(1024 * 1024 * 1024)).toBe('1.0 GB');
	});

	test('a partir de diez no hace falta el decimal', () => {
		// «15 MB» dice lo mismo que «15,0 MB» y ocupa menos en una tarjeta.
		expect(bytes(15 * 1024 * 1024)).toBe('15 MB');
	});

	test('un tamaño negativo conserva el signo', () => {
		// Es lo que hace que una desinstalación pueda decir cuánto libera.
		expect(bytes(-2048)).toBe('-2.0 KB');
	});
});

describe('avance', () => {
	test('sin total no se puede saber', () => {
		// Y la barra tiene que poder mostrarse indeterminada en vez de clavada
		// en cero, que se lee como trabada.
		expect(avance(0, 0)).toBeNull();
		expect(avance(5, -1)).toBeNull();
	});

	test('queda entre cero y uno aunque los números no cierren', () => {
		expect(avance(0, 10)).toBe(0);
		expect(avance(5, 10)).toBe(0.5);
		expect(avance(20, 10)).toBe(1);
		expect(avance(-5, 10)).toBe(0);
	});
});

describe('fecha', () => {
	test('sin fecha no inventa una', () => {
		// Un cero es «no hay dato», no el 1 de enero de 1970.
		expect(fecha(0)).toBe('');
		expect(fecha(null)).toBe('');
		expect(fecha(undefined)).toBe('');
	});

	test('una fecha real se ve en el idioma pedido', () => {
		const texto = fecha(Date.UTC(2026, 8, 17) / 1000, 'es');
		expect(texto).toContain('2026');
		expect(texto.length).toBeGreaterThan(4);
	});
});
