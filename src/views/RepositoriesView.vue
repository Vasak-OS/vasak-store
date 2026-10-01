<script setup lang="ts">
/**
 * De dónde salen los paquetes.
 *
 * Los protegidos —`core` y `extra`— aparecen con el conmutador apagado y
 * explicando por qué: se puede editar `/etc/pacman.conf` a mano, pero un clic
 * no puede dejar la máquina sin actualizaciones de seguridad.
 *
 * Cada fila es una `SettingRow` de la librería dentro de su tarjeta: el
 * conmutador adelante, el nombre y su estado, y la acción a la derecha, que en
 * una ventana angosta baja debajo del nombre. Lo que no entra en una línea —los
 * servidores, la lista de réplicas, la nota de protegido— va al pie de la fila.
 * El formulario de agregar usa `FormGroup`, que ata cada etiqueta a su campo.
 */
import { useI18n } from '@vasakgroup/tauri-plugin-i18n';
import {
	ActionButton,
	Badge,
	EmptyState,
	FormGroup,
	ListCard,
	LoadingState,
	PageHeader,
	SettingRow,
	SwitchToggle,
	TextInput,
} from '@vasakgroup/vue-libvasak';
import { onMounted, ref } from 'vue';
import AppDialog from '@/components/ui/AppDialog.vue';
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

const list = ref<Repositorio[]>([]);
const loading = ref(true);
const failure = ref('');
/** El error de la lectura, que deja la pantalla sin nada que mostrar. */
const unreadable = ref('');
const form = ref<HTMLFormElement | null>(null);
const adding = ref(false);
const draft = ref({ nombre: '', servidor: '', siglevel: 'Required DatabaseOptional' });

async function load() {
	loading.value = true;
	failure.value = '';
	unreadable.value = '';
	try {
		list.value = await pedirRepositorios();
	} catch (error) {
		// Aparte del error de una acción: si no se pudo leer, no hay lista que
		// mostrar, y la pantalla tiene que decir eso en lugar de quedar en blanco.
		unreadable.value = String(error);
	} finally {
		loading.value = false;
	}
}

/**
 * Pide al formulario que valide antes de mandar.
 *
 * El botón de confirmar está en el pie del modal, fuera del `<form>`, así que
 * no puede ser de tipo `submit`. Llamando a `add` directo se salteaba la
 * validación de los campos obligatorios y se mandaba un formulario vacío al
 * servicio, que contestaba un error críptico en vez de señalar el campo.
 */
function submit() {
	form.value?.requestSubmit();
}

async function toggle(repository: Repositorio, active: boolean) {
	failure.value = '';
	try {
		await cambiarRepositorio(repository.nombre, active);
	} catch (error) {
		failure.value = String(error);
	}
	await load();
}

async function add() {
	failure.value = '';
	try {
		await agregarRepositorio(draft.value.nombre, draft.value.servidor, draft.value.siglevel);
		adding.value = false;
		draft.value = { nombre: '', servidor: '', siglevel: 'Required DatabaseOptional' };
	} catch (error) {
		failure.value = String(error);
	}
	await load();
}

async function remove(repository: Repositorio) {
	failure.value = '';
	try {
		await quitarRepositorio(repository.nombre);
	} catch (error) {
		failure.value = String(error);
	}
	await load();
}

