# D-095：新版服务器发布与测试账号交付

2026-09-11，负责人明确授权上传服务器，提供 SSH 登录方式，并要求不影响其他项目；另授权将 SSH 凭据保存到本地。已完成发布。

## 已发布与保留范围

- 地址：`https://sysuzgxytj.top/welcomeparty/`。
- Release：`/opt/sysu-welcome-internal/releases/20260911-d095-8cb053412900`；455 个源码/编译/迁移文件，包含已授权的 D-088～D-094 改动。
- 归档 SHA-256：`cf3024109659915304d7bed77153aeb155be019b763e49c599f85975eebc19eb`，10,834,850 字节。HEAD 仍为 `6bc38222a15b8b9f7d1eb3745729eed5ad582c0c`，发布内容以 RELEASE.json 的实际文件哈希为准。
- 只短暂停止并重启 `sysu-welcome-internal`，新 PID 887515；数据库 schema 17→19，resetEpoch 8、publicSeq 37、REHEARSAL / RUNNING / PROGRAM_SUPPORT、runRevision 15 及当前节目保持。
- 旧晚会项目 PID 1387993、Nginx PID 1286、3000 端口另一个 Node 服务监听状态均保持。Nginx 配置未改，哈希保持 `861f96e80fca999db4770af730b8a6818e4100c6301156340529106d14024391`；域名根站 200。
- 新版所需 pinyin-pro 3.29.3 单独落入新 release 的 backend/node_modules；下载包 SHA-512 与 pnpm-lock.yaml 一致，无其他运行依赖版本变更或全局安装。

## 数据升级与回退

先在隔离副本演练，随后对实际库执行经验证的维护入口。现有 `program-credits-upgrade.js` 已串联 18、19 两次迁移，一次从 17 到 19；不能再重复调用只接受源 schema 18 的入口。初次副本演练的第二条命令因副本已经是 19 被拒绝；原线上服务始终未受该演练影响。

实际升级前一致性备份：`/var/lib/sysu-welcome-internal/d095-deployment/schema17-before.sqlite`，权限 0600，SHA-256 `eca4e89086c0743f1b2c2fe2ae49eb3b1fac5bfebb9183a8995df395cb7e3efa`。45 张原有表的全部既有字段和行，在备份与升级后逐项一致；新列和新互动表按迁移添加。

旧 release `20260909-d086-22255b85640d` 保留。跨 schema 回退必须只停止本项目，同时恢复上述 schema-17 数据备份和旧 release；不得只切换旧代码连接 schema-19 库。恢复前要保存此后新增记录。本次自动失败回退分支未触发。

## 验证与交付

- 51 个文件、471 项单元/API/集成测试通过；后端构建、部署静态检查、/welcomeparty/ 生产前端构建通过。
- 服务器 v2 完整验证通过，300 个合成身份。455 个文件哈希及公开前端静态文件哈希匹配发布清单。
- 公网手机、大屏、主控均为 200，Vue 挂载成功，无页面脚本异常或请求失败；截图位于 `output/deploy-d095/`。
- 主控在线登录及快照 200。20 个旧邀请、30 个手动登录账号与服务器当前启用凭据一致，汇总位于仓库外 `.welcome-internal-access/全部测试账号-20260911.html`；凭据未上传静态站点。
- SSH 登录凭据按负责人授权保存在仓库外 `.welcome-server-access/`，采用 Windows 当前用户 DPAPI 加密并限制目录 ACL；部署工具读取后只在进程内解密，没有写入发布包或日志。

当前保留旧测试轮次的 21 项目录，未擅自清空。新版 22 项预设已随代码上线；从头测试需要先备份/复位合成轮次，再通过主控载入该预设，已单独询问负责人。真实手机、OBS/LED 设备和长时间现场负载仍未代验。

