# PPT-html-skill

本地动态 HTML 演示文稿技能，适用于 Codex。提供六种独立的字体、构图与运动系统，生成可离线播放的单文件 HTML，并支持静态 PDF 导出。

![六种字体与版式](docs/style-preview.png)

## 六种风格

| 风格 | 版式方向 | 展示字体 |
|---|---|---|
| 瑞士 Swiss | 非对称信息网格、独立编号、对齐数据 | Inter + Noto Sans SC |
| 新艺术 Art Nouveau | 植物图版、书页式图文、拱形节律 | 霞鹜新致宋 + Cormorant Garamond Italic |
| 装饰艺术 Art Deco | 中轴舞台、阶梯展开、几何细线 | 站酷庆科黄油体 + Poiret One |
| 孟菲斯 Memphis | 错位海报、彩色纸片、贴纸式数字 | 站酷快乐体 + Lilita One |
| 拟物 Skeuomorphism | 控制台、模拟仪表、纸质检查单 | Noto Sans SC + Share Tech Mono |
| 迷幻 Psychedelic | 流动字形、海报构图、稳定阅读区 | 马善政毛笔楷书 + Shrikhand |

每种风格包含四个可替换的起始场景：开场、过程、数据、收束。四页是示例，不是文稿页数限制。

## 在 Codex 中使用

将完整仓库放到个人技能目录，例如：

```sh
git clone https://github.com/Cyoung-Van/PPT-html-skill.git "$HOME/.codex/skills/html-motion-deck"
```

如果目标目录已存在，请先保留原有版本，避免覆盖本地修改。

在 Codex 中调用：

> 用 $html-motion-deck，把这份材料做成新艺术风格的动态演示，先给我预览。

入口：[SKILL.md](SKILL.md)。设计规则：[风格](references/styles.md)、[动效](references/motion.md)、[工作流程](references/workflow.md)。

## 本地生成

需要 Python 3、fonttools/brotli，以及 Node.js 22+ 和 Chrome/Chromium（检查、导出时使用）。Codex 可使用其工作区依赖；其他环境可在虚拟环境中安装 Python 依赖：

```sh
python3 -m pip install -r requirements.txt
python3 scripts/create_deck.py --out /absolute/new-project --style art-nouveau
```

生成器拒绝覆盖已有目录。编辑新项目的 deck.json 和 assets/custom.css 后：

```sh
python3 /absolute/new-project/scripts/build_deck.py --project /absolute/new-project
node /absolute/new-project/scripts/check_deck.mjs --html /absolute/new-project/index.html --out /absolute/new-project/qa
node /absolute/new-project/scripts/export_pdf.mjs --html /absolute/new-project/index.html --out /absolute/new-project/presentation-v1.pdf
```

用 CHROME_PATH 指定非默认位置的 Chrome/Chromium。脚本使用独立临时浏览器，只关闭自己创建的进程。

## 包含内容

- 六套独立场景配置、排版样式和 SVG 装饰。
- 11 个字体原文件与许可；构建时按实际文字生成内嵌子集。
- 分步讲述、转场、曲线绘制、数字动画、目录、讲稿与键盘/触控导航。
- 减少运动、后台暂停、快速切换清理、预览与正式稿工作流程。
- 可选水印、单文件 HTML 构建、排版/动画检查和 PDF 导出。

## 交付与验证边界

默认在本地制作，不创建或发布 ChatGPT Sites。示例数字、活动和仪表都属于设计示意，不是实测成果。PDF 保存最终静态状态，不播放动画。水印用于标示归属，不能保证不可移除。

六套四页示例已做本地排版与动效检查；实际内容、字体变化或不同浏览器仍需按 [验收说明](references/validation.md) 重新检查。

## 字体与许可

字体沿用各自的原始许可，见 [字体来源](assets/fonts/sources.json) 和 [许可证目录](assets/fonts/licenses)。霞鹜新致宋的使用与替换方式见 [字体说明](assets/fonts/licenses/lxgw-neozhisong/FONT-NOTICE.md)。其他代码与文档尚未另行指定开源许可证。
