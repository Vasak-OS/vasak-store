/**
 * Que `vue-tsc` corra donde comprueba algo.
 *
 * `bunx --bun vue-tsc` lo ejecuta bajo el runtime de Bun, y ahí el parche que
 * `vue-tsc` le mete a TypeScript para entender `.vue` no llega a aplicarse:
 * degrada a `tsc` pelado. `tsc` no conoce la extensión, así que **ningún `.vue`
 * entra al programa y ninguno se comprueba**. Sale con 0 y no dice nada, que es
 * lo peor que puede hacer un control.
 *
 * Acá no es hipotético. Con la bandera puesta, `ActualizacionesView.vue` llamó
 * durante seis versiones a `operaciones.empezar`, que el store nunca devolvió:
 * un store de pinia no expone lo que no está en su `return`. Apretar «Comprobar
 * de nuevo» tiraba un `TypeError` que el `catch` de la pantalla se comía, así
 * que el botón no hacía nada y no se quejaba nadie. Lo encontró `check-all.sh`,
 * que corre `vue-tsc` por su cuenta y sin la bandera, cuando el paquete ya no
 * compilaba.
 *
 * Se lee el `package.json`, no se corre el comando: hacerlo correr acá tarda
 * más que toda la suite y necesita las dependencias instaladas.
 */

import { describe, expect, test } from 'bun:test';

const paquete = JSON.parse(await Bun.file(new URL('../package.json', import.meta.url)).text());

describe('el typecheck del build', () => {
	test('vue-tsc no corre con --bun', () => {
		expect(paquete.scripts.build).toContain('vue-tsc');
		expect(paquete.scripts.build).not.toMatch(/--bun\s+vue-tsc/);
	});

	test('y el build sigue haciendo el typecheck antes de empaquetar', () => {
		// Si el orden se da vuelta, un error de tipos igual deja un `dist`
		// escrito, que es la mitad del valor de tenerlo.
		const build: string = paquete.scripts.build;
		expect(build.indexOf('vue-tsc')).toBeLessThan(build.indexOf('vite build'));
	});
});
