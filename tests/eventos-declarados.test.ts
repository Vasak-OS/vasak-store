/**
 * El componente que declara lo que emite.
 *
 * `BotonAccion` no declaraba `click`, y lo usan veinticuatro botones: instalar,
 * actualizar, desinstalar, agregar un repositorio. Caía sobre el elemento de
 * adentro por el paso de atributos: funcionaba, pero no estaba escrito en
 * ningún lado, y con `strictTemplates` pasó a ser un error.
 *
 * El campo de texto estaba acá por lo mismo y ya no: es el `TextInput` de la
 * librería, y la búsqueda dejó de dispararse con un `@keydown` propio —la
 * dispara `SearchField`, con Enter o cuando se deja de escribir—.
 *
 * Declararlos tiene un filo: Vue saca de los atributos **todo** evento
 * declarado, así que el reenvío al elemento de adentro no es opcional. Sin él
 * el botón deja de responder, el chequeo de tipos sigue en cero y nada avisa.
 * Estas pruebas son por eso.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mount, type VueWrapper } from '@vue/test-utils';
import BotonAccion from '@/components/ui/BotonAccion.vue';

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
