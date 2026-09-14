// Genere les fixtures du golden master a partir du calcul JavaScript d'origine.
// Usage : node tests/legacy/make-fixtures.js
// Les glyphes sont synthetiques (formes geometriques deterministes) : node n'a pas de canvas,
// et le moteur de fontes du navigateur n'est pas ce que le golden master doit figer.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./millefeuille-legacy.js');

function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Un glyphe = canvas RGBA de W x Hc pixels, encre = alpha 255, plus la boite englobante.
function glyph(W, Hc, paint){
  const on = new Uint8Array(W*Hc);
  paint((x,y) => { if (x>=0 && x<W && y>=0 && y<Hc) on[y*W+x] = 1; });
  const d = new Uint8ClampedArray(W*Hc*4);
  let x0=W, x1=-1, y0=Hc, y1=-1;
  for (let y=0;y<Hc;y++) for (let x=0;x<W;x++) if (on[y*W+x]){
    d[(y*W+x)*4+3] = 255;
    if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;
  }
  if (x1 < 0) return null;
  return {d, W, x0, x1, y0, y1};
}
function rect(p, x, y, w, h){ for (let j=y;j<y+h;j++) for (let i=x;i<x+w;i++) p(i,j); }
function ring(p, cx, cy, ro, ri){
  for (let j=cy-ro;j<=cy+ro;j++) for (let i=cx-ro;i<=cx+ro;i++){
    const r2 = (i-cx)**2 + (j-cy)**2;
    if (r2 <= ro*ro && r2 >= ri*ri) p(i,j);
  }
}
function diag(p, x, y, len, thick, dir){
  for (let k=0;k<len;k++) for (let t=0;t<thick;t++) p(x+k, y+dir*k+t);
}

const GLYPHS = {
  // mot large : deux barres, un anneau (lettre percee), une diagonale, une barre basse
  mot: glyph(700, 400, p => {
    rect(p, 40, 80, 40, 240); rect(p, 80, 80, 90, 36);
    ring(p, 300, 200, 90, 50);
    diag(p, 420, 100, 200, 30, 1);
    rect(p, 460, 300, 200, 26);
  }),
  // mot etroit et haut
  etroit: glyph(200, 500, p => { rect(p, 60, 40, 30, 420); rect(p, 100, 220, 60, 30); }),
  // bruit deterministe : beaucoup de petits segments, teste fusion, rejet et plafonnement
  bruit: glyph(500, 300, p => {
    const rnd = mulberry32(42);
    for (let k=0;k<140;k++) rect(p, Math.floor(rnd()*470), Math.floor(rnd()*280), 6+Math.floor(rnd()*30), 4+Math.floor(rnd()*22));
  }),
  // un seul pixel : cas limite de boite englobante degeneree
  point: glyph(50, 50, p => p(25, 25)),
};

function cfg(over){
  return Object.assign({mot:'Merci',police:"Georgia,'Times New Roman',serif",gras:700,np:480,h:205,
    mt:20,mb:20,garde:18,pas:1,proj:'fan',ang:180,tech:1,minf:5,gap:4,
    ondul:'none',amp:0.1,ampb:0.08,thick:0.06,mir:false,cyc:1}, over);
}

