/**
 * Los componentes que declaran lo que emiten, y lo reenvían.
 *
 * `BotonAccion` estaba acá: no declaraba `click` y lo usaban veinticuatro
 * botones. Se fue: los botones son el `ActionButton` de la librería, que lo
 * declara y lo prueba allá. Quedan los propios que declaran eventos con
 * nombre: el diálogo de la tienda (`close`) y el de la previsualización
 * (`close` y `confirm`).
 *
 * Declararlos tiene un filo: Vue saca de los atributos **todo** evento
 * declarado, así que el reenvío no es opcional. Sin él el diálogo deja de
 * cerrarse, el chequeo de tipos sigue en cero y nada avisa (memoria
 * `declarar-un-evento-lo-saca-de-attrs`). Estas pruebas son por eso.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mount, type VueWrapper } from '@vue/test-utils';
import PreviewDialog from '@/components/store/PreviewDialog.vue';
import AppDialog from '@/components/ui/AppDialog.vue';
import { sinArrastre } from './ejemplos';
import { asentar, desmontarTodo, elDialogo } from './montar';

let vista: VueWrapper | null = null;

afterEach(() => {
	vista?.unmount();
	vista = null;
	desmontarTodo();
});

function botonQueDice(texto: string): HTMLButtonElement {
	const boton = elDialogo()
		.findAll('button')
		.find((b) => b.text() === texto || b.attributes('aria-label') === texto);
	if (!boton) throw new Error(`no hay un botón «${texto}»`);
	return boton.element as HTMLButtonElement;
}

describe('AppDialog', () => {
	test('la cruz de la cabecera avisa que se cierra', async () => {
		vista = mount(AppDialog, { props: { open: true, title: 'Algo' }, attachTo: document.body });
		await asentar();

		botonQueDice('comun.cerrar').click();
		await asentar();

		expect(vista.emitted('close')).toHaveLength(1);
	});

	test('y Escape también', async () => {
		vista = mount(AppDialog, { props: { open: true, title: 'Algo' }, attachTo: document.body });
		await asentar();

		elDialogo().element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await asentar();

		expect(vista.emitted('close')).toHaveLength(1);
	});
});

describe('PreviewDialog', () => {
	test('confirmar llega a quien lo abrió', async () => {
		vista = mount(PreviewDialog, {
			props: { open: true, report: sinArrastre(), title: 'Lo que va a pasar' },
			attachTo: document.body,
		});
		await asentar();

		botonQueDice('operacion.confirmar').click();
		await asentar();

		expect(vista.emitted('confirm')).toHaveLength(1);
	});

	test('y con un conflicto no se puede confirmar', async () => {
		vista = mount(PreviewDialog, {
			props: { open: true, report: { ...sinArrastre(), conflictos: ['choca con otro'] }, title: 'x' },
			attachTo: document.body,
		});
		await asentar();

		const confirmar = botonQueDice('operacion.confirmar');
		expect(confirmar.disabled).toBe(true);
		confirmar.click();
		await asentar();

		expect(vista.emitted('confirm')).toBeUndefined();
	});

	test('cancelar cierra', async () => {
		vista = mount(PreviewDialog, {
			props: { open: true, report: sinArrastre(), title: 'x' },
			attachTo: document.body,
		});
		await asentar();

		botonQueDice('comun.cancelar').click();
		await asentar();

		expect(vista.emitted('close')).toHaveLength(1);
	});
});
