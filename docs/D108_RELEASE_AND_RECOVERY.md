# D-108：正式入场发布与恢复索引

2026-09-17，按负责人授权，D-108 前后端、正式数据配置及主持人对稿材料配套发布。

## 已发布版本

| 项目 | 核验结果 |
| --- | --- |
| GitHub 分支 | `feature/screen-six-stage-experience` |
| 发布源码 | `0f8a4a266079b47f2419ee429c9ce75bae21ccd7`；发布后的记录修订独立提交 |
| 服务器 release | `/opt/sysu-welcome-internal/releases/20260917-d108-faf816d0cf47` |
| 入口链接 | `/opt/sysu-welcome-internal/current` 已指向上述 release |
| 数据 | 独立 PROTECTED / schema 22；256 名学生、50 名工作人员，容量 400 |
| 初始现场状态 | LIVE / READY、0 人入场，25 项目录、19 项表演 |
| 校园奖 | 15、5、10、3、3、20 人，共 56 条；全部未确认、未揭晓 |
| 旧库保留 | D-107 schema 21 排练库保持，52 张表与发布前一致性备份逐项一致 |

正式运行未制造测试登录、锁色、送礼、投票或揭晓。管理员登录只用于读取目录与草稿数量，所有录屏均来自独立合成场次。

## 现场入口与主持人交付

- [统一手机入口 / NFC 网址](https://sysuzgxytj.top/welcomeparty/welcome)
- [后台控台](https://sysuzgxytj.top/welcomeparty/admin)
- [公共大屏](https://sysuzgxytj.top/welcomeparty/screen)
- [主持人动画与口令](https://sysuzgxytj.top/welcomeparty/host-cues/index.html)
- [完整离线包](https://sysuzgxytj.top/welcomeparty/host-cues/host-cues-d108.zip)
- [GitHub 版本附件](https://github.com/SoliloquyRyan/SYSU-Welcome-Interactive/releases/tag/d108-20260917)

35 段本版动画包含 19 个节目、互动、报幕、两端礼物、手机转场、完整电影片尾及带声音 OBS 音乐实录。片尾按真实时间录至定格；165 秒为业务触发后的编排时长，录像包含前后衔接。9 个媒体节目的底图为原素材关键帧，不能替代 OBS 的完整视频播放。

离线包解压后直接打开 `index.html`。已核验 file 页面在 1440px 和 390px 的全部 35 项索引、视频加载与定位、无页面横向溢出；公网 35 段媒体均可访问，片尾和音乐文件支持 206 分段播放。

现场操作见[主控操作单](./LIVE_OPERATOR_GUIDE.md)和[主持人对稿单](./HOST_CUE_GUIDE.md)。真实微信、调音台和 LED 仍需联排。

## 受保护资料

本机资料位于项目外 `.welcome-formal/d108-20260917/`，目录仅当前 Windows 用户及 SYSTEM 可访问。负责人使用其中的 `工作人员账号分发清单.csv` 分发独立账号；后台入口凭据保存在 `负责人入口与保管说明.md`。不把这些文件放入 GitHub、网页或对稿包。

服务器正式资料目录为 `/var/lib/sysu-welcome-internal/formal-20260917-d108/`，目录权限 0700，运行文件 0600，仅晚会服务账号及 root 可访问。服务器仅收到运行库、运行鉴权文件和统一入口映射；未上传原始学生表、派生名单或工作账号分发清单。

## 体积与校验

| 产物 | 字节 | SHA-256 |
| --- | ---: | --- |
| `20260917-d108-faf816d0cf47.tar.gz` | 156130260 | `29e6789dbafef374f95c4b84c24be42792761050eed0f91c5cd9833e11228cda` |
| `host-cues-d108.zip` | 66568852 | `3d9788d4eacfb62e3ca1b637905ae87aa80788ed8f6a503cda5076dfca1e91cd` |
| D-107 schema 21 一致性备份 | 服务端保留 | `fa39b393613eb5b2e97fcef83d986be36a4490b082e703c87fc62bb40422aa5d` |

发布包清单含 819 项文件，不包含名单、数据库或秘密。应用主体不含主持材料为 12,337,157 字节，D-107 为 12,349,174 字节；本版对稿包较旧版增大，主要用于本版原速录制、完整片尾和截图封面。对稿媒体在独立目录，普通手机和控台入口不加载它们。

## 恢复索引

恢复必须配对旧代码和旧排练配置，保留新正式库以及已经产生的全部记录。不能仅切旧代码后继续读取 schema 22，也不能以旧备份覆盖新库。

| 内容 | 保留位置 |
| --- | --- |
| D-107 代码 | `/opt/sysu-welcome-internal/releases/20260916-d107-d68c537d2ca5` |
| D-107 旧排练库 | `/var/lib/sysu-welcome-internal/test-20260906/rehearsal.sqlite` |
| 发布前一致性备份 | `/var/lib/sysu-welcome-internal/d108-deployment/schema21-before.sqlite` |
| 旧配置路径日志 | `/var/lib/sysu-welcome-internal/d108-deployment/config-paths-before.json`，仅允许名单内路径和数量，无秘密内容 |
| 配套恢复入口 | `/var/lib/sysu-welcome-internal/d108-deployment/rollback.sh` |
| D-108 新正式库 | `/var/lib/sysu-welcome-internal/formal-20260917-d108/formal.sqlite`，恢复后继续保留 |
| 本机源码恢复包 | 项目外 `.welcome-recovery/d108/d107-bb313d4-source.zip`，完整哈希见 [D-108 实施记录](./D108_IMPLEMENTATION.md) |

需要恢复时，由服务器操作人员运行上述恢复入口；它仅停止本项目服务、恢复原配置路径、切换旧 release 后启动。恢复后核对服务健康、schema 21 及原排练状态；这会让旧排练环境重新上线，应同步告知现场操作人员。D-108 数据留在原目录，不丢弃后来产生的记录。

发布脚本的异常路径具备同样的配套恢复行为。此次实际切换成功，未人为执行线上往返恢复演练。

## 证据与验证范围

531 项单元 / 集成测试、61 个实际执行浏览器用例通过，构建、类型、文档和部署检查通过。OBS 1080p / 60fps 独立采样 1801.68 秒，400 个合成身份、1140 次送礼全部成功，区间新增渲染丢帧 0。完整口径、历史对照限制及未验实机项见 [D-108 实施与验收记录](./D108_IMPLEMENTATION.md)。

本机证据目录为 `output/deploy-d108/`：`server-verification.json`、`backup-verification.json`、`public-verification/verification.json`、`public-media-verification.json`、`host-verification/verification.json`、`final-artifact-privacy.json` 及 `obs/d108-soak.json`。服务器发布日志目录为 `/var/lib/sysu-welcome-internal/d108-deployment/`，受保护保存。
