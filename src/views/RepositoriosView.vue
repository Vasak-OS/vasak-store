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
import IndicadorDeCarga from '@/components/ui/IndicadorDeCarga.vue';
import InterruptorDeOpcion from '@/components/ui/InterruptorDeOpcion.vue';
import ModalBase from '@/components/ui/ModalBase.vue';
import {
	agregarRepositorio,
	cambiarRepositorio,
	repositorios as pedirRepositorios,
	quitarRepositorio,
	type Repositorio,
} from '@/tools/api';
import { interpolar } from '@/tools/interpolar';

const { t } = useI18n();

const lista = ref<Repositorio[]>([]);
const cargando = ref(true);
const falla = ref('');
const agregando = ref(false);
const nuevo = ref({ nombre: '', servidor: '', siglevel: 'Required DatabaseOptional' });

async function cargar() {
	cargando.value = true;
	falla.value = '';
	try {
		lista.value = await pedirRepositorios();
	} catch (error) {
		falla.value = String(error);
	} finally {
		cargando.value = false;
	}
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

onMounted(cargar);
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
    <p v-if="falla" class="text-sm text-status-error">{{ falla }}</p>

    <IndicadorDeCarga v-if="cargando" />
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
      <form class="flex flex-col gap-3" @submit.prevent="agregar">
        <label class="flex flex-col gap-1 text-sm">
          {{ t('repositorios.nombre') }}
          <input
            v-model="nuevo.nombre"
            required
            class="rounded-corner-sm border border-ui-border-strong bg-ui-bg px-2 py-1 outline-none focus:border-primary">
        </label>
        <label class="flex flex-col gap-1 text-sm">
          {{ t('repositorios.servidor') }}
          <input
            v-model="nuevo.servidor"
            required
            placeholder="https://…/$arch/$repo"
            class="rounded-corner-sm border border-ui-border-strong bg-ui-bg px-2 py-1 outline-none focus:border-primary">
        </label>
        <label class="flex flex-col gap-1 text-sm">
          {{ t('repositorios.firma') }}
          <input
            v-model="nuevo.siglevel"
            required
            class="rounded-corner-sm border border-ui-border-strong bg-ui-bg px-2 py-1 outline-none focus:border-primary">
          <span class="text-tx-muted text-xs leading-relaxed">{{ t('repositorios.firmaNota') }}</span>
        </label>
      </form>
      <template #pie>
        <BotonAccion @click="agregando = false">{{ t('comun.cancelar') }}</BotonAccion>
        <BotonAccion tono="principal" @click="agregar">{{ t('comun.aceptar') }}</BotonAccion>
      </template>
    </ModalBase>
  </div>
</template>
