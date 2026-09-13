# D-100：完整更新发布至服务器与 GitHub

2026-09-13，负责人明确要求「把目前所有更新上传到服务器与github」。已完成代码推送与服务器发布。

## 范围

- GitHub：`SoliloquyRyan/SYSU-Welcome-Interactive`，保留并推送当前`feature/screen-six-stage-experience`分支，不改写历史或擅自合并main。
- 服务器：仅`sysu-welcome-internal`与`https://sysuzgxytj.top/welcomeparty/`；D-096～D-099全部代码、静态资源和schema 19→21维护。
- 保留运行中的测试轮次、既有节目目录、身份、礼物、弹幕与抽取记录。25项新节目预设随代码发布，在新轮次待开始状态可由主控载入；不以发布为由复位当前场次。
- SSH凭据仍只在本机仓库外DPAPI存储，运行数据和测试账号文件不进入GitHub、静态目录或发布包。原始未确认节目媒体不自动绑定或上传。

## 发布前证据

D099最终495项测试和三浏览器各10项共30项全部通过，无失败/跳过。发布前核对源文件哈希并进行`/welcomeparty/`路径构建。

服务器实查仍为D095，release `20260911-d095-8cb053412900`；当前resetEpoch 9、REHEARSAL/RUNNING/COOPERATIVE_LIGHT、runRevision 3、FINALE_PREVIEW，21项运行目录。晚会服务、旧项目和Nginx均active，旧项目PID 1387993、Nginx PID1286；原release全部455个清单哈希匹配。

## 发布结果

- GitHub 代码提交：`e80db410a07c19269c6bf103764e06d95a54d388`，已推送 `feature/screen-six-stage-experience`。
- 服务器 release：`/opt/sysu-welcome-internal/releases/20260913-d100-572241664f6f`；487 个清单文件全部匹配，前端所有公开文件内容哈希逐项匹配。
- 发布包 SHA-256：`8def4e05fe98aadee5f23774244d2ab7362c379f588550c8c1fcd9ec495c1cd6`。
- 隔离数据库演练通过后，仅停止并重启晚会服务；schema 19→21，300 个合成身份、resetEpoch 9 保留。升级前 48 张表的既有列与所有记录逐项一致；升级后数据库完整性及 V2 验证通过。
- 备份：`/var/lib/sysu-welcome-internal/d100-deployment/schema19-before.sqlite`，权限 0600，SHA-256 `cf052ab8fa20c2f568c2a852f4d2293a1e3ed6f288a73ae3139da203235490c7`。跨 schema 回滚必须在停服后同时恢复该数据库及 D095 代码，不得只切换旧代码。
- 其他项目 PID、3000 端口监听、Nginx PID 和配置哈希均未改变，三个服务均 active，原站点根路径返回 200。
- 公网 health、协议能力、screen snapshot、后台登录和后台 snapshot 均为 200；仍为原测试轮次、运行状态和 21 项目录。25 项新预设已随代码发布，下一轮待开始时由主控载入。
- Playwright 公网 welcome、screen、admin 三页均 200、Vue 已挂载、无页面异常或网络请求失败；大屏 `wss://sysuzgxytj.top/welcomeparty/ws/v2` 收到实时帧。未登录手机初始身份探测返回预期 401。截图保存在本地 `output/playwright/d100-live/`。
- 本轮另通过生产子路径构建、部署检查及文档检查；此前 495 项测试及 30 项跨浏览器流程证据的 18 份源文件哈希未变。线上检查没有发送礼物、弹幕或改变现场状态，未替代真机及现场 OBS 联调。

入口：[手机](https://sysuzgxytj.top/welcomeparty/welcome)、[主控](https://sysuzgxytj.top/welcomeparty/admin)、[大屏](https://sysuzgxytj.top/welcomeparty/screen)。
