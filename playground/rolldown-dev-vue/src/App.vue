<script setup>
import { ref } from 'vue'
const count = ref(0)
</script>

<template>
  <h1>Vite + Vue</h1>
  <button type="button" @click="count++">Count: {{ count }}</button>
</template>

<!-- TODO: scoped css -->
