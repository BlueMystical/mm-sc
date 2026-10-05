import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api, ApiError, isBackendDown } from '@/api.js'

export const RETURN_KEY = 'mm_return_to'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)     // null = visitante
  const ready = ref(false)
  const error = ref(null)    // código de error si el backend/la base no responden
  let pending = null

  // Consulta la sesión una sola vez; 401 simplemente significa "visitante"
  function init() {
    pending ??= api.get('/auth/me')
      .then(u => { user.value = u; error.value = null })
      .catch(err => {
        user.value = null
        if (err instanceof ApiError && err.status === 401) { error.value = null; return }
        if (isBackendDown(err)) error.value = err.code
        else console.error(err)
      })
      .finally(() => { ready.value = true })
    return pending
  }

  // Reintenta la consulta de sesión (botón "Reintentar" del aviso)
  function retry() {
    pending = null
    return init()
  }

  // Vuelve a pedir el usuario (y su standing) sin tocar el estado de error
  async function refreshUser() {
    try { user.value = await api.get('/auth/me') } catch { /* se queda con lo que había */ }
  }

  // Login con Discord: redirección completa. returnTo = ruta a la que volver después.
  function login(returnTo) {
    if (returnTo) sessionStorage.setItem(RETURN_KEY, returnTo)
    window.location.href = '/api/auth/discord'
  }

  async function logout() {
    await api.post('/auth/logout')
    user.value = null
  }

  return { user, ready, error, init, retry, refreshUser, login, logout }
})