onMounted(async () => {
	await Promise.all([load(), ajustes.cargado ? Promise.resolve() : ajustes.cargar()]);
});
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
    <PageHeader :title="t('repositorios.titulo')" :description="t('repositorios.explicacion')">
      <template #actions>
        <ActionButton :label="t('repositorios.agregar')" @click="adding = true" />
      </template>
    </PageHeader>
    <p v-if="failure || ajustes.falla" class="text-sm text-status-error">
      {{ failure || ajustes.falla }}
    </p>

    <!-- El AUR va acá y no al lado del buscador, que es donde estaba. Prender
         el AUR no es una forma de buscar: es agregar una fuente de paquetes,
         con otro nivel de confianza, y eso es el tema de esta pantalla. Queda
         puesto entre sesiones, como los demás. -->
    <section class="rounded-corner-l border border-status-warning/50 bg-status-warning/5 p-3">
      <SettingRow :label="t('origen.aur')" :description="t('repositorios.aurNota')">
        <!-- Deshabilitado hasta saber cómo estaba: antes de leer los ajustes el
             conmutador se dibuja apagado, y tocarlo ahí guardaría «encendido»
             sobre un estado que todavía no se conocía. -->
        <template #leading>
          <SwitchToggle
            :model-value="ajustes.aur"
            :disabled="!ajustes.cargado"
            :label="t('origen.aur')"
            @update:model-value="(value: boolean) => ajustes.cambiarAur(value)" />
        </template>
        <Badge variant="outline" tone="warning" :label="t('repositorios.sinRevisar')" />
      </SettingRow>
    </section>

    <LoadingState v-if="loading" size="sm" :label="t('comun.cargando')" />
    <EmptyState
      v-else-if="unreadable"
      icon="dialog-error"
      :title="t('comun.noSePudoLeer')"
      :note="unreadable">
      <ActionButton variant="secondary" :label="t('comun.reintentar')" @click="load" />
    </EmptyState>
    <ul v-else class="flex flex-col gap-2">
      <li v-for="repository in list" :key="repository.nombre">
        <ListCard custom-class="block!">
          <SettingRow
            :label="repository.nombre"
            :description="repository.activo ? t('repositorios.activo') : t('repositorios.inactivo')">
            <template #leading>
              <SwitchToggle
                :model-value="repository.activo"
                :disabled="repository.protegido"
                :label="repository.nombre"
                @update:model-value="(value) => toggle(repository, value)" />
            </template>
            <ActionButton
              v-if="!repository.protegido"
              variant="danger"
              :label="t('repositorios.quitar')"
              :title="interpolar(t('repositorios.confirmarQuitar'), repository.nombre)"
              @click="remove(repository)" />
            <template #footer>
              <span class="flex min-w-0 flex-col gap-0.5">
                <span v-for="server in repository.servidores" :key="server" class="break-all text-tx-muted text-xs">
                  {{ server }}
                </span>
                <span v-if="repository.lista" class="break-all text-tx-muted text-xs">
                  {{ t('repositorios.lista') }}: {{ repository.lista }}
                </span>
                <span v-if="repository.protegido" class="text-tx-muted text-xs leading-relaxed">
                  {{ t('repositorios.protegidoNota') }}
                </span>
              </span>
            </template>
          </SettingRow>
        </ListCard>
      </li>
    </ul>

    <AppDialog :open="adding" :title="t('repositorios.agregar')" @close="adding = false">
      <form ref="form" class="flex flex-col gap-3" @submit.prevent="add">
        <FormGroup :label="t('repositorios.nombre')">
          <template #default="{ id }">
            <TextInput :id="id" v-model="draft.nombre" required />
          </template>
        </FormGroup>
        <FormGroup :label="t('repositorios.servidor')">
          <template #default="{ id }">
            <TextInput :id="id" v-model="draft.servidor" required mono placeholder="https://…/$arch/$repo" />
          </template>
        </FormGroup>
        <FormGroup :label="t('repositorios.firma')" :help="t('repositorios.firmaNota')">
          <template #default="{ id, describedBy }">
            <TextInput :id="id" v-model="draft.siglevel" required :described-by="describedBy" />
          </template>
        </FormGroup>
      </form>
      <template #footer>
        <ActionButton variant="secondary" :label="t('comun.cancelar')" @click="adding = false" />
        <!-- Por `requestSubmit` y no llamando a `add` directo: así los
             campos obligatorios se validan y el navegador señala el que falta,
             en vez de mandar un formulario vacío al servicio. -->
        <ActionButton :label="t('comun.aceptar')" @click="submit" />
      </template>
    </AppDialog>
  </div>
</template>
