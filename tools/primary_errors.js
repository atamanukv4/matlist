// node tools/primary_errors.js file.xmcd — первичные ошибки: убираем каскад «не определена», когда имя определено в листе, но его определение упало
const fs=require('fs'),path=require('path');const {DOMParser}=require('@xmldom/xmldom');
const E=require('../src/engine.js'),X=require('../src/xmcd.js');
const f=process.argv[2];const imp=X.importXmcd(fs.readFileSync(f,'utf8'),DOMParser);
const math=E.calcOrder(imp.regions).filter(r => r.kind === 'math'); // порядок счёта как в app.js
const R=new E.SheetRunner(imp.settings.origin||0);const failedDefs=new Set();const prim=[];
const kinds={};for(const r of imp.regions)kinds[r.kind]=(kinds[r.kind]||0)+1;
for(const r of math){ if(!r.latex||r.noeval)continue; let st=null;
 try{st=E.parse(r.latex);R.step(st);}catch(e){const m=e.message;const nm=(/«([^»]*)»/.exec(m)||[])[1];
  let lhs=null; if(st&&st.type==='define'){const l=st.lhs; lhs=l.type==='id'?l.name:l.type==='call'?l.f:(l.type==='sub'&&l.e.type==='id'?l.e.name+'_'+l.raw:null);}
  else {const mm=/^(.*?)\\coloneq/.exec(r.latex); if(mm) lhs=mm[1];}
  if(lhs)failedDefs.add(lhs.replace(/\./g,'_'));
  const cascade=/не определена/.test(m)&&nm&&[...failedDefs].some(d=>d===nm.replace(/\./g,'_')||d.replace(/\\mathrm\{|\}|\\/g,'').includes(nm.replace(/\./g,'_')));
  if(!cascade)prim.push(m.slice(0,80)+'  ⟵  '+r.latex.slice(0,150));}}
console.log('==',path.basename(f),JSON.stringify(kinds),'первичных:',prim.length);prim.slice(0,25).forEach(p=>console.log('  ',p));
