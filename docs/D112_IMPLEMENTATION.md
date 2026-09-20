# D-112 实施记录

## 已完成

- 修复手机端未登录启动时的空白：参与者快照未返回前仍能显示姓名、学号、星色入场表单；慢网络和连接失败不会阻塞 Vue 根页面。
- 修复手机背景的渲染循环：未登录时使用稳定的空星列表引用，避免 Canvas `sky-points` 事件触发父子组件无限重渲染。
- 保留 D-111 的 schema 24、resetEpoch、名单、游客、工作人员、互动音频和节目目录；本轮没有数据库迁移、归档或重置。
- 新发布包不包含 `frontend/dist/host-cues/`；Nginx 对 `/welcomeparty/host-cues/` 与其子路径返回 404。
- 本机离线对稿包、D-111 release 和 `.welcome-recovery/d111/` 均保留。

## 发布结果

- 线上 release：`20260918-d112-ef0307403355`
- 发布包 SHA-256：`a910b9b2e2edf1bf2e80dbc775a15d2494f223a2bbb4b205d1d383391444a03c`
- 当前数据库状态保持：schema 24、resetEpoch 2、`READY`、25 项目录、0 人公开入场。
- `sysu-welcome-internal.service`、Nginx、原站点服务均为 active；应用重启后 `NRestarts=0`。
- `/welcome`、`/screen`、`/admin` 返回 200；对稿索引和子路径返回 404；未登录参与者快照返回预期 401。
- 大屏浏览器检查通过，主题标题存在、旧“星海集结”文案不存在，WSS `/welcomeparty/ws/v2` 保持连接。
- `pnpm obs:audio --check` 通过，三组 `mix` 输入可识别；没有播放、切场或改变 OBS 场景。

## 验证范围与限制

- `pnpm typecheck`、`pnpm deploy:check`、`pnpm test`：544/544 通过。
- 手机 390×844 公网浏览器检查：表单可见，错误学号提示正常，无页面脚本错误。
- 大屏 1920×1080 公网浏览器检查：主题和实时 WebSocket 正常。
- 尚未由本轮桌面检查代替微信真机、NFC 写卡、调音台、场馆 LED 和长时间 1080p/60fps 运行；这些仍需现场联排。

## 恢复边界

- D-111 release 仍保留在服务器：`20260918-d111-8dec402c966c`。
- Nginx 旧配置备份：服务器 `/var/lib/sysu-welcome-internal/d112-nginx-before.conf`。
- 本轮切回只需切换应用 release 并按健康检查重载服务；不要用旧代码直接读取 schema 24 以外的数据。
