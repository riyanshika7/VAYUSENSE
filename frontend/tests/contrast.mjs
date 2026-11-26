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

function blendHex(fgHex, bgHex, alpha) {
  const [r1, g1, b1] = hexToRgb(fgHex);
  const [r2, g2, b2] = hexToRgb(bgHex);
  return (
    '#' +
    [
      Math.round(r1 * alpha + r2 * (1 - alpha)),
      Math.round(g1 * alpha + g2 * (1 - alpha)),
      Math.round(b1 * alpha + b2 * (1 - alpha)),
    ]
      .map(v => v.toString(16).padStart(2, '0'))
      .join('')
  );
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
  ['Slate-500 #64748b on Slate-50 #f8fafc', '#64748b', '#f8fafc'],
  ['Slate-500 #64748b on Slate-50/60 over White #fbfcfd', '#64748b', '#fbfcfd'],
  ['Slate-600 #475569 on White #ffffff', '#475569', '#ffffff'],
  ['Slate-600 #475569 on Slate-100 #f1f5f9', '#475569', '#f1f5f9'],
  ['Slate-600 #475569 on Vayu-50 #f0fdfa', '#475569', '#f0fdfa'],
  ['Slate-600 #475569 on Vayu-100 #ccfbf1', '#475569', '#ccfbf1'],
  ['Slate-600 #475569 on Rose-500/8 over White #fef0f2', '#475569', '#fef0f2'],
  ['Vayu-700 #0f766e on White #ffffff', '#0f766e', '#ffffff'],
  ['Vayu-800 #115e59 on White #ffffff', '#115e59', '#ffffff'],
  // Phase 3.3 Batch A composited, hover, placeholder & UI-control pairs
  ['PollutantBreakdown unmeasured name (Slate-600 on Slate-50/40)', '#475569', blendHex('#f8fafc', '#ffffff', 0.4), 4.5],
  ['PollutantBreakdown unmeasured label/desc (Slate-500 on Slate-50/40)', '#64748b', blendHex('#f8fafc', '#ffffff', 0.4), 4.5],
  ['CompletionTracker unchecked circle (Slate-500 on White)', '#64748b', '#ffffff', 3.0],
  ['CompletionTracker labels (Slate-500 on Slate-50)', '#64748b', '#f8fafc', 4.5],
  ['CompletionTracker done metadata (Slate-500 on Emerald-50/60)', '#64748b', blendHex('#ecfdf5', '#ffffff', 0.6), 4.5],
  ['ExplainableCard unchecked border (Slate-500 on White)', '#64748b', '#ffffff', 3.0],
  ['ExplainableCard completed timing pill (Slate-600 on Slate-100)', '#475569', '#f1f5f9', 4.5],
  ['ExplainableCard completed mechanism (Slate-600 on Slate-50)', '#475569', '#f8fafc', 4.5],
  ['ExplainableCard completed footer (Slate-500 on Slate-50)', '#64748b', '#f8fafc', 4.5],
  ['App demo banner resting (Slate-950 on Amber-500)', '#020617', '#f59e0b', 4.5],
  ['App demo banner hover (Slate-800 on Amber-500)', '#1e293b', '#f59e0b', 4.5],
  ['App medical disclaimer footer (Slate-600 on Surface-Canvas)', '#475569', '#f8fafc', 4.5],
  ['Sidebar mobile close icon (Slate-500 on White)', '#64748b', '#ffffff', 3.0],
  ['Sidebar mobile close hover (Slate-700 on Slate-100)', '#334155', '#f1f5f9', 3.0],
  ['Sidebar inactive nav description hover (Slate-500 on Slate-50)', '#64748b', '#f8fafc', 4.5],
  ['Profile input placeholders (Slate-500 on White)', '#64748b', '#ffffff', 4.5],
];

let failed = false;
pairs.forEach(([desc, c1, c2, minRatio = 3.0]) => {
  const cr = parseFloat(getContrast(c1, c2));
  const ok = cr >= minRatio;
  const pass = cr >= 4.5 ? 'PASS (WCAG AA Normal & Large)' : cr >= 3.0 ? 'PASS (WCAG AA Large & UI Components)' : 'FAIL';
  if (!ok) failed = true;
  console.log(`${desc}: ${cr}:1 -> ${ok ? pass : `FAIL (< ${minRatio}:1)`}`);
});
if (failed) process.exit(1);
