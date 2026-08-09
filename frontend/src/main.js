import { createApp } from 'vue'
import './styles/tokens.css'
import './styles/motion.css'
import './style.css'
import App from './App.vue'
import router from './router'

createApp(App).use(router).mount('#app')
