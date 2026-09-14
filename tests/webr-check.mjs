// Rejoue le golden master dans webR lui-meme (R compile en WebAssembly, sous node),
// pour verifier que le moteur reel donne les memes resultats que R natif.
// Usage : cd tests && npm install webr@0.6.0 && node webr-check.mjs
import { WebR } from 'webr';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const fxDir = path.join(here, 'fixtures');

const webR = new WebR({ channelType: 3 });
await webR.init();
await webR.evalRVoid(fs.readFileSync(path.join(root, 'plieur.R'), 'utf8'));

const glyphes = JSON.parse(fs.readFileSync(path.join(fxDir, 'glyphes.json'), 'utf8'));
function asGlyph(g){
  const px = new Uint8Array(g.rows.join('').split('').map(Number));
  return { px, x0: g.x0, x1: g.x1, y0: g.y0, y1: g.y1 };
}

let failures = 0;
const files = fs.readdirSync(fxDir).filter(f => f.endsWith('.json') && !['glyphes.json','nombres.json'].includes(f));
for (const f of files){
  const fx = JSON.parse(fs.readFileSync(path.join(fxDir, f), 'utf8'));
  const shelter = await new webR.Shelter();
  try {
    const cfg = await new shelter.RList(fx.cfg);
    const glyph = await new shelter.RList(asGlyph(glyphes[fx.glyph]));
    const res = await shelter.evalR(`
      res <- build(cfg, glyph = glyph)
      list(sheets = res$sheets, folds = res$folds, stats = res$stats,
           csv = charToRaw(make_csv(res$folds)), pdf = make_pdf(cfg, folds = res$folds))
    `, { env: { cfg, glyph } });
    const out = await res.toJs();
    const get = k => out.values[out.names.indexOf(k)];
    const folds = await (await res.get('folds')).toD3();
    const pdf = await (await res.get('pdf')).toTypedArray();
    const csv = Buffer.from(await (await res.get('csv')).toTypedArray()).toString('utf8');
    const stats = get('stats');
    const st = k => stats.values[stats.names.indexOf(k)].values[0];
    const exp = fx.expected;
    const problems = [];
    if (get('sheets').values[0] !== exp.sheets) problems.push('sheets');
    if (JSON.stringify(folds) !== JSON.stringify(exp.folds)) problems.push('folds');
    if (st('sheets') !== exp.stats.sheets || st('marks') !== exp.stats.marks || st('hours') !== exp.stats.hours) problems.push('stats');
    if (csv !== exp.csv) problems.push('csv');
    if (Buffer.from(pdf).toString('base64') !== exp.pdf_base64) problems.push('pdf');
    if (problems.length){ failures++; console.log('KO', fx.name, problems.join(', ')); }
    else console.log('ok', fx.name);
  } finally { await shelter.purge(); }
}
webR.close();
console.log(failures ? `${failures} cas en echec` : 'tous les cas passent dans webR');
process.exit(failures ? 1 : 0);
