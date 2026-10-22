import {spawn} from 'node:child_process';
import {mkdtemp, readFile, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export function argsOf(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error('Expected option, got ' + argv[i]);
    out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return out;
}
export async function openDeck(file) {
  file = path.resolve(file);
  await access(file);
  if (typeof WebSocket !== 'function') throw new Error('Use Node.js 22+ (the bundled Codex Node runtime is supported).');
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium',
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe')].filter(Boolean);
  let executable;
  for (const p of candidates) { try { await access(p); executable = p; break; } catch {} }
  if (!executable) throw new Error('Chrome/Chromium not found. Set CHROME_PATH to its executable.');
  const profile = await mkdtemp(path.join(tmpdir(), 'html-motion-deck-'));
  const child = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], {stdio:'ignore'});
  let ws, closed = false, sequence = 0;
  const pending = new Map();
  const close = async () => {
    if (closed) return;
    closed = true;
    for (const p of pending.values()) {clearTimeout(p.timer); p.reject(new Error('Browser session closed'));}
    pending.clear();
    try {ws?.close();} catch {}
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      for (let i=0;i<20 && child.exitCode===null && child.signalCode===null;i++) await sleep(100);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    await rm(profile, {recursive:true, force:true, maxRetries:3, retryDelay:100});
  };
  try {
    let port;
    for (let i=0;i<100;i++) {
      if (child.exitCode !== null) throw new Error('Chrome exited before connecting');
      try {port = (await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;} catch {}
      await sleep(100);
    }
    if (!port) throw new Error('Chrome startup timed out');
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    const target = targets.find(t=>t.type==='page');
    if (!target) throw new Error('Chrome did not create an isolated page');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('CDP connection timed out')),10000);
      ws.onopen=()=>{clearTimeout(timer);resolve();}; ws.onerror=e=>{clearTimeout(timer);reject(e);};
    });
    ws.onmessage=e=>{
      const msg=JSON.parse(e.data),p=pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);clearTimeout(p.timer);
      msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result);
    };
    const send=(method,params={},timeout=60000)=>new Promise((resolve,reject)=>{
      const id=++sequence;
      const timer=setTimeout(()=>{pending.delete(id);reject(new Error(method+' timed out'));},timeout);
      pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));
    });
    const evaluate=async expression=>{
      const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
      if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result?.value;
    };
    await send('Page.enable');await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
    const nav=await send('Page.navigate',{url:pathToFileURL(file).href});
    if(nav.errorText) throw new Error(nav.errorText);
    let ready=false;
    for(let i=0;i<150;i++) {
      ready=await evaluate('document.readyState === "complete" && !!window.__deck');
      if(ready) break;
      await sleep(100);
    }
    if(!ready) throw new Error('Deck runtime did not become ready; check the input HTML');
    await evaluate('(async()=>{await document.fonts.ready;if(window.__deck.ready?.then)await window.__deck.ready;await Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise((r,j)=>{i.onload=r;i.onerror=j})));return true})()');
    const broken=await evaluate('[...document.images].filter(i=>!i.complete || i.naturalWidth===0).map(i=>i.getAttribute("src").slice(0,80))');
    if(broken.length) throw new Error('Broken images: '+JSON.stringify(broken));
    return {send,evaluate,close};
  } catch(error) {await close();throw error;}
}
