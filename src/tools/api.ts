/**
 * Lo que la ventana le puede pedir al backend.
 *
 * Los tipos son los de `src-tauri/src/tipos.rs`, escritos otra vez de este
 * lado. Duplicarlos no es lindo, pero la alternativa —generarlos— agrega un
 * paso de compilación para diez estructuras que casi no cambian, y el precio
 * real de la duplicación lo pagan los tests: hay uno que compara los nombres de
 * los comandos contra los que el `invoke_handler` de Rust declara.
 */

import { invoke } from '@tauri-apps/api/core';

/** De dónde sale un programa. Es la jerarquía de confianza de la distribución. */
export type Origen = 'repositorio' | 'aur' | 'appimage' | 'local';

export type Icono = { tipo: 'tema'; valor: string } | { tipo: 'archivo'; valor: string };

export interface Tarjeta {
	nombre: string;
	titulo: string;
	resumen: string;
	version: string;
	origen: Origen;
	repositorio: string;
	instalada: boolean;
	actualizable: string | null;
	tamano: number;
	icono: Icono;
	categorias: string[];
	votos?: number;
	popularidad?: number;
	actualizado?: number;
}

export interface Captura {
	ruta: string;
	titulo: string;
}

export interface Detalle extends Tarjeta {
	descripcion: string;
	capturas: Captura[];
	web: string | null;
	licencia: string | null;
	autor: string | null;
	empaquetador: string | null;
	arquitectura: string | null;
	descarga: number;
	construido: number;
	instalado_el: number | null;
	dependencias: string[];
	opcionales: string[];
	requerido_por: string[];
}

export interface ResumenDeCategoria {
	id: string;
	cuantas: number;
	icono: string;
}

export interface Descubrimiento {
	seleccion: Tarjeta[];
	novedades: Tarjeta[];
	categorias: ResumenDeCategoria[];
}

export interface Pagina {
	resultados: Tarjeta[];
	total: number;
}

export interface PaqueteBreve {
	nombre: string;
	version: string;
	version_nueva?: string;
	origen: string;
	tamano: number;
	descarga: number;
}

export interface Previsualizacion {
	instalar: PaqueteBreve[];
	quitar: PaqueteBreve[];
	actualizar: PaqueteBreve[];
	conflictos: string[];
	descarga: number;
	espacio: number;
}

export interface Repositorio {
	nombre: string;
	activo: boolean;
	servidores: string[];
	lista?: string;
	protegido: boolean;
}

export interface AppImage {
	id: string;
	titulo: string;
	ruta: string;
	tamano: number;
	integrado: number;
	en_el_menu: boolean;
	/** Si vive en el directorio de la tienda, o sea si lo integramos nosotros. */
	administrado: boolean;
}

/** Un paso de una operación en curso. */
export interface Paso {
	id: string;
	fase: string;
	objetivo: string;
	hecho: number;
	total: number;
}

export interface Linea {
	id: string;
	texto: string;
}

export interface FinalDeOperacion {
	id: string;
	/** Vacío si salió bien. */
	error: string;
}

export const descubrir = () => invoke<Descubrimiento>('descubrir');

export const buscar = (texto: string, incluirAur: boolean, limite?: number) =>
	invoke<Pagina>('buscar', { texto, incluirAur, limite });

export const instaladas = (texto: string) => invoke<Pagina>('instaladas', { texto });

export const actualizaciones = () => invoke<Tarjeta[]>('actualizaciones');

export const deCategoria = (categoria: string, limite?: number) =>
	invoke<Pagina>('de_categoria', { categoria, limite });

export const detalle = (nombre: string, delAur = false) =>
	invoke<Detalle>('detalle', { nombre, delAur });

export const recetaDelAur = (nombre: string) => invoke<string>('receta_del_aur', { nombre });

export const previsualizar = (
	operacion: 'instalar' | 'quitar' | 'actualizar',
	paquetes: string[],
	conHuerfanas = false
) => invoke<Previsualizacion>('previsualizar', { operacion, paquetes, conHuerfanas });

export const instalar = (paquetes: string[]) => invoke<string>('instalar', { paquetes });

export const quitar = (paquetes: string[], conHuerfanas = false) =>
	invoke<string>('quitar', { paquetes, conHuerfanas });

export const actualizarTodo = () => invoke<string>('actualizar_todo');

export const sincronizar = () => invoke<string>('sincronizar');

export const recargar = () => invoke<void>('recargar');

export const instalarDelAur = (nombre: string) => invoke<string>('instalar_del_aur', { nombre });

export const repositorios = () => invoke<Repositorio[]>('repositorios');

export const cambiarRepositorio = (nombre: string, activo: boolean) =>
	invoke<void>('cambiar_repositorio', { nombre, activo });

export const agregarRepositorio = (nombre: string, servidor: string, siglevel: string) =>
	invoke<void>('agregar_repositorio', { nombre, servidor, siglevel });

export const quitarRepositorio = (nombre: string) => invoke<void>('quitar_repositorio', { nombre });

export const appimages = () => invoke<AppImage[]>('appimages');

export const integrarAppimage = (ruta: string) => invoke<AppImage>('integrar_appimage', { ruta });

export const quitarAppimage = (ruta: string) => invoke<void>('quitar_appimage', { ruta });

export const ejecutarAppimage = (ruta: string) => invoke<void>('ejecutar_appimage', { ruta });
