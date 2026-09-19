/**
 * Lo que tiene que estar listo antes de la primera prueba.
 *
 * Corre como `preload` de `bun test` (ver `bunfig.toml`). Son tres cosas y las
 * tres tienen que pasar antes de que se importe un componente, no después:
 *
 * 1. el DOM, porque `@vue/test-utils` monta contra `document`;
 * 2. el complemento que compila los `.vue`, porque sin él lo que se importa es
 *    la ruta del archivo;
 * 3. los dobles de Tauri y los complementos, porque los componentes los llaman
 *    al importarse.
 *
 * Nada de esto se puede hacer desde el cuerpo de una prueba: para entonces los
 * módulos verdaderos ya están cargados.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { mock } from 'bun:test';
import * as nucleo from '@tauri-apps/api/core';
import * as eventos from '@tauri-apps/api/event';
import './complemento-vue';
import {
	convertFileSrc,
	getIconSource,
	getSymbolSource,
	invoke,
	listen,
	useI18n,
} from './dobles';

GlobalRegistrator.register();

// Los dobles **encima** del módulo de verdad, no en su lugar. Reemplazarlo
// entero deja sin exportar lo que no se nombra acá, y los componentes de
// `@vasakgroup/vue-libvasak` vienen compilados: importan de `@tauri-apps/api`
// cosas internas —`SERIALIZE_TO_IPC_FN`, por ejemplo— que el empaquetado ya
// resolvió y que acá desaparecían, con lo que fallaba el import y no la
// prueba.
mock.module('@tauri-apps/api/core', () => ({ ...nucleo, invoke, convertFileSrc }));
mock.module('@tauri-apps/api/event', () => ({ ...eventos, listen }));
mock.module('@vasakgroup/tauri-plugin-i18n', () => ({ useI18n }));
mock.module('@vasakgroup/plugin-vicons', () => ({ getIconSource, getSymbolSource }));
