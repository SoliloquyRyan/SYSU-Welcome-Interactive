# 历史美术与渲染器索引

这些文件于 D-102 清理时从运行源码目录移入归档，原始字节保持不变。它们用于审美比较和旧版实现借鉴，不由当前页面加载。

| 历史阶段 | 参考文件 | 当前说明 |
|---|---|---|
| D-040 手机与大屏底图 | [手机旧底图](./mobile/nebula-master.webp)、[大屏尘埃图](./screen/deep-space-dust-d040.png) | 已被共享程序化银河取代 |
| D-073 电影感银河 | [预览](./mobile/galaxy-cinematic-d073.webp)、[原图](./mobile/galaxy-cinematic-d073.png)、[来源与提示词](./mobile/galaxy-cinematic-d073.md) | 保留原始 PNG 与运行 WebP |
| D-075 强纹理版 | [预览](./mobile/star-river-d075.webp)、[原图](./mobile/star-river-d075.png)、[来源与提示词](./mobile/star-river-d075.md) | 被柔光版替代的参考稿 |
| D-075 柔光版 | [预览](./mobile/star-river-soft-d075.webp)、[原图](./mobile/star-river-soft-d075.png)、[来源与提示词](./mobile/star-river-soft-d075.md) | 后续被流动银河替代 |
| D-090 银白星舰 | [原始贴图](./gifts/starship-pearl-v2.png) | 当前应用使用 starship-nocturne.svg |
| 早期手机 Canvas 银河 | [完整渲染器源码](../code/mobile-galaxy-renderer.js) | 无当前页面调用，旧纯函数回归测试仍指向此副本 |

[manifest.json](./manifest.json) 记录原路径、现路径、字节数、SHA-256 和源提交 fb45d4c。所有归档文件逐字节校验过。历史来源文档中的“运行素材”等描述保留其当时含义。

需要参考时直接查看此目录；若要重新启用，请从当前渲染器 API、隐私与生命周期约束出发适配，不直接把整个旧版本覆盖回运行源码。

重要代码基线仍在 Git 历史中：D-100 业务提交 e80db41，发布记录提交 fb45d4c。本机 output/deploy-d100 的发布包和清单保留，服务器发布未被本次清理改变。
