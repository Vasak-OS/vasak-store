<script setup lang="ts">
/**
 * De dónde salen los paquetes.
 *
 * Los protegidos —`core` y `extra`— aparecen con el conmutador apagado y
 * explicando por qué: se puede editar `/etc/pacman.conf` a mano, pero un clic
 * no puede dejar la máquina sin actualizaciones de seguridad.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import { onMounted, ref } from 'vue';
import BotonAccion from '@/components/ui/BotonAccion.vue';
import CampoDeTexto from '@/components/ui/CampoDeTexto.vue';
import EstadoVacio from '@/components/ui/EstadoVacio.vue';
import IndicadorDeCarga from '@/components/ui/IndicadorDeCarga.vue';
import InterruptorDeOpcion from '@/components/ui/InterruptorDeOpcion.vue';
import ModalBase from '@/components/ui/ModalBase.vue';
import { useAjustes } from '@/stores/ajustes';
import {
	agregarRepositorio,
	cambiarRepositorio,
	repositorios as pedirRepositorios,
	quitarRepositorio,
	type Repositorio,
} from '@/tools/api';
import { interpolar } from '@/tools/interpolar';

const { t } = useI18n();
const ajustes = useAjustes();

const lista = ref<Repositorio[]>([]);
const cargando = ref(true);
const falla = ref('');
/** El error de la lectura, que deja la pantalla sin nada que mostrar. */
const noSeLeyo = ref('');
const formulario = ref<HTMLFormElement | null>(null);
const agregando = ref(false);
const nuevo = ref({ nombre: '', servidor: '', siglevel: 'Required DatabaseOptional' });

async function cargar() {
	cargando.value = true;
	falla.value = '';
	noSeLeyo.value = '';
	try {
		lista.value = await pedirRepositorios();
	} catch (error) {
		// Aparte del error de una acción: si no se pudo leer, no hay lista que
		// mostrar, y la pantalla tiene que decir eso en lugar de quedar en blanco.
		noSeLeyo.value = String(error);
	} finally {
		cargando.value = false;
	}
}

/**
 * Pide al formulario que valide antes de mandar.
 *
 * El botón de confirmar está en el pie del modal, fuera del `<form>`, así que
 * no puede ser de tipo `submit`. Llamando a `agregar` directo se salteaba la
 * validación de los campos obligatorios y se mandaba un formulario vacío al
 * servicio, que contestaba un error críptico en vez de señalar el campo.
 */
function enviar() {
	formulario.value?.requestSubmit();
}

async function cambiar(repositorio: Repositorio, activo: boolean) {
	falla.value = '';
	try {
		await cambiarRepositorio(repositorio.nombre, activo);
	} catch (error) {
		falla.value = String(error);
	}
	await cargar();
}

async function agregar() {
	falla.value = '';
	try {
		await agregarRepositorio(nuevo.value.nombre, nuevo.value.servidor, nuevo.value.siglevel);
		agregando.value = false;
		nuevo.value = { nombre: '', servidor: '', siglevel: 'Required DatabaseOptional' };
	} catch (error) {
		falla.value = String(error);
	}
	await cargar();
}

async function quitar(repositorio: Repositorio) {
	falla.value = '';
	try {
		await quitarRepositorio(repositorio.nombre);
	} catch (error) {
		falla.value = String(error);
	}
	await cargar();
}

