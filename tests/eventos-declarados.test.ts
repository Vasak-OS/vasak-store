/**
 * Los dos componentes que ahora declaran lo que emiten.
 *
 * `BotonAccion` no declaraba `click` —y lo usan veinticuatro botones: instalar,
 * actualizar, desinstalar, agregar un repositorio— y `CampoDeTexto` no
 * declaraba `keydown`, que es cómo la búsqueda se dispara con Enter. Los dos
 * caían sobre el elemento de adentro por el paso de atributos: funcionaban,
 * pero no estaban escritos en ningún lado, y con `strictTemplates` pasaron a
 * ser un error.
 *
 * Declararlos tiene un filo: Vue saca de los atributos **todo** evento
 * declarado, así que el reenvío al elemento de adentro no es opcional. Sin él
 * el botón deja de responder, el chequeo de tipos sigue en cero y nada avisa.
 * Estas pruebas son por eso.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mount, type VueWrapper } from '@vue/test-utils';
import BotonAccion from '@/components/ui/BotonAccion.vue';
import CampoDeTexto from '@/components/ui/CampoDeTexto.vue';

let vista: VueWrapper | null = null;

afterEach(() => {
	vista?.unmount();
	vista = null;
});

describe('BotonAccion', () => {
	test('el clic llega a quien lo usa', async () => {
		vista = mount(BotonAccion, { slots: { default: 'Instalar' } });

		await vista.get('button').trigger('click');

		expect(vista.emitted('click')).toHaveLength(1);
	});

	test('y deshabilitado no llega', async () => {
		// Es lo que evita que se mande una segunda operación mientras hay una
		// en curso: el demonio rechazaría la segunda igual, y es mejor que el
		// botón lo diga antes que un error después.
		vista = mount(BotonAccion, {
			props: { deshabilitado: true },
			slots: { default: 'Instalar' },
		});

		await vista.get('button').trigger('click');

		expect(vista.emitted('click')).toBeUndefined();
	});
});

describe('CampoDeTexto', () => {
	test('la tecla llega a quien lo usa', async () => {
		// Es cómo la búsqueda se dispara con Enter.
		vista = mount(CampoDeTexto, { props: { modelValue: '' } });

		await vista.get('input').trigger('keydown', { key: 'Enter' });

		expect(vista.emitted('keydown')).toHaveLength(1);
	});

	test('y lo que se escribe sigue llegando', async () => {
		// El `@input` y el `@keydown` conviven en el mismo elemento: declarar el
		// segundo no puede llevarse puesto al primero.
		vista = mount(CampoDeTexto, { props: { modelValue: '' } });

		await vista.get('input').setValue('gimp');

		expect(vista.emitted('update:modelValue')?.[0]).toEqual(['gimp']);
	});
});
