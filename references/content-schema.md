# 内容格式

顶层：title、style、lang（默认 zh-CN）、output_filename（默认 index.html）、slides。可选 sequence 是唯一稳定 ID 的有序数组；未指定时顺序播放全部页面。fonts 数组包含 family、path、weight、style、subset；watermark 包含 enabled、text、logo、opacity，默认关闭。

单页 id、title 必填；kind 为 cover/content/chapter，label 为显示标签，chapter 为目录分组；eyebrow、subtitle、body_html、takeaway、notes 可选。layout 指定可复用场景布局（见各模板），title_html 可使用语义 span/em 为中英文分别排版；title 仍是目录与可访问名称。id 唯一、以英文字母开头，只用字母数字/下划线/连字符。label 可以是“目录”或“A3”，不能作数组下标。

body_html 使用当前作者编写的语义 HTML：段落、列表、表格、figure、原图与可编辑 SVG。脚本写进 engine.js，不在内容中放 script/iframe/onClick。图片用本地 src，不用 srcset。SVG 引用优先内联几何，引用 ID 必须全稿唯一。

## 布局与动效钩子

- split / columns：双栏；metric-grid / metric：少量指标；flow：步骤；editorial：连续叙述。
- proof、caption、quote、media、chart、list：证据、图注、引语、媒体和数据视觉。不强制内容全部卡片化。
- reveal：按层级随进页出现。
- data-step="1" / "2" / "3"：用户按下一步展开，完成后才翻页。避免把一句话拆成过多点击。
- SVG path[data-draw]：真实路径描边，不改变最终曲线形状。
- data-count="35"：计数终值，元素文本也保留终值，单位放邻近文本。不用于日期、编号、区间等需要逐字准确的内容。
- data-goto="stable-id"：内部跳转，目标必须存在。

window.__deck 提供 go(index,{instant})、next、prev、showAll、state、setReducedMotion、animationsFinished、freezeForPrint、restoreAfterPrint、audit，供自动验收与导出使用。索引从零开始，指物理页序。

## 运动计划

为关键场景保留一行工作记录即可，不要求每份成品增加计划文件：

    页面 ID | 主张 | 首个视觉焦点 | 展开顺序 | 动作目的 | 最终状态 | 减少运动替代

例如架构页先给系统边界，再三步揭示输入/控制/执行，连接按信息方向绘制；最后保留完整架构。减少运动时直接显示路径，分步仍由用户控制，不做位移缩放。

样例不是固定文案、布局或页数要求，必须按材料替换。

新模板在 assets/templates/<style>.json 中分别定义四种场景。不要修改一套 sample.json 后批量仅替换风格名称；内容位置、留白、字体组合与主视觉都应由当前主题决定。
