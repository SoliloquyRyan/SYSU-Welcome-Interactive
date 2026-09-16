# D-107：D-106 发布与主持人动画对稿

2026-09-16，负责人认可当前版本，明确授权上传 GitHub、既有服务器，并要求各个环节的动画方便主持人对稿。

## 发布范围

- D-102～D-106 已认可的清理、历史归档、OBS 式控台、节目星城、一人一星、字体和礼物动效。
- GitHub 沿用 `feature/screen-six-stage-experience`，不改写历史。
- 服务器仅更新 `sysu-welcome-internal` 与 `/welcomeparty/`；前后端配套发布，schema 保持 21。
- 保留当前场次与运行目录，不复位线上数据，不替换节目目录；新 25 项预设仍由主控在待开始状态明确载入。
- 用户提供的方线体子集随当前版本发布，来源与原始元数据继续保留，不改写其许可声明。

## 发布前实查

服务器为 D-100，release `20260913-d100-572241664f6f`，487 项文件全部与清单匹配。schema 21，SQLite 完整性正常；epoch 12、REHEARSAL / RUNNING / COOPERATIVE_LIGHT、FINALE_PREVIEW，6 颗已入场星。晚会服务、旧站点与 Nginx 均 active。

## 主持人材料

动画从独立合成排练实例的实际页面录制，节目名称、表演者来自仓库已确认目录；示例星号、投票和获奖名单不是现场结果。注明每段动画触发、自动时长、等待口令和主控动作。录制不改变线上场次。

## 验证与发布结果

发布前 56 个测试文件 / 521 项单元与集成测试通过；Chromium、Chrome、Edge 共 48 项专项流程回归通过，无失败、无跳过。类型检查、E2E 类型检查、构建、部署清单检查、生产启动冒烟通过。

本地首次排练启动检查完成合成库初始化后，受 Windows TCP 保留范围 2922～3021 影响，不能绑定固定端口 3000（EACCES），该项记录为环境阻塞；没有为此修改系统网络、关闭其他应用或重置数据。采用独立动态端口的三浏览器流程及生产启动验证已通过。

本轮不重新声称 OBS 30 分钟耐久或微信 / LED 真机通过；D-105 的耐久结果保留为历史基线。本次发布结果如下。

## 已发布结果

- GitHub：代码提交 `f55f423`，对稿包构建与说明提交 `ff87c4f424d9eb1048aecac1e9a38fc42016a0a6`，均已推送原功能分支。版本附件见 [D-107 release](https://github.com/SoliloquyRyan/SYSU-Welcome-Interactive/releases/tag/d107-20260916)。
- 服务器 release：`/opt/sysu-welcome-internal/releases/20260916-d107-d68c537d2ca5`，814 项清单哈希一致；199 项公开文件通过逐文件 HTTPS 内容校验，视频 Range 请求返回 206。
- 发布包 SHA-256：`f9adaf47e3514841b4a90052faae4f5c088799761a61cfb27ded5496f6aa8ffc`。
- 数据库仍为 schema 21，无迁移或复位；50 张业务 / 配置表逐行保持，场次 epoch 12、排练／运行中／协同点亮及终章预览、观众星、当前节目与互动状态保持。现有目录实际为 25 项。
- 一致性备份：`/var/lib/sysu-welcome-internal/d107-deployment/schema21-before.sqlite`，权限 0600，SHA-256 `8cc8ccb635f09ec2e46882cdfd08fd88bd8813788749a26ba26de213cedbd8ec`。
- 只重启晚会服务；其他项目 PID、3000 监听、Nginx PID 与配置哈希保持。公网健康、协议、三端页面、后台登录、公开大屏实时帧和主持页视频播放通过。
- 传输先后尝试 SSH、GitHub 下载与分段 CDN 下载；所有候选均在完整 SHA-256 匹配后才解包，下载期间旧服务一直运行。
- 最终公网浏览器核验覆盖手机入口、大屏、后台登录页和主持对稿页：页面无 JavaScript 异常与未完成的失败请求，手机字体及大屏方线体等实际加载成功，大屏收到实时帧，主持视频正常播放。首次截图出现字体等待超时，随后发现检查脚本在 CLI 沙箱中使用了不可用的 `URL` 全局；修正检查脚本并放宽字体等待后全项通过，初次失败日志保留。
- 已清理本次传输产生的 29 个临时文件，回收 140,983,749 字节；完整发布包、旧 release 和数据备份继续保留。

## 对稿交付

[在线动画与口令](https://sysuzgxytj.top/welcomeparty/host-cues/index.html) · [离线 ZIP](https://sysuzgxytj.top/welcomeparty/host-cues/host-cues-d107.zip) · [GitHub 备用附件](https://github.com/SoliloquyRyan/SYSU-Welcome-Interactive/releases/download/d107-20260916/host-cues-d107.zip)

36 段视频、25 项目录（19 个表演节目）；当前大屏 33 段、手机选色入场 1 段，另收录 D-106 手机收礼与 D-105 带声音 OBS 参考各 1 段并注明版本。节目媒体使用已有素材静态关键帧演示叠层。所有示例互动、分数、名单均为合成排练。

离线包 53,498,304 字节，SHA-256 `63e2280a764f7c86f3f0ab9644ee950e826cacaa96313c12dacb7d1e3cb9f25c`。主持页的 36 段媒体加载、5 类抽样播放和 390 px 无横向溢出通过。CLI 禁止 file 协议导航，因此离线校验范围是 ZIP 完整性、相对引用与本地 HTTP 播放；不把该工具限制写成已经完成的文件双击验收。

应用主体的字体／背景保持 D-106，主持媒体位于独立 `host-cues/` 目录，手机与控台入口不请求这些录像。

## 恢复索引

D-100 release 及各历史版本、D-102 历史素材归档、D-104／D-105／D-106 本机源码包保留。回退本次应用时停止 `sysu-welcome-internal`，将 `current` 原子切回 `/opt/sysu-welcome-internal/releases/20260913-d100-572241664f6f` 后启动并核验；schema 同为 21，应保留当前数据库，不因回退代码覆盖新产生的记录。备份只在另行确认的数据恢复场景中使用。

证据目录：`D:/Ruan/Documents/SYSU/WHCX/output/d107-release-20260916`。公开素材和源码包不含数据库、邀请凭据、Cookie 或管理密码。
