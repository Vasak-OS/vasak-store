/**
 * El composable de iconos que trajo el molde de la plantilla.
 *
 * Resolvía el icono con una llamada al complemento y se suscribía al cambio de
 * tema. `ThemeIcon` hace lo mismo con una memoria compartida por nombre y tipo,
 * el pedido en vuelo compartido, y **un solo** oyente para toda la ventana.
 *
 * Acá había una vuelta más: `IconoDeApp` **no puede** ser `ThemeIcon`, porque
 * prueba una lista de nombres candidatos en orden —los temas no se ponen de
 * acuerdo entre el `Icon=` del `.desktop`, el identificador de AppStream y el
 * nombre del paquete— y si ninguno está cae a un archivo del catálogo. Lo único
 * que necesitaba del composable era saber cuándo cambió el tema, y eso ahora lo
 * da la librería con `usarLaVersionDelTema()`, que se cuelga del mismo oyente
 * único en vez de registrar otro por instancia.
 *
 * La guardia mira la **forma** de la copia y no el nombre del archivo: lo que
 * la define es suscribirse al aviso del cambio de tema desde la aplicación.
 * Ver Vasak-OS/vue-libvasak#54.
 */

import { describe, expect, test } from 'bun:test';
import { Glob } from 'bun';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// `fileURLToPath` y no `.pathname`: éste deja los caracteres codificados tal
// como están, así que un checkout en una ruta con un espacio llega con `%20` y
// `scanSync` no encuentra nada.
const FUENTE = fileURLToPath(new URL('../src/', import.meta.url));
const fuentes = [...new Glob('**/*.{vue,ts}').scanSync(FUENTE)];

describe('el composable de iconos del molde', () => {
	test('hay algo que mirar', () => {
		// Sin esto las de abajo pasan sobre una lista vacía, que es en lo que
		// quedan si el patrón deja de encontrar archivos. Una guardia que se
		// apaga sola dice que sí.
		expect(fuentes).toContain('components/tienda/IconoDeApp.vue');
		expect(fuentes.length).toBeGreaterThan(10);
	});

	test('ya no está', () => {
		expect(fuentes.filter((ruta) => ruta.includes('useReactiveIcon'))).toEqual([]);
	});

	test('y nadie escucha el cambio de tema por su cuenta', async () => {
		// Ésta es la forma de la copia. Que nadie llame a `getIconSource` sería
		// demasiado: `IconoDeApp` lo hace y tiene que hacerlo, porque prueba
		// varios nombres. Lo que no puede volver es el oyente propio.
		const culpables: string[] = [];
		for (const ruta of fuentes) {
			const texto = await Bun.file(join(FUENTE, ruta)).text();
			if (texto.includes('vicons:theme-changed')) culpables.push(ruta);
		}

		expect(culpables).toEqual([]);
	});

	// Que el ícono siga al tema **no** se comprueba acá.
	//
	// Estaba, leyendo el `.vue` y buscando `usarLaVersionDelTema`. Se sacó
	// porque no comprobaba nada: sacándole la versión al `watch` —que es
	// justamente la forma de romperlo— el archivo sigue nombrando el composable
	// y la prueba seguía en verde. Medido, no supuesto.
	//
	// Está en `iconos.test.ts`, montando el componente y emitiendo el cambio de
	// tema, que es lo único que distingue «sigue al tema» de «lo importa».
});
