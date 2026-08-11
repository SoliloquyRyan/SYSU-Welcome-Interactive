# 手机端动画协作交接

> 日期：2026-08-11
> 工作基线：`feature/demo-v0`
> 范围：只负责 `/welcome` 的星色、入场过场与手机端环境动效

## 一键进入

Windows 下直接双击仓库根目录的 `打开手机端预览.cmd`。该入口会自动进入仓库、查找系统或 Codex 自带的 `pnpm`，并仅在首次缺少依赖时执行冻结锁文件安装。

如需使用终端，也可以在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm preview:mobile
```

第二条命令会启动隔离的临时后端与真实前端，自动打开 `390×844` 可见浏览器，完成备用核验并停在“选择你的恒星色温”。点击“确认星色 · 进入星辰”即可观察过场。关闭浏览器或按 `Ctrl+C` 会删除临时数据库并释放端口。

该入口不读取 `backend/.data/`，不输出邀请令牌、合成姓名、Demo 码或后台密码，也不会建立正式业务后门。

## 主要修改位置

- `frontend/src/pages/student/WelcomePage.vue`
  - `.temperature-*`：恒星色温选择页；
  - `.arrival-transition*`：星辰进入中央、轨道与感知波；
  - `@keyframes arrival-*`：路径、波纹、星点和文字入场；
  - 文件末尾 `prefers-reduced-motion`：减少动态效果终态。
- `frontend/src/services/star-temperature.js`
  - Kelvin 范围、颜色计算和 CSS 变量；除非产品负责人确认，不要修改数据范围和持久化语义。
- `frontend/src/styles/motion.css`
  - 全局动效基线；修改会影响三端，必须谨慎。

## 可以做

- 调整过场节奏、缓动、透明度、轨道形状和感知波层次；
- 改善星点从星海进入中央的连续性；
- 优化 390×844、较矮手机和高分辨率手机上的构图；
- 用纯 CSS、SVG 和现有 Vue 组件实现，不新增大型动画库；
- 保持深午夜蓝、发光圆点恒星、克制轨道与低密度星海的视觉根基。

## 不要做

- 不恢复怀士堂线稿、紫粉渐变、玻璃卡片墙、emoji 或粒子雨；
- 不修改后端、数据库迁移、共享契约、身份核验、积分、弹幕或后台逻辑；
- 不读取或提交 `backend/.data/`、`tests/reports/`、真实 `.env`、凭据、截图中的核验信息；
- 不删除“跳过过场”，不让信息依赖动画结束才出现；
- 不破坏 `prefers-reduced-motion: reduce`，该模式必须直接显示静态终态。

## 交付门槛

```bash
pnpm --filter @sysu-welcome/frontend build
pnpm typecheck:e2e
pnpm exec playwright test tests/e2e/entry-device.spec.ts --project=chromium-ci
```

同时人工确认：

- 390×844 无整页横向或纵向滚动；
- “跳过过场”触控区域至少 44×44px；
- 动画结束后时光胶囊提交按钮无需滚动即可触及；
- 减少动态效果模式没有无限装饰动画；
- 页面没有真实姓名、学号、邀请码、Cookie 或后台凭据。

建议从 `feature/demo-v0` 新建 `feature/mobile-arrival-animation`，只提交表现层和对应测试，完成后发 Pull Request 由项目负责人确认视觉方向。
