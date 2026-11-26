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
  ['Focus ring #0f766e on White #ffffff', '#0f766e', '#ffffff', 3.0],
  ['Focus ring #0f766e on Dark #0f172a', '#0f766e', '#0f172a', 3.0],
  ['Rose-950 #4c0519 on Rose-50 #fff1f2', '#4c0519', '#fff1f2', 4.5],
  ['Amber-950 #451a03 on Amber-50 #fffbeb', '#451a03', '#fffbeb', 4.5],
  ['Amber-800 #92400e on Amber-50 #fffbeb', '#92400e', '#fffbeb', 4.5],
  ['Rose-600 #e11d48 on White #ffffff', '#e11d48', '#ffffff', 4.5],
  ['Rose-700 #be123c on Slate-50 #f8fafc', '#be123c', '#f8fafc', 4.5],
  ['Emerald-800 #065f46 on Emerald-50 #ecfdf5', '#065f46', '#ecfdf5', 4.5],
  ['Amber-900 #78350f on Amber-50 #fffbeb', '#78350f', '#fffbeb', 4.5],
  ['Orange-900 #7c2d12 on Orange-50 #fff7ed', '#7c2d12', '#fff7ed', 4.5],
  ['Rose-900 #881337 on Rose-50 #fff1f2', '#881337', '#fff1f2', 4.5],
  ['Purple-900 #581c87 on Purple-50 #faf5ff', '#581c87', '#faf5ff', 4.5],
  ['Slate-700 #334155 on Slate-100 #f1f5f9', '#334155', '#f1f5f9', 4.5],
  ['Teal-800 #115e59 on Teal-50 #f0fdfa', '#115e59', '#f0fdfa', 4.5],
  ['Slate-500 #64748b on White #ffffff', '#64748b', '#ffffff', 4.5],
  ['Slate-500 #64748b on Slate-50 #f8fafc', '#64748b', '#f8fafc', 4.5],
  ['Slate-500 #64748b on Slate-50/60 over White #fbfcfd', '#64748b', '#fbfcfd', 4.5],
  ['Slate-600 #475569 on White #ffffff', '#475569', '#ffffff', 4.5],
  ['Slate-600 #475569 on Slate-100 #f1f5f9', '#475569', '#f1f5f9', 4.5],
  ['Slate-600 #475569 on Vayu-50 #f0fdfa', '#475569', '#f0fdfa', 4.5],
  ['Slate-600 #475569 on Vayu-100 #ccfbf1', '#475569', '#ccfbf1', 4.5],
  ['Slate-600 #475569 on Rose-500/8 over White #fef0f2', '#475569', '#fef0f2', 4.5],
  ['Vayu-700 #0f766e on White #ffffff', '#0f766e', '#ffffff', 4.5],
  ['Vayu-800 #115e59 on White #ffffff', '#115e59', '#ffffff', 4.5],
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
  // Phase 3.4 Batch B remaining muted text, hover & UI-control pairs (plus dark-tooltip exception)
  ['PollutantBreakdown subtitle & sensors (Slate-500 on White)', '#64748b', '#ffffff', 4.5],
  ['PollutantBreakdown IAQI sublabel (Slate-500 on Slate-50/60)', '#64748b', blendHex('#f8fafc', '#ffffff', 0.6), 4.5],
  ['AQITrendChart forecast source note (Slate-500 on White)', '#64748b', '#ffffff', 4.5],
  ['AQITrendChart dark tooltip labels (Slate-400 on Slate-900)', '#94a3b8', '#0f172a', 4.5],
  ['RecommendedActions RAC-120 inactive tab desc resting (Slate-600 on Slate-50)', '#475569', '#f8fafc', 4.5],
  ['RecommendedActions RAC-120 inactive tab desc hover (Slate-600 on Slate-100)', '#475569', '#f1f5f9', 4.5],
  ['RecommendedActions RAC-120 active tab desc (Slate-300 on Slate-900)', '#cbd5e1', '#0f172a', 4.5],
  ['RecommendedActions RAC-167 timing collapsed (Slate-500 on Slate-50/50)', '#64748b', blendHex('#f8fafc', '#ffffff', 0.5), 4.5],
  ['RecommendedActions RAC-181 chevron collapsed (Slate-500 on Slate-50/50)', '#64748b', blendHex('#f8fafc', '#ffffff', 0.5), 3.0],
  ['RecommendedActions RAC-181 chevron expanded (Slate-500 on White)', '#64748b', '#ffffff', 3.0],
  ['SustainableSwaps habit & feasibility (Slate-500 on Slate-50/70)', '#64748b', blendHex('#f8fafc', '#ffffff', 0.7), 4.5],
  ['CausalChain & ImpactBadges labels on completed card (Slate-500 on Slate-50)', '#64748b', '#f8fafc', 4.5],
  ['DailyTimeline section headings (Slate-500 on Slate-50/50)', '#64748b', blendHex('#f8fafc', '#ffffff', 0.5), 4.5],
  ['DailyTimeline empty notice (Slate-500 on White/60 over Slate-50/50)', '#64748b', blendHex('#ffffff', blendHex('#f8fafc', '#ffffff', 0.5), 0.6), 4.5],
  ['WhatChangedInspector metric labels (Slate-500 on White)', '#64748b', '#ffffff', 4.5],
  ['WhatChangedInspector empty rules (Slate-500 on Vayu-50/30 over Slate-50)', '#64748b', blendHex('#f0fdfa', '#f8fafc', 0.3), 4.5],
  ['NaturalLanguageProfile disclaimer (Slate-500 on Vayu-50/70 over Slate-50)', '#64748b', blendHex('#f0fdfa', '#f8fafc', 0.7), 4.5],
  ['Profile cards, parsed fields & schedule helpers (Slate-500 on Slate-50)', '#64748b', '#f8fafc', 4.5],
  ['PresetSelector click-to-load label (Slate-500 on White)', '#64748b', '#ffffff', 4.5],
  // Phase 3.5 Batch C semantic pills, buttons, status labels, tinted badges & chart reference label
  ['AQIHeroCard Good pill (White on Emerald-700)', '#ffffff', '#047857', 4.5],
  ['AQIHeroCard Moderate pill (White on Amber-700)', '#ffffff', '#b45309', 4.5],
  ['AQIHeroCard USG pill (White on Orange-700)', '#ffffff', '#c2410c', 4.5],
  ['AQIHeroCard Unhealthy pill (White on Rose-600)', '#ffffff', '#e11d48', 4.5],
  ['AQIHeroCard Very Unhealthy pill (White on Purple-800)', '#ffffff', '#6b21a8', 4.5],
  ['CausalChain step 3 badge (White on Amber-700)', '#ffffff', '#b45309', 4.5],
  ['CausalChain step 4 badge (White on Emerald-700)', '#ffffff', '#047857', 4.5],
  ['CausalChain step 5 badge (White on Teal-700)', '#ffffff', '#0f766e', 4.5],
  ['AQITrendChart switch button resting (White on Vayu-700)', '#ffffff', '#0f766e', 4.5],
  ['AQITrendChart switch button hover (White on Vayu-800)', '#ffffff', '#115e59', 4.5],
  ['NaturalLanguageProfile confirm resting (White on Emerald-700)', '#ffffff', '#047857', 4.5],
  ['NaturalLanguageProfile confirm hover (White on Emerald-800)', '#ffffff', '#065f46', 4.5],
  ['ProfileSetupPage recalculating status (Vayu-700 on White)', '#0f766e', '#ffffff', 4.5],
  ['WhatChangedInspector favorable delta (Emerald-700 on White)', '#047857', '#ffffff', 4.5],
  ['WhatChangedInspector adverse delta (Rose-600 on White)', '#e11d48', '#ffffff', 4.5],
  ['HouseholdMembersCard High Risk badge (Rose-700 on Rose-50)', '#be123c', '#fff1f2', 4.5],
  ['NaturalLanguageProfile Asthma Yes label (Rose-700 on Slate-50)', '#be123c', '#f8fafc', 4.5],
  ['AQITrendChart ReferenceLine label on White (Red-700 #b91c1c on White)', '#b91c1c', '#ffffff', 4.5],
  ['AQITrendChart ReferenceLine label over max area fill (Red-700 #b91c1c on Teal 0.25/White)', '#b91c1c', blendHex('#0f766e', '#ffffff', 0.25), 4.5],
  ['AQITrendChart ReferenceLine dashed stroke UI (#ef4444 on White)', '#ef4444', '#ffffff', 3.0],
  ['RecommendedActions RAC-171 beneficiary pill (Slate-600 on Slate-100)', '#475569', '#f1f5f9', 4.5],
  ['PersonalizedAlertsBanner warning Target label (Slate-600 on Rose-50/80 over Canvas)', '#475569', blendHex('#fff1f2', '#f8fafc', 0.8), 4.5],
  ['PersonalizedAlertsBanner advisory Target label (Slate-600 on Amber-50/80 over Canvas)', '#475569', blendHex('#fffbeb', '#f8fafc', 0.8), 4.5],
  ['WhatChangedInspector WCI-188 deactivated rules (Slate-600 on Slate-100/70 over Gradient)', '#475569', blendHex('#f1f5f9', blendHex('#f0fdfa', '#f8fafc', 0.3), 0.7), 4.5],
  ['IndoorConditionsCard option desc resting (Slate-600 on Slate-50)', '#475569', '#f8fafc', 4.5],
  ['IndoorConditionsCard option desc hover (Slate-600 on Slate-100)', '#475569', '#f1f5f9', 4.5],
  ['IndoorConditionsCard option desc selected (Slate-300 on Slate-900)', '#cbd5e1', '#0f172a', 4.5],
  ['Button & radio focus ring on Slate-50 (#0f766e on #f8fafc)', '#0f766e', '#f8fafc', 3.0],
  // Batch D — Header Updating status regression guard
  ['Header Updating status (Vayu-700 on White/95 over Canvas)', '#0f766e', blendHex('#ffffff', '#f8fafc', 0.95), 4.5],
  // Phase 3.6.3 — App.tsx aqiError banner foreground regression guard
  ['App error banner aqiError message (Rose-700 #be123c on Rose-50 #fff1f2)', '#be123c', '#fff1f2', 4.5],
];

