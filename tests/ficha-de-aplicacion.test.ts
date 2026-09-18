/**
 * La ficha de una aplicación.
 *
 * Era una lista de pares sin jerarquía, con el enlace al sitio perdido entre el
 * texto y las capturas de a una. Esto fija lo que la hace legible.
 */

import { describe, expect, test } from 'bun:test';

const ficha = await Bun.file(new URL('../src/views/DetalleView.vue', import.meta.url)).text();
const carrusel = await Bun.file(
	new URL('../src/components/tienda/CarruselDeCapturas.vue', import.meta.url)
).text();
const boton = await Bun.file(new URL('../src/components/ui/BotonAccion.vue', import.meta.url)).text();

describe('la ficha', () => {
	test('los datos son filas con separador y no pares sueltos', () => {
		expect(ficha).toContain('<dl');
		expect(ficha).toContain("border-ui-border border-t");
		expect(ficha).toContain('v-for="(fila, indice) in datos"');
	});

	test('un dato que el paquete no tiene no ocupa una fila vacía', () => {
		// Una tabla con la mitad de los valores en blanco se lee como datos que
		// faltan y no como datos que ese paquete no tiene.
		expect(ficha).toContain("filas.filter((fila) => fila.valor !== '')");
	});

	test('el enlace al sitio se ve', () => {
		// En píldora con el color de marca, no como un renglón más de texto.
		const enlace = ficha.slice(ficha.indexOf('v-if="web"'));
		expect(enlace.slice(0, 500)).toContain('rounded-full');
		expect(enlace.slice(0, 500)).toContain('border-primary');
	});

	test('el enlace sigue validando el esquema', () => {
		// El valor sale de archivos que no escribimos nosotros; un `javascript:`
		// en un `href` se ejecuta en la ventana.
		expect(ficha).toContain("url.protocol === 'https:' || url.protocol === 'http:'");
	});

	test('la cabecera separa la presentación de los datos', () => {
		expect(ficha).toContain('<header');
		expect(ficha).toContain(':tamano="96"');
	});
});

describe('las capturas', () => {
	test('se ven todas, no de a una', () => {
		// Con una sola a la vista, que existan más se descubría apretando una
		// flecha — que es la mitad de para qué están.
		expect(carrusel).toContain('v-for="captura in fuentes"');
		expect(carrusel).toContain('overflow-x-auto');
		expect(carrusel).toContain('snap-x');
	});

	test('se pueden abrir en grande', () => {
		expect(carrusel).toContain('ModalBase');
		expect(carrusel).toContain('ampliada');
	});

	test('las flechas aparecen sólo si hay a dónde ir', () => {
		expect(carrusel).toContain('v-if="puedeIzquierda"');
		expect(carrusel).toContain('v-if="puedeDerecha"');
	});
});

describe('los botones', () => {
	test('usan el radio de las tarjetas y no el de los chips', () => {
		// `rounded-corner-sm` es el de las insignias; al lado de cualquier otra
		// cosa de la ventana se notaba que no era de la misma familia.
		//
		// Se mira sólo la plantilla: el comentario de arriba nombra el radio
		// viejo para explicar por qué no está, y buscarlo en el archivo entero
		// daría un falso positivo.
		const plantilla = boton.slice(boton.indexOf('<template>'));
		expect(plantilla).toContain('rounded-corner ');
		expect(plantilla).not.toContain('rounded-corner-sm');
	});
});
