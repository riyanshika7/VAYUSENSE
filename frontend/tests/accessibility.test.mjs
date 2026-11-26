import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  evaluateContrastPair,
  runContrastSuite,
  pairs as contrastPairs,
  blendHex as contrastBlendHex,
  getContrast as contrastRatioFromScript,
} from './contrast.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const ReactJSXRuntime = require('react/jsx-runtime');
const { renderToStaticMarkup } = require('react-dom/server');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.join(__dirname, '..', 'src');

const lucideStub = new Proxy(
  {},
  {
    get: (_, name) => (props) =>
      React.createElement('svg', { 'data-icon': String(name), ...props }),
  }
);

/** Transpile and execute a local TypeScript/TSX component in memory for SSR accessibility verification. */
function loadTsxComponent(relPath, customMocks = {}) {
  const fullPath = path.join(srcDir, relPath);
  const source = fs.readFileSync(fullPath, 'utf-8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  });
  const mod = { exports: {} };
  const resolvedMocks = {
    react: React,
    'react/jsx-runtime': ReactJSXRuntime,
    'lucide-react': lucideStub,
    ...customMocks,
  };
  const customRequire = (specifier) => {
    if (specifier in resolvedMocks) return resolvedMocks[specifier];
    return require(specifier);
  };
  const fn = new Function('exports', 'require', 'module', outputText);
  fn(mod.exports, customRequire, mod);
  return mod.exports;
}

function hexToRgb(hex) {
  let cleaned = hex.replace('#', '');
  if (cleaned.length === 3) {
    cleaned = cleaned.split('').map((c) => c + c).join('');
  }
  const num = parseInt(cleaned, 16);
  return [num >> 16, (num >> 8) & 255, num & 255];
}

function getContrastRatio(fgHex, bgHex) {
  const lum = (hex) => {
    const [r, g, b] = hexToRgb(hex).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const l1 = lum(fgHex);
  const l2 = lum(bgHex);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

test('WCAG 2.4.7 & 2.3.3: Global focus-visible and reduced motion styling exist in index.css', () => {
  const css = fs.readFileSync(path.join(srcDir, 'index.css'), 'utf-8');
  assert.ok(css.includes(':focus-visible'), 'Must define explicit :focus-visible rule');
  assert.ok(css.includes('prefers-reduced-motion: reduce'), 'Must define prefers-reduced-motion rule');
});

test('WCAG 2.4.1 & 4.1.3: Skip to content and live status region in App.tsx', () => {
  const appTsx = fs.readFileSync(path.join(srcDir, 'App.tsx'), 'utf-8');
  assert.ok(appTsx.includes('Skip to main content'), 'Skip link text must be present');
  assert.ok(appTsx.includes('id="main-content"'), 'Main element must have id="main-content"');
  assert.ok(appTsx.includes('role="status"'), 'Polite live status region must exist');
  assert.ok(appTsx.includes('aria-live="polite"'), 'Live region must be polite');
});

test('WCAG 4.1.2: Combobox and listbox keyboard accessibility in Header.tsx', () => {
  const header = fs.readFileSync(path.join(srcDir, 'components', 'layout', 'Header.tsx'), 'utf-8');
  assert.ok(header.includes('role="combobox"'), 'Search input must have role="combobox"');
  assert.ok(header.includes('aria-autocomplete="list"'), 'Search input must declare autocomplete="list"');
  assert.ok(header.includes('aria-activedescendant='), 'Combobox must set aria-activedescendant');
  assert.ok(header.includes('role="listbox"'), 'Results list must have role="listbox"');
  assert.ok(header.includes('role="option"'), 'Items must have role="option"');
  assert.ok(header.includes("e.key === 'ArrowDown'"), 'Combobox must support ArrowDown navigation');
  assert.ok(header.includes("e.key === 'ArrowUp'"), 'Combobox must support ArrowUp navigation');
  assert.ok(header.includes("e.key === 'Escape'"), 'Dropdown must close on Escape and restore focus');
});

test('WCAG Tabs Pattern: AQITrendChart roving tabindex and tabpanel', () => {
  const chart = fs.readFileSync(path.join(srcDir, 'components', 'dashboard', 'AQITrendChart.tsx'), 'utf-8');
  assert.ok(chart.includes('role="tablist"'), 'Tab container must have role="tablist"');
  assert.ok(chart.includes('role="tab"'), 'Tab buttons must have role="tab"');
  assert.ok(chart.includes('tabIndex={activeTab === \'forecast\' ? 0 : -1}'), 'Must implement roving tabindex for forecast tab');
  assert.ok(chart.includes('aria-controls="panel-forecast"'), 'Tab must declare aria-controls');
  assert.ok(chart.includes('role="tabpanel"'), 'Associated panel must have role="tabpanel"');
  assert.ok(chart.includes('<caption'), 'Data summary table must have <caption>');
  assert.ok(chart.includes('<th scope="col"'), 'Table headers must have scope="col"');
});

test('WCAG Tabs Pattern: RecommendedActionsCard roving tabindex and arrow navigation', () => {
  const actions = fs.readFileSync(path.join(srcDir, 'components', 'dashboard', 'RecommendedActionsCard.tsx'), 'utf-8');
  assert.ok(actions.includes('role="tablist"'), 'Tab container must have role="tablist"');
  assert.ok(actions.includes('tabIndex={isActive ? 0 : -1}'), 'Tabs must implement roving tabindex');
  assert.ok(actions.includes('aria-controls="actions-tabpanel"'), 'Tabs must link to panel with aria-controls');
  assert.ok(actions.includes('role="tabpanel"'), 'Content must declare role="tabpanel"');
  assert.ok(actions.includes("e.key === 'ArrowRight'"), 'Tabs must support ArrowRight navigation');
  assert.ok(actions.includes("e.key === 'ArrowLeft'"), 'Tabs must support ArrowLeft navigation');
});

test('WCAG Radiogroup Pattern: PresetSelector and IndoorConditionsCard roving tabindex & keys', () => {
  const preset = fs.readFileSync(path.join(srcDir, 'components', 'profile', 'PresetSelector.tsx'), 'utf-8');
  assert.ok(preset.includes('role="radiogroup"'), 'Must declare role="radiogroup"');
  assert.ok(preset.includes('role="radio"'), 'Options must declare role="radio"');
  assert.ok(preset.includes('tabIndex={isSelected ? 0 : -1}'), 'Radiogroup must implement roving tabindex');
  assert.ok(preset.includes("e.key === 'ArrowRight'"), 'Radiogroup must support arrow navigation');

  const indoor = fs.readFileSync(path.join(srcDir, 'components', 'profile', 'IndoorConditionsCard.tsx'), 'utf-8');
  assert.ok(indoor.includes('role="radiogroup"'), 'Ventilation options must declare role="radiogroup"');
  assert.ok(indoor.includes('tabIndex={isSelected ? 0 : -1}'), 'Ventilation radios must implement roving tabindex');
  assert.ok(indoor.includes("e.key === 'ArrowRight'"), 'Ventilation radios must support arrow navigation');
});

test('WCAG 4.1.2: Native meter and progressbar semantics', () => {
  const risk = fs.readFileSync(path.join(srcDir, 'components', 'dashboard', 'ExposureRiskScoreCard.tsx'), 'utf-8');
  assert.ok(risk.includes('role="meter"'), 'Gauge bar must declare role="meter"');
  assert.ok(risk.includes('aria-valuenow='), 'Meter must have aria-valuenow');
  assert.ok(risk.includes('aria-valuemin={0}'), 'Meter must have aria-valuemin');
  assert.ok(risk.includes('aria-valuemax={100}'), 'Meter must have aria-valuemax');

  const tracker = fs.readFileSync(path.join(srcDir, 'components', 'explainability', 'CompletionTrackerCard.tsx'), 'utf-8');
  assert.ok(tracker.includes('role="progressbar"'), 'Adherence bar must declare role="progressbar"');
  assert.ok(tracker.includes('aria-valuenow={percentage}'), 'Progressbar must declare aria-valuenow');
});

test('WCAG Modal Dialog: Mobile sidebar modal semantics and focus trap', () => {
  const sidebar = fs.readFileSync(path.join(srcDir, 'components', 'layout', 'Sidebar.tsx'), 'utf-8');
  assert.ok(sidebar.includes("role={isOpen ? 'dialog' : undefined}"), 'Sidebar must declare role="dialog" on mobile');
  assert.ok(sidebar.includes("aria-modal={isOpen ? 'true' : undefined}"), 'Sidebar must declare aria-modal on mobile');
  assert.ok(sidebar.includes("e.key === 'Tab'"), 'Sidebar must trap Tab navigation when open on mobile');
  assert.ok(sidebar.includes("document.getElementById('mobile-menu-trigger')?.focus()"), 'Focus must return to hamburger trigger');
  assert.ok(sidebar.includes('(min-width: 1024px)'), 'Sidebar must match lg desktop breakpoint cleanly');
  assert.ok(sidebar.includes('.inert = true'), 'Sidebar must sync inert attribute when mobile drawer is hidden');
});

test('Phase 3 Sidebar SSR & Viewport Regression: Mobile closed hides controls, mobile open restores, desktop stays accessible', () => {
  const { Sidebar } = loadTsxComponent(path.join('components', 'layout', 'Sidebar.tsx'));
  const previousWindow = globalThis.window;

  try {
    // 1. Mobile viewport (< 1024px), drawer CLOSED
    globalThis.window = { matchMedia: () => ({ matches: false }) };
    const mobileClosedHtml = renderToStaticMarkup(
      React.createElement(Sidebar, {
        currentTab: 'overview',
        onTabChange: () => {},
        isOpen: false,
        onClose: () => {},
        isBackendConnected: true,
      })
    );
    assert.ok(mobileClosedHtml.includes('aria-hidden="true"'), 'Closed mobile sidebar must set aria-hidden="true"');
    assert.ok(mobileClosedHtml.includes('invisible'), 'Closed mobile sidebar must include invisible class');
    assert.ok(mobileClosedHtml.includes('lg:visible'), 'Sidebar must preserve lg:visible for desktop breakpoint');
    assert.ok(!mobileClosedHtml.includes('role="dialog"'), 'Closed sidebar must not expose dialog role');
    const closedButtons = mobileClosedHtml.match(/<button\b[^>]*>/g) || [];
    assert.equal(closedButtons.length, 6, 'Expected close button + 5 nav buttons');
    for (const btn of closedButtons) {
      assert.ok(btn.includes('tabindex="-1"'), `Closed mobile button must not be focusable: ${btn}`);
    }

    // 2. Mobile viewport (< 1024px), drawer OPEN
    const mobileOpenHtml = renderToStaticMarkup(
      React.createElement(Sidebar, {
        currentTab: 'overview',
        onTabChange: () => {},
        isOpen: true,
        onClose: () => {},
        isBackendConnected: true,
      })
    );
    assert.ok(mobileOpenHtml.includes('role="dialog"'), 'Open mobile drawer must expose role="dialog"');
    assert.ok(mobileOpenHtml.includes('aria-modal="true"'), 'Open mobile drawer must expose aria-modal="true"');
    assert.ok(
      !/<aside\b[^>]*aria-hidden="true"/.test(mobileOpenHtml),
      'Open mobile sidebar must not set aria-hidden="true" on aside'
    );
    const openButtons = mobileOpenHtml.match(/<button\b[^>]*>/g) || [];
    assert.equal(openButtons.length, 6);
    for (const btn of openButtons) {
      assert.ok(!btn.includes('tabindex="-1"'), `Open mobile button must be focusable: ${btn}`);
    }

    // 3. Desktop viewport (>= 1024px), mobile isOpen=false
    globalThis.window = { matchMedia: () => ({ matches: true }) };
    const desktopHtml = renderToStaticMarkup(
      React.createElement(Sidebar, {
        currentTab: 'overview',
        onTabChange: () => {},
        isOpen: false,
        onClose: () => {},
        isBackendConnected: true,
      })
    );
    assert.ok(
      !/<aside\b[^>]*aria-hidden="true"/.test(desktopHtml),
      'Desktop sidebar must never have aria-hidden="true" when mobile state isOpen=false'
    );
    assert.ok(desktopHtml.includes('lg:translate-x-0'), 'Desktop sidebar must remain translated on-screen');
    assert.ok(desktopHtml.includes('lg:visible'), 'Desktop sidebar must remain visible via lg:visible');
    const desktopButtons = desktopHtml.match(/<button\b[^>]*>/g) || [];
    assert.equal(desktopButtons.length, 6);
    for (const btn of desktopButtons) {
      assert.ok(!btn.includes('tabindex="-1"'), `Desktop nav control must stay keyboard-focusable: ${btn}`);
    }
  } finally {
    globalThis.window = previousWindow;
  }
});

test('Phase 3 Contrast Regression: WCAG 2.2 AA contrast ratios & rendered text tokens in AQIHeroCard, ExposureRiskScoreCard, Header', () => {
  // 1. Verify mathematical contrast >= 4.5:1 for all remediated palette combinations
  assert.ok(getContrastRatio('#64748b', '#ffffff') >= 4.5, 'slate-500 on white must meet 4.5:1');
  assert.ok(getContrastRatio('#64748b', '#f8fafc') >= 4.5, 'slate-500 on slate-50 must meet 4.5:1');
  assert.ok(getContrastRatio('#64748b', '#fbfcfd') >= 4.5, 'slate-500 on slate-50/60 over white must meet 4.5:1');
  assert.ok(getContrastRatio('#475569', '#ffffff') >= 4.5, 'slate-600 on white must meet 4.5:1');
  assert.ok(getContrastRatio('#475569', '#f1f5f9') >= 4.5, 'slate-600 on slate-100 must meet 4.5:1');
  assert.ok(getContrastRatio('#475569', '#ccfbf1') >= 4.5, 'slate-600 on focused vayu-100 option must meet 4.5:1');
  assert.ok(getContrastRatio('#475569', '#fef0f2') >= 4.5, 'slate-600 on rose-500/8 tint must meet 4.5:1');

  // 2. Render AQIHeroCard & ExposureRiskScoreCard with full props to inspect rendered classes
  const { Badge } = loadTsxComponent(path.join('components', 'common', 'Badge.tsx'));
  const { AQIHeroCard } = loadTsxComponent(path.join('components', 'dashboard', 'AQIHeroCard.tsx'), {
    '../common/Badge': { Badge },
  });
  const { ExposureRiskScoreCard } = loadTsxComponent(
    path.join('components', 'dashboard', 'ExposureRiskScoreCard.tsx'),
    { '../common/Badge': { Badge } }
  );

  const heroHtml = renderToStaticMarkup(
    React.createElement(AQIHeroCard, {
      aqiData: {
        location_name: 'New Delhi',
        station_name: 'Mandir Marg, Delhi',
        station_id: 7024,
        coordinates: { latitude: 28.6358, longitude: 77.2245 },
        aqi: 184,
        classification: {
          category: 'Unhealthy',
          color_hex: '#EF4444',
          health_implications: 'Sensitive groups may experience more serious effects.',
          scale_name: 'WAQI / US EPA Standard',
          methodology_note: 'US EPA formula note',
        },
        dominant_pollutant: 'pm25',
        pollutants: {},
        source: 'WAQI',
        attributions: [{ name: 'CPCB', url: 'https://cpcb.nic.in' }],
        station_url: 'https://aqicn.org/city/delhi/mandir-marg',
        measurement_time: '2026-11-26 00:00:00',
        data_freshness: 'live',
      },
    })
  );

  // Check zero text-slate-400 remains on rendered text elements (only allowed on decorative <svg data-icon="Info">)
  const heroWithoutIcons = heroHtml.replace(/<svg\b[^>]*>.*?<\/svg>/g, '');
  assert.ok(!heroWithoutIcons.includes('text-slate-400'), 'AQIHeroCard text elements must not use text-slate-400');

  const riskHtml = renderToStaticMarkup(
    React.createElement(ExposureRiskScoreCard, {
      riskScore: 76.4,
      riskLevel: 'High',
      confidenceScore: 0.9,
      freshnessIndicator: 'Live',
      isStaleOrMissing: false,
    })
  );
  assert.ok(!riskHtml.includes('text-slate-400'), 'ExposureRiskScoreCard must not use text-slate-400 on text labels');

  // 3. Check Header meaningful text tokens (allow only decorative icons marked aria-hidden or Search/Calendar SVGs)
  const headerSrc = fs.readFileSync(path.join(srcDir, 'components', 'layout', 'Header.tsx'), 'utf-8');
  assert.ok(!headerSrc.includes('placeholder:text-slate-400'), 'Header input placeholder must meet AA contrast');
  const disallowedHeaderText400 = headerSrc
    .split('\n')
    .filter((line) => line.includes('text-slate-400') && !line.includes('<Search') && !line.includes('<Calendar') && !line.includes('<MapPin'));
  assert.deepEqual(
    disallowedHeaderText400,
    [],
    `Header meaningful text/controls must not use text-slate-400: ${disallowedHeaderText400.join('; ')}`
  );
});

test('Phase 3 Combobox Regression: aria-selected represents selection independently of keyboard focus', () => {
  const headerSrc = fs.readFileSync(path.join(srcDir, 'components', 'layout', 'Header.tsx'), 'utf-8');

  assert.ok(
    headerSrc.includes('aria-selected={isSelected}'),
    'Combobox option must set aria-selected={isSelected} rather than isFocused || isSelected'
  );
  assert.ok(
    !headerSrc.includes('isFocused || isSelected'),
    'Must not conflate keyboard focus with aria-selected'
  );
  assert.ok(
    headerSrc.includes('activeIndex >= 0 && activeIndex < searchResults.length'),
    'aria-activedescendant must stay bounded to existing searchResults indices'
  );

  // Verify keyboard state machine preserves ArrowDown / ArrowUp wrapping, Enter selection, and Escape dismissal
  function stepCombobox(state, key, results) {
    if (key === 'Escape') return { ...state, isOpen: false };
    if (key === 'ArrowDown' && results.length > 0) {
      return { ...state, activeIndex: state.activeIndex < results.length - 1 ? state.activeIndex + 1 : 0 };
    }
    if (key === 'ArrowUp' && results.length > 0) {
      return { ...state, activeIndex: state.activeIndex > 0 ? state.activeIndex - 1 : results.length - 1 };
    }
    if (key === 'Enter' && state.activeIndex >= 0 && state.activeIndex < results.length) {
      return { isOpen: false, activeIndex: -1, selectedQuery: results[state.activeIndex].query };
    }
    return state;
  }

  const results = [{ query: 'delhi' }, { query: 'mumbai' }, { query: 'bengaluru' }];
  let st = { isOpen: true, activeIndex: -1, selectedQuery: 'delhi' };
  st = stepCombobox(st, 'ArrowDown', results);
  assert.equal(st.activeIndex, 0);
  assert.equal(st.selectedQuery, 'delhi'); // Focus moved without mutating selection
  st = stepCombobox(st, 'ArrowDown', results);
  assert.equal(st.activeIndex, 1);
  assert.equal(st.selectedQuery, 'delhi'); // Mumbai focused via activeIndex, not selected yet
  st = stepCombobox(st, 'ArrowUp', results);
  assert.equal(st.activeIndex, 0);
  st = stepCombobox(st, 'ArrowUp', results); // Wraps to last
  assert.equal(st.activeIndex, 2);
  st = stepCombobox(st, 'Enter', results);
  assert.equal(st.selectedQuery, 'bengaluru');
  assert.equal(st.isOpen, false);
  assert.equal(st.activeIndex, -1);

  const escaped = stepCombobox({ isOpen: true, activeIndex: 1, selectedQuery: 'bengaluru' }, 'Escape', results);
  assert.equal(escaped.isOpen, false);
  assert.equal(escaped.selectedQuery, 'bengaluru');
});

function compositeHex(fgHex, bgHex, alpha) {
  const [r1, g1, b1] = hexToRgb(fgHex);
  const [r2, g2, b2] = hexToRgb(bgHex);
  return (
    '#' +
    [
      Math.round(r1 * alpha + r2 * (1 - alpha)),
      Math.round(g1 * alpha + g2 * (1 - alpha)),
      Math.round(b1 * alpha + b2 * (1 - alpha)),
    ]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

test('Phase 3.3 Batch A Contrast Regression: Opacity removal, checkboxes, Sidebar, App hover, and placeholders', () => {
  // 1. Alpha-compositing & WCAG AA ratio assertions for Batch A surfaces
  const unmeasuredBg = compositeHex('#f8fafc', '#ffffff', 0.4); // bg-slate-50/40 over white
  assert.ok(getContrastRatio('#475569', unmeasuredBg) >= 4.5, 'Unmeasured pollutant name must pass 4.5:1');
  assert.ok(getContrastRatio('#64748b', unmeasuredBg) >= 4.5, 'Unmeasured Not reported & desc must pass 4.5:1');
  // Regression guard: prove opacity-60 caused failure previously
  const legacyOpacity60Bg = compositeHex('#f8fafc', '#ffffff', 0.12);
  assert.ok(
    getContrastRatio(compositeHex('#334155', legacyOpacity60Bg, 0.6), legacyOpacity60Bg) < 4.5,
    'Opacity-60 with slate-700 fails 4.5:1 and must not be reintroduced'
  );

  // Checkboxes & non-text UI controls >= 3.0:1
  assert.ok(getContrastRatio('#64748b', '#ffffff') >= 3.0, 'Unchecked checkbox border/circle must meet 3.0:1');
  assert.ok(getContrastRatio('#334155', '#f1f5f9') >= 3.0, 'Sidebar close hover must meet 3.0:1');

  // Completed recommendation card & CompletionTrackerCard
  const completedDoneBg = compositeHex('#ecfdf5', '#ffffff', 0.6); // bg-emerald-50/60 over white
  assert.ok(getContrastRatio('#64748b', completedDoneBg) >= 4.5, 'CompletionTrackerCard done text must pass 4.5:1');
  assert.ok(getContrastRatio('#475569', '#f1f5f9') >= 4.5, 'Timing pill on bg-slate-100 must pass 4.5:1');
  assert.ok(getContrastRatio('#475569', '#f8fafc') >= 4.5, 'Completed mechanism & heading on slate-50 pass 4.5:1');

  // App hover & footer + placeholders
  assert.ok(getContrastRatio('#020617', '#f59e0b') >= 4.5, 'Demo banner resting text must pass 4.5:1');
  assert.ok(getContrastRatio('#1e293b', '#f59e0b') >= 4.5, 'Demo banner hover text must pass 4.5:1');
  assert.ok(getContrastRatio('#475569', '#f8fafc') >= 4.5, 'Medical disclaimer footer must pass 4.5:1');
  assert.ok(getContrastRatio('#64748b', '#ffffff') >= 4.5, 'Input placeholders must pass 4.5:1');

  // 2. Render PollutantBreakdown with unmeasured sensors
  const { PollutantBreakdown } = loadTsxComponent(path.join('components', 'dashboard', 'PollutantBreakdown.tsx'));
  const pbHtml = renderToStaticMarkup(
    React.createElement(PollutantBreakdown, {
      pollutants: {
        pm25: { value: 168, unit: 'IAQI', label: 'PM2.5' },
        so2: null,
        co: null,
      },
    })
  );
  assert.ok(!pbHtml.includes('opacity-60'), 'PollutantBreakdown unmeasured card must not use opacity-60');
  assert.ok(pbHtml.includes('bg-slate-50/40 border-slate-200/70'), 'Unmeasured card must use bg-slate-50/40');
  assert.ok(pbHtml.includes('text-slate-600'), 'Unmeasured pollutant name must preserve muted distinction cleanly');
  assert.ok(pbHtml.includes('text-slate-500 italic">Not reported'), 'Not reported label must use text-slate-500');

  // 3. Render CompletionTrackerCard with pending and completed states
  const { CompletionTrackerCard } = loadTsxComponent(
    path.join('components', 'explainability', 'CompletionTrackerCard.tsx')
  );
  const recs = [
    {
      action: 'Close bedroom windows before sunset',
      reason: 'Inversion trapping',
      expected_benefit: 'Reduces PM2.5',
      timing: 'Evening',
      affected_household_member: 'All members',
      priority: 'High',
      confidence: 'High',
      supporting_data_rule: 'RULE_TEST_1',
    },
    {
      action: 'Run bedroom purifier continuously',
      reason: 'Clean air shield',
      expected_benefit: 'Reduces PM2.5',
      timing: 'Night',
      affected_household_member: 'Seniors',
      priority: 'Critical',
      confidence: 'High',
      supporting_data_rule: 'RULE_TEST_2',
    },
  ];
  const trackerHtml = renderToStaticMarkup(
    React.createElement(CompletionTrackerCard, {
      recommendations: recs,
      completedActionKeys: ['RULE_TEST_2'],
      onToggleAction: () => {},
      onResetCompleted: () => {},
    })
  );
  assert.ok(!trackerHtml.includes('text-slate-300'), 'Unchecked checkbox Circle must not use text-slate-300');
  assert.ok(!trackerHtml.includes('text-slate-400'), 'CompletionTrackerCard labels/meta must not use text-slate-400');

  // 4. Render ExplainableRecommendationCard in pending & completed states (expanded to verify footer)
  const { CausalChainVisualizer } = loadTsxComponent(
    path.join('components', 'explainability', 'CausalChainVisualizer.tsx')
  );
  const { ImpactCategoryBadges } = loadTsxComponent(
    path.join('components', 'explainability', 'ImpactCategoryBadges.tsx')
  );
  const { ExplainableRecommendationCard } = loadTsxComponent(
    path.join('components', 'explainability', 'ExplainableRecommendationCard.tsx'),
    {
      './CausalChainVisualizer': { CausalChainVisualizer },
      './ImpactCategoryBadges': { ImpactCategoryBadges },
    }
  );

  const pendingCardHtml = renderToStaticMarkup(
    React.createElement(ExplainableRecommendationCard, {
      recommendation: recs[0],
      isCompleted: false,
      onToggleComplete: () => {},
      defaultExpanded: false,
    })
  );
  assert.ok(pendingCardHtml.includes('border-slate-500 bg-white'), 'Unchecked checkbox must use >=3:1 border-slate-500');
  assert.ok(!pendingCardHtml.includes('border-slate-300 bg-white'), 'Must not revert unchecked border to slate-300');

  const completedCardHtml = renderToStaticMarkup(
    React.createElement(ExplainableRecommendationCard, {
      recommendation: recs[0],
      isCompleted: true,
      onToggleComplete: () => {},
      defaultExpanded: true,
    })
  );
  assert.ok(!completedCardHtml.includes('opacity-90'), 'Completed card must not apply opacity-90 over card container');
  assert.ok(completedCardHtml.includes('bg-slate-50'), 'Completed card must use bg-slate-50 distinction');
  assert.ok(completedCardHtml.includes('text-slate-600 bg-slate-100'), 'Timing pill must use text-slate-600 on slate-100');
  assert.ok(completedCardHtml.includes('text-slate-500 pt-1 border-t'), 'Rule/confidence footer must use text-slate-500');

  // 5. Verify Sidebar, App.tsx, and profile input placeholder tokens
  const { Sidebar } = loadTsxComponent(path.join('components', 'layout', 'Sidebar.tsx'));
  const previousWindow = globalThis.window;
  let sidebarHtml = '';
  try {
    globalThis.window = { matchMedia: () => ({ matches: true }) };
    sidebarHtml = renderToStaticMarkup(
      React.createElement(Sidebar, {
        currentTab: 'overview',
        onTabChange: () => {},
        isOpen: false,
        onClose: () => {},
        isBackendConnected: true,
      })
    );
  } finally {
    globalThis.window = previousWindow;
  }
  // Remove decorative icons (svgs inside nav buttons) before verifying no text-slate-400 remains on UI/text
  const sidebarWithoutDecorativeSvgs = sidebarHtml.replace(/<span class="text-slate-400"><svg\b[^>]*>.*?<\/svg><\/span>/g, '');
  assert.ok(!sidebarWithoutDecorativeSvgs.includes('text-slate-400'), 'Sidebar UI/text must not use text-slate-400');

  const appSrc = fs.readFileSync(path.join(srcDir, 'App.tsx'), 'utf-8');
  assert.ok(!appSrc.includes('hover:text-white'), 'App.tsx demo banner links must not use low-contrast hover:text-white');
  assert.ok(!appSrc.includes('text-xs text-slate-400'), 'App.tsx disclaimer & footer must not use text-slate-400');

  for (const rel of [
    path.join('components', 'profile', 'HouseholdMembersCard.tsx'),
    path.join('components', 'profile', 'NaturalLanguageProfileCard.tsx'),
    path.join('components', 'profile', 'ProfileSetupPage.tsx'),
  ]) {
    const content = fs.readFileSync(path.join(srcDir, rel), 'utf-8');
    assert.ok(content.includes('placeholder:text-slate-500'), `${rel} must specify placeholder:text-slate-500`);
  }
});

test('Phase 3.4 Batch B Contrast Regression: Muted text on light/translucent grounds, RAC-120 hover, RAC-181 chevron, and dark tooltips', () => {
  // 1. Quantitative contrast checks (computed ratios, not token names alone)
  const slate50Over50 = compositeHex('#f8fafc', '#ffffff', 0.5);
  const slate50Over60 = compositeHex('#f8fafc', '#ffffff', 0.6);
  const slate50Over70 = compositeHex('#f8fafc', '#ffffff', 0.7);
  const timelineEmptyBg = compositeHex('#ffffff', slate50Over50, 0.6);
  const wciGradientBg = compositeHex('#f0fdfa', '#f8fafc', 0.3);
  const nlpGradientBg = compositeHex('#f0fdfa', '#f8fafc', 0.7);

  // Proof of why slate-400 and hover slate-500 were insufficient before Batch B
  assert.ok(getContrastRatio('#94a3b8', slate50Over50) < 3.0, 'Previous slate-400 on slate-50/50 fails 3:1 UI threshold');
  assert.ok(getContrastRatio('#64748b', '#f1f5f9') < 4.5, 'Slate-500 on hover:bg-slate-100 fails 4.5:1 (justifies RAC-120 slate-600)');

  // Passing Batch B ratios
  assert.ok(getContrastRatio('#475569', '#f8fafc') >= 4.5, 'RAC-120 resting (slate-600 on slate-50) must pass 4.5:1');
  assert.ok(getContrastRatio('#475569', '#f1f5f9') >= 4.5, 'RAC-120 hover (slate-600 on slate-100) must pass 4.5:1');
  assert.ok(getContrastRatio('#cbd5e1', '#0f172a') >= 4.5, 'RAC-120 active (slate-300 on slate-900) must pass 4.5:1');
  assert.ok(getContrastRatio('#64748b', slate50Over50) >= 3.0, 'RAC-181 chevron collapsed (slate-500 on slate-50/50) must pass 3.0:1');
  assert.ok(getContrastRatio('#64748b', '#ffffff') >= 3.0, 'RAC-181 chevron expanded (slate-500 on white) must pass 3.0:1');
  assert.ok(getContrastRatio('#64748b', slate50Over60) >= 4.5, 'PollutantBreakdown IAQI sublabel (slate-500 on slate-50/60) must pass 4.5:1');
  assert.ok(getContrastRatio('#64748b', slate50Over70) >= 4.5, 'SustainableSwaps metadata (slate-500 on slate-50/70) must pass 4.5:1');
  assert.ok(getContrastRatio('#64748b', timelineEmptyBg) >= 4.5, 'DailyTimeline empty notice (slate-500 on white/60 over slate-50/50) must pass 4.5:1');
  assert.ok(getContrastRatio('#64748b', wciGradientBg) >= 4.5, 'WhatChangedInspector empty rules on gradient must pass 4.5:1');
  assert.ok(getContrastRatio('#64748b', nlpGradientBg) >= 4.5, 'NaturalLanguageProfile disclaimer on gradient must pass 4.5:1');
  assert.ok(getContrastRatio('#94a3b8', '#0f172a') >= 4.5, 'AQITrendChart dark tooltips (slate-400 on slate-900) must pass 4.5:1');

  // 2. Verify SSR output of Batch B updated components & untouched dark tooltips
  const { Badge } = loadTsxComponent(path.join('components', 'common', 'Badge.tsx'));
  const { CausalChainVisualizer } = loadTsxComponent(
    path.join('components', 'explainability', 'CausalChainVisualizer.tsx')
  );
  const { ImpactCategoryBadges } = loadTsxComponent(
    path.join('components', 'explainability', 'ImpactCategoryBadges.tsx')
  );
  const { RecommendedActionsCard } = loadTsxComponent(
    path.join('components', 'dashboard', 'RecommendedActionsCard.tsx'),
    {
      '../common/Badge': { Badge },
      '../explainability/CausalChainVisualizer': { CausalChainVisualizer },
      '../explainability/ImpactCategoryBadges': { ImpactCategoryBadges },
    }
  );
  const makeAction = (title) => ({
    action: title,
    priority: 'High',
    timing: '06:00 - 08:00',
    beneficiary: 'All members',
    trigger_condition: 'PM2.5 > 120',
    why_now: 'Morning inversion peak',
    expected_mechanism: 'Reduces inhalation exposure',
  });
  const racHtml = renderToStaticMarkup(
    React.createElement(RecommendedActionsCard, {
      todayRoutine: {
        morning: { summary: 'Morning summary', actions: [makeAction('Close windows'), makeAction('Run purifier')] },
        afternoon: { summary: 'Afternoon summary', actions: [] },
        evening: { summary: 'Evening summary', actions: [] },
        night: { summary: 'Night summary', actions: [] },
      },
      isAiGenerated: true,
    })
  );
  assert.ok(racHtml.includes('text-slate-300'), 'Active timeline tab must retain text-slate-300 on bg-slate-900');
  assert.ok(racHtml.includes('text-slate-600'), 'RAC-120 inactive tab time must use text-slate-600 for hover AA contrast');
  assert.ok(racHtml.includes('text-slate-500 p-1'), 'RAC-181 accordion chevron must meet 3:1 with text-slate-500');
  // Decorative icons (<User> in badge, <ArrowRight> step connectors) intentionally remain text-slate-400
  const racWithoutDecorativeSvgs = racHtml.replace(/<svg data-icon="(?:User|ArrowRight)"[^>]*><\/svg>/g, '');
  assert.ok(!racWithoutDecorativeSvgs.includes('text-slate-400'), 'RecommendedActionsCard text/UI must not use text-slate-400');

  // Verify PollutantBreakdown remaining light-surface labels (with meteorological strip + IAQI)
  const { PollutantBreakdown } = loadTsxComponent(path.join('components', 'dashboard', 'PollutantBreakdown.tsx'));
  const pbFullHtml = renderToStaticMarkup(
    React.createElement(PollutantBreakdown, {
      pollutants: {
        pm25: { value: 90, unit: 'IAQI', label: 'PM2.5' },
        pm10: { value: 140, unit: 'IAQI', label: 'PM10' },
        no2: null,
        meteorological: { t: 24, h: 55, p: 1012, w: 2.1 },
      },
    })
  );
  assert.ok(!pbFullHtml.includes('text-slate-400'), 'PollutantBreakdown must have zero remaining text-slate-400');

  // Verify AQITrendChart dark tooltips remain intact while light-surface source caption uses text-slate-500
  const chartSrc = fs.readFileSync(path.join(srcDir, 'components', 'dashboard', 'AQITrendChart.tsx'), 'utf-8');
  assert.ok(chartSrc.includes('bg-slate-900'), 'Dark chart tooltips must stay bg-slate-900');
  assert.ok(chartSrc.includes('text-[11px] text-slate-500 italic'), 'Forecast source caption must use text-slate-500');
  const darkTooltipCount = (chartSrc.match(/text-slate-400/g) || []).filter(() => true).length;
  // Four dark tooltip text-slate-400 tokens + one decorative Info icon text-slate-400 = 5
  assert.equal(darkTooltipCount, 5, 'AQITrendChart must preserve only the 4 dark tooltip tokens and 1 decorative Info icon');
});

test('Phase 3.5 Batch C Contrast Regression: Semantic pills, status labels, chart reference label, and tinted/hover badges', () => {
  // 1. Quantitative luminance & alpha-compositing proofs (legacy failures vs compliant Batch C fixes)
  assert.ok(getContrastRatio('#ffffff', '#059669') < 4.5, 'White on emerald-600 fails 4.5:1');
  assert.ok(getContrastRatio('#ffffff', '#d97706') < 4.5, 'White on amber-600 fails 4.5:1');
  assert.ok(getContrastRatio('#ffffff', '#ea580c') < 4.5, 'White on orange-600 fails 4.5:1');
  assert.ok(getContrastRatio('#ffffff', '#0d9488') < 4.5, 'White on teal-600/vayu-600 fails 4.5:1');
  assert.ok(getContrastRatio('#be123c', '#fff1f2') >= 4.5, 'Rose-700 on rose-50 (High Risk) must pass 4.5:1');
  assert.ok(getContrastRatio('#e11d48', '#fff1f2') < 4.5, 'Previous rose-600 on rose-50 fails 4.5:1');
  assert.ok(getContrastRatio('#e11d48', '#f8fafc') < 4.5, 'Previous rose-600 on slate-50 fails 4.5:1');
  assert.ok(getContrastRatio('#be123c', '#f8fafc') >= 4.5, 'Rose-700 on slate-50 must pass 4.5:1');
  assert.ok(getContrastRatio('#047857', '#ffffff') >= 4.5, 'Emerald-700 on white must pass 4.5:1');
  assert.ok(getContrastRatio('#0f766e', '#ffffff') >= 4.5, 'Vayu-700 on white must pass 4.5:1');

  // Saturated -700/-800 pill/button resting & hover ratios
  for (const [label, bg] of [
    ['Emerald-700', '#047857'],
    ['Emerald-800', '#065f46'],
    ['Amber-700', '#b45309'],
    ['Orange-700', '#c2410c'],
    ['Rose-600', '#e11d48'],
    ['Purple-800', '#6b21a8'],
    ['Teal-700 / Vayu-700', '#0f766e'],
    ['Vayu-800', '#115e59'],
  ]) {
    assert.ok(getContrastRatio('#ffffff', bg) >= 4.5, `White on ${label} must pass 4.5:1`);
  }

  // ReferenceLine label against both pure white and peak 0.25 diurnal area fill
  const areaTopBg = compositeHex('#0f766e', '#ffffff', 0.25);
  assert.ok(getContrastRatio('#ef4444', '#ffffff') < 4.5, 'Previous #ef4444 chart label fails 4.5:1');
  assert.ok(getContrastRatio('#dc2626', areaTopBg) < 4.5, '#dc2626 drops below 4.5:1 over peak diurnal area fill');
  assert.ok(getContrastRatio('#b91c1c', '#ffffff') >= 4.5, '#b91c1c chart label must pass 4.5:1 on white');
  assert.ok(getContrastRatio('#b91c1c', areaTopBg) >= 4.5, '#b91c1c chart label must pass 4.5:1 over peak area fill');
  assert.ok(getContrastRatio('#ef4444', '#ffffff') >= 3.0, 'ReferenceLine dashed stroke must pass 3:1 UI contrast');

  // Borderline slate-500 vs upgraded slate-600 on tinted & hover surfaces
  const pabRoseBg = compositeHex('#fff1f2', '#f8fafc', 0.8);
  const pabAmberBg = compositeHex('#fffbeb', '#f8fafc', 0.8);
  const wciDeactivatedBg = compositeHex('#f1f5f9', compositeHex('#f0fdfa', '#f8fafc', 0.3), 0.7);
  assert.ok(getContrastRatio('#64748b', '#f1f5f9') < 4.5, 'Slate-500 on slate-100 fails 4.5:1');
  assert.ok(getContrastRatio('#64748b', pabRoseBg) < 4.5, 'Slate-500 on rose-50/80 fails 4.5:1');
  assert.ok(getContrastRatio('#64748b', wciDeactivatedBg) < 4.5, 'Slate-500 on slate-100/70 fails 4.5:1');
  assert.ok(getContrastRatio('#475569', '#f1f5f9') >= 4.5, 'RAC-171 / ICC-133 hover (slate-600 on slate-100) must pass 4.5:1');
  assert.ok(getContrastRatio('#475569', pabRoseBg) >= 4.5, 'PAB-37 warning (slate-600 on rose-50/80) must pass 4.5:1');
  assert.ok(getContrastRatio('#475569', pabAmberBg) >= 4.5, 'PAB-37 advisory (slate-600 on amber-50/80) must pass 4.5:1');
  assert.ok(getContrastRatio('#475569', wciDeactivatedBg) >= 4.5, 'WCI-188 (slate-600 on slate-100/70) must pass 4.5:1');

  // 2. SSR render checks for modified Batch C components
  const { Badge } = loadTsxComponent(path.join('components', 'common', 'Badge.tsx'));
  const { AQIHeroCard } = loadTsxComponent(path.join('components', 'dashboard', 'AQIHeroCard.tsx'), {
    '../common/Badge': { Badge },
  });
  const makeAqiData = (category, aqi) => ({
    location_name: 'New Delhi',
    station_name: 'Anand Vihar',
    station_id: 1,
    coordinates: { latitude: 28.64, longitude: 77.31 },
    aqi,
    classification: { category, color_hex: '#000', health_implications: 'Test implication', scale_name: 'US EPA', methodology_note: '' },
    dominant_pollutant: 'pm25',
    pollutants: {},
    source: 'WAQI',
    attributions: [],
    station_url: null,
    measurement_time: '2026-11-26 12:00:00',
    data_freshness: 'live',
  });
  for (const [cat, aqi, expectedPill] of [
    ['Good', 35, 'bg-emerald-700 text-white'],
    ['Moderate', 85, 'bg-amber-700 text-white'],
    ['Unhealthy for Sensitive Groups', 125, 'bg-orange-700 text-white'],
    ['Unhealthy', 180, 'bg-rose-600 text-white'],
  ]) {
    const html = renderToStaticMarkup(React.createElement(AQIHeroCard, { aqiData: makeAqiData(cat, aqi) }));
    assert.ok(html.includes(expectedPill), `AQIHeroCard ${cat} pill must render ${expectedPill}`);
    assert.ok(!html.includes('bg-emerald-600') && !html.includes('bg-amber-600') && !html.includes('bg-orange-600'));
  }

  const { CausalChainVisualizer } = loadTsxComponent(path.join('components', 'explainability', 'CausalChainVisualizer.tsx'));
  const ccvHtml = renderToStaticMarkup(
    React.createElement(CausalChainVisualizer, {
      causalChain: { live_data: '1', household_context: '2', detected_risk: '3', recommended_action: '4', expected_benefit: '5' },
    })
  );
  assert.ok(ccvHtml.includes('bg-amber-700 text-white'));
  assert.ok(ccvHtml.includes('bg-emerald-700 text-white'));
  assert.ok(ccvHtml.includes('bg-teal-700 text-white'));

  const { PersonalizedAlertsBanner } = loadTsxComponent(path.join('components', 'dashboard', 'PersonalizedAlertsBanner.tsx'));
  const pabHtml = renderToStaticMarkup(
    React.createElement(PersonalizedAlertsBanner, {
      alerts: [
        { activity: 'Morning Run', alert_level: 'warning', affected_member: 'Asthma Member', message: 'Avoid outdoor cardio.' },
        { activity: 'Commute', alert_level: 'caution', affected_member: 'Commuter', message: 'Use N95 mask.' },
      ],
    })
  );
  assert.ok(pabHtml.includes('text-slate-600') && !pabHtml.includes('text-slate-500'));

  const { WhatChangedInspector } = loadTsxComponent(path.join('components', 'explainability', 'WhatChangedInspector.tsx'));
  const wciHtml = renderToStaticMarkup(
    React.createElement(WhatChangedInspector, {
      delta: {
        prevLocation: 'Delhi',
        currLocation: 'Bengaluru',
        prevAqi: 210,
        currAqi: 75,
        prevProfileName: 'Commuter',
        currProfileName: 'WFH',
        prevRiskScore: 72.0,
        currRiskScore: 41.0,
        addedRuleTitles: ['Open midday windows'],
        removedRuleTitles: ['Mandatory N95 mask'],
        changeRationale: 'Lower ambient AQI.',
      },
    })
  );
  // Strip decorative <CheckCircle> icon on L162 before verifying no text-emerald-600 text remains
  const wciWithoutDecorativeIcon = wciHtml.replace(/<svg data-icon="CheckCircle"[^>]*><\/svg>/g, '');
  assert.ok(wciWithoutDecorativeIcon.includes('text-emerald-700 font-bold') && !wciWithoutDecorativeIcon.includes('text-emerald-600'));
  assert.ok(wciHtml.includes('text-xs text-slate-600') && wciHtml.includes('line-through'));

  // Verify RAC-171 beneficiary pill inside RecommendedActionsCard uses slate-600 on slate-100
  const { ImpactCategoryBadges } = loadTsxComponent(
    path.join('components', 'explainability', 'ImpactCategoryBadges.tsx')
  );
  const { RecommendedActionsCard } = loadTsxComponent(
    path.join('components', 'dashboard', 'RecommendedActionsCard.tsx'),
    {
      '../common/Badge': { Badge },
      '../explainability/CausalChainVisualizer': { CausalChainVisualizer },
      '../explainability/ImpactCategoryBadges': { ImpactCategoryBadges },
    }
  );
  const racHtmlC = renderToStaticMarkup(
    React.createElement(RecommendedActionsCard, {
      todayRoutine: {
        morning: {
          summary: 'Morning summary',
          actions: [{ action: 'Mask up', priority: 'High', timing: '08:00', beneficiary: 'Commuters', trigger_condition: 'AQI>200', why_now: 'Peak traffic', expected_mechanism: 'Filters PM2.5' }],
        },
        afternoon: { summary: 'Afternoon', actions: [] },
        evening: { summary: 'Evening', actions: [] },
        night: { summary: 'Night', actions: [] },
      },
      isAiGenerated: false,
    })
  );
  assert.ok(racHtmlC.includes('text-slate-600 bg-slate-100') && !racHtmlC.includes('text-slate-500 bg-slate-100'));

  const { HouseholdMembersCard } = loadTsxComponent(path.join('components', 'profile', 'HouseholdMembersCard.tsx'));
  const hmcHtml = renderToStaticMarkup(
    React.createElement(HouseholdMembersCard, {
      profile: {
        profile_name: 'Test',
        num_adults: 2,
        children_ages: [],
        num_older_adults: 1,
        has_asthma_or_respiratory_vulnerability: false,
        num_outdoor_workers: 0,
        mobility_limited_member: false,
        ventilation: 'sealed_ac',
        commute_habits: { is_daily_commuter: false, primary_mode: 'public_metro', estimated_daily_commute_minutes: 30 },
        exercise_habits: { participates_in_outdoor_exercise: false, time_of_day: 'midday', intensity: 'moderate' },
        cooking_habits: { has_kitchen_exhaust_or_chimney: true, heavy_frying_or_tadka_daily: false, uses_incense_or_mosquito_coils: false },
        purifier_setup: { has_air_purifier: false, purifier_count: 0, located_in_bedrooms: false, operates_continuously: false },
        has_outdoor_child_play: false,
      },
      onChange: () => {},
    })
  );
  assert.ok(hmcHtml.includes('text-rose-700 bg-rose-50') && !hmcHtml.includes('text-rose-600 bg-rose-50'));

  const { IndoorConditionsCard } = loadTsxComponent(path.join('components', 'profile', 'IndoorConditionsCard.tsx'));
  const iccHtml = renderToStaticMarkup(
    React.createElement(IndoorConditionsCard, {
      profile: {
        profile_name: 'Test',
        num_adults: 1,
        children_ages: [],
        num_older_adults: 0,
        has_asthma_or_respiratory_vulnerability: false,
        num_outdoor_workers: 0,
        mobility_limited_member: false,
        ventilation: 'sealed_ac',
        commute_habits: { is_daily_commuter: false, primary_mode: 'public_metro', estimated_daily_commute_minutes: 30 },
        exercise_habits: { participates_in_outdoor_exercise: false, time_of_day: 'midday', intensity: 'moderate' },
        cooking_habits: { has_kitchen_exhaust_or_chimney: true, heavy_frying_or_tadka_daily: false, uses_incense_or_mosquito_coils: false },
        purifier_setup: { has_air_purifier: false, purifier_count: 0, located_in_bedrooms: false, operates_continuously: false },
        has_outdoor_child_play: false,
      },
      onChange: () => {},
    })
  );
  assert.ok(iccHtml.includes('text-slate-300'), 'Selected option must retain text-slate-300 on bg-slate-900');
  assert.ok(iccHtml.includes('text-slate-600'), 'Unselected option descriptions must use text-slate-600 for hover AA contrast');

  // Check AQITrendChart, NaturalLanguageProfileCard, and ProfileSetupPage updated semantic classes
  const chartSrcC = fs.readFileSync(path.join(srcDir, 'components', 'dashboard', 'AQITrendChart.tsx'), 'utf-8');
  assert.ok(chartSrcC.includes('bg-vayu-700 text-white hover:bg-vayu-800'));
  assert.ok(chartSrcC.includes("fill: '#b91c1c'"));
  const { NaturalLanguageProfileCard } = loadTsxComponent(
    path.join('components', 'profile', 'NaturalLanguageProfileCard.tsx')
  );
  const nlpHtmlC = renderToStaticMarkup(
    React.createElement(NaturalLanguageProfileCard, {
      onParse: async () => {},
      isParsing: false,
      parseError: null,
      parsedSuggestion: {
        message: 'Parsed profile',
        suggested_fields: {
          has_asthma_or_respiratory_vulnerability: true,
          confidence: 0.92,
        },
      },
      onConfirm: () => {},
      onDiscard: () => {},
    })
  );
  assert.ok(nlpHtmlC.includes('text-rose-700') && !nlpHtmlC.includes('text-rose-600'));
  assert.ok(nlpHtmlC.includes('bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800'));
  const pspSrcC = fs.readFileSync(path.join(srcDir, 'components', 'profile', 'ProfileSetupPage.tsx'), 'utf-8');
  assert.ok(pspSrcC.includes('text-vayu-700 animate-pulse') && !pspSrcC.includes('text-vayu-600 animate-pulse'));
});

/** Recursively enumerate all `.tsx` files under `rootDir`, sorted POSIX-relative paths first. */
function collectTsxFiles(rootDir) {
  const results = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsxFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

/** Extract icon component identifiers imported from `lucide-react` in the file (plus verified DailyTimelineView alias). */
function extractLucideIconIdentifiers(lines, rel) {
  const icons = new Set();
  const source = lines.join('\n');
  const importRegex = /import\s*\{([^{}]*?)\}\s*from\s*['"]lucide-react['"]/g;
  for (const match of source.matchAll(importRegex)) {
    for (const rawSpec of match[1].split(',')) {
      const cleaned = rawSpec.trim().replace(/^type\s+/, '');
      if (!cleaned) continue;
      const aliasParts = cleaned.split(/\s+as\s+/);
      const localName = (aliasParts[1] || aliasParts[0]).trim();
      if (/^[A-Z][A-Za-z0-9]*$/.test(localName)) {
        icons.add(localName);
      }
    }
  }
  if (
    rel === 'components/explainability/DailyTimelineView.tsx' &&
    source.includes('const Icon = segment.icon;') &&
    icons.size > 0
  ) {
    icons.add('Icon');
  }
  return icons;
}

/**
 * Isolate strictly self-closing tags for verified Lucide icon components (`<Icon ... />`) from `line`.
 * Wrapper/container JSX components (e.g. `<Badge ...>Text</Badge>`), HTML tags, and non-icon PascalCase
 * tags stay intact in `strippedLine` so meaningful text classes cannot hide behind an icon on the same line.
 */
function splitVerifiedSelfClosingIcons(line, lucideIcons) {
  if (!lucideIcons.size) {
    return { strippedLine: line, iconTags: [] };
  }
  const iconTags = [];
  let strippedLine = '';
  let i = 0;

  while (i < line.length) {
    if (line[i] === '<') {
      const nameMatch = line.slice(i + 1).match(/^([A-Z][A-Za-z0-9]*)(?=[\s/>])/);
      if (nameMatch && lucideIcons.has(nameMatch[1])) {
        let j = i + 1 + nameMatch[1].length;
        let quote = null;
        let braceDepth = 0;
        let closedSelf = false;
        while (j < line.length) {
          const ch = line[j];
          if (quote) {
            if (ch === '\\') {
              j += 2;
              continue;
            }
            if (ch === quote) quote = null;
          } else if (ch === '"' || ch === "'" || ch === '`') {
            quote = ch;
          } else if (ch === '{') {
            braceDepth++;
          } else if (ch === '}') {
            if (braceDepth > 0) braceDepth--;
          } else if (braceDepth === 0) {
            if (ch === '/' && line[j + 1] === '>') {
              iconTags.push(line.slice(i, j + 2));
              i = j + 2;
              closedSelf = true;
              break;
            }
            if (ch === '>') {
              break;
            }
          }
          j++;
        }
        if (closedSelf) continue;
      }
    }
    strippedLine += line[i];
    i++;
  }

  return { strippedLine, iconTags };
}

/** Confirm whether `lines[idx]` sits directly inside a native `<input type="checkbox|radio">` opening tag. */
function isNativeCheckboxOrRadioInputLine(lines, idx) {
  const line = lines[idx].trim();
  if (!line.includes('focus:ring-') || !line.includes('border-slate-300')) return false;
  for (let k = idx; k >= Math.max(0, idx - 15); k--) {
    const chunk = lines[k].trim();
    if (k < idx && chunk.includes('/>')) return false;
    if (chunk.startsWith('<input')) {
      const inputHead = lines.slice(k, idx + 1).join(' ');
      return /type=["'](?:checkbox|radio)["']/.test(inputHead);
    }
    if (k < idx && /^<[a-zA-Z]/.test(chunk)) return false;
  }
  return false;
}

const DECORATIVE_SLATE400_ICON_CONTEXTS = new Map([
  [
    'components/dashboard/AQITrendChart.tsx',
    [
      ({ iconTag, lines, idx }) =>
        iconTag.includes('<Info className="w-8 h-8 text-slate-400 mx-auto mb-2" />') &&
        lines.slice(Math.max(0, idx - 3), idx).some((l) => l.includes('id="panel-forecast"')) &&
        /^\s*<h[1-6]\b[^>]*>[^<]{3,}<\/h[1-6]>/.test(lines[idx + 1] || ''),
    ],
  ],
  [
    'components/explainability/CausalChainVisualizer.tsx',
    [
      ({ iconTag, lines, idx }) => {
        if (!iconTag.includes('<ArrowRight className="w-4 h-4 text-slate-400')) return false;
        const wrapperHead = lines.slice(Math.max(0, idx - 5), idx).join('\n');
        return /<div\b[^>]*\baria-hidden="true"/.test(wrapperHead);
      },
    ],
  ],
  [
    'components/explainability/WhatChangedInspector.tsx',
    [
      ({ iconTag, lines, idx }) =>
        iconTag.includes('<ArrowRight className="w-3.5 h-3.5 text-slate-400') &&
        /<span\b[^>]*>.+<\/span>/.test((lines[idx - 1] || '').trim()) &&
        /<span\b[^>]*>.+<\/span>/.test((lines[idx + 1] || '').trim()),
      ({ iconTag, lines, idx }) =>
        iconTag.includes('<XCircle className="w-3.5 h-3.5 text-slate-400" />') &&
        /<span\b/.test((lines[idx - 1] || '').trim()) &&
        /[A-Za-z]{3,}/.test((lines[idx + 1] || '').trim()),
    ],
  ],
  [
    'components/layout/Header.tsx',
    [
      ({ iconTag, lines, idx }) =>
        iconTag.includes('<Search className="w-3.5 h-3.5 text-slate-400') &&
        /<span\b[^>]*>\{currentLocation\.label\}<\/span>/.test((lines[idx - 1] || '').trim()) &&
        lines.slice(Math.max(0, idx - 8), idx).some((l) => l.includes('aria-label=')),
      ({ iconTag, lines, idx }) =>
        iconTag.includes('<Search className="w-4 h-4 text-slate-400') &&
        lines.slice(idx + 1, Math.min(lines.length, idx + 4)).some((l) => l.includes('<label htmlFor="city-search-input"')),
      ({ iconTag, lines, idx }) =>
        iconTag.includes('<Calendar className="w-3.5 h-3.5 text-slate-400" />') &&
        /<span\b[^>]*>.+<\/span>/.test((lines[idx + 1] || '').trim()),
    ],
  ],
]);

const KNOWN_OUT_OF_SCOPE_ISSUES = [
  {
    file: 'App.tsx',
    rule: 'low-contrast-semantic-text',
    match: (line) => line.includes('aqiError') && line.includes('text-rose-600'),
    reason:
      'Pre-existing out-of-scope failure: text-rose-600 (#e11d48) on bg-rose-50 (#fff1f2) = 4.28:1 (< 4.5:1); deferred from Batch D to avoid unrequested edits outside scope.',
  },
];

/**
 * Scan JSX/TSX source lines of a single file for low-contrast tokens with narrow documented exceptions.
 *
 * Limitations of static JSX/TSX scanning (not a replacement for visual/rendered verification):
 * - Cannot resolve dynamic runtime class concatenation or conditional multi-component class merges.
 * - Cannot compute cascaded CSS specificity overrides or media-query breakpoint rules.
 * - Cannot trace background surfaces or `opacity` inherited from distant ancestor components/portals.
 * - Native `<input type="checkbox">` without `appearance-none` renders browser/OS form chrome rather
 *   than utility border classes and is excluded from custom-checkbox border checks.
 */
function scanTsxLinesForContrast(rel, lines) {
  const unexpectedViolations = [];
  const allowlistedExceptions = [];
  const deferredOutOfScope = [];
  const lucideIcons = extractLucideIconIdentifiers(lines, rel);

  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*') || line.startsWith('{/*')) {
      return;
    }
    const nearbyContext = lines.slice(Math.max(0, idx - 25), idx + 1).join('\n');
    const { strippedLine, iconTags } = splitVerifiedSelfClosingIcons(line, lucideIcons);

    const recordFinding = (rule, token) => {
      const deferred = KNOWN_OUT_OF_SCOPE_ISSUES.find(
        (item) => item.file === rel && item.rule === rule && item.match(line)
      );
      if (deferred) {
        deferredOutOfScope.push({ file: rel, line: lineNo, rule, token, reason: deferred.reason });
      } else {
        unexpectedViolations.push({ file: rel, line: lineNo, rule, token, snippet: line });
      }
    };

    // 1a. Light slate text / placeholders on non-icon markup (`text-slate-100..400`, `placeholder:text-slate-100..400`)
    const nonIconLightSlate = strippedLine.match(/\b(?:placeholder:)?text-slate-(100|200|300|400)\b/g);
    if (nonIconLightSlate) {
      for (const token of nonIconLightSlate) {
        const isPlaceholder = token.startsWith('placeholder:');
        const isDecorativeDivider =
          !isPlaceholder &&
          token === 'text-slate-300' &&
          strippedLine === '<span className="text-slate-300" aria-hidden="true">·</span>';
        const isDarkTooltipSurface =
          !isPlaceholder &&
          rel === 'components/dashboard/AQITrendChart.tsx' &&
          nearbyContext.includes('bg-slate-900') &&
          (token === 'text-slate-300' ||
            (token === 'text-slate-400' &&
              (strippedLine.includes('Daily Average:') ||
                strippedLine.includes('Recorded Range:') ||
                strippedLine.includes('AQI'))));
        const isActiveDarkTernary =
          !isPlaceholder &&
          token === 'text-slate-300' &&
          (/\bisActive\s*\?\s*'text-slate-300'\s*:\s*'text-slate-(500|600)'/.test(strippedLine) ||
            /\bisSelected\s*\?\s*'text-slate-300'\s*:\s*'text-slate-600'/.test(strippedLine)) &&
          nearbyContext.includes('bg-slate-900');
        const isSidebarNavIconSpan =
          !isPlaceholder &&
          rel === 'components/layout/Sidebar.tsx' &&
          token === 'text-slate-400' &&
          strippedLine === "<span className={isActive ? 'text-vayu-300' : 'text-slate-400'}>{item.icon}</span>" &&
          lines.slice(Math.max(0, idx - 22), idx).some((l) => l.includes('<button')) &&
          lines.slice(idx + 1, Math.min(lines.length, idx + 4)).some((l) => l.includes('{item.label}</p>'));

        if (isDecorativeDivider || isDarkTooltipSurface || isActiveDarkTernary || isSidebarNavIconSpan) {
          allowlistedExceptions.push({ file: rel, line: lineNo, rule: 'light-slate-text', token });
        } else {
          recordFinding('light-slate-text', token);
        }
      }
    }

    // 1b. Light slate color tokens on self-closing verified Lucide icons
    for (const iconTag of iconTags) {
      const iconLightSlate = iconTag.match(/\btext-slate-(100|200|300|400)\b/g);
      if (!iconLightSlate) continue;
      for (const token of iconLightSlate) {
        const hasAriaHidden = /\baria-hidden=(?:"true"|'true'|\{true\})/.test(iconTag);
        const contextPredicates = DECORATIVE_SLATE400_ICON_CONTEXTS.get(rel) || [];
        const hasVerifiedLabelContext = contextPredicates.some((pred) =>
          pred({ iconTag, lines, idx, rel })
        );
        if (hasAriaHidden || hasVerifiedLabelContext) {
          allowlistedExceptions.push({ file: rel, line: lineNo, rule: 'light-slate-text', token });
        } else {
          recordFinding('light-slate-text', token);
        }
      }
    }

    // 2. White text over saturated -400/-500/-600 semantic backgrounds
    const satBgMatch = line.match(/\bbg-(vayu|emerald|amber|orange|teal|rose|red)-(400|500|600)\b(?!\/)/g);
    if (satBgMatch && line.includes('text-white')) {
      for (const token of satBgMatch) {
        const isVerifiedRoseBadge =
          rel === 'components/dashboard/AQIHeroCard.tsx' && token === 'bg-rose-600';
        const isCheckboxControl =
          rel === 'components/explainability/ExplainableRecommendationCard.tsx' &&
          token === 'bg-emerald-600' &&
          line.includes('border-emerald-600 text-white');
        const nextLine = (lines[idx + 1] || '').trim();
        const isIconOnlyContainer =
          rel === 'components/profile/NaturalLanguageProfileCard.tsx' &&
          token === 'bg-vayu-600' &&
          nextLine.startsWith('<Wand2 ');
        if (isVerifiedRoseBadge || isCheckboxControl || isIconOnlyContainer) {
          allowlistedExceptions.push({ file: rel, line: lineNo, rule: 'saturated-bg-with-white-text', token });
        } else {
          recordFinding('saturated-bg-with-white-text', token);
        }
      }
    }

    // 3. Light-surface weak semantic text (`text-(vayu|emerald|amber|orange|teal|rose|red)-(400|500|600)`)
    // Checked strictly on `strippedLine` so inner self-closing Lucide icons never exempt outer text/components.
    const weakSemanticMatches = strippedLine.match(/\btext-(vayu|emerald|amber|orange|teal|rose|red)-(400|500|600)\b/g);
    if (weakSemanticMatches) {
      const isNativeInputStyle = isNativeCheckboxOrRadioInputLine(lines, idx);
      for (const token of weakSemanticMatches) {
        if (isNativeInputStyle) continue;
        const isWhatChangedWhiteDelta =
          rel === 'components/explainability/WhatChangedInspector.tsx' &&
          token === 'text-rose-600' &&
          (strippedLine.includes('aqiDiff') || strippedLine.includes('scoreDiff'));
        const isDecorativeBullet =
          rel === 'components/dashboard/ExposureRiskScoreCard.tsx' &&
          token === 'text-vayu-600' &&
          strippedLine === '<span className="text-vayu-600 font-bold">•</span>';
        if (isWhatChangedWhiteDelta || isDecorativeBullet) {
          allowlistedExceptions.push({ file: rel, line: lineNo, rule: 'low-contrast-semantic-text', token });
        } else {
          recordFinding('low-contrast-semantic-text', token);
        }
      }
    }

    // 4. Input / textarea placeholder contrast requirement
    if (line.includes('placeholder=')) {
      const elementCtx = lines.slice(Math.max(0, idx - 2), Math.min(lines.length, idx + 4)).join(' ');
      if (!/placeholder:text-slate-(500|600|700|800|900)/.test(elementCtx)) {
        recordFinding('unstyled-input-placeholder', 'placeholder=');
      }
    }

    // 5. Custom checkbox / toggle UI borders below 4.5:1 (`border-slate-200..400` or `text-slate-300..400`)
    const isCustomToggle =
      (/\<Circle\b/.test(line) && /\btext-slate-(300|400)\b/.test(line)) ||
      (line.includes('appearance-none') && /\bborder-slate-(200|300|400)\b/.test(line));
    if (isCustomToggle) {
      recordFinding('low-contrast-custom-checkbox', line);
    }

    // 6. Unconditional container/element opacity dimming (`opacity-10..90` without disabled/hover/focus prefix)
    const opacityMatches = line.match(/(?<![:\w-])opacity-(10|20|25|30|40|50|60|70|75|80|90)\b/g);
    if (opacityMatches) {
      for (const token of opacityMatches) {
        const isNonTextSwatch =
          rel === 'components/dashboard/AQITrendChart.tsx' &&
          line.includes('<span className="w-3 h-3 rounded-sm bg-slate-300 opacity-60" />');
        if (isNonTextSwatch) {
          allowlistedExceptions.push({ file: rel, line: lineNo, rule: 'parent-opacity-dimming', token });
        } else {
          recordFinding('parent-opacity-dimming', token);
        }
      }
    }

    // 7. Translucent foreground text tokens (`text-white/70`, `text-slate-600/60`, etc.)
    const translucentTextMatches = strippedLine.match(/\btext-(?:white|black|[a-z]+-[0-9]+)\/[0-9]+\b/g);
    if (translucentTextMatches) {
      for (const token of translucentTextMatches) {
        recordFinding('low-opacity-text-token', token);
      }
    }
  });

  return { unexpectedViolations, allowlistedExceptions, deferredOutOfScope };
}

/** Run static contrast token checks across every `.tsx` file under `rootDir`. */
function scanApplicationContrastTokens(rootDir) {
  const tsxFiles = collectTsxFiles(rootDir);
  const unexpectedViolations = [];
  const allowlistedExceptions = [];
  const deferredOutOfScope = [];

  for (const fullPath of tsxFiles) {
    const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/');
    const lines = fs.readFileSync(fullPath, 'utf-8').split(/\r?\n/);
    const fileResult = scanTsxLinesForContrast(rel, lines);
    unexpectedViolations.push(...fileResult.unexpectedViolations);
    allowlistedExceptions.push(...fileResult.allowlistedExceptions);
    deferredOutOfScope.push(...fileResult.deferredOutOfScope);
  }

  return { tsxFiles, unexpectedViolations, allowlistedExceptions, deferredOutOfScope };
}

test('Phase 3.6 Batch D: Header Updating status contrast & strict contrast.mjs thresholds', () => {
  // 1. Render Header in busy & idle states and confirm Updating… reaches >= 4.5:1 on bg-white/95 backdrop
  const { Header } = loadTsxComponent('components/layout/Header.tsx', {
    '../../services/aqiService': { searchCities: async () => [], PRESET_CITY_SUGGESTIONS: [] },
  });
  const baseProps = {
    currentLocation: { label: 'Delhi, India', query: 'delhi' },
    onLocationChange: () => {},
    selectedPreset: 'default',
    onPresetChange: () => {},
    onRefresh: () => {},
    isLoading: true,
    isRefreshing: false,
    isBackendConnected: true,
    lastFetched: null,
    onOpenMobileMenu: () => {},
    profiles: { default: { id: 'default', name: 'General Family' } },
    isDemoMode: false,
    onToggleDemoMode: () => {},
  };
  const busyHtml = renderToStaticMarkup(React.createElement(Header, baseProps));
  const idleHtml = renderToStaticMarkup(React.createElement(Header, { ...baseProps, isLoading: false }));

  assert.ok(
    busyHtml.includes('text-vayu-700 font-medium animate-pulse') && busyHtml.includes('Updating…'),
    'Header Updating… status must use compliant text-vayu-700 with preserved animation and label'
  );
  assert.ok(
    !busyHtml.includes('text-vayu-600 font-medium animate-pulse'),
    'Header Updating… status must not regress to low-contrast text-vayu-600'
  );
  assert.ok(!idleHtml.includes('Updating…'), 'Idle Header must not render Updating… indicator');
  assert.ok(
    busyHtml.includes('aria-expanded="false"') &&
      busyHtml.includes('aria-label="Change monitoring location. Current: Delhi, India"'),
    'Header location selector trigger accessibility attributes must remain intact'
  );
  const headerSource = fs.readFileSync(path.join(srcDir, 'components', 'layout', 'Header.tsx'), 'utf-8');
  assert.ok(
    headerSource.includes('role="combobox"') &&
      headerSource.includes('aria-autocomplete="list"') &&
      headerSource.includes('aria-activedescendant='),
    'Header combobox and search markup must remain intact'
  );

  const headerCanvasBg = contrastBlendHex('#ffffff', '#f8fafc', 0.95);
  const headerUpdatingRatio = parseFloat(contrastRatioFromScript('#0f766e', headerCanvasBg));
  assert.ok(
    headerUpdatingRatio >= 4.5,
    `Header Updating… (#0f766e on bg-white/95 ${headerCanvasBg}) must be >= 4.5:1, got ${headerUpdatingRatio}:1`
  );

  // 2. Verify every contrast.mjs entry carries an explicit threshold and rejects omitted thresholds
  assert.ok(contrastPairs.length >= 88, `Expected at least 88 explicit contrast pairs, found ${contrastPairs.length}`);
  for (const entry of contrastPairs) {
    assert.ok(entry.length >= 4 && typeof entry[3] === 'number', `Entry missing explicit threshold: ${entry[0]}`);
    const result = evaluateContrastPair(entry);
    assert.equal(result.ok, true, `Contrast pair failed (${result.desc}): ${result.cr}:1 < ${result.minRatio}:1`);
  }
  assert.equal(runContrastSuite(contrastPairs, null), true, 'Full contrast.mjs suite must pass with explicit thresholds');

  assert.throws(
    () => evaluateContrastPair(['Missing threshold regression check', '#0f766e', '#ffffff']),
    /Missing explicit WCAG contrast threshold/
  );
  assert.throws(
    () => evaluateContrastPair(['Non-numeric threshold regression check', '#0f766e', '#ffffff', undefined]),
    /Invalid explicit WCAG contrast threshold/
  );
  assert.equal(
    runContrastSuite([['Sub-4.5 normal text must fail loudly', '#94a3b8', '#ffffff', 4.5]], null),
    false
  );

  // Verify legacy failing pair was replaced and Header Batch D + dark tooltip pairs exist
  assert.ok(
    !contrastPairs.some(([desc]) => desc.includes('Rose-600 #e11d48 on Slate-50 #f8fafc')),
    'Legacy failing Rose-600 on Slate-50 (4.49:1) pair must be replaced'
  );
  assert.ok(
    contrastPairs.some(([desc, , , ratio]) => desc.includes('Rose-600 #e11d48 on White #ffffff') && ratio === 4.5),
    'Replaced Rose-600 on White pair must enforce 4.5:1'
  );
  assert.ok(
    contrastPairs.some(([desc, , , ratio]) => desc.includes('Header Updating status') && ratio === 4.5),
    'Header Updating status regression pair must be registered in contrast.mjs with 4.5:1 threshold'
  );
  assert.ok(
    contrastPairs.some(([desc, fg, bg, ratio]) => desc.includes('dark tooltip') && fg === '#94a3b8' && bg === '#0f172a' && ratio === 4.5),
    'Dark tooltip Slate-400 on Slate-900 pair must remain intact with 4.5:1 threshold'
  );
});

test('Phase 3.6 Batch D: Application-wide contrast token scanner across all TSX components', () => {
  const { tsxFiles, unexpectedViolations, allowlistedExceptions, deferredOutOfScope } = scanApplicationContrastTokens(srcDir);

  assert.equal(tsxFiles.length, 26, `Expected full coverage of all 26 .tsx files in frontend/src, scanned ${tsxFiles.length}`);
  assert.ok(
    deferredOutOfScope.length <= 1,
    `Unexpected growth in deferred out-of-scope contrast findings: ${JSON.stringify(deferredOutOfScope)}`
  );
  assert.ok(
    allowlistedExceptions.length > 0 && allowlistedExceptions.every((e) => e.file && e.rule && e.token),
    'Expected documented narrow allowlisted exceptions with explicit rule metadata'
  );
  assert.deepEqual(
    unexpectedViolations,
    [],
    `Found unexpected contrast token violations across application TSX files:\n${unexpectedViolations
      .map((v) => `${v.file}:${v.line} [${v.rule}] ${v.token} :: ${v.snippet}`)
      .join('\n')}`
  );

  // Negative self-checks: original 7 rule checks + Phase 3.6.2 false-negative hardening checks
  const syntheticSamples = [
    ['components/layout/Header.tsx', ['<span className="text-vayu-600 font-medium animate-pulse">Updating…</span>'], 'low-contrast-semantic-text'],
    ['components/layout/Header.tsx', ['<p className="text-slate-400">New unapproved caption</p>'], 'light-slate-text'],
    ['components/profile/Example.tsx', ['<input placeholder="City" className="border-slate-300" />'], 'unstyled-input-placeholder'],
    ['components/dashboard/Example.tsx', ['<span className="bg-emerald-600 text-white">Low contrast pill</span>'], 'saturated-bg-with-white-text'],
    ['components/explainability/Example.tsx', ['<Circle className="w-4 h-4 text-slate-400" />'], 'low-contrast-custom-checkbox'],
    ['components/dashboard/PollutantBreakdown.tsx', ['<div className="p-3 opacity-60">Dimmed card</div>'], 'parent-opacity-dimming'],
    ['components/profile/Example.tsx', ['<span className="text-white/70">Translucent text</span>'], 'low-opacity-text-token'],
    // Phase 3.6.2 hardened false-negative checks:
    ['components/dashboard/Example.tsx', ["import { Badge } from '../common/Badge';", '<Badge className="text-vayu-600">Meaningful text</Badge>'], 'low-contrast-semantic-text'],
    ['components/dashboard/Example.tsx', ["import { Info } from 'lucide-react';", '<span className="text-rose-500"><Info />Alert message</span>'], 'low-contrast-semantic-text'],
    ['components/dashboard/Example.tsx', ["import { Info } from 'lucide-react';", '<span className="text-rose-500"><Info className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />Alert message</span>'], 'low-contrast-semantic-text'],
    ['components/dashboard/Example.tsx', ["import { Info } from 'lucide-react';", '<span className="text-slate-400"><Info className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />Alert message</span>'], 'light-slate-text'],
    ['components/profile/Example.tsx', ["import { Info } from 'lucide-react';", '<InteractiveButton className="text-amber-600 focus:ring-2 border-slate-300" onClick={() => {}}><Info className="w-4 h-4" />Inspect</InteractiveButton>'], 'low-contrast-semantic-text'],
    ['components/dashboard/Example.tsx', ['<Badge aria-hidden="true" className="text-slate-400">Text</Badge>'], 'light-slate-text'],
    ['components/dashboard/AQITrendChart.tsx', ["import { Info } from 'lucide-react';", '<Info className="w-8 h-8 text-slate-400 mx-auto mb-2" />'], 'light-slate-text'],
    ['components/layout/Header.tsx', ["import { Search, Calendar } from 'lucide-react';", '<button><Search className="w-4 h-4 text-slate-400" /></button>'], 'light-slate-text'],
    ['components/layout/Header.tsx', ["import { Calendar } from 'lucide-react';", '<div><Calendar className="w-3.5 h-3.5 text-slate-400" /></div>'], 'light-slate-text'],
    ['components/explainability/WhatChangedInspector.tsx', ["import { XCircle } from 'lucide-react';", '<XCircle className="w-3.5 h-3.5 text-slate-400" />'], 'light-slate-text'],
  ];
  for (const [sampleFile, sampleLines, expectedRule] of syntheticSamples) {
    const res = scanTsxLinesForContrast(sampleFile, sampleLines);
    assert.ok(
      res.unexpectedViolations.some((v) => v.rule === expectedRule),
      `Scanner failed to flag synthetic ${expectedRule} regression in ${sampleFile}: ${sampleLines.join(' ')}`
    );
  }
});
