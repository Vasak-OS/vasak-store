/**
 * El AUR se enciende desde Repositorios, no desde el buscador.
 *
 * Prender el AUR no es una forma de buscar: es agregar una fuente de paquetes
 * con otro nivel de confianza. Al lado del buscador era además una opción que
 * se olvidaba al cerrar la ventana.
 */

import { describe, expect, test } from 'bun:test';

const busqueda = await Bun.file(
	new URL('../src/components/tienda/BarraDeBusqueda.vue', import.meta.url)
).text();
const repositorios = await Bun.file(
	new URL('../src/views/RepositoriosView.vue', import.meta.url)
).text();
const portada = await Bun.file(new URL('../src/views/DescubrirView.vue', import.meta.url)).text();
const ajustes = await Bun.file(new URL('../src/stores/ajustes.ts', import.meta.url)).text();

describe('el interruptor del AUR', () => {
	test('ya no está en el buscador', () => {
		expect(busqueda).not.toContain('InterruptorDeOpcion');
		expect(busqueda).not.toContain('cambiarAur');
	});

	test('está en Repositorios, con su advertencia', () => {
		expect(repositorios).toContain('ajustes.cambiarAur');
		expect(repositorios).toContain("t('repositorios.aurNota')");
		expect(repositorios).toContain('status-warning');
	});

	test('se guarda, y se lee al abrir', () => {
		expect(ajustes).toContain('guardarAur');
		expect(ajustes).toContain('pedirAjustes');
	});

	test('de fábrica está apagado', () => {
		// Mientras no se hayan leído los ajustes, la respuesta prudente a
		// «¿consulto una fuente que la distribución marca como insegura?» es no.
		expect(ajustes).toContain('const aur = ref(false);');
	});

	test('si no se pudo guardar, el conmutador no miente', () => {
		// Moverlo igual sería decir que quedó puesto algo que no quedó.
		const cambiar = ajustes.slice(ajustes.indexOf('async function cambiarAur'));
		expect(cambiar.slice(0, 500)).toContain('aur.value = (await guardarAur(activo)).aur;');
	});

	test('buscar usa el ajuste, y cambiarlo rehace la búsqueda', () => {
		expect(portada).toContain('ajustes.aur');
		expect(portada).toContain('() => ajustes.aur], cargar)');
	});
});
