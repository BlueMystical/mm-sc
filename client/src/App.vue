<script setup>
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import AppLayout from '@/layouts/AppLayout.vue'
</script>

<template>
  <Toast position="bottom-right" />
  <ConfirmDialog />
  <AppLayout>
    <RouterView />
  </AppLayout>
</template>
