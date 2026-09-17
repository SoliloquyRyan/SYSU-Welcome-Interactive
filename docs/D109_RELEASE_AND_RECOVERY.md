# D-109：发布与恢复索引

## 发布状态

2026-09-18，负责人已授权前后端、数据升级与主持对稿包配套发布。发布验证进行中；本页在公网核验后补充实际版本和结果。

本轮不会执行正式重置。发布前线上为 D-108、schema 22、LIVE / COMPLETED、epoch 1。新版本复制并校验现有数据库，再在独立路径保留升级至 schema 23；D-108 原代码、原库与鉴权文件保持可用。

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
