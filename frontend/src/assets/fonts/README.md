# 本地字体体系（D-104）

手机所有组件、输入框、数字、弹窗与正文统一使用 Welcome Sans SC（Noto Sans SC 2.004 的重命名子集），大屏正文也使用此字体。`welcome-sans-sc-ui.woff2` 为轻量固定 UI 核心，其余源字库字形按 384 个字符拆成互不重叠的 WOFF2；`unicode-range` 让浏览器只请求当前文字所需的文件。Emoji、源字库未覆盖的字与加载失败保留可读兜底。后台字体保持自身控台规范。

大屏几何标题使用得意黑 Smiley Sans 2.0.1，英文与数字使用 Oxanium。两者只在大屏的标题及重点数字应用，不会作为手机字体请求。

来源：

- [Noto CJK](https://github.com/notofonts/noto-cjk)，固定提交 `523d033d6cb47f4a80c58a35753646f5c3608a78`；来源与核心字符范围在 `welcome-sans-sc-ui.json`。
- [Smiley Sans 2.0.1](https://github.com/atelier-anchor/smiley-sans/releases/tag/v2.0.1)，使用官方 TTF WOFF2。
- [Oxanium](https://github.com/sevmeyer/oxanium)，官方可变 TTF 转成 WOFF2，固定提交见 `font-ranges.json`。

三款字体遵循 SIL OFL 1.1，完整许可证在 `frontend/public/licenses/`，随站点同源提供。`font-ranges.json` 记录每一产物及源包的 SHA256、Unicode 范围和体积。应用构建不下载字体、不依赖 Python；复建入口为 `scripts/build-mobile-font.py`、`scripts/build-font-ranges.py`。私有姓名、名册和数据库不参与字体构建。

## D-105 标题补充

下段为 D-105 时点记录；D-106 已接入负责人提供的方线体，见文末。

大屏英文标题 / 数字使用 Orbitron 本地可变字体，抒情与器乐标题使用 Source Han Serif SC 2.003R 子集，重命名为 Welcome Stage Serif。中文方线体文件及网页嵌入授权待提供，当前使用得意黑回退。手机 / 姓名 / 正文仍使用 Welcome Sans SC；不会请求上述标题字体。

来源：[Orbitron](https://github.com/google/fonts/tree/main/ofl/orbitron)、[Source Han Serif](https://github.com/adobe-fonts/source-han-serif)。`stage-fonts.json` 记录来源、SHA256、覆盖范围与实际字节。OFL 位于 `frontend/public/licenses/`；子集构建使用 `scripts/build-stage-fonts.py --sources <源包目录>`，不读取姓名或数据库。旧 Oxanium 文件与 D-104 来源记录保留供恢复参考。

## D-106 方线体

负责人提供 `FZZH-FangXTJ-L.TTF`（FZZH-FangXianTiS Light），用于本地大屏几何标题。`fangxian-title.woff2` 为 48,280 字节标题子集，保留原始名称 / 版权元数据；来源校验与字符覆盖见 `fangxian-title.json`，复建入口为 `scripts/build-fangxian-font.py --source <原文件>`。原始 TTF 留在负责人提供的位置，运行包不复制整套字库。当前未附独立的网页再分发许可文件；本字体不属于前述 OFL 资产。本地构图可审阅，公开发布另行核对。手机继续只请求 Welcome Sans SC，加载失败与缺字保持回退。

D-107 补充（2026-09-16）：负责人已认可当前版本并明确授权上传 GitHub 与服务器，方线体标题子集随本次版本发布。上述 D-106 来源、原始元数据与“未另附许可文件”的事实保留，不将其改标为 OFL；授权范围与发布记录见 `docs/D107_RELEASE_AND_HOST_CUES.md`。
