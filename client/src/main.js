import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import Aura from '@primeuix/themes/aura'
import { definePreset } from '@primeuix/themes'
import 'primeicons/primeicons.css'
import '@fontsource-variable/inter'
import '@fontsource-variable/space-grotesk'
import './style.css'

import App from './App.vue'
import router from './router.js'
import { i18n } from './i18n.js'

// Paleta propia sobre Aura: cian como color primario
const MmPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{cyan.50}', 100: '{cyan.100}', 200: '{cyan.200}', 300: '{cyan.300}',
      400: '{cyan.400}', 500: '{cyan.500}', 600: '{cyan.600}', 700: '{cyan.700}',
      800: '{cyan.800}', 900: '{cyan.900}', 950: '{cyan.950}'
    }
  }
})

const app = createApp(App)
app.use(createPinia())
app.use(i18n)
app.use(router)
app.use(PrimeVue, {
  theme: { preset: MmPreset, options: { darkModeSelector: '.app-dark' } }
})
app.use(ToastService)
app.use(ConfirmationService)
app.mount('#app')
