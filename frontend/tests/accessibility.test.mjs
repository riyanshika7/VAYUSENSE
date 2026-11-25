import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

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
