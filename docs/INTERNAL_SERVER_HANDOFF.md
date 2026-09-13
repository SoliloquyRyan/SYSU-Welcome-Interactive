# 本次服务器内测运维交接

> **当前 D-100（2026-09-13，已发布）**：全部已完成更新已推送 GitHub 功能分支，并部署至 `/welcomeparty/`，线上 schema 21。原测试轮次与 21 项目录保留；25 项新预设可在下一轮待开始时载入。公开资源、三端页面、后台登录及大屏实时连接已核验，其他项目保持运行。发布、备份和验证见 [D-100](./D100_SERVER_AND_GITHUB_RELEASE.md)。下方版本状态均为当时历史记录。

> D-095（2026-09-11，已部署）：D-088～D-094 前后端已发布，数据库保留升级至 schema 19；其他项目与 Nginx 不变。471 项测试、公网三端和 50 个旧测试身份核验通过。当前仍保留旧测试轮次与 21 项目录，复位并载入新 22 项需主控确认。见 [发布记录](./D095_SERVER_RELEASE.md)。


> **当前 D-087（2026-09-09，已部署）**：已认可 D-086 前端无停服发布，后端保持 D-071 / schema 17。9 个公开文件哈希匹配，后台、其他服务、Nginx 配置及场次保持。发布与回滚见 [D-087](./D087_DEPLOYMENT_FLOW_REVIEW.md)，现场使用 [主控操作单](./LIVE_OPERATOR_GUIDE.md)。下面旧版本通知保留历史。

> D-074（2026-09-07，已部署）：手机与大屏采用极光流线和星尘艺术化画风，深靛蓝暗部抬高；原 D-073 照片式银河退役。后端仍为 D-071 / schema 17，PID、活动状态和其他站点保持。验收见 [D-074 记录](./D074_ARTISTIC_GALAXY_ACCEPTANCE.md)；回退只切回 D-073 release。

> D-073（2026-09-07，已部署）：大屏真实星更清楚，集结页显示完成入场人数；手机换用原创精细银河，旧云雾框退役。后端仍为 D-071 / schema 17，PID 与活动状态保持。验收与回滚见 [D-073 记录](./D073_GALAXY_ARRIVAL_ACCEPTANCE.md)。回退只需切回 D-072 release。

> D-072（2026-09-07，历史版本）：当时前端为电影感银河与星舰修订，并修复手机礼物快照竞争漏播；后端仍为 D-071 / schema 17。仅原子切换前端 release，后台与其他服务 PID、活动状态全部保持。验收及回滚见 [D-072 记录](./D072_CINEMATIC_ACCEPTANCE.md)。回退 D-072 只切回 D-071 release，不动数据库。

> D-071 业务基线为礼物、聊天与个人档案版本，前后端均已发布，服务器合成库已保留升级至 schema 17。手机和 OBS 浏览器源刷新后使用新版。D-071 跨 schema 回退必须同时恢复升级前备份与 D-070 代码，不能只切换 `current`。

实际入口为 `https://sysuzgxytj.top/welcomeparty/`。负责人先提供 `hiwebsun.top`，随后更正；错误域名在本服务器上的旧路由已恢复。本次不修改任何 DNS 记录，不重启旧项目。

