import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {argsOf,openDeck,sleep} from './browser.mjs';

const args=argsOf(process.argv.slice(2));
if(!args.html || !args.out)throw new Error('Usage: node check_deck.mjs --html /absolute/index.html --out /absolute/qa-directory');
const out=path.resolve(args.out);await mkdir(out,{recursive:true});
const b=await openDeck(args.html),report={html:path.resolve(args.html),slides:[],issues:[],motion:{}};
try {
 const count=await b.evaluate('document.querySelectorAll(".slide").length');
 await b.evaluate('window.__deck.setReducedMotion(true);true');
 for(let i=0;i<count;i++) {
  await b.evaluate('window.__deck.go('+i+',{instant:true});window.__deck.showAll();true');
  await sleep(50);
  const layout=await b.evaluate(`(()=>{
    const s=document.querySelector('.slide.is-active'),base=s.getBoundingClientRect(),k=1920/base.width,issues=[];
    const rel=e=>{const r=e.getBoundingClientRect();return {left:(r.left-base.left)*k,top:(r.top-base.top)*k,right:(r.right-base.left)*k,bottom:(r.bottom-base.top)*k}};
    const bd=s.querySelector('.slide-body'),hd=s.querySelector('.slide-heading'),take=s.querySelector('.takeaway');
    const body=rel(bd),header=rel(hd),footer=rel(take);
    const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>2 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2;
    if(overlaps(header,body))issues.push('heading overlaps body');
    if(body.bottom>footer.top-2)issues.push('body region overlaps takeaway');
    if(take.scrollHeight>take.clientHeight+2)issues.push('takeaway clipped');
    const els=[...bd.querySelectorAll('*')].filter(e=>!e.closest('svg') && e.getBoundingClientRect().height>0);
    for(const e of els){const r=rel(e),cs=getComputedStyle(e);if(cs.display==='none')continue;if(r.bottom>footer.top-4||r.right>1826||r.left<94)issues.push('body overflow: '+e.tagName+' '+e.textContent.trim().slice(0,30));if((cs.overflow==='hidden'||cs.overflowY==='hidden')&&e.scrollHeight>e.clientHeight+3)issues.push('clipped: '+e.tagName);}
    const hiddenPaint=window.__deck.audit().issues.filter(x=>x.type==='inactive-slide-paint');
    issues.push(...hiddenPaint.map(x=>'inactive slide paint: '+x.slide));
    return {id:s.id,index:window.__deck.state().index,issues:[...new Set(issues)],body,header,footer};
  })()`);
  report.slides.push(layout);
  const png=await b.send('Page.captureScreenshot',{format:'png'});
  await writeFile(path.join(out,'slide-'+String(i+1).padStart(2,'0')+'.png'),Buffer.from(png.data,'base64'));
 }
 await b.evaluate('window.__deck.setReducedMotion(false);window.__deck.go(0,{instant:true});true');
 if(count>1){
  await b.evaluate('window.__deck.go(1);true');await sleep(100);
  report.motion.running=await b.evaluate('document.getAnimations().filter(a=>a.playState==="running").length');
  const shot=await b.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,'motion-100ms.png'),Buffer.from(shot.data,'base64'));
  await b.evaluate('window.__deck.animationsFinished?.().then(()=>true)');await sleep(100);
  const settled=await b.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,'motion-settled.png'),Buffer.from(settled.data,'base64'));
  if(!report.motion.running)report.issues.push('No observable running motion after navigation');
  await b.evaluate('window.__deck.go(0);window.__deck.go(1);window.__deck.go(0);window.__deck.go(1);true');
  await b.evaluate('window.__deck.animationsFinished?.().then(()=>true)');await sleep(100);
  report.motion.rapid=await b.evaluate('({active:[...document.querySelectorAll(".slide.is-active")].map(s=>s.id),leaving:document.querySelectorAll(".slide.is-leaving").length,state:window.__deck.state()})');
  if(report.motion.rapid.active.length!==1||report.motion.rapid.leaving!==0||report.motion.rapid.state.index!==1)report.issues.push('Rapid navigation did not settle');
 }
 await b.evaluate('window.__deck.setReducedMotion(true);true');await sleep(100);
 report.motion.reducedRunning=await b.evaluate('document.getAnimations().filter(a=>a.playState==="running").length');
 if(report.motion.reducedRunning)report.issues.push('Reduced-motion mode has running animations');
 report.issues.push(...report.slides.flatMap(s=>s.issues.map(issue=>s.id+': '+issue)));
 report.passed=report.issues.length===0;
 await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,slides:count,issues:report.issues,report:path.join(out,'report.json')}));
 if(!report.passed)process.exitCode=1;
}finally{await b.close();}
