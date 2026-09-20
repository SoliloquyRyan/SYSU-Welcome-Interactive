# D-114 实施记录

日期：2026-09-18
范围：本地账号核验资料、手机端入场视觉、断网静态舞台备用文件。

## 已完成

- 从受保护正式资料只读核对 256 名学生、50 名工作人员和 1 个后台用户名 `event-admin`。游客不预建账号，仍由服务器按昵称和星色动态创建。
- 账号导出和抽样脚本：`pnpm accounts:export`、`pnpm accounts:select -- --student 1 --staff 2 --guest 2`。输出位于项目外的 `.welcome-test-accounts/D114/`，ACL 仅当前 Windows 用户和 `SYSTEM`；聊天、PPT、公开构建物不包含密码、学号或 NFC 私密映射。
- 手机端移除生产页面中的 `OpeningMusic` 挂载，不创建入场 `AudioContext`；姓名、学号、星色在同一页，游客切换位于主按钮正下方。学生和游客入口在 390×844、390×700 本地排练视口均无页面纵向滚动，游客切换与软键盘聚焦保持可用。
- 新增 `phone-unified-d114.png`，手机核验、等待、节目单、节目、档案和结束页面继续共用同源竖版雾紫城市背景；个人流星和礼物局部反馈业务逻辑保持。
- 生成 `output/d114-offline-ppt/`：48 页可编辑 `.pptx`、48 页静态 `.pdf`、页序索引和内嵌素材。每个目录项目有报幕页，19 个表演项目有独立背景页，互动标题和末页“感谢你的参与”均保留。PPT 手动翻页，不请求网页、WebSocket、远程图片、音频或视频。

## 验证结果

| 检查 | 结果 |
|---|---|
| `pnpm accounts:export` | PASS：256 / 50 / 1，游客创建数 0 |
| `pnpm accounts:select -- --student 1 --staff 2 --guest 2` | PASS：只生成受保护抽样文件 |
| `pnpm typecheck` | PASS |
| `pnpm build` | PASS；手机背景进入产物，旧入场音乐按钮不在构建入口 |
| 本地排练 Chromium 390×844、390×700 | PASS：表单可见，游客入口紧贴确认按钮，无页面滚动；匿名快照 401 属预期 |
| PPTX / PDF | PASS：PowerPoint 导出 48 页，PDF 48 页；首、中、尾页渲染检查通过 |

## 未在本轮执行

- 未部署服务器、未重置或写入正式轮次、未改 schema、未修改 OBS 场景或桥接凭据。
- 微信真机、iOS/Android 软键盘实机、场馆 LED、调音台和 OBS 真实播放链路仍需现场测试；本地排练只验证页面和静态素材加载。

## 本机交付位置

- 账号受保护目录：`D:\Ruan\Documents\SYSU\WHCX\.welcome-test-accounts\D114\`
- 离线舞台包：`output\d114-offline-ppt\`
- D-114 修改前回滚副本：`output\d114-before-20260918-220005\`
- 主持对稿页离线保留位置和 D-109/D-110 恢复材料仍按既有索引保存，未放入断网 PPT。