| 项目 | 实际值 |
|---|---|
| 操作系统 / Node | OpenCloudOS 9.2 / 现有 Node 22.23.2 |
| 新服务 | `sysu-welcome-internal.service`，专用无登录账号 `sysu-welcome-internal` |
| 监听 | `127.0.0.1:3216`，不增加公网端口 |
| 代码入口 | `/opt/sysu-welcome-internal/current` |
| 当前 release | `/opt/sysu-welcome-internal/releases/20260909-d086-22255b85640d`；D-086 前端 / D-071 后端，schema 17 |
| D-086 前端补丁 SHA-256 | `22255b85640dbee5d5abae7c5542dbdaaf80e02e4d9710bc329aacb81bfdac89`；9 个公开文件，合并清单 430 项 |
| D-074 前端补丁 SHA-256 | `c59863c4026af81f3c423c3f1f33b50554d8ae5317fa3d7e2ac2da7bf67b85ab`；10 个前端文件，合并清单 425 项 |
| D-073 前端补丁 SHA-256 | `23adf3214539b44e6594822084095f5050038483cec7b449361d8382cfd3e307`；11 个前端文件，合并清单 423 项 |
| D-072 前端补丁 SHA-256 | `cb81af533532b1df9bf88ec55d8a33aae070e509c27ee75569bbbffb2c025c03`；11 个前端文件，合并清单 420 项 |
| D-071 发布包 SHA-256 | `6238ab6abe8d3e17af4f183773c506d34f88d9e1fc7fa84438e20615e1503d38`；合并 release 清单 417 项 |
| D-071 升级前备份 | `/var/lib/sysu-welcome-internal/backups/d071-r2-before-20260907.sqlite`；SHA-256 `e5fb6b6e08e40241773aef1456d1e7ec86e8956ebaf4ec25773cb884313c0a9f`；权限 0600 |
| D-070 补丁 SHA-256 | `8477b22394a7faab8934daf5bcafdf26c555b712a6b503ce4559defd22a80b93` |
| D-069 补丁 SHA-256 | `4a7752c8a77bf48c15a6ebd50891d96bef7a8d415c8a34c716b5de7d4e8f806a` |
| D-068 补丁 SHA-256 | `19962f583d536cb9269f3d48f784dfe0342c9153c055af3e8d06f6d6010f1cef` |
| D-066 前端补丁 SHA-256 | `93ce0c7ac0257ce503712b232eca43f0963374d6c7a4b0b068cfbc0dec3eb791`；11 个公开前端文件 |
| 原发布包 SHA-256 | `cd66d9a37a88dd601579227b3bc6a3b9a207913c120cc697121b3b884a6cd173`；原 release `20260906-0a57083c6dbc` 保留 |
| 版本口径 | HEAD 为 `6bc38222a15b8b9f7d1eb3745729eed5ad582c0c`，包含本地未提交改动；D-086 `RELEASE.json` 按实际 430 项记 SHA-256，`PATCH-D086.json` 记录本次前端文件与 16 个已认可来源文件哈希，不能仅用 HEAD 代表发布内容 |
| 测试数据 | `/var/lib/sysu-welcome-internal/test-20260906`；300 人合成 schema 17（由原库保留升级，未重置），实际到场只计激活的测试身份 |
| 服务环境 | `/etc/sysu-welcome-internal/runtime.env`；示例见 [`deploy/runtime-internal.env.example`](../deploy/runtime-internal.env.example) |
| Nginx 路径片段 | `/etc/nginx/snippets/sysu-welcome-internal.conf`；仓库副本见 [`deploy/nginx-welcomeparty.conf`](../deploy/nginx-welcomeparty.conf) |
| TLS / 页面 | 沿用已有域名证书与 Nginx；静态页面、API、WSS 和 Cookie Path 都在 `/welcomeparty/` 内 |
| 旧服务 | `party-screen-site` 继续监听 3100；另一个 Node 服务仍使用 3000；均未停止、覆盖或迁移 |

## D-071 发布验证

2026-09-07 仅停止并重启本项目，创建 schema 16 一致性备份后用专用入口升级至 schema 17，再原子切换 D-071 release。发布后协议 v2 ACTIVE，活动礼物目录精确为 1/5/10/20；epoch 8、RUNNING / REHEARSAL / PROGRAM_SUPPORT、runRevision 15、当前节目与 presentation 保持。

升级前后参与者数量/动力/星光、3 条礼物及实际面值、9 条弹幕、4 条奖励、1 条旧减免、24 项节目/热度、1 颗公开星和抽奖事实逐项一致。新旧迎新服务、其他 Node 服务与 Nginx 均 active，其他服务及 Nginx PID 保持；根站、晚会入口、协议能力和静态文件哈希通过，发布后 5 分钟 warning 日志为空。首次候选版本因历史 `program.changed` 事件含旧 50 面值被保护门拒绝，已自动恢复 D-070；最终版本只为旧持久事件增加解析兼容，活动目录仍由 schema 17 严格验证。

发布后只读 Chromium 打开 `/welcome`、`/screen`、`/admin` 均为 200，Vue 根节点完成渲染，无页面异常或失败请求；未登录手机/后台快照各返回一次预期 401。该探针不登录、不发送业务命令，报告为 `output/gift-experience-20260907/live-readonly-smoke.json`。

## D-070 发布验证

前端原子发布通过，后台 PID 3651641 保持；发布前后 epoch 8、publicSeq 37、RUNNING / REHEARSAL / PROGRAM_SUPPORT、runRevision 15、presentation NONE 均未改变。线上 HTML/JS 哈希匹配，新旧服务和根站正常。455 项自动测试、Chrome 7 项通过，真机输入法体验另计。

## D-069 发布验证

本项目短暂停服后创建 `/var/lib/sysu-welcome-internal/backups/d069-before-20260907.sqlite`，SQLite 完整性通过，备份权限 0600。无需 schema 升级；发布后协议 v2 ACTIVE，现场运行状态、星位、当前节目与抽奖保持，旧项目及 Nginx PID 保持。线上 HTML 和主 JS 与新 release 哈希一致。手机和后台刷新生效，实体手机体验另计。

