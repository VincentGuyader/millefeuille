// Compare la page d'origine (JS) et la nouvelle page (webR) dans un vrai navigateur.
// Attend deux serveurs locaux : l'ancienne page sur 8801, la nouvelle sur 8802 (voir CLAUDE.md).
// Variables : CHROME_PATH (chemin du navigateur), DL (dossier de sortie des exports).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

function findChrome(){
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']){
    try { return execSync('command -v ' + name, { encoding: 'utf8' }).trim(); } catch {}
  }
  throw new Error('Aucun navigateur trouve : definir CHROME_PATH');
}
const DL = process.env.DL || fs.mkdtempSync(path.join(os.tmpdir(), 'plieur-e2e-'));

const CASES = [
  { name: 'defaut', set: {} },
  { name: 'anglaise-decoupe', set: { mot: 'Merci', police: "'Snell Roundhand','Brush Script MT',cursive", tech: '3' } },
  { name: 'home-impact', set: { mot: 'HOME', police: 'Impact,Haettenschweiler,sans-serif', np: '620', tech: '3' } },
  { name: 'papa-ondule', set: { mot: 'Papa', ondul: 'mot', amp: '14', tech: '3' } },
  { name: 'oui-vagues', set: { mot: 'Oui', ondul: 'bloc', tech: '3', np: '520' } },
  { name: 'avance', set: { mot: 'Été 2026', gras: '900', proj: 'linear', ang: '120', pas: '2', garde: '30', h: '190', mt: '15', mb: '25', minf: '3', gap: '2', tech: '3', ondul: 'deux', mir: '1', cyc: '2' } },
  { name: 'vide', set: { mot: '' } },
];

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true,
  args: ['--no-sandbox', '--disable-gpu'] });

async function readOut(page){
  return page.evaluate(() => ({
    stats: [...document.querySelectorAll('.stats b')].map(b => b.textContent),
    rows: [...document.querySelectorAll('#tb tr')].map(tr => [...tr.children].map(td => td.textContent).join('|')),
  }));
}
async function setCase(page, set){
  await page.evaluate(set => {
    for (const [id, v] of Object.entries(set)){
      const el = document.getElementById(id); el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, set);
}
async function runSite(url, waitReady){
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('  erreur page', url, e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('  console', url, m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  if (waitReady) await page.waitForFunction(() => document.getElementById('status').textContent === '' && document.querySelectorAll('#tb tr').length > 0, { timeout: 180000 });
  else await page.waitForFunction(() => document.querySelectorAll('#tb tr').length > 0, { timeout: 30000 });
  const out = {};
  for (const c of CASES){
    await page.evaluate(() => { document.getElementById('tb').innerHTML = ''; });
    // remet les reglages par defaut avant chaque cas
    await page.evaluate(() => {
      const d = { mot:'Merci', police:"Georgia,'Times New Roman',serif", gras:'700', np:'480', h:'205', tech:'1', mt:'20', mb:'20', garde:'18', pas:'1', proj:'fan', ang:'180', ondul:'none', amp:'10', ampb:'8', thick:'6', mir:'0', cyc:'1', minf:'5', gap:'4' };
      for (const [id, v] of Object.entries(d)) document.getElementById(id).value = v;
    });
    const before = await page.$eval('#tb', tb => tb.dataset.calcul || '0');
    await setCase(page, c.set);
    if (Object.keys(c.set).length === 0) await setCase(page, { mot: 'Merci' });
    if (waitReady) await page.waitForFunction(b => document.getElementById('tb').dataset.calcul !== b, { timeout: 60000 }, before);
    else await new Promise(r => setTimeout(r, 900));
    out[c.name] = await readOut(page);
  }
  return { page, out };
}

const legacy = await runSite('http://localhost:8801/index.html', false);
const fresh = await runSite('http://localhost:8802/index.html', true);
let ko = 0;
for (const c of CASES){
  const a = JSON.stringify(legacy.out[c.name]), b = JSON.stringify(fresh.out[c.name]);
  const rows = legacy.out[c.name].rows.length;
  if (a === b) console.log('ok ', c.name.padEnd(18), rows, 'lignes, totaux', legacy.out[c.name].stats.join('/'));
  else { ko++; console.log('KO ', c.name, '\n  JS  :', a.slice(0, 300), '\n  webR:', b.slice(0, 300)); }
}

// export du PDF et du CSV depuis la nouvelle page : on capture le Blob passe a
// URL.createObjectURL, le dossier de telechargement de chromium (snap) n'etant pas accessible.
const before = await fresh.page.$eval('#tb', tb => tb.dataset.calcul);
await setCase(fresh.page, { mot: 'Merci', tech: '3' });
await fresh.page.waitForFunction(b => document.getElementById('tb').dataset.calcul !== b, {}, before);
await fresh.page.evaluate(() => {
  window.__blobs = [];
  const orig = URL.createObjectURL;
  URL.createObjectURL = b => { window.__blobs.push(b); return orig.call(URL, b); };
});
for (const [id, ext] of [['dlPdf', 'pdf'], ['dlCsv', 'csv']]){
  await fresh.page.click('#dl');
  await fresh.page.click('#' + id);
  await fresh.page.waitForFunction(n => window.__blobs.length >= n, { timeout: 30000 }, ext === 'pdf' ? 1 : 2);
  const bytes = await fresh.page.evaluate(async () => Array.from(new Uint8Array(await window.__blobs.at(-1).arrayBuffer())));
  fs.writeFileSync(path.join(DL, 'patron.' + ext), Buffer.from(bytes));
  console.log('export', ext, bytes.length, 'octets, statut :', JSON.stringify(await fresh.page.$eval('#status', e => e.textContent)));
}
console.log('exports ecrits dans', DL);
await browser.close();
process.exit(ko ? 1 : 0);
