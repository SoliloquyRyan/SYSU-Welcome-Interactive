# D-073 手机银河素材

2026-09-07，使用内置 imagegen 生成的原创环境素材，无文字、人物、参与者身份或计数。只用于手机银河盘面；真实星号与本人星体仍由页面独立绘制。

- 原始生成图：`galaxy-cinematic-d073.png`，1536 × 1024，1,441,912 bytes。
- 运行素材：`galaxy-cinematic-d073.webp`，1536 × 1024，169,312 bytes。通过浏览器 Canvas `toDataURL('image/webp', .92)` 进行格式编码，尺寸和构图未改变；前端只打包 WebP。
- 新素材替换旧 `nebula-master.webp` 云雾框及正常状态的程序化主盘面。原始旧文件保留供回退，不再由 PersonalJourneyStage 加载。
- 运行时合成：约 700ms 从程序化后备盘面渐入，慢速平移/轻微运镜，独立动态星点。减少动态时直接静态显示；加载失败保留程序化银河。

## 最终生成提示词

Create an original, photorealistic cinematic galaxy texture asset for a refined mobile space-event interface. This is a standalone astronomical matte painting, NOT a UI mockup. Landscape 3:2 composition. A vast spiral galaxy viewed at a low oblique angle, its long axis rising gently about 12 degrees from left to right. Center the galaxy at the exact center of the image. The full galaxy occupies approximately 88 percent of image width and 48 percent of image height; all four outer edges of the canvas smoothly fade to perfectly black with generous empty margins. A luminous yet controlled warm ivory galactic nucleus, fine layered charcoal dust lanes passing in front of the bulge, delicate silver-blue unresolved stellar light, irregular overlapping spiral structures with exquisite thin filament detail and physically believable soft gradients. Much more intricate and photographic than a procedural noise swirl. Subtle cold blue outer disk, restrained warm inner light, near-black deep space, rich dark contrast, no blown-out white core. The galaxy should feel huge, ancient, elegant and immersive, like a high budget science fiction film's deep-space establishing shot. Distinct foreground dust absorption, very fine organic details, no coarse grain or painterly brushstrokes. No large foreground stars, no lens flares or diffraction crosses, no planets, no spacecraft, no black hole, no donut-shaped rings, no colored cloud frame, no stars sprinkled uniformly over the whole canvas. No text, labels, symbols, watermark, logo, borders or user interface. Preserve the black empty canvas outside the galaxy so this asset can be cleanly composited over a dark mobile background with separately animated stars.
