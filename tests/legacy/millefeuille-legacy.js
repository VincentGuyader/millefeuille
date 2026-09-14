// Copie de reference du calcul JavaScript d'origine du site (index.html, commit 04f062e).
// Sert uniquement a produire les fixtures du golden master ; ne pas modifier.
// Seule adaptation : raster() est remplace par un glyphe synthetique passe en argument,
// car node n'a pas de canvas, et makePdf() recoit cfg et folds au lieu de lire la page.
'use strict';
const NR = 200;

/* ---------- calcul ---------- */
function sampleU(n, angleDeg, mode){
  const out = new Array(n);
  const a = angleDeg * Math.PI / 180;
  for (let k = 0; k < n; k++){
    const i = (k + 0.5) / n;
    if (mode === 'linear' || angleDeg <= 0){ out[k] = i; continue; }
    const phi = -a/2 + a*i;
    out[k] = (Math.sin(phi) + Math.sin(a/2)) / (2*Math.sin(a/2));
  }
  return out;
}
function wave(n, amp, cycles){
  const out = new Array(n).fill(0);
  if (amp <= 0) return out;
  for (let k = 0; k < n; k++)
    out[k] = amp * Math.sin(2*Math.PI*cycles*(k+0.5)/n);
  return out;
}
function ribbon(n, amp, cycles, thick, mirror){
  const m = new Uint8Array(NR*n);
  if (thick <= 0) return m;
  const base = thick/2 + amp, half = thick/2;
  for (let j = 0; j < n; j++){
    const s = Math.sin(2*Math.PI*cycles*(j+0.5)/n);
    const ct = base + amp*s;
    const cb = 1 - base + amp*(mirror ? -s : s);
    for (let i = 0; i < NR; i++){
      const r = (i+0.5)/NR;
      if (Math.abs(r-ct) <= half || Math.abs(r-cb) <= half) m[j*NR+i] = 1;
    }
  }
  return m;
}
function mmf(ink, n, pageH, mt, mb, minFold, gap, maxMarks){
  const usable = pageH - mt - mb, res = [];
  for (let j = 0; j < n; j++){
    const S = [], E = [];
    let run = -1;
    for (let i = 0; i < NR; i++){
      const on = ink[j*NR+i] === 1;
      if (on && run < 0) run = i;
      if ((!on || i === NR-1) && run >= 0){
        const end = on ? i+1 : i;
        const a = mt + run/NR*usable, b = mt + end/NR*usable;
        const last = S.length-1;
        if (last >= 0 && a - E[last] < gap) E[last] = b;
        else { S.push(a); E.push(b); }
        run = -1;
      }
    }
    let bands = S.map((a,k) => ({a, b:E[k]})).filter(o => o.b-o.a >= minFold);
    if (bands.length > maxMarks)
      bands = bands.map((o,k)=>({o,k})).sort((x,y)=>(y.o.b-y.o.a)-(x.o.b-x.o.a))
                   .slice(0,maxMarks).sort((x,y)=>x.k-y.k).map(x=>x.o);
    bands.forEach(o => res.push({sheet:j+1, a:+o.a.toFixed(1), b:+o.b.toFixed(1)}));
  }
  return res;
}

/* ---------- lettres ---------- */
function inkAt(r, u, row, off, lo, hi){
  const x = Math.round(r.x0 + u*(r.x1-r.x0));
  const dv = ((row+0.5)/NR - off - lo) / (hi-lo);
  if (dv < 0 || dv > 1) return 0;
  const y = Math.round(r.y0 + dv*(r.y1-r.y0));
  return r.d[(y*r.W+x)*4+3] > 128 ? 1 : 0;
}

/* ---------- pipeline ---------- */
function build(cfg, r){
  const sheets = Math.max(1, Math.floor((Math.floor(cfg.np/2) - 2*cfg.garde)/cfg.pas));
  const u = sampleU(sheets, cfg.ang, cfg.proj);
  const ampW = (cfg.ondul==='mot'||cfg.ondul==='deux') ? cfg.amp : 0;
  const ampB = (cfg.ondul==='bloc'||cfg.ondul==='deux') ? cfg.ampb : 0;
  const thk  = (cfg.ondul==='bloc'||cfg.ondul==='deux') ? cfg.thick : 0;
  const off  = wave(sheets, ampW, cfg.cyc);
  const band = ribbon(sheets, ampB, cfg.cyc, thk, cfg.mir);

  let lo = thk > 0 ? thk + 2*ampB + 0.03 + ampW : ampW;
  let hi = 1 - lo;
  if (hi - lo < 0.2){ lo = 0.4; hi = 0.6; }

  const ink = new Uint8Array(NR*sheets);
  if (r) for (let j=0;j<sheets;j++) for (let i=0;i<NR;i++){
    const k = j*NR+i;
    ink[k] = band[k] || inkAt(r, u[j], i, off[j], lo, hi);
  }
  return { sheets, folds: mmf(ink, sheets, cfg.h, cfg.mt, cfg.mb, cfg.minf, cfg.gap, cfg.tech) };
}

