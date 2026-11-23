import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.join(__dirname, '..', 'src');

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
});
