/**
 * Lo que decide cómo entra la tienda al escritorio.
 *
 * Tres archivos que no se compilan y que por eso se rompen callados: la lista
 * de iconos de `tauri.conf.json`, la entrada del menú, y lo que los ata al
 * nombre del binario. Nada de esto lo mira el compilador ni `vue-tsc`, y el
 * síntoma aparece recién en una máquina con el paquete instalado: un icono
 * genérico, una entrada del menú que no abre nada, o una ventana que el
 * lanzador no reconoce como abierta.
 *
 * Pasó: al quedarse con un solo icono, `bundle.icon` siguió nombrando cuatro
 * archivos borrados. Y el `StartupWMClass` decía `vasak-store`, que no es el
 * identificador de nada.
 */

import { describe, expect, test } from 'bun:test';

const RAIZ = new URL('..', import.meta.url);

const configuracion = JSON.parse(
	await Bun.file(new URL('src-tauri/tauri.conf.json', RAIZ)).text()
);
const entrada = await Bun.file(new URL('packaging/vasak-store.desktop', RAIZ)).text();

/** Las claves del `.desktop`, sin los comentarios. */
const claves = new Map(
	entrada
		.split('\n')
		.filter((linea) => !linea.startsWith('#') && linea.includes('='))
		.map((linea) => {
			const corte = linea.indexOf('=');
			return [linea.slice(0, corte), linea.slice(corte + 1)];
		})
);

describe('los iconos que se empaquetan', () => {
	test('cada uno de los que se nombran existe', async () => {
		// Es lo que faltaba. Un nombre que no está no rompe la compilación de
		// Rust ni la del frontend: el paquete sale sin icono y se ve recién
		// instalado, con la entrada del menú dibujada con el genérico.
		const nombrados: string[] = configuracion.bundle.icon;
		expect(nombrados.length).toBeGreaterThan(0);

		for (const relativo of nombrados) {
			const archivo = Bun.file(new URL(`src-tauri/${relativo}`, RAIZ));
			expect(await archivo.exists(), `${relativo} no existe`).toBe(true);
		}
	});

	test('y no queda ninguno suelto que nadie nombre', async () => {
		// Al revés también: un icono que no está en la lista es peso muerto que
		// se copia, se versiona y nadie usa — que es como se llegó a tener
		// catorce.
		const nombrados: string[] = configuracion.bundle.icon;
		const iconos = new Bun.Glob('src-tauri/icons/*');
		const sueltos: string[] = [];
		for await (const ruta of iconos.scan({ cwd: RAIZ.pathname })) {
			if (!nombrados.includes(ruta.replace('src-tauri/', ''))) {
				sueltos.push(ruta);
			}
		}
		expect(sueltos).toEqual([]);
	});

	test('el que se empaqueta es un PNG, que es lo que el tema hicolor entiende', async () => {
		// El empaquetador de deb saca el tamaño de la imagen y la instala en
		// `hicolor/<ancho>x<alto>/apps/`. Un `.ico` o un `.icns` ahí no los
		// dibuja nadie en Linux.
		for (const relativo of configuracion.bundle.icon as string[]) {
			expect(relativo).toEndWith('.png');
		}
	});
});

describe('la entrada del menú', () => {
	test('abre el binario que el paquete instala', () => {
		// `Exec` tiene que ser el `productName`, que es como se llama el
		// ejecutable. Renombrar el programa y olvidarse de acá deja una entrada
		// del menú que no abre nada, y no falla nada al compilar.
		expect(claves.get('Exec')).toBe(configuracion.productName);
	});

	test('pide el icono por el nombre con el que se instala', () => {
		// El empaquetador de Tauri nombra el PNG del tema hicolor como el
		// `productName`. Cualquier otro nombre acá cae en lo que el tema tenga
		// —o en nada— y el icono propio queda instalado y sin usar.
		expect(claves.get('Icon')).toBe(configuracion.productName);
	});

	test('y lo pide sin ruta, para que lo resuelva el tema', () => {
		// Con una ruta absoluta el icono deja de seguir al tema del escritorio,
		// que es la mitad de para qué existe un tema de iconos.
		expect(claves.get('Icon')).not.toContain('/');
	});

	test('el escritorio puede unirla con la ventana abierta', () => {
		// `StartupWMClass` tiene que ser el `identifier`. Decía `vasak-store`,
		// que no es el identificador de nada, así que el lanzador mostraba la
		// tienda como si no estuviera corriendo aunque lo estuviera.
		expect(claves.get('StartupWMClass')).toBe(configuracion.identifier);
	});

	test('está traducida al español', () => {
		// La ventana se traduce entera; una entrada del menú en inglés al lado
		// de las demás en español es la única parte que se nota siempre.
		for (const clave of ['Name', 'GenericName', 'Comment', 'Keywords']) {
			expect(claves.has(`${clave}[es]`), `falta ${clave}[es]`).toBe(true);
			expect(claves.get(`${clave}[es]`)).not.toBe(claves.get(clave));
		}
	});

	test('dice de qué se trata además de cómo se llama', () => {
		// «Tienda» a secas no dice qué hace. El `GenericName` es lo que muestran
		// los lanzadores que buscan por descripción.
		expect(claves.get('GenericName')).toBeTruthy();
		expect(claves.get('Comment')).toBeTruthy();
	});

	test('cae en una categoría del menú, y en una sola', () => {
		// Con dos categorías principales la aplicación aparece dos veces en el
		// menú. `PackageManager` es adicional y necesita una principal al lado.
		const categorias = (claves.get('Categories') ?? '').split(';').filter(Boolean);
		expect(categorias).toContain('System');
		expect(categorias).toContain('PackageManager');
		const principales = categorias.filter((una) =>
			['AudioVideo', 'Audio', 'Video', 'Development', 'Education', 'Game', 'Graphics',
				'Network', 'Office', 'Science', 'Settings', 'System', 'Utility'].includes(una)
		);
		expect(principales).toHaveLength(1);
	});

	test('y el archivo entero es válido para el escritorio', async () => {
		// `desktop-file-validate` es la referencia, y viene en
		// `desktop-file-utils`, que el paquete ya declara como dependencia. Si
		// no está en la máquina que corre las pruebas, no se comprueba: no es
		// motivo para que fallen.
		const validador = Bun.which('desktop-file-validate');
		if (!validador) {
			return;
		}
		const corrida = Bun.spawnSync([
			validador,
			new URL('packaging/vasak-store.desktop', RAIZ).pathname,
		]);
		const dijo = new TextDecoder().decode(corrida.stdout) + new TextDecoder().decode(corrida.stderr);
		// Los avisos que empiezan en «hint:» son sugerencias de estilo, no
		// errores; lo que no puede haber es un «error:».
		expect(dijo).not.toContain('error:');
		expect(corrida.exitCode).toBe(0);
	});
});