/** Evaluate a contrast pair requiring an explicit WCAG AA threshold (no silent fallback default). */
export function evaluateContrastPair(entry) {
  if (!Array.isArray(entry) || entry.length < 4) {
    throw new Error(`Missing explicit WCAG contrast threshold for entry: ${JSON.stringify(entry)}`);
  }
  const [desc, c1, c2, minRatio] = entry;
  if (typeof minRatio !== 'number' || !Number.isFinite(minRatio) || minRatio <= 0) {
    throw new Error(`Invalid explicit WCAG contrast threshold (${String(minRatio)}) for "${desc}"`);
  }
  const cr = parseFloat(getContrast(c1, c2));
  const ok = cr >= minRatio;
  return { desc, cr, minRatio, ok };
}

/** Run contrast checks across pairs; returns true iff all entries pass with explicit thresholds. */
export function runContrastSuite(entries = pairs, log = console.log) {
  let failed = false;
  for (const entry of entries) {
    const { desc, cr, minRatio, ok } = evaluateContrastPair(entry);
    const pass = cr >= 4.5 ? 'PASS (WCAG AA Normal & Large)' : cr >= 3.0 ? 'PASS (WCAG AA Large & UI Components)' : 'FAIL';
    if (!ok) failed = true;
    if (log) {
      log(`${desc}: ${cr}:1 -> ${ok ? pass : `FAIL (< ${minRatio}:1)`}`);
    }
  }
  return !failed;
}

export { pairs, getContrast, blendHex };

const isDirectCli =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === 'string' &&
  process.argv[1].replace(/\\/g, '/').endsWith('/tests/contrast.mjs');

if (isDirectCli) {
  if (!runContrastSuite(pairs)) {
    process.exit(1);
  }
}
