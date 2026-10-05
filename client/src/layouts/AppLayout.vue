<script setup>
import { computed, ref, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Menubar from 'primevue/menubar'
import Menu from 'primevue/menu'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Avatar from 'primevue/avatar'
import Message from 'primevue/message'
import Drawer from 'primevue/drawer'
import { useAuthStore } from '@/stores/auth.js'
import { LOCALES } from '@/i18n.js'
import { errorText } from '@/api.js'
import StandingBanner from '@/components/StandingBanner.vue'
import { getCookie, setCookie } from '@/cookies.js'

const auth = useAuthStore()
const router = useRouter()
const { t, locale } = useI18n()

// Idioma y tema se guardan en cookies para recordarlos en la próxima sesión
const COOKIE_LOCALE = 'mm_locale'
const COOKIE_THEME = 'mm_theme'

const savedLocale = getCookie(COOKIE_LOCALE)
if (savedLocale && LOCALES.some(l => l.code === savedLocale)) locale.value = savedLocale

watch(locale, l => {
  setCookie(COOKIE_LOCALE, l)
  document.documentElement.lang = l
}, { immediate: true })

// Tema claro/oscuro (por defecto, el del sistema)
const savedTheme = getCookie(COOKIE_THEME)
const dark = ref(
  savedTheme ? savedTheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
)
watchEffect(() => {
  document.documentElement.classList.toggle('app-dark', dark.value)
  setCookie(COOKIE_THEME, dark.value ? 'dark' : 'light')
})

// Panel "Acerca de" (se abre al pulsar el nombre de la app)
const aboutOpen = ref(false)
const GITHUB_URL = 'https://github.com/BlueMystical/Courrier-UEX'
const DONATE_URL = 'https://www.buymeacoffee.com/blue.mystic'
// Versiones livianas del logo (el original pesa ~350 KB): 96 px para la barra, 448 px para el Drawer
const LOGO_SM = '/logo-mmsc-sm.webp'
const LOGO = '/logo-mmsc-md.webp'

// Explorar es público; el resto solo existe para usuarios con sesión
const items = computed(() => [
  { label: t('nav.explore'), icon: 'pi pi-search', command: () => router.push('/') },
  ...(auth.user
    ? [
        { label: t('nav.inventories'), icon: 'pi pi-box', command: () => router.push('/inventories') },
        { label: t('nav.orders'), icon: 'pi pi-shopping-cart', command: () => router.push('/orders') }
      ]
    : [])
])

const userMenu = ref()
const userItems = computed(() => [
  { label: t('nav.profile'), icon: 'pi pi-user', command: () => router.push(`/u/${auth.user.user_id}`) },
  { separator: true },
  {
    label: t('nav.logout'),
    icon: 'pi pi-sign-out',
    command: async () => {
      await auth.logout()
      router.push('/')
    }
  }
])
</script>

<template>
  <Menubar :model="items" class="topbar">
    <template #start>
      <button type="button" class="brand" :aria-label="t('about.open')" @click="aboutOpen = true">
        <img :src="LOGO_SM" alt="" class="logo" width="32" height="32" />
        <span>{{ t('app.name') }}</span>
      </button>
    </template>
    <template #end>
      <div class="actions">
        <Select
          v-model="locale" :options="LOCALES" optionLabel="label" optionValue="code"
          size="small" :aria-label="t('common.language')" class="lang"
        />
        <Button
          :icon="dark ? 'pi pi-sun' : 'pi pi-moon'"
          text rounded severity="secondary"
          :aria-label="dark ? t('common.themeLight') : t('common.themeDark')"
          @click="dark = !dark"
        />
        <template v-if="auth.ready">
          <Button
            v-if="!auth.user"
            :label="t('nav.login')"
            icon="pi pi-discord"
            @click="auth.login($route.fullPath)"
          />
          <button v-else class="user" aria-haspopup="true" @click="userMenu.toggle($event)">
            <Avatar :image="auth.user.avatar ?? undefined" :label="auth.user.avatar ? undefined : auth.user.user_name[0]" shape="circle" />
            <span class="name">{{ auth.user.user_name }}</span>
          </button>
          <Menu ref="userMenu" :model="userItems" popup />
        </template>
      </div>
    </template>
  </Menubar>

  <main class="page">
    <Message v-if="auth.error" severity="warn" :closable="false" class="banner">
      <div class="banner-body">
        <span>{{ errorText(auth.error) }}</span>
        <Button :label="t('common.retry')" icon="pi pi-refresh" size="small" severity="secondary" @click="auth.retry()" />
      </div>
    </Message>
    <StandingBanner />
    <slot />
  </main>

  <Drawer v-model:visible="aboutOpen" position="left" class="about">
    <template #header>
      <span class="about-title">{{ t('app.name') }}</span>
    </template>

    <img :src="LOGO" :alt="t('app.name')" class="about-logo" />

    <section class="about-section">
      <h3>{{ t('about.purposeTitle') }}</h3>
      <p>{{ t('about.purpose') }}</p>
    </section>

    <section class="about-section">
      <h3>{{ t('about.howTitle') }}</h3>
      <ol class="steps">
        <li v-for="n in 4" :key="n">{{ t(`about.step${n}`) }}</li>
      </ol>
    </section>

    <section class="about-section">
      <h3>{{ t('about.moreTitle') }}</h3>
      <p>{{ t('about.more') }}</p>
      <Button
        as="a" :href="GITHUB_URL" target="_blank" rel="noopener noreferrer"
        icon="pi pi-github" :label="t('about.repo')" severity="secondary" outlined
      />
    </section>

    <section class="about-section">
      <h3>{{ t('about.supportTitle') }}</h3>
      <p>{{ t('about.support') }}</p>
      <Button
        as="a" :href="DONATE_URL" target="_blank" rel="noopener noreferrer"
        icon="pi pi-heart" :label="t('about.donate')"
      />
    </section>
  </Drawer>
</template>

<style scoped>
.topbar {
  position: sticky; top: 0; z-index: 20;
  border-radius: 0; border-inline: 0; border-top: 0; padding-inline: 1.25rem;
  background: color-mix(in srgb, var(--p-content-background) 82%, transparent);
  backdrop-filter: blur(10px);
}
.brand { display: inline-flex; align-items: center; gap: 0.6rem; background: none; border: 0; padding: 0.25rem 0.4rem; border-radius: 10px; cursor: pointer; font-family: var(--font-display); font-weight: 700; font-size: 1.2rem; letter-spacing: -0.01em; margin-right: 1.5rem; color: var(--p-primary-color); }
.brand:hover { background: var(--p-content-hover-background); }
.logo { height: 32px; width: auto; object-fit: contain; }
.about-logo { display: block; width: min(100%, 14rem); max-height: 12rem; height: auto; object-fit: contain; margin: 0 auto 1.5rem; }
.about-title { font-family: var(--font-display); font-weight: 700; font-size: 1.25rem; color: var(--p-primary-color); }
.about-section { margin-bottom: 1.5rem; }
.about-section h3 { margin: 0 0 0.5rem; font-size: 1rem; }
.about-section p { margin: 0 0 0.75rem; color: var(--p-text-muted-color); line-height: 1.55; }
.steps { margin: 0; padding-left: 1.2rem; display: flex; flex-direction: column; gap: 0.55rem; line-height: 1.5; }
.actions { display: flex; align-items: center; gap: 0.5rem; }
.user { display: flex; align-items: center; gap: 0.5rem; background: none; border: 0; cursor: pointer; color: inherit; font: inherit; padding: 0.25rem 0.5rem; border-radius: 999px; }
.user:hover { background: var(--p-content-hover-background); }
.name { max-width: 10rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.page { max-width: 1180px; margin: 0 auto; padding: 1.75rem 1.25rem 3rem; }
.banner { margin-bottom: 1rem; }
.banner-body { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
@media (max-width: 600px) { .name { display: none; } }
</style>
