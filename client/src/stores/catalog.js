import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api.js'

// Catálogo de materiales (UEX) para los selectores. Se pide una sola vez.
export const useCatalogStore = defineStore('catalog', () => {
  const items = ref([])
  const loading = ref(false)
  const failed = ref(false)
  let pending = null

  function load() {
    if (!pending) {
      loading.value = true
      failed.value = false
      pending = api.get('/public/commodities')
        .then(data => { items.value = data })
        .catch(() => { failed.value = true; pending = null })   // permite reintentar
        .finally(() => { loading.value = false })
    }
    return pending
  }

  return { items, loading, failed, load }
})
