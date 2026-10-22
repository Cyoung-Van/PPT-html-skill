# 霞鹜新致宋字体说明

字体：LXGW Neo ZhiSong / 霞鹜新致宋 v1.067。
作者仓库：https://github.com/lxgw/LxgwNeoZhiSong
版本：https://github.com/lxgw/LxgwNeoZhiSong/releases/tag/v1.067
原始字体文件：assets/fonts/LXGWNeoZhiSong.ttf。
完整 IPA Font License 1.0 见本目录 LICENSE.md，中文参考见 LICENSE_CHS.md。
字体作者提供的工程源文件：https://github.com/lxgw/LxgwNeoZhiSong/tree/main/projects

## 本技能中的使用

仓库保留未修改的原始 TTF 文件及其名称。scripts/build_deck.py 按项目 deck.json 中的 fonts 配置，为当前文稿生成 WOFF2 字形子集并内联到 HTML；子集不是独立发布的原始字体替代包。改动文字后应重新构建。

## 使用原始 IPA 字体替换

1. 从 https://moji.or.jp/ipafont/ipafontdownload/ 获取 IPAex 明朝，或从 https://moji.or.jp/mj/ 获取 IPAmj 明朝。
2. 将解压的原始字体文件放入生成项目的 assets/fonts/，保留原字体文件名。
3. 在项目 deck.json 的 fonts 数组中，找到 family 为 DeckNouveau 的条目，将 path 改为该原始字体的项目相对路径，例如 assets/fonts/ipaexm.ttf。将 subset 设为 false 可直接内联未转换的原始字体。
4. 执行 python3 scripts/build_deck.py --project .，重新生成 HTML。family 是 CSS 调用标识，不修改字体文件内部名称。

如需修改新建项目的默认字体，同时更新技能 assets/templates/art-nouveau.json 中对应的 fonts 条目，再生成新项目。第三方字体的原始许可和作者说明应随字体保留。
