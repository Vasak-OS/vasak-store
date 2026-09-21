/**
 * Lo que `strictTemplates` no sabe de los atributos `data-*`.
 *
 * Con `vueCompilerOptions.strictTemplates`, `vue-tsc` comprueba que cada
 * atributo de una plantilla exista: en un componente, que sea una propiedad
 * declarada o un evento que emite; en un elemento, que esté en el tipo de ese
 * elemento. Es lo que hace que un `:size` sobre un `<img>` —que no hace nada—
 * o un componente escrito con un nombre que no existe dejen de pasar en
 * silencio.
 *
 * Los `data-*` son la excepción legítima: HTML los permite todos, y acá se usan
 * para marcar nodos que después se buscan con `closest()` o `querySelector()`.
 * Sin esto, `strictTemplates` los rechaza uno por uno.
 *
 * Se declara el patrón, no cada nombre: una lista de nombres queda vieja en
 * cuanto alguien marca un nodo nuevo, y lo que se quiere permitir es la forma.
 *
 * ⚠️ Esto cubre los **elementos** y no los componentes, y no es por falta de
 * ganas: `strictTemplates` pasa los atributos de un componente a camelCase antes
 * de comprobarlos, así que `data-tauri-drag-region` llega al chequeo como
 * `dataTauriDragRegion` y no coincide con este patrón. Declarar lo mismo en
 * `ComponentCustomProps` **no sirve** —se probó—. Para ponerle un `data-*` a un
 * componente hay que pasarlo por `v-bind`, como hace `LogoDeLaTienda`, que lo
 * explica ahí.
 */
declare module 'vue' {
	interface HTMLAttributes {
		[atributo: `data-${string}`]: unknown;
	}
}

export {};
