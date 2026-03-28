import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Parse design tokens from index.css ───────────────────────────────────

const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), '../src/renderer/src/index.css');
const css = readFileSync(cssPath, 'utf8');

function extractBlock(src, selectorRe) {
  const idx = src.search(selectorRe);
  if (idx === -1) return '';
  const start = src.indexOf('{', idx);
  let depth = 0, end = start;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { if (--depth === 0) { end = i; break; } }
  }
  return src.slice(start + 1, end);
}

function parseVars(block) {
  const vars = {};
  const re = /--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g;
  let m;
  while ((m = re.exec(block)) !== null) vars[`--${m[1]}`] = m[2];
  return vars;
}

// :root base (dark), then light overrides merged on top
const baseVars  = parseVars(extractBlock(css, /:root(?![\w.])\s*\{/));
const lightOver = parseVars(extractBlock(css, /:root\.light\s*\{/));
const dark  = baseVars;
const light = { ...baseVars, ...lightOver };

// ── WCAG helpers ──────────────────────────────────────────────────────────

function lin(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function lum(r, g, b) {
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function cr(L1, L2) {
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}
function hexLum(h) {
  if (h.length === 4) h = '#' + h[1]+h[1] + h[2]+h[2] + h[3]+h[3];
  return lum(parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16));
}

// ── Report ────────────────────────────────────────────────────────────────

function checkPairs(vars, pairs, need, title) {
  console.log(`\n── ${title} (needs ${need}:1) ──`);
  for (const [fgKey, bgKey] of pairs) {
    const fgH = vars[fgKey] ?? fgKey;   // allow literal hex as fallback
    const bgH = vars[bgKey] ?? bgKey;
    if (!fgH || !bgH) { console.log(`  ${fgKey} vs ${bgKey}: MISSING`); continue; }
    const ratio = cr(hexLum(fgH), hexLum(bgH));
    const delta = (ratio - need).toFixed(2);
    const tag   = ratio >= need ? `✅ +${delta} over` : `❌ ${delta} under`;
    console.log(`  ${fgKey} (${fgH}) vs ${bgKey} (${bgH}): ${ratio.toFixed(2)}:1  ${tag}`);
  }
}

const TEXT_PAIRS = [
  ['--tf-text',       '--tf-bg-app'],
  ['--tf-text',       '--tf-bg-panel'],
  ['--tf-text-muted', '--tf-bg-app'],
  ['--tf-text-muted', '--tf-bg-panel'],
  ['--tf-text-faint', '--tf-bg-app'],
  ['--tf-text-faint', '--tf-bg-panel'],
  ['--tf-accent',     '--tf-bg-app'],
  ['--tf-accent',     '--tf-bg-panel'],
];
const BORDER_PAIRS = [
  ['--tf-border', '--tf-bg-app'],
  ['--tf-border', '--tf-bg-panel'],
];

console.log(`\nParsed tokens from: src/renderer/src/index.css\n`);

console.log('═══════════ DARK THEME ═══════════');
checkPairs(dark,  TEXT_PAIRS,   4.5, 'Text contrast  WCAG 1.4.3');
checkPairs(dark,  BORDER_PAIRS, 3,   'UI boundaries  WCAG 1.4.11');
checkPairs(dark,  [['#ffffff', '--tf-accent']], 4.5, 'White text on accent button');

console.log('\n═══════════ LIGHT THEME ════════════');
checkPairs(light, TEXT_PAIRS,   4.5, 'Text contrast  WCAG 1.4.3');
checkPairs(light, BORDER_PAIRS, 3,   'UI boundaries  WCAG 1.4.11');
checkPairs(light, [['#ffffff', '--tf-accent']], 4.5, 'White text on accent button');