/* ---------- export ---------- */
function grouped(folds){
  const m = new Map();
  folds.forEach(f => { if(!m.has(f.sheet)) m.set(f.sheet,[]); m.get(f.sheet).push(f); });
  return m;
}
function cells(fs){
  const c = []; fs.forEach(f => c.push(f.a.toFixed(1), f.b.toFixed(1)));
  while (c.length < 6) c.push('');
  return c.slice(0,6);
}
function stats(folds){
  const m = grouped(folds);
  return { sheets: m.size, marks: folds.length*2, hours: Math.max(1, Math.round(m.size/60)) };
}
function makeCsv(folds){
  let csv = 'feuille;repere_1;repere_2;repere_3;repere_4;repere_5;repere_6\n';
  grouped(folds).forEach((fs,s) => { csv += s + ';' + cells(fs).join(';') + '\n'; });
  return '\ufeff'+csv;
}
function esc(s){
  return String(s).replace(/[\\()]/g, c => '\\'+c)
                  .split('').map(c => c.charCodeAt(0) < 256 ? c : '?').join('');
}
function makePdf(cfg, folds){
  const W = 595.28, H = 841.89, ml = 48, mt = 54;
  const m = grouped(folds);
  const rows = [...m.entries()].map(([s,fs]) =>
    String(s).padStart(3) + '  ' + cells(fs).map(v => v.padStart(5)).join(' '));
  const head = 'Fl.  ' + ['1','2','3','4','5','6'].map(v => v.padStart(5)).join(' ');

  const perCol = 56, perPage = perCol*2;
  const pages = [];
  for (let i = 0; i < rows.length; i += perPage) pages.push(rows.slice(i, i+perPage));
  if (!pages.length) pages.push([]);

  const meta = cfg.np + ' pages  .  page de ' + cfg.h + ' mm  .  marges '
    + cfg.mt + '/' + cfg.mb + ' mm  .  ' + (cfg.tech === 1 ? 'pliage simple' : 'avec decoupe');

  const contents = pages.map((chunk, pi) => {
    let t = 'BT /F2 17 Tf ' + ml + ' ' + (H-mt) + ' Td (' + esc(cfg.mot || '') + ') Tj ET\n';
    t += 'BT /F1 8 Tf ' + ml + ' ' + (H-mt-16) + ' Td (' + esc(meta) + ') Tj ET\n';
    t += 'BT /F1 8 Tf ' + ml + ' ' + (H-mt-28) + ' Td ('
       + esc('Mesures en mm depuis le haut. Page ' + (pi+1) + '/' + pages.length) + ') Tj ET\n';
    const y0 = H-mt-52, rh = 11.6;
    [0,1].forEach(c => {
      t += 'BT /F1 8 Tf ' + (ml+c*252) + ' ' + (y0+13) + ' Td (' + esc(head) + ') Tj ET\n';
    });
    chunk.forEach((r,k) => {
      const c = Math.floor(k/perCol), i = k%perCol;
      t += 'BT /F1 8 Tf ' + (ml+c*252) + ' ' + (y0-i*rh) + ' Td (' + esc(r) + ') Tj ET\n';
    });
    return t;
  });

  const objs = [];
  const kids = pages.map((_,i) => (5+i*2) + ' 0 R').join(' ');
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = '<< /Type /Pages /Count ' + pages.length + ' /Kids [' + kids + '] >>';
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((_,i) => {
    objs[5+i*2] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W.toFixed(2) + ' ' + H.toFixed(2)
      + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + (6+i*2) + ' 0 R >>';
    objs[6+i*2] = '<< /Length ' + contents[i].length + ' >>\nstream\n' + contents[i] + 'endstream';
  });

  let out = '%PDF-1.4\n';
  const off = [];
  for (let i = 1; i < objs.length; i++){
    off[i] = out.length;
    out += i + ' 0 obj\n' + objs[i] + '\nendobj\n';
  }
  const xref = out.length;
  out += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n';
  for (let i = 1; i < objs.length; i++)
    out += String(off[i]).padStart(10,'0') + ' 00000 n \n';
  out += 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

module.exports = { NR, sampleU, wave, ribbon, mmf, inkAt, build, grouped, cells, stats, makeCsv, makePdf };