const CASES = [
  ['defaut',        'mot',    cfg({})],
  ['decoupe',       'mot',    cfg({tech:3})],
  ['lineaire',      'mot',    cfg({proj:'linear', tech:3})],
  ['angle120',      'mot',    cfg({ang:120, tech:3})],
  ['ondul-mot',     'mot',    cfg({ondul:'mot', amp:0.14, cyc:1, tech:3})],
  ['ondul-bloc',    'mot',    cfg({ondul:'bloc', tech:3, np:520})],
  ['ondul-miroir',  'mot',    cfg({ondul:'bloc', tech:3, mir:true, cyc:2.5, ampb:0.2, thick:0.2})],
  ['ondul-deux',    'mot',    cfg({ondul:'deux', tech:3, amp:0.25, ampb:0.12, thick:0.1, cyc:0.25})],
  ['bloc-ecrase',   'mot',    cfg({ondul:'deux', tech:3, amp:0.25, ampb:0.2, thick:0.2})],
  ['pas3-garde',    'mot',    cfg({pas:3, garde:40, np:2000, tech:3})],
  ['petit-livre',   'etroit', cfg({np:120, garde:20, h:90, mt:5, mb:5})],
  ['une-feuille',   'etroit', cfg({np:120, garde:29})],
  ['egalites',      'mot',    cfg({h:190, mt:20, mb:20, tech:3, minf:1, gap:0})],
  ['egalites-2',    'bruit',  cfg({h:100, mt:25, mb:25, tech:3, minf:1, gap:0.5})],
  ['bruit-fusion',  'bruit',  cfg({tech:3, minf:2, gap:12})],
  ['bruit-simple',  'bruit',  cfg({tech:1, minf:3, gap:4})],
  ['bruit-grand',   'bruit',  cfg({tech:3, np:1400, h:400, mt:90, mb:90, minf:0.5, gap:0})],
  ['point',         'point',  cfg({tech:3, minf:1, gap:0})],
  ['pdf-texte',     'etroit', cfg({mot:'Été (test) \\ 日本 \u{1F600} ok', h:205.5, np:480, tech:3})],
  ['pdf-vide',      'point',  cfg({mot:'', minf:50})],
  ['pdf-pages',     'bruit',  cfg({tech:3, np:1400, minf:1, gap:0})],
  ['zero-plis',     'mot',    cfg({minf:500})],
  ['negatif',       'mot',    cfg({h:40, mt:0, mb:90, minf:-5, tech:3})],
];

const outDir = path.join(__dirname, '..', 'fixtures');
fs.mkdirSync(outDir, {recursive:true});
for (const f of fs.readdirSync(outDir)) fs.unlinkSync(path.join(outDir, f));

function glyphRows(g){
  const rows = [];
  for (let y=g.y0;y<=g.y1;y++){
    let s = '';
    for (let x=g.x0;x<=g.x1;x++) s += g.d[(y*g.W+x)*4+3] > 128 ? '1' : '0';
    rows.push(s);
  }
  return rows;
}

const glyphes = {};
for (const [k, g] of Object.entries(GLYPHS)) glyphes[k] = {x0:g.x0, x1:g.x1, y0:g.y0, y1:g.y1, rows: glyphRows(g)};
fs.writeFileSync(path.join(outDir, 'glyphes.json'), JSON.stringify(glyphes));

for (const [name, gname, c] of CASES){
  const g = GLYPHS[gname];
  const {sheets, folds} = L.build(c, g);
  const pdf = L.makePdf(c, folds);
  const fx = {
    name, cfg: c,
    glyph: gname,
    expected: { sheets, folds, stats: L.stats(folds), csv: L.makeCsv(folds),
                pdf_base64: Buffer.from(pdf).toString('base64') }
  };
  fs.writeFileSync(path.join(outDir, name + '.json'), JSON.stringify(fx));
  console.log(name.padEnd(14), 'feuilles', String(sheets).padStart(4), 'plis', String(folds.length).padStart(4), 'pdf', pdf.length, 'octets');
}

// Nombres : arrondi toFixed(1) et conversion nombre -> texte, a reproduire exactement en R.
const rnd = mulberry32(7);
const fixed = [];
for (let k=0;k<20000;k++){
  const mt = Math.floor(rnd()*90), usable = 10 + Math.floor(rnd()*380), run = Math.floor(rnd()*201);
  const x = mt + run/200*usable;
  fixed.push([x, +x.toFixed(1), x.toFixed(1)]);
}
// Les grandeurs qui finissent dans le PDF : ordonnees des lignes, marges, hauteurs, pages.
const strs = [];
const H = 841.89, mt = 54, y0 = H-mt-52;
for (let i=0;i<120;i++) strs.push([y0 - i*11.6, String(y0 - i*11.6)]);
[H-mt, H-mt-16, H-mt-28, y0+13, 48, 300, 480, 205.5, 0.1, 123456789012].forEach(v => strs.push([v, String(v)]));
for (let k=0;k<5000;k++){
  const v = Math.floor(rnd()*2000) + [0, 0.5, 0.25, 0.75, 0.1, 0.2, 0.3, 0.7, 0.9][Math.floor(rnd()*9)];
  strs.push([v, String(v)]);
}
for (let k=0;k<5000;k++){ const v = Math.floor(rnd()*4000)/10; strs.push([v, String(v)]); }
fs.writeFileSync(path.join(outDir, 'nombres.json'), JSON.stringify({fixed, strs}));
console.log('nombres.json ecrit');
