# D-090：星舰外观、材质与飞行动画重设计

2026-09-11。负责人明确否决原星舰建模并要求重做贴图与动画。本轮仅替换最高档礼物的视觉呈现，覆盖 D-089 的星舰具体美术，其他 D-089 实现保持。

## 新版外观与镜头

- 使用原创银白金属双舷探索舰渲染贴图：拉长舰体比例，补充香槟金嵌线、深色机械舱、装甲缝、冷蓝舷窗与双引擎。图片为透明底，能直接融入 D-086 已认可银河。
- 舰体、金属反射扫光、远近引擎、尾焰、星尘和跃迁环分别成层。正常模式以 CSS transform / opacity 为主要动画属性；反射遮罩复用同一张带 alpha 贴图。
- 先从远处驶入，再用约 1.4 秒的缓行展示段保留材质细节，最后双引擎增强、星尘拉长并向右上方加速离场。跃迁环是细线椭圆，避免高亮实心光团压过舰体。
- 公屏总时长沿用 7.2 秒，手机沿用 5.8 秒；保留数量标记，文案与翼尖分开。镜头依赖组件所在容器尺寸，嵌入预览和实际视口使用同一套动画。
- 减少动态直接显示静态舰体及礼物数量。贴图加载失败时显示静态礼物名称及数量，不留下破图。原有事件去重、限量并行、计时清理、隐藏页面处理及账目逻辑保持。
- 使用透明贴图与 CSS 透视合成，未引入新的 3D 引擎或运行时依赖。贴图在组件模块加载时预热；加载完成与否不影响礼物计数或扣费。

## 素材与生成记录

使用内置 imagegen 工具生成，未使用 CLI/API 回退。输出为 2172 × 724 PNG，1,312,832 bytes，保留透明通道。

- 正式项目素材：`frontend/src/assets/gifts/starship-pearl-v2.png`
- 正式组件：`frontend/src/components/GiftStarshipFlight.vue`
- 原版组件及本轮修改前文档备份：`output/backups/d090-before-20260911/`
- 可离线重播预览：`output/playwright/d090-starship/index.html`，由 `node scripts/build-cinema-preview.mjs output/playwright/d090-starship` 生成，提供播放、定格、镜头进度、手机/公屏切换和静态回退；`?shot=starship` 直接展示材质定格。
- 预览使用正式组件与正式银河、220 个合成星号，不访问业务数据库。

最终生成提示词：

```text
Use case: stylized-concept.
Asset type: transparent PNG 3D-rendered spaceship cutout for a premium live-event gift animation.
Primary request: Completely redesigned original elegant interstellar exploration flagship, visually exquisite and cinematic, a believable detailed 3D spacecraft with sculpted surfaces, replacing a crude flat wedge.
Composition: one entire spacecraft only, landscape wide canvas, centered with 8 percent clean margin around every part. Nose points toward RIGHT, slightly upward, rear engines toward LEFT. Three-quarter elevated SIDE view: mostly long side silhouette with some top surface visible, no front-facing foreshortening. Silhouette about three times longer than tall. Long tapered central fuselage, sophisticated layered double side nacelles, slender swept curved winglets, beautifully integrated architectural hull. The ship should feel like a luxury futuristic deep-space research yacht, not an airplane, not a battleship, no weapons.
Materials/textures: pearl titanium and satin silver main armor with convincing brushed metal grain, finely beveled panel seams, subtle ceramic panels, dark graphite mechanical recesses and precision vents, restrained warm champagne-gold inlaid rails, tiny ice-blue navigation windows, sculpted reflective cockpit canopy. Strong geometric depth, ambient occlusion between layers, elegant sophisticated modeling rather than random greeble.
Lighting: cinematic studio lighting, broad soft pearl-white overhead key, warm gold rim on upper edges, cool indigo bounce below. Rear engine cores glowing pale cyan with compact halos only; no long exhaust since it will be animated separately in the website.
Background: genuinely transparent alpha, isolated cutout, no floor, no shadow plane, no space background, no stars, no smoke, no portal, no border, no checkerboard baked into the image. Preserve full silhouette, avoid very fine disconnected floating fragments.
No text, no logos, no insignias, no people. Sharp professional premium product visualization, high detail and exceptionally beautiful materials.
```

## 验证范围

- 前端生产构建通过；相关视觉与银河单元测试 2 个文件、21 项通过。
- 最终 Chromium 回归 3/3 通过：D-089 现场互动/批量礼物/谢幕总账、三端完整生命周期、系统减少动态下的静态弹幕和完整公屏动效。2 份星舰在公屏出现，数量、前三档礼物统计和后续谢幕账目一致；用时约 149 秒。脱敏报告保存于 `output/playwright/d090-starship/browser-report.json`。
- Chromium 1920 × 1080 公屏与 390 × 844 手机构图已检查；公屏检查 22%、54%、75%、86%、100% 的关键帧以及静态结果。
- 两端减少动态检查无存活 CSS 动画；公屏静态舰体位置跨 650ms 保持不变。双端完整自然播放均按原时长移除组件。使用故意缺失的素材 URL 检查手机失败回退，名称及 ×2 数量可见，动画为零。
- 正常预览控制台 0 错误、0 警告；故障模拟仅产生预期的素材 404。文档链接及决策顺序检查通过，`git diff --check` 无空白错误。
- 本轮不改变数据库、后端、业务状态和依赖清单。尚未发布服务器；真实手机、OBS 和场馆 LED 的观感及性能仍需实机确认。
