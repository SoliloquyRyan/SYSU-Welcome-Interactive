# D-100：完整更新发布至服务器与 GitHub

2026-09-13，负责人明确要求「把目前所有更新上传到服务器与github」。发布实施中。

## 范围

- GitHub：`SoliloquyRyan/SYSU-Welcome-Interactive`，保留并推送当前`feature/screen-six-stage-experience`分支，不改写历史或擅自合并main。
- 服务器：仅`sysu-welcome-internal`与`https://sysuzgxytj.top/welcomeparty/`；D-096～D-099全部代码、静态资源和schema 19→21维护。
- 保留运行中的测试轮次、既有节目目录、身份、礼物、弹幕与抽取记录。25项新节目预设随代码发布，在新轮次待开始状态可由主控载入；不以发布为由复位当前场次。
- SSH凭据仍只在本机仓库外DPAPI存储，运行数据和测试账号文件不进入GitHub、静态目录或发布包。原始未确认节目媒体不自动绑定或上传。

## 发布前证据

D099最终495项测试和三浏览器各10项共30项全部通过，无失败/跳过。发布前核对源文件哈希并进行`/welcomeparty/`路径构建。

服务器实查仍为D095，release `20260911-d095-8cb053412900`；当前resetEpoch 9、REHEARSAL/RUNNING/COOPERATIVE_LIGHT、runRevision 3、FINALE_PREVIEW，21项运行目录。晚会服务、旧项目和Nginx均active，旧项目PID 1387993、Nginx PID1286；原release全部455个清单哈希匹配。

## 发布结果

待隔离演练、保留数据升级、线上资源核验和GitHub推送后填写。
