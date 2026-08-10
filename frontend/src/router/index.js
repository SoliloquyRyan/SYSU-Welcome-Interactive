import { createRouter, createWebHistory } from 'vue-router'

import AdminPage from '../pages/admin/AdminPage.vue'
import ScreenPage from '../pages/screen/ScreenPage.vue'
import WelcomePage from '../pages/student/WelcomePage.vue'
import { captureInvitationTokenFromUrl } from '../services/invitation-entry'

// Clean the invitation credential before createWebHistory snapshots the initial
// location; otherwise the router can restore the original query string.
captureInvitationTokenFromUrl()

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/welcome',
    },
    {
      path: '/welcome',
      name: 'welcome',
      component: WelcomePage,
      meta: { title: '星际信标' },
    },
    {
      path: '/screen',
      name: 'screen',
      component: ScreenPage,
      meta: { title: '现场大屏' },
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminPage,
      meta: { title: '现场控制台' },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/welcome',
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  document.title = `${to.meta.title ?? '创新互动系统'} · SYSU Welcome`
})

export default router
