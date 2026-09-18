/**
 * Los íconos salen del tema del sistema siempre que se pueda.
 *
 * Es lo que hace que la tienda se vea como el resto del escritorio y que cambie
 * cuando la persona cambia de tema. El archivo del catálogo —un PNG convertido
 * desde JPEG XL— es el respaldo para lo que el tema no tenga.
 */

import { describe, expect, test } from 'bun:test';

const componente = await Bun.file(
	new URL('../src/components/tienda/IconoDeApp.vue', import.meta.url)
).text();
const lector = await Bun.file(
	new URL('../src-tauri/src/lector.rs', import.meta.url)
).text();

describe('el ícono de una aplicación', () => {
	test('prueba el tema antes que el archivo', () => {
		// Dentro de `resolver`, no en el archivo entero: los `import` de arriba
		// están en el orden que pide el formateador y no dicen nada del orden en
		// que se resuelve.
		const cuerpo = componente.slice(
			componente.indexOf('async function resolver'),
			componente.indexOf('// Se vuelve a resolver')
		);
		const tema = cuerpo.indexOf('getIconSource');
		const archivo = cuerpo.indexOf('convertFileSrc');
		expect(tema).toBeGreaterThan(-1);
		expect(archivo).toBeGreaterThan(tema);
	});

	test('se vuelve a resolver cuando cambia el ícono y cuando cambia el tema', () => {
		// Lo primero porque Vue reusa el componente entre elementos de una
		// lista: sin eso, al desplazar, las tarjetas nuevas se quedaban con el
		// ícono de la fila que ocupaba ese lugar antes.
		expect(componente).toContain('watch([icono, version]');
	});

	test('descarta la respuesta de una resolución vieja', () => {
		// Dos cambios seguidos resuelven en paralelo; sin el testigo, la lenta
		// pisa a la nueva.
		expect(componente).toContain('++pedido');
		expect(componente).toContain('mio !== pedido');
	});
});

describe('los nombres que se prueban', () => {
	test('el backend ofrece varios y termina en el genérico', () => {
		// Los temas no se ponen de acuerdo: unos usan el `Icon=` del `.desktop`,
		// otros el identificador de AppStream y unos cuantos el del paquete.
		expect(lector).toContain('strip_suffix(".desktop")');
		expect(lector).toContain('tema.push(paquete.to_string())');
		expect(lector).toContain('"package-x-generic"');
	});
});
