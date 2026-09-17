# D-109：发布与恢复索引

## 发布状态

2026-09-18，前后端、数据保留升级与主持对稿包已配套发布，公网核验通过。

本轮未执行正式重置。发布前线上为 D-108、schema 22、LIVE / COMPLETED、epoch 1。新版本已复制并校验现有数据库，在独立路径保留升级至 schema 23；D-108 原代码、原库与鉴权文件保持可用。

## 现场入口

- [手机入场](https://sysuzgxytj.top/welcomeparty/welcome)
- [半屏控台](https://sysuzgxytj.top/welcomeparty/admin)
- [大屏](https://sysuzgxytj.top/welcomeparty/screen)；OBS 视频叠层使用 `?media=overlay`。
- [主持人动画对稿](https://sysuzgxytj.top/welcomeparty/host-cues/index.html)
- [D-109 对稿离线包](https://sysuzgxytj.top/welcomeparty/host-cues/host-cues-d109.zip)

入场与控台口令沿用 D-108 的受保护分发文件，本轮不重新发放工作人员或后台口令。游客仅填写昵称与星色；其浏览器凭据由服务器管理，不另发口令。

## 正式重新开场

仅主控在待开始、暂停或已结束状态点击底部“归档并重置本轮”，输入“重新开场”。系统先完成受保护归档与完整性校验，再开启新轮次。

学生名单、工作人员账号口令、节目目录和校园奖草稿内容保留；人员重新核验与锁色，动力按初始规则建立，校园奖重新确认和揭晓，94 个游客名额全部释放。旧记录留在受保护归档中，公开页面不提供数据库下载。

相同重置请求在响应丢失后重试只返回原结果，不再次清空。业务仍在运行时必须先暂停。具体操作见[主控操作单](./LIVE_OPERATOR_GUIDE.md)。

## 成对恢复边界

| 项目 | 路径或要求 |
| --- | --- |
| D-108 代码 | `/opt/sysu-welcome-internal/releases/20260917-d108-faf816d0cf47` |
| D-108 原库 | `/var/lib/sysu-welcome-internal/formal-20260917-d108/formal.sqlite`，schema 22 |
| D-109 运行库 | `/var/lib/sysu-welcome-internal/formal-20260918-d109/formal.sqlite`，schema 23 |
| 升级前校验归档 | 新运行目录下 `schema22-before-upgrade.sqlite` |
| 发布记录与恢复入口 | `/var/lib/sysu-welcome-internal/d109-deployment/rollback.sh`，仅服务器负责人可访问 |
| 正式轮次归档 | 当前数据库旁 `round-archives/`，保存数据库及校验信息，不复制鉴权文件 |
| 本机源码恢复点 | 项目外 `.welcome-recovery/d109/d108-05adbdb-source.zip` |

恢复入口仅停止本项目服务，成对切回 D-108 代码与 schema 22 原库，再验证服务。D-109 新库、轮次归档以及新产生的记录继续保留，不用旧备份覆盖新数据。恢复到旧库会让网站展示旧版本当时状态，现场须同步核对，不能让旧代码直接打开 schema 23。

本机源码归档 SHA-256：`368bb43ffe8fffaa3212ed299df86440b63fb0d56d5487e027207d2e104e770e`。

## 验收口径

工程、三浏览器、400 身份压力与 OBS 采样详见[实施验收记录](./D109_IMPLEMENTATION.md)。对稿使用独立合成实例录制，节目素材样片使用关键帧参照；不含真实学生资料、账号口令或正式获奖草稿。

微信实机输入法、现场调音台接线、NFC 写卡与场馆 LED 不由桌面浏览器和受控 OBS 测试代签。

## 发布产物与在线核验

| 项目 | 已验证结果 |
| --- | --- |
| 线上 release | `20260918-d109-99bdde4fc401` |
| 实现代码提交 | `fe148777ab3a97e070f9748ee7769969f52efd1e` |
| GitHub 分支 | `feature/screen-six-stage-experience` |
| 线上状态 | LIVE / COMPLETED，epoch 1，0 人已入场；未重置 |
| 名单 | 原 256 名学生＋50 个工作人员保留，游客新增数 0 |
| 原表保留 | 53 张表逐行核对；只按约定修改节目姓名与典礼时长 |
| 发布文件 | 873 个文件 SHA-256 校验通过 |
| 主持材料 | 35 段录像，离线包 23,621,217 字节 |
| 网页核验 | 手机、大屏、已登录 960×900 控台和对稿页无脚本错误 |
| 其他服务 | 原站点、Nginx 均运行，PID 与 Nginx 配置校验值保持 |

发布包 SHA-256：`43595e7bf65a2cea9ba96d69ddc1204c8c95af5f57fb6924fcb42af8f37f4e3a`。离线包 SHA-256：`edd29493a143df5ccbf3c19d94f397977918230b0f8e7645273ec3cbcbf6076c`。受保护 schema 22 升级归档 SHA-256：`0157d7b5841374cfb46e6b4ea86137660a598cd228a2563820b84d30ea5eed3e`。

公网对稿索引与本地一致，35 段媒体的长度匹配，片尾与音乐支持范围请求和定位播放。校园奖保留 15 / 5 / 10 / 3 / 3 / 20 条未确认草稿，未公开获奖内容。主控登录继续使用 Secure / HttpOnly Cookie。

上线后刷新控制网页、手机页面及 OBS 浏览器源，确保已打开的页面加载新版。新一轮必须由主控明确执行底部归档重置；发布不代替该操作。
