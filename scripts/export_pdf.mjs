import {writeFile, access, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {argsOf,openDeck} from './browser.mjs';

const args=argsOf(process.argv.slice(2));
if(!args.html || !args.out) throw new Error('Usage: node export_pdf.mjs --html /absolute/deck.html --out /absolute/new.pdf');
const out=path.resolve(args.out);
try {await access(out);throw new Error('Output exists; choose a new filename to preserve it: '+out);} catch(e) {if(e.code!=='ENOENT')throw e;}
const browser=await openDeck(args.html);
try {
  const expected=await browser.evaluate('document.querySelectorAll(".slide").length');
  await browser.evaluate('window.__deck.freezeForPrint?.();true');
  await browser.send('Emulation.setEmulatedMedia',{media:'print'});
  const printState=await browser.evaluate('({slides:[...document.querySelectorAll(".slide")].map(s=>({id:s.id,display:getComputedStyle(s).display,width:s.getBoundingClientRect().width,height:s.getBoundingClientRect().height})),hiddenFragments:[...document.querySelectorAll("[data-step]")].filter(e=>getComputedStyle(e).opacity==="0"||getComputedStyle(e).visibility==="hidden").length})');
  if(printState.slides.some(s=>s.display==='none'||s.width!==1920||s.height!==1080)||printState.hiddenFragments) throw new Error('Print final-state validation failed: '+JSON.stringify(printState));
  const result=await browser.send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false,marginTop:0,marginBottom:0,marginLeft:0,marginRight:0},120000);
  const bytes=Buffer.from(result.data,'base64');
  if(bytes.subarray(0,5).toString()!=='%PDF-')throw new Error('Chrome returned an invalid PDF');
  await mkdir(path.dirname(out),{recursive:true});await writeFile(out,bytes);
  console.log(JSON.stringify({pdf:out,expectedPages:expected,bytes:bytes.length,validation:'Exported; verify actual PDF page count and rendered pages before delivery.'}));
} finally {await browser.close();}
