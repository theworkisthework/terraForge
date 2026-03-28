function lin(c){c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
function lum(r,g,b){return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);}
function cr(L1,L2){const hi=Math.max(L1,L2),lo=Math.min(L1,L2);return(hi+0.05)/(lo+0.05);}
function hex(h){const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);return lum(r,g,b);}
function pass(ratio, needed=3){return ratio>=needed ? '✅' : `❌ (needs ${needed}:1)`;}

const appDark   = hex('#1a1a2e');
const panelDark = hex('#16213e');
const appLight  = hex('#f0f2f9');
const panelLight= hex('#ffffff');

// WCAG 1.4.11 requires 3:1 for UI component boundaries
const NEED = 3;

const borders = [
  { label: 'BEFORE dark', color: '#0f3460', bg: panelDark, bgName: 'bg-panel-dark' },
  { label: 'BEFORE dark', color: '#0f3460', bg: appDark,   bgName: 'bg-app-dark'   },
  { label: 'BEFORE light', color: '#c5cce8', bg: panelLight, bgName: 'bg-panel-light' },
  { label: 'BEFORE light', color: '#c5cce8', bg: appLight,   bgName: 'bg-app-light'   },
  { label: 'NOW    dark', color: '#5c7a9e', bg: panelDark, bgName: 'bg-panel-dark' },
  { label: 'NOW    dark', color: '#5c7a9e', bg: appDark,   bgName: 'bg-app-dark'   },
  { label: 'NOW    light', color: '#7584a8', bg: panelLight, bgName: 'bg-panel-light' },
  { label: 'NOW    light', color: '#7584a8', bg: appLight,   bgName: 'bg-app-light'   },
];

console.log('== Border contrast (WCAG 1.4.11 needs 3:1) ==');
for (const b of borders) {
  const ratio = cr(hex(b.color), b.bg);
  const delta = (ratio - NEED).toFixed(2);
  const sign  = ratio >= NEED ? `+${delta} over` : `${delta} under`;
  console.log(`${b.label}  ${b.color} vs ${b.bgName}: ${ratio.toFixed(2)}:1  ${pass(ratio)}  [${sign}]`);
}

console.log('');
console.log('Midpoint candidates (dark — between #0f3460 and #5c7a9e):');
for (const h of ['#2a4a72', '#364e6e', '#3d567a', '#455e82', '#4d668a']) {
  const r1 = cr(hex(h), panelDark);
  const r2 = cr(hex(h), appDark);
  console.log(`  ${h}  panel=${r1.toFixed(2)} app=${r2.toFixed(2)}  ${pass(Math.min(r1,r2))}`);
}
console.log('');
console.log('Midpoint candidates (light — between #c5cce8 and #7584a8):');
for (const h of ['#8b98bc', '#9aa6c8', '#aab4d4', '#b5bedd', '#bec8e4']) {
  const r1 = cr(hex(h), panelLight);
  const r2 = cr(hex(h), appLight);
  console.log(`  ${h}  panel=${r1.toFixed(2)} app=${r2.toFixed(2)}  ${pass(Math.min(r1,r2))}`);
}