## D-068 发布验证

2026-09-07 完成前端原子发布：线上 HTML 与主 JS 哈希匹配，协议 v2 ACTIVE，后台 PID 3522956 保持。发布前后 epoch 8、publicSeq 16、RUNNING / REHEARSAL / COOPERATIVE_LIGHT、runRevision 9 与 FINALE_PREVIEW 均未改变；未切换现场场景。Nginx 配置哈希不变，新旧服务及根站检查通过。Chrome 手机布局 2/2 通过，聊天列表独立浏览器验证上翻停留、未读提示、回到最新、超过 9 秒保留、撤回和清屏；实体手机触摸与输入法仍需现场确认。

## 日常检查

D-066 于 2026-09-06 晚更新大屏默认完整动效、静态弹幕及中断恢复。通过原子切换 `current` 发布，无后端重启、数据库写入或 Nginx 变更；后台 PID 3417867，原 LIVE / COMPLETED、epoch 7 和 publicSeq 86 保持。D-066 发布当时后台进程仍使用原 release 的相同后端字节，因此两份 release 都应保留。仅在当时 schema 15 基线上回退 D-066 前端，将 `current` 原子切回 `20260906-0a57083c6dbc` 即可，无需重置或恢复数据库。正常浏览器与 OBS 刷新才能载入新前端；结束状态下刷新只展示结束页，不重播弹幕或转场。操作见 RUNBOOK §5.2，验证见 TEST_PLAN §3.28。

```bash
systemctl is-active sysu-welcome-internal
curl -fsS https://sysuzgxytj.top/welcomeparty/api/health
curl -fsS https://sysuzgxytj.top/welcomeparty/api/protocol-capabilities
journalctl -u sysu-welcome-internal --since '10 minutes ago' --no-pager
```

协议能力应为 `contractVersion: "2"`、`activeRuntimeVersion: "2"`、`activationState: "ACTIVE"`。`/api/ready` 是 v1 入口，在 v2 中会返回 409；不要据此判断新服务不可用。测试操作与两种运行模式的按钮区别见 [`INTERNAL_TEST_20260906.md`](./INTERNAL_TEST_20260906.md)。

服务器 root 密码没有写进本仓库、发布包、服务配置或交接文档。内测管理员和邀请链接单独保存在受控文件中；不把此访问文件放进静态目录。

## 只回退本次入口

原始 Nginx 配置保存在 `/etc/sysu-welcome-internal/nginx-before-20260906.conf`，权限 0600。候选替换前已逐字核验：除指定域名 `/welcomeparty/` 代理块外，其余配置保持一致。

需要回退入口路由时，先确认该配置在本次部署后没有其他人再改动。若已有后续修改，只恢复 `sysuzgxytj.top` 的 `/welcomeparty/` 路由块，让它重新代理 `127.0.0.1:3100`；不要用整份历史文件覆盖后来修改。执行 `nginx -t` 后平滑 reload，再验证根站和旧入口。旧服务及旧数据一直保留，无需恢复旧数据库。

若只回退 D-071 应用版本，不修改 Nginx：先停止 `sysu-welcome-internal`，单独保留当前 schema 17 库，再把 D-071 升级前备份恢复到全新或核验过的运行路径，切回 D-070 release 与同代 manifest 后启动并验证。D-071 上线后产生的互动不能静默丢失；需要保留时先制定转换方案。严禁让 D-070 后端直接打开 schema 17，或仅把 `current` 指向 D-070。

新服务的数据仍在独立目录。若要更新新版代码，先在新的 release 中校验和构建，只停止/切换/启动 `sysu-welcome-internal`，同一测试库只允许一个写实例。不要操作其他服务或将真实 `.private` 数据放入此内测库。

## 验收范围

本机完整 G3 初次运行的单元测试 434 条通过，浏览器 51 项中有 2 项失败、2 项既定跳过。发现节目透明稳态会初始化隐藏 GPU，已修复；对抽奖、三端银河生命周期及先前超时的 v1 完整流程作三浏览器定向复验，9/9 通过。最终银河旧/新核心与子路径专项 27/27 通过，部署静态检查通过。没有把初次 G3 写成全绿。

实际服务器 HTTPS/WSS 三端完整流程已通过，检查后重置合成冒烟数据并重新应用 21 项目录，交付状态为 READY / REHEARSAL。正常 DNS 的健康、协议能力与公开快照均为 200；新旧服务、PM2 和 Nginx 均 active，两域名根站仍为 200。浏览器证据与具体覆盖范围见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.26。实体手机、现场 OBS 合成、LED 屏与长时间负载仍需要今晚人工测试。
