# 星城背景 D-103

用途：节目、主持、互动、颁奖共用的低对比城市层；Canvas 星点与节目文字分层渲染。

## 来源与修订

- 2026-09-15，按项目负责人本轮授权，使用 Codex 内置 imagegen 生成原创画面；没有下载图库图，也没有直接复制参考图版面。
- 负责人追加要求：首稿太丰富，会分散学生注意力；改为赛博朋克加微复古。
- 最终方向：紫灰底色、少量青粉灯带、边缘三四座简化建筑、轻微模拟胶片颗粒，中央至少约四分之三作为安静留白。无文字、人物、标识或密集窗格。
- 原始提示摘要：Minimal late-1980s/1990s airbrushed cyberpunk stage backdrop; dusty lavender and slate purple; sparse cyan and muted pink light strips on simple buildings at the far edges; at least 75 percent calm empty center; subtle analog film grain; no text, logos, people, dense city, HUD, cloud sea or fantasy castles.
- 最终生成原件：`C:\Users\Ruan\.codex\generated_images\01a0a525-dc09-7d13-a99a-2320cb78996b\exec-8bc52129-0619-485b-95c6-953a9d553d79.png`，1672 × 941。
- 首张复杂城市稿保存在同一外部生成目录中，未进入运行资源。当前构建只包含下面两个 WebP。
- 变换：使用本机 sharp 编码为 WebP；手机从右侧取景并压缩为 720 × 1100。城市的换色、薄雾、轮廓和星点由应用独立管理。

## 运行资产

| 文件 | 大小 | SHA256 |
| --- | ---: | --- |
| `mist-city-d103.webp` | 22,888 B | `EE2E7622955AAB93C98F833346DEF289525F4548AD722F47A8CF3FBB709575C1` |
| `mist-city-mobile-d103.webp` | 8,980 B | `2E5385326032080BB25479E1949E23F8163414AEE9488103080022148FD7A8F9` |

本记录说明生成来源与项目内用途，不将生成资产声明为第三方开源许可证。负责人提供的学院标志仍为独立、未修改的既有资产。

## D-104 复用与增强

两张已认可的 D-103 图片保持原字节。霓虹轮廓、天线、悬挂灯带，以及雾紫星湾／霓虹轨道／月台星影三组原创 SVG 图层集中在 ProgramStageBackground.vue；无新增图片下载。装饰星点提升为大屏 120、手机 30，独立于真实观众星星。

## D-105 朦胧蒸汽与十种独立构图

`d105/` 中 10 套背景各有 screen / mobile WebP。素材由内置 imagegen 原创生成；依负责人最新修订恢复认可原图的粉紫青蓝色彩，以柔雾与霓虹统一风格；十个节目分别采用水岸、高架、窗廊、夜巷、屋顶、雨窗、山城、玻璃叠片、街角、广场。没有可辨认的天空星星或文字；真实观众星、标题、礼物和音乐调制由应用独立绘制。使用 sharp 仅缩放 / WebP 编码，保留实际分辨率。

完整原件、提示摘要、哈希、屏幕与手机尺寸 / 字节在仓库外 `../output/d105-ui-20260916-134511/art-manifest.json` 和 `art-originals/`；生产构建仅包含 WebP。上方 D-103 原素材与 D-104 三类轮廓仍保留为历史 / 回退。当前运行不再使用 D-104 固定 120 / 30 个装饰星。
