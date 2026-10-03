import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore, RETURN_KEY } from '@/stores/auth.js'

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    // Públicas: las ve cualquier visitante
    { path: '/',          name: 'explore',          component: () => import('@/views/ExploreView.vue') },
    { path: '/i/:token',  name: 'shared-inventory', component: () => import('@/views/InventoryPublicView.vue'), props: true },
    { path: '/u/:id',     name: 'user',             component: () => import('@/views/UserProfileView.vue'),     props: true },

    // Requieren sesión
    { path: '/inventories',     name: 'my-inventories', component: () => import('@/views/MyInventoriesView.vue'), meta: { requiresAuth: true } },
    { path: '/inventories/:id', name: 'inventory-edit', component: () => import('@/views/InventoryEditView.vue'), props: true, meta: { requiresAuth: true } },
    { path: '/orders',          name: 'orders',         component: () => import('@/views/OrdersView.vue'),        meta: { requiresAuth: true } },

    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

router.beforeEach(async to => {
  const auth = useAuthStore()
  await auth.init()

  // Volvemos de Discord: retomar la página donde el visitante se quedó
  if (auth.user) {
    const back = sessionStorage.getItem(RETURN_KEY)
    if (back) {
      sessionStorage.removeItem(RETURN_KEY)
      if (back !== to.fullPath) return back
    }
  }

  // Backend caído: no tiene sentido mandar a Discord; volvemos a Explorar con el aviso visible
  if (to.meta.requiresAuth && !auth.user && auth.error) return { name: 'explore' }

  if (to.meta.requiresAuth && !auth.user) {
    auth.login(to.fullPath)
    return false
  }
})

export default router
