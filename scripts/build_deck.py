#!/usr/bin/env python3
"""Build a standalone offline HTML deck from a project directory."""
import argparse
import base64
import html
import json
import mimetypes
import io
import re
from pathlib import Path

STYLES = ('swiss', 'art-nouveau', 'art-deco', 'memphis', 'skeuomorphic', 'psychedelic')


def build(project, output=None):
    project = Path(project).resolve()
    config = json.loads((project / 'deck.json').read_text(encoding='utf-8'))
    style = config.get('style', 'swiss')
    if style not in STYLES:
        raise ValueError('Unknown style: ' + style)
    slides = config.get('slides', [])
    if not slides:
        raise ValueError('At least one slide is required')
    ids = [s['id'] for s in slides]
    if len(ids) != len(set(ids)) or any(not re.fullmatch(r'[A-Za-z][\w-]*', s) for s in ids):
        raise ValueError('Slide IDs must be unique, stable, and start with a letter')
    route = config.get('sequence')
    if route is not None and (not route or len(route) != len(set(route)) or any(x not in ids for x in route)):
        raise ValueError('sequence must contain unique existing slide IDs')

    def data_url(value):
        if value.startswith('data:') or value.startswith('#'):
            return value
        if re.match(r'(?:https?:|//|file:)', value):
            raise ValueError('Download or copy the asset locally before building: ' + value)
        path = (project / value).resolve()
        if not path.is_file():
            raise FileNotFoundError(path)
        mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
        return 'data:' + mime + ';base64,' + base64.b64encode(path.read_bytes()).decode('ascii')

    def inline_markup(markup):
        if re.search(r'<(?:script|iframe|link)\b|\son\w+\s*=', markup, re.I):
            raise ValueError('Use assets/engine.js for authored behavior; no scripts, event attributes, or frames in slide HTML')
        markup = re.sub(r'\b(src|poster)\s*=\s*([\x22\x27])([^\x22\x27]+)\2',
                        lambda m: m[1] + '="' + html.escape(data_url(m[3]), quote=True) + '"', markup)
        if 'srcset=' in markup.lower():
            raise ValueError('Use one local src per presentation image instead of srcset')
        return re.sub(r'url\(\s*[\x22\x27]?([^\x22\x27)]+)[\x22\x27]?\s*\)',
                      lambda m: 'url("' + data_url(m[1].strip()) + '")', markup)

    css = '\n'.join((project / 'assets' / f).read_text(encoding='utf-8') for f in ('base.css', 'themes.css'))
    custom = project / 'assets' / 'custom.css'
    if custom.exists():
        css += '\n' + custom.read_text(encoding='utf-8')
    if re.search(r'@import\b', css, re.I):
        raise ValueError('Inline styles locally; CSS @import is not offline')
    css = re.sub(r'url\(\s*[\x22\x27]?([^\x22\x27)]+)[\x22\x27]?\s*\)',
                 lambda m: 'url("' + data_url(m[1].strip()) + '")', css)
    font_text = html.unescape(re.sub(r'<[^>]*>', '', json.dumps(config, ensure_ascii=False))) + '目录关闭讲稿全屏动效完整简化上一页下一页0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz /%×→←—·'
    for f in config.get('fonts', []):
        family = json.dumps(f['family'], ensure_ascii=False)
        font_url = None
        if f.get('subset', False):
            try:
                from fontTools.ttLib import TTFont
                from fontTools.subset import Options, Subsetter
                from fontTools.varLib.instancer import instantiateVariableFont
            except ImportError as exc:
                raise RuntimeError('Font subsetting requires fonttools and brotli in the selected Python runtime.') from exc
            font = TTFont(project / f['path'])
            options = Options(); options.layout_features = ['*']
            sub = Subsetter(options=options); sub.populate(text=font_text); sub.subset(font)
            if 'fvar' in font:
                axes = {a.axisTag: max(a.minValue, min(a.maxValue, float(f.get('weight', 400)))) for a in font['fvar'].axes if a.axisTag == 'wght'}
                if axes: font = instantiateVariableFont(font, axes, inplace=True)
            font.flavor = 'woff2'; buffer = io.BytesIO(); font.save(buffer)
            font_url = 'data:font/woff2;base64,' + base64.b64encode(buffer.getvalue()).decode('ascii')
        else:
            font_url = data_url(f['path'])
        css += '\n@font-face{font-family:' + family + ';src:url("' + font_url + '");font-weight:' + str(f.get('weight', 400)) + ';font-style:' + f.get('style', 'normal') + ';font-display:block}'

    decor = json.loads((project / 'assets' / 'decor.json').read_text(encoding='utf-8'))[style]
    if isinstance(decor, dict):
        decor = decor.get('html', '')
    watermark = config.get('watermark', {})
    wm_markup = ''
    if watermark.get('enabled'):
        text = html.escape(watermark.get('text', ''))
        if not text:
            raise ValueError('Enabled watermark needs explicit text')
        logo = '<img alt="" src="' + data_url(watermark['logo']) + '">' if watermark.get('logo') else ''
        item = '<span>' + logo + text + '</span>'
        wm_markup = '<div class="watermark" aria-hidden="true"><div>' + ''.join('<p>' + item * 3 + '</p>' for _ in range(3)) + '</div></div>'
        opacity = float(watermark.get('opacity', .10))
        if not 0 <= opacity <= .3:
            raise ValueError('watermark.opacity must be between 0 and 0.3')
        css += '\n.watermark{opacity:' + str(opacity) + '}'

    rendered = []
    for index, s in enumerate(slides):
        esc = lambda x: html.escape(str(x), quote=True)
        label = s.get('label', str(index + 1).zfill(2))
        kind = s.get('kind', 'content')
        if kind not in ('cover', 'chapter', 'content'):
            raise ValueError('Invalid slide kind: ' + kind)
        body = inline_markup(s.get('body_html', ''))
        layout = s.get('layout', kind)
        if not re.fullmatch(r'[a-z][a-z0-9-]*', layout): raise ValueError('Invalid layout name')
        display_title = inline_markup(s['title_html']) if s.get('title_html') else esc(s['title']).replace('\n', '<br>')
        for target in re.findall(r'data-goto=[\x22\x27]([^\x22\x27]+)', body):
            if target not in ids:
                raise ValueError('Unknown internal jump: ' + target)
        rendered.append('<section class="slide ' + kind + '" id="' + esc(s['id']) + '" data-label="' + esc(label) + '" data-title="' + esc(s['title']) + '" data-chapter="' + esc(s.get('chapter', '')) + '" data-kind="' + kind + '" data-layout="' + layout + '">'
                        + '<div class="slide-decor" aria-hidden="true">' + decor + '</div>'
                        + '<header class="slide-heading"><div class="eyebrow reveal">' + esc(s.get('eyebrow', '')) + '</div><h1 class="title reveal">' + display_title + '</h1><p class="subtitle reveal">' + esc(s.get('subtitle', '')) + '</p></header>'
                        + '<div class="slide-body">' + body + '</div>'
                        + '<div class="takeaway reveal">' + esc(s.get('takeaway', '')) + '</div>'
                        + wm_markup + '<aside class="notes">' + esc(s.get('notes', '')).replace('\n', '<br>') + '</aside></section>')
    runtime_config = {k: config[k] for k in ('title', 'style', 'sequence') if k in config}
    runtime_json = json.dumps(runtime_config, ensure_ascii=False).replace('<', '\\u003c')
    script = (project / 'assets' / 'engine.js').read_text(encoding='utf-8').replace('</script', '<\\/script')
    title = html.escape(config.get('title', 'HTML 演示文稿'))
    doc = '<!doctype html><html lang="' + html.escape(config.get('lang', 'zh-CN'), quote=True) + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title><style>' + css + '</style></head><body>'
    doc += '<div id="viewport"><div id="stage" data-style="' + style + '"><main id="slides">' + ''.join(rendered) + '</main>'
    doc += '<div id="deck-chrome"><div class="chrome-top"><span id="deck-title"></span><span id="chapter-label"></span></div><div class="chrome-bottom"><button id="prev" title="上一页或上一步（←）" aria-label="上一页或上一步">←</button><button id="overview-toggle" title="目录（G）">目录</button><button id="next" title="下一页或下一步（→）" aria-label="下一页或下一步">→</button><span id="page-counter" aria-live="polite"></span><button id="motion-toggle" title="减少运动（M）">减少运动</button><button id="notes-toggle" title="讲稿（N）">讲稿</button><button id="fullscreen-toggle" title="全屏（F）">全屏</button></div><div id="progress"></div></div>'
    doc += '<section id="overview" class="overlay" hidden role="dialog" aria-modal="true" aria-labelledby="overview-title"><div class="overlay-card"><button data-close aria-label="关闭目录">关闭 ×</button><h2 id="overview-title">目录</h2><div id="overview-list"></div></div></section>'
    doc += '<section id="notes-panel" class="overlay" hidden role="dialog" aria-modal="true" aria-labelledby="notes-title"><div class="overlay-card"><button data-close aria-label="关闭讲稿">关闭 ×</button><h2 id="notes-title">讲稿</h2><div id="notes-content"></div></div></section>'
    doc += '</div></div><script>window.DECK_CONFIG=' + runtime_json + ';</script><script>' + script + '</script></body></html>'
    target = Path(output).resolve() if output else project / config.get('output_filename', 'index.html')
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(doc, encoding='utf-8')
    return {'html': str(target), 'slides': len(slides), 'style': style, 'bytes': target.stat().st_size}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    parser.add_argument('--output')
    args = parser.parse_args()
    print(json.dumps(build(args.project, args.output), ensure_ascii=False))
