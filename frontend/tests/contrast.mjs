function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const num = parseInt(hex, 16);
  return [num >> 16, (num >> 8) & 255, num & 255];
}

function getLuminance([r, g, b]) {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrast(hex1, hex2) {
  const l1 = getLuminance(hexToRgb(hex1));
  const l2 = getLuminance(hexToRgb(hex2));
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return ratio.toFixed(2);
}

const pairs = [
  ['Focus ring #0f766e on White #ffffff', '#0f766e', '#ffffff'],
  ['Focus ring #0f766e on Dark #0f172a', '#0f766e', '#0f172a'],
  ['Rose-950 #4c0519 on Rose-50 #fff1f2', '#4c0519', '#fff1f2'],
  ['Amber-950 #451a03 on Amber-50 #fffbeb', '#451a03', '#fffbeb'],
  ['Amber-800 #92400e on Amber-50 #fffbeb', '#92400e', '#fffbeb'],
  ['Rose-600 #e11d48 on Slate-50 #f8fafc', '#e11d48', '#f8fafc'],
  ['Rose-700 #be123c on Slate-50 #f8fafc', '#be123c', '#f8fafc'],
  ['Emerald-800 #065f46 on Emerald-50 #ecfdf5', '#065f46', '#ecfdf5'],
  ['Amber-900 #78350f on Amber-50 #fffbeb', '#78350f', '#fffbeb'],
  ['Orange-900 #7c2d12 on Orange-50 #fff7ed', '#7c2d12', '#fff7ed'],
  ['Rose-900 #881337 on Rose-50 #fff1f2', '#881337', '#fff1f2'],
  ['Purple-900 #581c87 on Purple-50 #faf5ff', '#581c87', '#faf5ff'],
  ['Slate-700 #334155 on Slate-100 #f1f5f9', '#334155', '#f1f5f9'],
  ['Teal-800 #115e59 on Teal-50 #f0fdfa', '#115e59', '#f0fdfa'],
  ['Slate-500 #64748b on White #ffffff', '#64748b', '#ffffff'],
  ['Slate-600 #475569 on White #ffffff', '#475569', '#ffffff'],
  ['Vayu-700 #0f766e on White #ffffff', '#0f766e', '#ffffff'],
  ['Vayu-800 #115e59 on White #ffffff', '#115e59', '#ffffff'],
];

pairs.forEach(([desc, c1, c2]) => {
  const cr = parseFloat(getContrast(c1, c2));
  const pass = cr >= 4.5 ? 'PASS (WCAG AA Normal & Large)' : cr >= 3.0 ? 'PASS (WCAG AA Large & UI Components)' : 'FAIL';
  console.log(`${desc}: ${cr}:1 -> ${pass}`);
});
