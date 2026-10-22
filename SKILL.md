---
name: html-motion-deck
description: 制作或修改可离线播放的动态 HTML 演示文稿、网页幻灯片和答辩演示，并导出静态 PDF。支持瑞士、新艺术 Art Nouveau、装饰艺术 Art Deco、孟菲斯 Memphis、拟物主义 Skeuomorphism、迷幻 Psychedelic 六种视觉与动效方向。用于 HTML 演示和动效幻灯片请求，不代替普通网站开发或原生 PPTX 编辑。
---

# HTML 动态演示文稿

交付本地可播放演示、完整前端源文件和用户要求的 PDF。视觉风格决定构图、字体、图形与运动方式，不只决定颜色。

## 工作边界

- 默认在本地工作区制作。不要创建、注册或发布 ChatGPT Sites；部署只按用户明确指定的平台执行，未指定时确认平台。
- 修改已有稿件时定位当前 HTML 和生成源，保留备份，在原稿上做最小调整。不能因为有生成器就重建已完成稿件。
- 原稿姓名、学校标志、数据与水印不成为新稿默认内容。自带样例为明确标注的演示数据，必须替换为用户材料。
- PDF 保存完整最终状态，不播放 HTML 动画，不能称作动态演示。

## 设计与制作

1. **定位任务。** 确定受众、场景、内容来源、已有稿件、页数和时长。能从上下文确定的直接执行，缺少会改变结果的信息时再问。不擅自增加页数、封面或附录。
2. **选定风格。** 阅读 [六种风格](references/styles.md) 中当前方向。已有参考优先；新稿未指定时按内容选一个方向并说明。只有用户要求比较时才生成多版。
3. **先设计运动。** 阅读 [动效设计](references/motion.md)，为各页确定“主张 → 视觉焦点 → 出现顺序 → 动作目的 → 最终状态”。根据内容明确开场、论证、分步或收束的运动，不要求每份稿件都含全部场景。不能用全稿统一淡入代替动效设计。
4. **实现。** 现有稿件编辑其源文件；新稿可用下方生成器。本地素材和指定字体内联到最终 HTML；六套起始场景各自配有展示字体，并在构建时按当前内容生成内嵌字形子集。阅读 [工作流程](references/workflow.md) 和 [内容格式](references/content-schema.md)。
5. **实播验收。** 执行 [验证清单](references/validation.md)，查看动画中间状态和最终画面。脚本检查不能替代节奏、风格和可读性审查。字体缺失、丢图或运行异常时，不能将静态截图当作动效完成。
6. **交付。** 提供正式 HTML、可编辑源文件和要求的 PDF。“先预览”只修改副本，批准后同步正式稿。新 PDF 使用明确新文件名，保留旧版。

## 新稿生成器

SKILL_DIR 为本技能目录，参数使用真实绝对路径。

```sh
python3 "$SKILL_DIR/scripts/create_deck.py" --out "/absolute/new-project" --style art-nouveau --title "演示标题"
```

风格值：swiss、art-nouveau、art-deco、memphis、skeuomorphic、psychedelic。生成器按所选风格读取 assets/templates 中的独立场景，而非同一套内容换皮；它拒绝覆盖已有目录，生成的四页可运行样例**不是已完成的用户内容，也不是页数要求**。

编辑 deck.json 和 assets/custom.css 后：

```sh
python3 "/absolute/project/scripts/build_deck.py" --project "/absolute/project"
node "/absolute/project/scripts/check_deck.mjs" --html "/absolute/project/index.html" --out "/absolute/project/qa"
node "/absolute/project/scripts/export_pdf.mjs" --html "/absolute/project/index.html" --out "/absolute/project/演示_新版本.pdf"
```

构建字体子集需要 Python 的 fonttools 和 brotli，可使用工作区依赖中的 Python。检查和导出使用 Node 22+、本机 Chrome/Chromium，优先采用工作区依赖返回的 Node。CHROME_PATH 可指定浏览器。脚本启动独立临时浏览器，只关闭自己的进程，不干预用户会话。UI 预览可用现有浏览器工具，无需远程服务。

## 必须保留的能力

- 清晰的目录、前后页、键盘与触控导航；分步展开与翻页语义明确。显示标签、稳定 ID、物理页序互相独立。
- 快速连续操作后只有一个活动页；返回、哈希跳转和附录入口不遗留旧动画。后台、目录、讲稿状态暂停持续装饰运动。
- 减少运动模式保留完整信息，正文和导航坐标稳定；迷幻风格不用频闪，拟物仪表不伪装真实遥测。
- 正文、速览和按钮预留各自空间。优先精简、重排或在用户允许时拆页，不沿用逐页缩小整块正文的补丁。
- 水印按需启用并覆盖指定页面及打印页。严格使用指定文字、图形与字体，不宣称无法移除。
- 打印显示全部分步内容、图表与计数最终值，保留来源和水印，一页幻灯片对应一页 PDF。

[原流程提炼记录](references/source-notes.md) 说明来源与改进边界。只将实际暴露的问题纳入维护，不把单一项目的特殊情况扩成通用规则。
