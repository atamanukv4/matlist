// Матлист — экспорт листа: DOCX (формулы — объекты Word, OMML) и HTML для печати в PDF; ZIP без сжатия.
(function (root) {
'use strict';
const E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.MatEngine;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ───────── ZIP (метод «stored») ─────────
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
const enc = s => new TextEncoder().encode(s);
function zip(files) { // files: [{ name, data: Uint8Array | string }]
  const parts = [], cd = []; let off = 0;
  for (const f of files) {
    const name = enc(f.name), data = typeof f.data === 'string' ? enc(f.data) : f.data, crc = crc32(data), sz = data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    parts.push(new Uint8Array(lh.buffer), name, data); cd.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + sz;
  }
  let cdSize = 0; for (const p of cd) cdSize += p.length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  const all = [...parts, ...cd, new Uint8Array(end.buffer)]; let n = 0; for (const p of all) n += p.length;
  const out = new Uint8Array(n); let q = 0; for (const p of all) { out.set(p, q); q += p.length; }
  return out;
}

// ───────── формулы → OMML ─────────
const GR = { α: 'α' };
const r = (t, opt) => '<m:r>' + (opt && opt.plain ? '<m:rPr><m:sty m:val="p"/></m:rPr>' : '') + '<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr><m:t xml:space="preserve">' + esc(t) + '</m:t></m:r>';
const rp = t => r(t, { plain: true });
const e = x => '<m:e>' + x + '</m:e>';
const dl = (x, a, b) => '<m:d><m:dPr><m:begChr m:val="' + esc(a || '(') + '"/><m:endChr m:val="' + esc(b || ')') + '"/></m:dPr>' + e(x) + '</m:d>';
const PREC = { or: 1, and: 2, cmp: 3, add: 4, mul: 5, neg: 6, pow: 7, atom: 9 };
function name(n) {
  const us = n.indexOf('_'); const base = us >= 0 ? n.slice(0, us) : n, sub = us >= 0 ? n.slice(us + 1) : null;
  const b = [...base].length > 1 && /^[A-Za-z']+$/.test(base) ? rp(base) : r(base);
  return sub === null ? b : '<m:sSub>' + e(b) + '<m:sub>' + rp(sub) + '</m:sub></m:sSub>';
}
const FN = { sin: 1, cos: 1, tan: 1, cot: 1, sec: 1, csc: 1, ln: 1, log: 1, exp: 1, sinh: 1, cosh: 1, tanh: 1, max: 1, min: 1, arg: 1, det: 1 };
function om(n, p) {
  const wrap = (s, q) => (q < p ? dl(s) : s);
  switch (n.type) {
    case 'num': { const s = String(n.v); if (/e/.test(s)) { const [m, x] = s.split('e'); return wrap(r(m + '·') + '<m:sSup>' + e(r('10')) + '<m:sup>' + r(String(parseInt(x))) + '</m:sup></m:sSup>', PREC.mul); } return n.v < 0 ? wrap(r(s), PREC.neg) : r(s); }
    case 'str': return rp('"' + n.v + '"');
    case 'imag': return r(String(n.v) + 'i');
    case 'id': return name(n.name);
    case 'paren': return dl(om(n.e, 0));
    case 'neg': return wrap(r('−') + om(n.e, PREC.neg), PREC.neg);
    case 'un': return wrap(r('¬') + om(n.e, PREC.neg), PREC.neg);
    case 'bin': {
      const o = n.op;
      if (o === '/') return '<m:f>' + '<m:num>' + om(n.l, 0) + '</m:num><m:den>' + om(n.r, 0) + '</m:den></m:f>';
      if (o === '+' || o === '-') return wrap(om(n.l, PREC.add) + r(o === '-' ? '−' : '+') + om(n.r, PREC.add + 1), PREC.add);
      if (o === '·' || o === '×') return wrap(om(n.l, PREC.mul) + r(o) + om(n.r, PREC.mul + 1), PREC.mul);
      const cm = { '<': '<', '>': '>', '≤': '≤', '≥': '≥', '≠': '≠', '==': '=' }[o];
      if (cm) return wrap(om(n.l, PREC.cmp + 1) + r(cm) + om(n.r, PREC.cmp + 1), PREC.cmp);
      if (o === '∧' || o === '∨') return wrap(om(n.l, PREC.and) + r(o) + om(n.r, PREC.and + 1), PREC.and);
      return om(n.l, 0) + r(o) + om(n.r, 0);
    }
    case 'pow': return wrap('<m:sSup>' + e(om(n.b, PREC.pow + 1)) + '<m:sup>' + om(n.e, 0) + '</m:sup></m:sSup>', PREC.pow);
    case 'sqrt': return '<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>' + e(om(n.e, 0)) + '</m:rad>';
    case 'root': return '<m:rad><m:deg>' + om(n.n, 0) + '</m:deg>' + e(om(n.e, 0)) + '</m:rad>';
    case 'abs': return dl(om(n.e, 0), '|', '|');
    case 'fact': return om(n.e, PREC.atom) + r('!');
    case 'transpose': return '<m:sSup>' + e(om(n.e, PREC.atom)) + '<m:sup>' + r('T') + '</m:sup></m:sSup>';
    case 'col': return '<m:sSup>' + e(om(n.e, PREC.atom)) + '<m:sup>' + dl(om(n.j, 0), '⟨', '⟩') + '</m:sup></m:sSup>';
    case 'matrix': return dl('<m:m>' + n.rows.map(row => '<m:mr>' + row.map(c => e(om(c, 0))).join('') + '</m:mr>').join('') + '</m:m>', '[', ']');
    case 'sub': return '<m:sSub>' + e(om(n.e, PREC.atom)) + '<m:sub>' + (n.ix ? n.ix.map(x => om(x, 0)).join(r(',')) : rp(n.raw)) + '</m:sub></m:sSub>';
    case 'call': {
      const f = FN[n.f] ? rp(n.f) : name(n.f);
      return '<m:func><m:fName>' + f + '</m:fName>' + e(dl(n.args.map(a => om(a, 0)).join(r(',')))) + '</m:func>';
    }
    case 'range': return om(n.a, 0) + (n.s ? r(',') + om(n.s, 0) : '') + r('..') + om(n.b, 0);
    case 'int': return '<m:nary><m:naryPr><m:chr m:val="∫"/></m:naryPr><m:sub>' + om(n.lo, 0) + '</m:sub><m:sup>' + om(n.hi, 0) + '</m:sup>' + e(om(n.body, PREC.add) + rp(' d') + name(n.v)) + '</m:nary>';
    case 'deriv': { const o = n.order > 1 ? '<m:sSup>' + e(rp('d')) + '<m:sup>' + r(String(n.order)) + '</m:sup></m:sSup>' : rp('d'); const v = n.order > 1 ? '<m:sSup>' + e(name(n.v)) + '<m:sup>' + r(String(n.order)) + '</m:sup></m:sSup>' : name(n.v);
      return '<m:f><m:num>' + o + '</m:num><m:den>' + rp('d') + v + '</m:den></m:f>' + om(n.e, PREC.mul); }
    case 'sum': case 'prod': return '<m:nary><m:naryPr><m:chr m:val="' + (n.type === 'sum' ? '∑' : '∏') + '"/>' + (n.to ? '' : '<m:supHide m:val="1"/>') + '</m:naryPr><m:sub>' + name(n.v) + (n.from ? r('=') + om(n.from, 0) : '') + '</m:sub><m:sup>' + (n.to ? om(n.to, 0) : '') + '</m:sup>' + e(om(n.body, PREC.mul)) + '</m:nary>';
    case 'system': return dl('<m:eqArr>' + n.eqs.map(q => e(om(q, 0))).join('') + '</m:eqArr>', '{', '');
    case 'unsupported': return rp(n.what || '?');
  }
  return r('?');
}
function stmtOmml(st) {
  if (st.type === 'define') return om(st.lhs, 0) + r(st.global ? '≡' : '≔') + om(st.rhs, 0);
  if (st.type === 'eval') return om(st.expr, 0);
  if (st.type === 'expr') return om(st.expr, 0);
  return '';
}
// результат (LaTeX из fmtValue) → OMML
function resOmml(tex) {
  const arr = tex.match(/^\\begin\{array\}\{[^}]*\}([\s\S]*)\\end\{array\}$/);
  if (arr) return '<m:eqArr>' + arr[1].split('\\\\').map(row => e(resOmml(row.trim()))).join('') + '</m:eqArr>';
  try { const st = E.parse(tex); if (st.type === 'expr' || st.type === 'eval') return om(st.expr, 0); } catch (err) { /* ниже — текстом */ }
  return rp(tex.replace(/\\times/g, '×').replace(/\\cdot/g, '·').replace(/[{}\\]/g, ''));
}
function mathOmml(reg) {
  let st; try { st = E.parse(reg.latex); } catch (err) { return null; }
  let x = stmtOmml(st);
  if (reg.res) x += r(st.sym ? '→' : '=') + resOmml(reg.res);
  return '<m:oMath>' + x + '</m:oMath>';
}

// ───────── DOCX ─────────
// regs: регионы листа, отсортированные; opts: { title, png(reg) → { data: Uint8Array, w, h } | null }
function docx(regs, opts) {
  const media = []; let body = '';
  const EMU = 9525; // 1 px = 9525 EMU (96 dpi)
  const maxW = 6.3 * 914400; // ширина поля A4 при полях 2 см
  const pic = (img, k) => {
    let cx = Math.round(img.w * EMU), cy = Math.round(img.h * EMU); if (cx > maxW) { cy = Math.round(cy * maxW / cx); cx = maxW; }
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + k + '" name="Рисунок ' + k + '"/>' +
      '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:nvPicPr><pic:cNvPr id="' + k + '" name="image' + k + '.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg' + k + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  };
  const textRuns = (t, bold) => String(t).split('\n').map((line, i) => (i ? '<w:r><w:br/></w:r>' : '') + '<w:r>' + (bold ? '<w:rPr><w:b/></w:rPr>' : '') + '<w:t xml:space="preserve">' + esc(line) + '</w:t></w:r>').join('');
  // строки листа: регионы с близкой вертикалью — в один абзац через табуляцию
  const rows = [];
  for (const g of regs) { const last = rows[rows.length - 1]; if (last && Math.abs(g.y - last.y) < 14 && g.kind !== 'plot' && g.kind !== 'image' && last.items.every(q => q.kind !== 'plot' && q.kind !== 'image')) last.items.push(g); else rows.push({ y: g.y, items: [g] }); }
  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
    let p = '';
    row.items.forEach((g, i) => {
      if (i) p += '<w:r><w:tab/></w:r>';
      if (g.kind === 'math') { const m = mathOmml(g); p += m || textRuns(g.latex); }
      else if (g.kind === 'text' || g.kind === 'note') p += textRuns(g.text || '', g.bold);
      else if (g.kind === 'plot' || g.kind === 'image') {
        const img = opts.png && opts.png(g);
        if (img) { const k = media.length + 1; media.push(img.data); p += pic(img, k); }
      }
    });
    const ind = Math.round(Math.max(0, row.items[0].x - 12) * 15); // px → twips (1 px ≈ 15 twips)
    const shade = row.items.length === 1 && row.items[0].hl ? '<w:shd w:val="clear" w:color="auto" w:fill="' + row.items[0].hl.replace('#', '') + '"/>' : '';
    body += '<w:p><w:pPr>' + shade + '<w:spacing w:after="80"/>' + (ind ? '<w:ind w:left="' + Math.min(ind, 6000) + '"/>' : '') + '</w:pPr>' + p + '</w:p>';
  }
  const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>' +
    (opts.title ? '<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t xml:space="preserve">' + esc(opts.title) + '</w:t></w:r></w:p>' : '') + body +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    media.map((_, i) => '<Relationship Id="rIdImg' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image' + (i + 1) + '.png"/>').join('') + '</Relationships>';
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="24"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="200"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style></w:styles>';
  const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
  const pkgRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';
  const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + esc(opts.title || '') + '</dc:title><dc:creator>Матлист</dc:creator></cp:coreProperties>';
  const files = [{ name: '[Content_Types].xml', data: ct }, { name: '_rels/.rels', data: pkgRels }, { name: 'docProps/core.xml', data: core }, { name: 'word/document.xml', data: doc }, { name: 'word/styles.xml', data: styles }, { name: 'word/_rels/document.xml.rels', data: rels }];
  media.forEach((d, i) => files.push({ name: 'word/media/image' + (i + 1) + '.png', data: d }));
  return zip(files);
}
// цвет подсветки → ближайший цвет выделения Word
function hlName(hex) {
  const W = { yellow: [255, 255, 0], green: [0, 255, 0], cyan: [0, 255, 255], magenta: [255, 0, 255], lightGray: [192, 192, 192] };
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); let best = 'yellow', bd = 1e9;
  for (const k in W) { const d = W[k].reduce((s, v, i) => s + (v - c[i]) ** 2, 0); if (d < bd) { bd = d; best = k; } }
  return best;
}

// ───────── HTML для печати (PDF) ─────────
// regs — с полями html (готовая разметка региона) и x, y, w, h в px; css — стили MathLive и приложения
function printHtml(regs, opts) {
  let maxX = 0, maxY = 0; for (const g of regs) { maxX = Math.max(maxX, g.x + (g.w || 200)); maxY = Math.max(maxY, g.y + (g.h || 30)); }
  const pageW = 718; // ширина печатной области A4 (190 мм) в px CSS
  const k = Math.min(1, pageW / (maxX + 10));
  const items = regs.map(g => '<div class="pr" style="left:' + g.x + 'px;top:' + g.y + 'px' + (g.hl ? ';background:' + g.hl : '') + '">' + g.html + '</div>').join('');
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(opts.title || 'Матлист') + '</title><style>' + (opts.css || '') +
    '@page{size:A4;margin:12mm 10mm}html,body{margin:0;background:#fff;color:#111}' +
    '.sheet{position:relative;width:' + Math.ceil(maxX + 10) + 'px;height:' + Math.ceil(maxY + 20) + 'px;transform:scale(' + k + ');transform-origin:0 0}' +
    '.pr{position:absolute;white-space:nowrap;padding:1px 3px;border-radius:3px}.pr .res{color:#0b5c2e}.pr .t{white-space:pre-wrap;font:14px/1.35 system-ui,sans-serif}.pr .t.b{font-weight:650}' +
    '.pr .emsg{display:block;font-size:11px;color:#d12f2f}.pr img{display:block}.wrap{height:' + Math.ceil((maxY + 20) * k) + 'px}' +
    '</style></head><body><div class="wrap"><div class="sheet">' + items + '</div></div></body></html>';
}

const api = { zip, crc32, docx, printHtml, mathOmml, om, stmtOmml };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MatExport = api;
})(typeof window !== 'undefined' ? window : globalThis);
