import { createI18n } from 'vue-i18n'
import en from '@/locales/en.json'
import es from '@/locales/es.json'

// Para añadir un idioma: crear src/locales/xx.json y registrarlo aquí y en LOCALES.
export const LOCALES = [
  { code: 'en', label: 'EN' },
  { code: 'es', label: 'ES' }
]

function initialLocale() {
  try {
    const saved = localStorage.getItem('mm_locale')
    if (LOCALES.some(l => l.code === saved)) return saved
  } catch { /* sin acceso a localStorage */ }
  return 'en'   // inglés por defecto
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages: { en, es }
})

document.documentElement.lang = i18n.global.locale.value