onMounted(async () => {
	await Promise.all([cargar(), ajustes.cargado ? Promise.resolve() : ajustes.cargar()]);
});
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="font-medium text-lg">{{ t('repositorios.titulo') }}</h1>
      <BotonAccion class="ml-auto" tono="principal" @click="agregando = true">
        {{ t('repositorios.agregar') }}
      </BotonAccion>
    </div>
    <p class="text-tx-muted text-xs leading-relaxed">{{ t('repositorios.explicacion') }}</p>
    <p v-if="falla || ajustes.falla" class="text-sm text-status-error">
      {{ falla || ajustes.falla }}
    </p>

    <!-- El AUR va acá y no al lado del buscador, que es donde estaba. Prender
         el AUR no es una forma de buscar: es agregar una fuente de paquetes,
         con otro nivel de confianza, y eso es el tema de esta pantalla. Queda
         puesto entre sesiones, como los demás. -->
    <section
      class="flex items-start gap-3 rounded-corner border border-status-warning/50 bg-status-warning/5 p-3">
      <InterruptorDeOpcion
        :valor="ajustes.aur"
        :etiqueta="t('origen.aur')"
        @cambiar="(valor: boolean) => ajustes.cambiarAur(valor)" />
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <div class="flex items-center gap-2">
          <span class="font-medium text-sm">{{ t('origen.aur') }}</span>
          <span
            class="rounded-corner-sm border border-status-warning px-1.5 py-0.5 text-status-warning text-xs">
            {{ t('repositorios.sinRevisar') }}
          </span>
        </div>
        <p class="text-tx-muted text-xs leading-relaxed">{{ t('repositorios.aurNota') }}</p>
      </div>
    </section>

    <IndicadorDeCarga v-if="cargando" />
    <EstadoVacio
      v-else-if="noSeLeyo"
      icono="dialog-error"
      :titulo="t('comun.noSePudoLeer')"
      :nota="noSeLeyo">
      <BotonAccion @click="cargar">{{ t('comun.reintentar') }}</BotonAccion>
    </EstadoVacio>
    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="repositorio in lista"
        :key="repositorio.nombre"
        class="flex items-start gap-3 rounded-corner border border-ui-border bg-ui-surface/40 p-3">
        <InterruptorDeOpcion
          :valor="repositorio.activo"
          :deshabilitado="repositorio.protegido"
          :etiqueta="repositorio.nombre"
          @cambiar="(valor) => cambiar(repositorio, valor)" />
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="flex items-center gap-2">
            <span class="font-medium text-sm">{{ repositorio.nombre }}</span>
            <span class="text-xs" :class="repositorio.activo ? 'text-status-success' : 'text-tx-muted'">
              {{ repositorio.activo ? t('repositorios.activo') : t('repositorios.inactivo') }}
            </span>
          </span>
          <span v-for="servidor in repositorio.servidores" :key="servidor" class="truncate text-tx-muted text-xs">
            {{ servidor }}
          </span>
          <span v-if="repositorio.lista" class="truncate text-tx-muted text-xs">
            {{ t('repositorios.lista') }}: {{ repositorio.lista }}
          </span>
          <span v-if="repositorio.protegido" class="text-tx-muted text-xs leading-relaxed">
            {{ t('repositorios.protegidoNota') }}
          </span>
        </span>
        <BotonAccion
          v-if="!repositorio.protegido"
          tono="peligro"
          :titulo="interpolar(t('repositorios.confirmarQuitar'), repositorio.nombre)"
          @click="quitar(repositorio)">
          {{ t('repositorios.quitar') }}
        </BotonAccion>
      </li>
    </ul>

    <ModalBase :abierto="agregando" :titulo="t('repositorios.agregar')" @cerrar="agregando = false">
      <form ref="formulario" class="flex flex-col gap-3" @submit.prevent="agregar">
        <label class="flex flex-col gap-1 text-sm">
          {{ t('repositorios.nombre') }}
          <CampoDeTexto v-model="nuevo.nombre" required :etiqueta="t('repositorios.nombre')" />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          {{ t('repositorios.servidor') }}
          <CampoDeTexto
            v-model="nuevo.servidor"
            required
            mono
            placeholder="https://…/$arch/$repo"
            :etiqueta="t('repositorios.servidor')" />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          {{ t('repositorios.firma') }}
          <CampoDeTexto v-model="nuevo.siglevel" required :etiqueta="t('repositorios.firma')" />
          <span class="text-tx-muted text-xs leading-relaxed">{{ t('repositorios.firmaNota') }}</span>
        </label>
      </form>
      <template #pie>
        <BotonAccion @click="agregando = false">{{ t('comun.cancelar') }}</BotonAccion>
        <!-- Por `requestSubmit` y no llamando a `agregar` directo: así los
             campos obligatorios se validan y el navegador señala el que falta,
             en vez de mandar un formulario vacío al servicio. -->
        <BotonAccion tono="principal" @click="enviar">{{ t('comun.aceptar') }}</BotonAccion>
      </template>
    </ModalBase>
  </div>
</template>
