/* Local presentation runtime. No dependencies, requests, or automatic page advances. */
(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const stage = $('#stage');
  const slidesRoot = $('#slides');
  const slides = $$('#slides > .slide');
  if (!stage || !slidesRoot || !slides.length) throw new Error('Deck requires #stage and at least one #slides > .slide.');
  const config = window.DECK_CONFIG || {};
  const style = config.style || stage.dataset.style || 'swiss';
  stage.dataset.style = style;
  const configIssues = [];
  const byId = new Map(slides.map((slide, index) => [slide.id, index]));
  let route = slides.map((_, index) => index);
  if (Array.isArray(config.sequence)) {
    const chosen = config.sequence.map(id => byId.get(String(id)));
    if (!chosen.length || chosen.some(index => index === undefined) || new Set(chosen).size !== chosen.length) {
      configIssues.push('sequence must contain existing, unique slide IDs; using all slides.');
    } else route = chosen;
  }
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = media.matches;
  let motionOverride = null;
  let current = -1;
  let step = 0;
  let token = 0;
  let ready = false;
  let printing = false;
  let openPanel = null;
  let previousFocus = null;
  let previousIndex = null;
  let returnStack = [];
  let numberBuffer = '';
  let numberTimer = null;
  let toastTimer = null;
  const animations = new Set();
  const counters = new Set();
  const finalizers = new Set();
  const originalCountText = new WeakMap();
  const fragments = slides.map(slide => {
    const elements = $$('[data-step]', slide);
    const values = new Map(elements.map((element, index) => {
      const authored = element.getAttribute('data-step');
      const value = authored !== '' && Number.isFinite(Number(authored)) ? Math.max(0, Number(authored)) : index + 1;
      return [element, value];
    }));
    return {elements, values, levels: [...new Set(values.values())].filter(value => value > 0).sort((a, b) => a - b)};
  });

  const profiles = {
    swiss: {
      duration: 500, stagger: 70, revealDuration: 470, easing: 'cubic-bezier(.2,.8,.2,1)',
      enter: dir => [{opacity: 0, transform: `translateX(${dir * 100}px)`}, {opacity: 1, transform: 'translateX(0)'}],
      leave: dir => [{opacity: 1, transform: 'translateX(0)'}, {opacity: 0, transform: `translateX(${-dir * 46}px)`}],
      reveal: [{opacity: 0, transform: 'translateY(24px)'}, {opacity: 1, transform: 'translateY(0)'}]
    },
    'art-nouveau': {
      duration: 830, stagger: 110, revealDuration: 780, easing: 'cubic-bezier(.16,.65,.25,1)',
      enter: dir => [{opacity: 0, transform: `translate(${dir * 34}px,24px) rotate(${dir * .6}deg) scale(.985)`}, {opacity: 1, transform: 'translate(0,0) rotate(0) scale(1)'}],
      leave: dir => [{opacity: 1, transform: 'translate(0,0)'}, {opacity: 0, transform: `translate(${-dir * 22}px,-12px)`}],
      reveal: [{opacity: 0, transform: 'translateY(30px) rotate(-.5deg)'}, {opacity: 1, transform: 'translateY(0) rotate(0)'}]
    },
    'art-deco': {
      duration: 760, stagger: 95, revealDuration: 610, easing: 'cubic-bezier(.65,0,.2,1)',
      enter: () => [{opacity: 1, clipPath: 'inset(0 50% 0 50%)'}, {opacity: 1, clipPath: 'inset(0 0% 0 0%)'}],
      leave: () => [{opacity: 1}, {opacity: 0}],
      reveal: [{opacity: 0, transform: 'translateY(22px)'}, {opacity: 1, transform: 'translateY(0)'}]
    },
    memphis: {
      duration: 590, stagger: 85, revealDuration: 550, easing: 'cubic-bezier(.22,1.22,.35,1)',
      enter: dir => [{opacity: 0, transform: `translate(${dir * 88}px,22px) rotate(${dir * 1.7}deg) scale(.97)`}, {opacity: 1, transform: 'translate(0,0) rotate(0) scale(1)'}],
      leave: dir => [{opacity: 1, transform: 'rotate(0)'}, {opacity: 0, transform: `translateX(${-dir * 35}px) rotate(${-dir}deg)`}],
      reveal: [{opacity: 0, transform: 'translateY(26px) scale(.94)'}, {opacity: 1, transform: 'translateY(0) scale(1)'}]
    },
    skeuomorphic: {
      duration: 430, stagger: 85, revealDuration: 470, easing: 'cubic-bezier(.2,.7,.15,1)',
      enter: () => [{opacity: 0, transform: 'translateY(16px)', filter: 'brightness(.8)'}, {opacity: 1, transform: 'translateY(0)', filter: 'brightness(1)'}],
      leave: () => [{opacity: 1}, {opacity: 0}],
      reveal: [{opacity: 0, transform: 'translateY(12px)'}, {opacity: 1, transform: 'translateY(0)'}]
    },
    psychedelic: {
      duration: 900, stagger: 100, revealDuration: 650, easing: 'cubic-bezier(.2,.75,.25,1)',
      enter: () => [{opacity: 0, clipPath: 'circle(18% at 50% 50%)', transform: 'scale(1.035)'}, {opacity: 1, clipPath: 'circle(80% at 50% 50%)', transform: 'scale(1)'}],
      leave: () => [{opacity: 1}, {opacity: 0}],
      reveal: [{opacity: 0, transform: 'translateY(22px)'}, {opacity: 1, transform: 'translateY(0)'}]
    }
  };
  const profile = profiles[style] || profiles.swiss;

  function fit() {
    if (printing) return;
    const scale = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `scale(${scale})`;
  }

  function liveMessage(message) {
    let status = $('#deck-status');
    if (!status) {
      status = document.createElement('div'); status.id = 'deck-status';
      status.className = 'deck-toast'; status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite'); stage.append(status);
    }
    status.textContent = message; status.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => status.classList.remove('visible'), 1800);
  }

  function updatePause() {
    const paused = document.hidden || !!openPanel || printing;
    stage.dataset.paused = String(paused);
    document.body.classList.toggle('document-hidden', document.hidden);
  }

  function finishEffects() {
    for (const finish of [...finalizers]) finish();
    finalizers.clear();
  }

  function cancelWork() {
    token++;
    for (const animation of [...animations]) animation.cancel();
    animations.clear();
    for (const counter of [...counters]) { cancelAnimationFrame(counter.id); counter.finish(); }
    counters.clear();
    finishEffects();
    for (const slide of slides) {
      slide.classList.remove('is-leaving');
      slide.style.zIndex = '';
    }
  }

  function animate(element, keyframes, options, myToken = token) {
    if (reduced || printing || !element.animate) return Promise.resolve();
    const animation = element.animate(keyframes, {fill: 'both', ...options});
    animations.add(animation);
    return animation.finished.catch(() => {}).then(() => {
      animations.delete(animation);
      animation.cancel();
      return myToken === token;
    });
  }

  function fragmentVisible(element) {
    if (printing) return true;
    const owner = element.closest('[data-step]');
    return !owner || owner.classList.contains('step-visible');
  }

  function effects(root, instant = false) {
    const all = selector => [...(root.matches(selector) ? [root] : []), ...$$(selector, root)].filter(fragmentVisible);
    const myToken = token;
    for (const element of all('[data-draw]')) {
      if (typeof element.getTotalLength !== 'function') continue;
      let length;
      try { length = element.getTotalLength(); } catch (_) { continue; }
      if (!Number.isFinite(length) || length <= 0) continue;
      const oldArray = element.style.strokeDasharray;
      const oldOffset = element.style.strokeDashoffset;
      let finished = false;
      const finish = () => { if (finished) return; finished = true; element.style.strokeDasharray = oldArray; element.style.strokeDashoffset = oldOffset; finalizers.delete(finish); };
      if (instant || reduced || printing) { finish(); continue; }
      finalizers.add(finish);
      element.style.strokeDasharray = String(length);
      animate(element, [{strokeDashoffset: length}, {strokeDashoffset: 0}], {duration: 1000, delay: 120, easing: 'ease-in-out'}, myToken).then(finish);
    }
    for (const element of all('[data-count]')) {
      const target = Number(element.dataset.count);
      if (!Number.isFinite(target) || element.dataset.count === '') continue;
      if (!originalCountText.has(element)) originalCountText.set(element, element.textContent);
      const original = originalCountText.get(element);
      const finalText = element.dataset.countFinal || original || String(target);
      if (instant || reduced || printing) { element.textContent = finalText; continue; }
      let resolve;
      const done = new Promise(r => { resolve = r; });
      const entry = {id: 0, done, finish: () => { element.textContent = finalText; counters.delete(entry); resolve(); }};
      counters.add(entry);
      const authoredDecimals = Number(element.dataset.decimals);
      const decimals = Number.isInteger(authoredDecimals) && authoredDecimals >= 0 && authoredDecimals <= 6 ? authoredDecimals : Math.min(6, (String(target).split('.')[1] || '').length);
      const start = performance.now();
      const tick = now => {
        if (myToken !== token || reduced || printing) { entry.finish(); return; }
        const progress = Math.min(1, (now - start) / 900);
        const value = target * (1 - (1 - progress) ** 3);
        element.textContent = (element.dataset.prefix || '') + value.toFixed(decimals) + (element.dataset.suffix || '');
        if (progress >= 1) entry.finish(); else entry.id = requestAnimationFrame(tick);
      };
      entry.id = requestAnimationFrame(tick);
    }
    for (const element of all('[data-bar]')) {
      if (!instant) animate(element, [{transform: 'scaleX(0)'}, {transform: 'scaleX(1)'}], {duration: 760, delay: 90, easing: profile.easing}, myToken);
    }
    for (const element of all('[data-rotate-to]')) {
      const target = Number(element.dataset.rotateTo);
      if (!Number.isFinite(target)) continue;
      const finalTransform = `rotate(${target}deg)`;
      element.style.transform = finalTransform;
      if (!instant) animate(element, [{transform: 'rotate(0deg)'}, {transform: finalTransform}], {duration: 900, delay: 80, easing: 'cubic-bezier(.2,.8,.2,1)'}, myToken);
    }
  }

  function reveal(root, instant = false) {
    const elements = [...(root.matches('.reveal') ? [root] : []), ...$$('.reveal', root)].filter(fragmentVisible);
    if (!instant && !reduced && !printing) elements.forEach((element, i) => {
      animate(element, profile.reveal, {duration: profile.revealDuration, delay: Math.min(i * profile.stagger, 650), easing: profile.easing});
    });
    effects(root, instant);
  }

  function applyStep(animateNew = false) {
    if (current < 0) return;
    const group = fragments[current];
    const threshold = step === 0 ? 0 : group.levels[step - 1];
    for (const element of group.elements) {
      const visible = group.values.get(element) <= threshold;
      const wasVisible = element.classList.contains('step-visible');
      element.classList.toggle('step-visible', visible);
      element.setAttribute('aria-hidden', String(!visible));
      element.inert = !visible;
      if (animateNew && visible && !wasVisible) {
        if (!element.classList.contains('reveal')) animate(element, profile.reveal, {duration: profile.revealDuration, easing: profile.easing});
        reveal(element, reduced);
      }
    }
    updateChrome();
  }

  function updateChrome() {
    if (current < 0) return;
    const slide = slides[current];
    if ($('#deck-title')) $('#deck-title').textContent = config.title || document.title;
    if ($('#chapter-label')) $('#chapter-label').textContent = slide.dataset.chapter || '';
    const routeIndex = route.indexOf(current);
    if ($('#page-counter')) {
      $('#page-counter').textContent = `${slide.dataset.label || current + 1} / ${slides.length}`;
      $('#page-counter').setAttribute('aria-label', `第 ${current + 1} 页，共 ${slides.length} 页`);
    }
    if ($('#progress')) $('#progress').style.transform = `scaleX(${routeIndex >= 0 ? (routeIndex + 1) / route.length : (current + 1) / slides.length})`;
    if ($('#prev')) $('#prev').disabled = step === 0 && adjacent(-1) === null;
    if ($('#next')) $('#next').disabled = step === fragments[current].levels.length && adjacent(1) === null;
    if ($('#motion-toggle')) {
      $('#motion-toggle').setAttribute('aria-pressed', String(reduced));
      $('#motion-toggle').textContent = reduced ? '动效：简化' : '动效：完整';
      $('#motion-toggle').title = 'M 切换减少动态效果';
    }
    if (openPanel === $('#notes-panel')) renderNotes();
    $$('[data-overview-index]').forEach(button => {
      const selected = Number(button.dataset.overviewIndex) === current;
      button.classList.toggle('current', selected);
      if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
  }

  function writeHash() {
    try { history.replaceState(null, '', '#' + encodeURIComponent(slides[current].id)); } catch (_) { /* Sandboxed local viewers may restrict history. */ }
  }

  function go(value, options = {}) {
    const index = typeof value === 'string' ? resolveSlide(value) : value;
    if (!Number.isInteger(index) || index < 0 || index >= slides.length) return false;
    if (index === current && !options.restart) {
      if (options.step !== undefined) {
        step = options.step === 'last' ? fragments[index].levels.length : Math.max(0, Math.min(fragments[index].levels.length, Number(options.step) || 0));
        applyStep();
      }
      return true;
    }
    const from = current;
    cancelWork();
    const myToken = token;
    if (from >= 0) previousIndex = from;
    current = index;
    step = options.step === 'last' ? fragments[index].levels.length : Math.max(0, Math.min(fragments[index].levels.length, Number(options.step) || 0));
    const entering = slides[index];
    const leaving = from >= 0 ? slides[from] : null;
    const immediate = !!options.instant || reduced || printing || from < 0;
    slides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === current);
      slide.classList.remove('is-leaving');
      slide.setAttribute('aria-hidden', String(i !== current));
      slide.inert = i !== current;
    });
    applyStep();
    if (options.hash !== false) writeHash();
    if (leaving && !immediate) {
      leaving.classList.add('is-leaving'); leaving.style.zIndex = '2'; entering.style.zIndex = '3';
      const dir = index > from ? 1 : -1;
      const enteringAnimation = animate(entering, profile.enter(dir), {duration: profile.duration, easing: profile.easing}, myToken);
      const leavingAnimation = animate(leaving, profile.leave(dir), {duration: profile.duration * .8, easing: profile.easing}, myToken);
      Promise.all([enteringAnimation, leavingAnimation]).then(() => {
        if (myToken !== token) return;
        leaving.classList.remove('is-leaving'); leaving.style.zIndex = ''; entering.style.zIndex = '';
      });
    }
    reveal(entering, !!options.instant || reduced || printing);
    updatePause();
    return true;
  }

  function adjacent(direction) {
    const position = route.indexOf(current);
    if (position >= 0) return route[position + direction] === undefined ? null : route[position + direction];
    const candidates = route.filter(index => direction > 0 ? index > current : index < current);
    return candidates.length ? (direction > 0 ? Math.min(...candidates) : Math.max(...candidates)) : null;
  }
  function next() {
    if (openPanel || printing) return;
    if (step < fragments[current].levels.length) { step++; applyStep(true); }
    else { const target = adjacent(1); if (target !== null) go(target); }
  }
  function prev() {
    if (openPanel || printing) return;
    if (step > 0) { cancelWork(); step--; applyStep(); }
    else { const target = adjacent(-1); if (target !== null) go(target, {step: 'last'}); }
  }
  function showAll() {
    if (current < 0) return;
    cancelWork(); step = fragments[current].levels.length; applyStep(); effects(slides[current], true);
  }
  function resolveSlide(value) {
    const key = String(value).replace(/^#/, '');
    if (byId.has(key)) return byId.get(key);
    const label = slides.findIndex(slide => (slide.dataset.label || '').toLowerCase() === key.toLowerCase());
    if (label >= 0) return label;
    const page = /^\d+$/.test(key) ? Number(key) - 1 : -1;
    return page >= 0 && page < slides.length ? page : -1;
  }
  function returnToOrigin() {
    const saved = returnStack.pop();
    if (saved) go(saved.index, {step: saved.step});
    else if (previousIndex !== null) go(previousIndex);
  }

  function renderOverview() {
    const list = $('#overview-list');
    if (!list) return;
    list.replaceChildren();
    slides.forEach((slide, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'overview-item';
      button.dataset.overviewIndex = String(index); button.dataset.inRoute = String(route.includes(index));
      const number = document.createElement('span'); number.className = 'overview-number'; number.textContent = slide.dataset.label || String(index + 1);
      const title = document.createElement('span'); title.className = 'overview-title'; title.textContent = slide.dataset.title || $('.title', slide)?.textContent || slide.id;
      const chapter = document.createElement('span'); chapter.className = 'overview-chapter'; chapter.textContent = slide.dataset.chapter || '';
      button.append(number, title, chapter);
      button.addEventListener('click', () => { closeOverlay(); go(index); }); list.append(button);
    });
    updateChrome();
  }
  function renderNotes() {
    const content = $('#notes-content');
    if (!content || current < 0) return;
    const note = $('.notes', slides[current]);
    content.replaceChildren();
    if (note && note.childNodes.length) for (const node of note.childNodes) content.append(node.cloneNode(true));
    else content.textContent = '本页没有讲稿。';
  }
  function focusable(panel) {
    return $$('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', panel)
      .filter(element => !element.hidden && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
  }
  function openOverlay(panel) {
    if (!panel) return;
    if (openPanel === panel) { closeOverlay(); return; }
    if (openPanel) closeOverlay(false);
    previousFocus = document.activeElement;
    if (panel.id === 'overview') renderOverview(); else renderNotes();
    openPanel = panel; panel.hidden = false; panel.classList.add('open');
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    if (!panel.hasAttribute('aria-label') && !panel.hasAttribute('aria-labelledby')) panel.setAttribute('aria-label', panel.id === 'overview' ? '演示目录' : '讲稿');
    slidesRoot.inert = true;
    if ($('#deck-chrome')) $('#deck-chrome').inert = true;
    updatePause();
    const target = panel.id === 'overview' ? $('.overview-item.current', panel) : null;
    const first = target || focusable(panel)[0] || panel;
    if (first === panel) panel.tabIndex = -1;
    first.focus({preventScroll: true});
    if (target) target.scrollIntoView({block: 'nearest'});
  }
  function closeOverlay(restoreFocus = true) {
    if (!openPanel) return;
    openPanel.hidden = true; openPanel.classList.remove('open'); openPanel = null;
    slidesRoot.inert = false;
    if ($('#deck-chrome')) $('#deck-chrome').inert = false;
    updatePause();
    if (restoreFocus && previousFocus && previousFocus.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus({preventScroll: true});
    previousFocus = null;
  }
  function setReducedMotion(value, user = true) {
    if (user) motionOverride = !!value;
    reduced = !!value;
    stage.dataset.motion = reduced ? 'reduced' : 'full';
    stage.dataset.reducedMotion = String(reduced);
    cancelWork();
    if (current >= 0) { applyStep(); effects(slides[current], true); }
    updateChrome();
    return reduced;
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen?.();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else liveMessage('当前浏览器不支持全屏，可使用浏览器的全屏功能。');
    } catch (_) { liveMessage('当前窗口无法进入全屏，可使用浏览器的全屏功能。'); }
  }
  function freezeForPrint() {
    printing = true; cancelWork(); closeOverlay(false);
    stage.dataset.print = 'true';
    slides.forEach(slide => effects(slide, true));
    updatePause();
  }
  function restoreAfterPrint() {
    printing = false; delete stage.dataset.print;
    if (current >= 0) applyStep();
    fit(); updatePause();
  }
  async function animationsFinished() {
    await Promise.allSettled([...animations].map(animation => animation.finished).concat([...counters].map(counter => counter.done)));
  }
  function state() {
    return {index: current, activeSlideId: slides[current]?.id || null, id: slides[current]?.id || null,
      label: slides[current]?.dataset.label || '', step, stepCount: fragments[current]?.levels.length || 0,
      reducedMotion: reduced, overlay: openPanel?.id || null, style, ready, printing, route: route.map(index => slides[index].id)};
  }
  function audit() {
    const issues = configIssues.map(detail => ({type: 'configuration', detail}));
    const ids = slides.map(slide => slide.id);
    if (new Set(ids).size !== ids.length || ids.some(id => !id)) issues.push({type: 'slide-ids', detail: 'Slide IDs must be nonempty and unique.'});
    if (slides.filter(slide => slide.classList.contains('is-active')).length !== 1) issues.push({type: 'active-slide-count'});
    if (!printing) {
      for (const slide of slides.filter(item => !item.classList.contains('is-active') && !item.classList.contains('is-leaving'))) {
        const painted = $$('*', slide).find(element => getComputedStyle(element).visibility === 'visible' && getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().width > 0);
        if (painted) issues.push({type: 'inactive-slide-paint', slide: slide.id, detail: painted.className?.toString()});
      }
    }
    for (const image of $$('img', slidesRoot)) if (!image.complete || image.naturalWidth === 0) issues.push({type: 'image', slide: image.closest('.slide')?.id, detail: image.getAttribute('src')?.slice(0, 100)});
    const scale = stage.getBoundingClientRect().width / 1920 || 1;
    for (const slide of slides) {
      const body = $('.slide-body', slide), takeaway = $('.takeaway', slide), heading = $('.slide-heading', slide);
      if (!body) continue;
      const br = body.getBoundingClientRect();
      const limit = takeaway ? takeaway.getBoundingClientRect().top : slide.getBoundingClientRect().bottom - 190 * scale;
      for (const element of $$('*', body)) {
        if (element.closest('svg') && element.tagName.toLowerCase() !== 'svg') continue;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height || getComputedStyle(element).display === 'none') continue;
        if (rect.bottom > limit - 8 * scale && rect.width > 12 * scale) {
          issues.push({type: 'body-footer-overlap', slide: slide.id, detail: element.textContent?.trim().slice(0, 65)}); break;
        }
        if (rect.right > br.right + 3 * scale || rect.left < br.left - 3 * scale) {
          issues.push({type: 'body-width-overflow', slide: slide.id, detail: element.textContent?.trim().slice(0, 65)}); break;
        }
      }
      if (heading) { const hr=heading.getBoundingClientRect(); if (Math.min(hr.right,br.right)-Math.max(hr.left,br.left)>2*scale && Math.min(hr.bottom,br.bottom)-Math.max(hr.top,br.top)>2*scale) issues.push({type:'heading-body-overlap',slide:slide.id}); }
      if (takeaway && (takeaway.scrollHeight > takeaway.clientHeight + 2 || takeaway.scrollWidth > takeaway.clientWidth + 2)) issues.push({type: 'takeaway-clipped', slide: slide.id});
    }
    return {slides: slides.length, state: state(), fontsReady: document.fonts?.status === 'loaded', runningAnimations: animations.size + counters.size, issues};
  }

  const bind = (selector, action) => $(selector)?.addEventListener('click', action);
  bind('#prev', prev); bind('#next', next); bind('#overview-toggle', () => openOverlay($('#overview')));
  bind('#notes-toggle', () => openOverlay($('#notes-panel'))); bind('#motion-toggle', () => setReducedMotion(!reduced)); bind('#fullscreen-toggle', fullscreen);
  $$('[data-close]').forEach(button => button.addEventListener('click', () => closeOverlay()));
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest('[data-goto]');
    if (link && stage.contains(link)) {
      event.preventDefault(); const index = resolveSlide(link.dataset.goto);
      if (index >= 0) { returnStack.push({index: current, step}); closeOverlay(false); go(index); }
      else liveMessage('未找到目标页：' + link.dataset.goto);
    }
    if (target?.closest('[data-return]')) { event.preventDefault(); returnToOrigin(); }
    if (openPanel && target === openPanel) closeOverlay();
  });
  function editable(target) {
    return target instanceof Element && !!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
  }
  window.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
    const key = event.key;
    if (openPanel) {
      if (key === 'Escape') { event.preventDefault(); closeOverlay(); return; }
      if (key === 'Tab') {
        const items = focusable(openPanel);
        if (!items.length) { event.preventDefault(); openPanel.focus(); return; }
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || !openPanel.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !openPanel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    if (editable(event.target)) return;
    if (key === 'Escape') { event.preventDefault(); numberBuffer = ''; clearTimeout(numberTimer); openOverlay($('#overview')); return; }
    if (/^[0-9]$/.test(key)) {
      numberBuffer += key; clearTimeout(numberTimer);
      numberTimer = setTimeout(() => { numberBuffer = ''; }, 2000);
      liveMessage('跳转到第 ' + numberBuffer + ' 页 · Enter 确认'); event.preventDefault(); return;
    }
    if (key === 'Enter' && numberBuffer) {
      const index = resolveSlide(numberBuffer); numberBuffer = ''; clearTimeout(numberTimer);
      if (index >= 0) go(index); else liveMessage('没有这一页。');
      event.preventDefault(); return;
    }
    if ((key === ' ' || key === 'Enter') && event.target instanceof Element && event.target.closest('button,a[href],summary,[role="button"]')) return;
    const actions = {
      ArrowRight: next, ArrowDown: next, PageDown: next, ' ': next, Enter: next,
      ArrowLeft: prev, ArrowUp: prev, PageUp: prev,
      Home: () => go(route[0]), End: () => go(route[route.length - 1], {step: 'last'}),
      g: () => openOverlay($('#overview')), G: () => openOverlay($('#overview')),
      n: () => openOverlay($('#notes-panel')), N: () => openOverlay($('#notes-panel')),
      m: () => setReducedMotion(!reduced), M: () => setReducedMotion(!reduced),
      f: fullscreen, F: fullscreen, b: returnToOrigin, B: returnToOrigin
    };
    if (actions[key]) { event.preventDefault(); actions[key](); }
  });
  let touch = null;
  stage.addEventListener('touchstart', event => {
    if (openPanel || event.touches.length !== 1 || event.target.closest('button,a,input,textarea,select,[contenteditable],.overlay')) { touch = null; return; }
    touch = {x: event.touches[0].clientX, y: event.touches[0].clientY, time: performance.now()};
  }, {passive: true});
  stage.addEventListener('touchend', event => {
    if (!touch || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - touch.x, dy = event.changedTouches[0].clientY - touch.y;
    if (performance.now() - touch.time < 1000 && Math.abs(dx) >= 65 && Math.abs(dx) > Math.abs(dy) * 1.8) dx < 0 ? next() : prev();
    touch = null;
  }, {passive: true});
  stage.addEventListener('touchcancel', () => { touch = null; }, {passive: true});
  function readHash() {
    let key;
    try { key = decodeURIComponent(location.hash.slice(1)); } catch (_) { key = ''; }
    const index = resolveSlide(key);
    if (index >= 0) go(index, {hash: false});
  }
  window.addEventListener('hashchange', readHash);
  window.addEventListener('resize', fit);
  document.addEventListener('visibilitychange', updatePause);
  const mediaChanged = event => { if (motionOverride === null) setReducedMotion(event.matches, false); };
  if (media.addEventListener) media.addEventListener('change', mediaChanged); else media.addListener(mediaChanged);
  window.addEventListener('beforeprint', freezeForPrint);
  window.addEventListener('afterprint', restoreAfterPrint);

  for (const panel of $$('.overlay')) panel.hidden = true;
  const requested = (() => { try { return resolveSlide(decodeURIComponent(location.hash.slice(1))); } catch (_) { return -1; } })();
  setReducedMotion(reduced, false); fit(); go(requested >= 0 ? requested : route[0], {instant: reduced});
  if (new URLSearchParams(location.search).has('all')) showAll();
  const api = {go, next, prev, showAll, state, setReducedMotion, audit, animationsFinished, freezeForPrint, restoreAfterPrint, slides};
  api.ready = Promise.resolve(document.fonts?.ready).then(() => { ready = true; fit(); return state(); });
  window.__deck = api;
})();
