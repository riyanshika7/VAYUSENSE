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

/**
 * Transpile and execute a real TypeScript module under `frontend/src` with relative TS resolution.
 * Replaces `import.meta.env` for Node CommonJS execution so service modules run without bundler shims.
 */
function loadTsModule(relPath, customMocks = {}, cache = new Map()) {
  const fullPath = path.resolve(srcDir, relPath);
  if (cache.has(fullPath)) return cache.get(fullPath).exports;

  const source = fs
    .readFileSync(fullPath, 'utf-8')
    .replace(/import\.meta\.env/g, '(globalThis.__VAYU_TEST_ENV__ || {})');

  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  });

  const mod = { exports: {} };
  cache.set(fullPath, mod);

  const resolvedMocks = {
    react: React,
    'react/jsx-runtime': ReactJSXRuntime,
    'lucide-react': lucideStub,
    ...customMocks,
  };

  const customRequire = (specifier) => {
    if (specifier in resolvedMocks) return resolvedMocks[specifier];
    if (specifier.startsWith('.')) {
      const base = path.resolve(path.dirname(fullPath), specifier);
      const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];
      const match = candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
      if (match) {
        return loadTsModule(path.relative(srcDir, match), customMocks, cache);
      }
    }
    return require(specifier);
  };

  const fn = new Function('exports', 'require', 'module', outputText);
  fn(mod.exports, customRequire, mod);
  return mod.exports;
}

function createMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, val) {
      store.set(key, String(val));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

test('URL Security: AQIHeroCard.isSafeUrl allows only HTTP and HTTPS URLs and rejects unsafe schemes', () => {
  const { isSafeUrl } = loadTsModule('components/dashboard/AQIHeroCard.tsx');

  assert.equal(isSafeUrl('https://aqicn.org/city/delhi'), true);
  assert.equal(isSafeUrl('http://cpcb.nic.in'), true);
  assert.equal(isSafeUrl('javascript:alert(1)'), false);
  assert.equal(isSafeUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(isSafeUrl('file:///etc/passwd'), false);
  assert.equal(isSafeUrl('https://'), false);
  assert.equal(isSafeUrl(''), false);
  assert.equal(isSafeUrl(null), false);
  assert.equal(isSafeUrl(undefined), false);
});

test('URL Security (SSR): AQIHeroCard omits javascript: hrefs while rendering HTTPS attribution links', () => {
  const { AQIHeroCard } = loadTsModule('components/dashboard/AQIHeroCard.tsx');

  const html = renderToStaticMarkup(
    React.createElement(AQIHeroCard, {
      aqiData: {
        location_name: 'Delhi',
        station_name: 'Mandir Marg',
        aqi: 182,
        classification: {
          category: 'Unhealthy',
          color_hex: '#e11d48',
          health_implications: 'Sensitive groups at elevated risk.',
          scale_name: 'WAQI / US EPA Standard',
          methodology_note: 'Standard US EPA breakpoints.',
        },
        pollutants: {},
        weather: {},
        attributions: [
          { name: 'Trusted WAQI', url: 'https://aqicn.org/city/delhi' },
          { name: 'Malicious Source', url: 'javascript:alert(1)' },
        ],
        data_freshness: 'Live (<1h)',
        is_fallback: false,
      },
    })
  );

  assert.ok(html.includes('href="https://aqicn.org/city/delhi"'), 'Safe HTTPS attribution link must render');
  assert.ok(!html.includes('javascript:alert(1)'), 'Unsafe javascript: attribution URL must never render');
  assert.ok(html.includes('Malicious Source'), 'Unsafe source label falls back cleanly without href');
});

test('City Search (aqiService.ts): PRESET_CITY_SUGGESTIONS contains the 6 official hubs', () => {
  const { PRESET_CITY_SUGGESTIONS } = loadTsModule('services/aqiService.ts');

  assert.equal(PRESET_CITY_SUGGESTIONS.length, 6);
  const cities = PRESET_CITY_SUGGESTIONS.map((c) => c.query);
  for (const expected of ['delhi', 'mumbai', 'bengaluru', 'kolkata', 'lucknow', 'jalandhar']) {
    assert.ok(cities.includes(expected), `Missing preset city ${expected}`);
  }
});

test('City Search (aqiService.ts): searchCities bypasses network for blanks and maps station IDs', async () => {
  const prevFetch = globalThis.fetch;
  try {
    const { searchCities } = loadTsModule('services/aqiService.ts');

    globalThis.fetch = async () => {
      throw new Error('fetch should not be called for empty query');
    };
    const blankRes = await searchCities('   ');
    assert.equal(blankRes.length, 6);

    let capturedUrl = '';
    globalThis.fetch = async (url) => {
      capturedUrl = String(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            { station_id: 7024, station_name: 'Mandir Marg, Delhi', aqi: 182 },
            { station_id: 8011, station_name: 'Anand Vihar, Delhi', aqi: null },
          ],
        }),
      };
    };

    const liveResults = await searchCities('Mandir Marg');
    assert.equal(capturedUrl, '/api/aqi/search?q=Mandir%20Marg');
    assert.deepEqual(liveResults, [
      { query: '@7024', label: 'Mandir Marg, Delhi', aqi: 182, isPreset: false },
      { query: '@8011', label: 'Anand Vihar, Delhi', aqi: null, isPreset: false },
    ]);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('API Client (api.ts): builds query strings and parses JSON error details with HTTP fallbacks', async () => {
  const prevFetch = globalThis.fetch;
  try {
    const { parseResponse, fetchHealth, fetchLiveAQI, fetchAIPlan } = loadTsModule('services/api.ts');

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'healthy', provider_token_configured: true, gemini_configured: true }),
    });
    const health = await fetchHealth();
    assert.equal(health.status, 'healthy');

    let lastUrl = '';
    let lastInit = null;
    globalThis.fetch = async (url, init) => {
      lastUrl = String(url);
      lastInit = init || null;
      return { ok: true, status: 200, json: async () => ({ aqi: 120 }) };
    };
    await fetchLiveAQI('mumbai');
    assert.equal(lastUrl, '/api/aqi?location=mumbai');
    await fetchLiveAQI(undefined, 28.61, 77.21);
    assert.equal(lastUrl, '/api/aqi?lat=28.61&lon=77.21');
    await fetchAIPlan({ preset_name: 'family', location: 'delhi' });
    assert.equal(lastUrl, '/api/ai/plan');
    assert.equal(lastInit.method, 'POST');

    await assert.rejects(
      () =>
        parseResponse(
          { ok: false, status: 400, json: async () => ({ detail: 'Invalid location specified' }) },
          'Query failed'
        ),
      { message: 'Invalid location specified' }
    );
    await assert.rejects(
      () =>
        parseResponse(
          { ok: false, status: 502, json: async () => { throw new Error('Malformed JSON'); } },
          'WAQI upstream unavailable'
        ),
      { message: 'WAQI upstream unavailable: HTTP 502' }
    );
    await assert.rejects(
      () =>
        parseResponse(
          { ok: false, status: 500, json: async () => ({}) },
          'Server error'
        ),
      { message: 'Server error: HTTP 500' }
    );
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('Cache Engine (aqiService.ts): TTL transitions across fresh, stale, expired, and normalized keys', async () => {
  const prevFetch = globalThis.fetch;
  const prevNow = Date.now;
  let clock = 1763700000000;
  Date.now = () => clock;

  try {
    const aqiService = loadTsModule('services/aqiService.ts');
    aqiService.clearAllCache();

    let networkCalls = 0;
    globalThis.fetch = async (url) => {
      networkCalls++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          location_name: String(url),
          station_name: 'Station',
          aqi: 150 + networkCalls,
        }),
      };
    };

    const first = await aqiService.fetchAQIWithCache('  Delhi  ');
    assert.equal(first.cacheStatus, 'fresh');
    assert.equal(networkCalls, 1);

    clock += 4 * 60 * 1000;
    const cached = await aqiService.fetchAQIWithCache('DELHI');
    assert.equal(cached.data.aqi, first.data.aqi);
    assert.equal(cached.cacheStatus, 'fresh');
    assert.equal(networkCalls, 1);

    clock += 6 * 60 * 1000; // +10 min total
    assert.equal(aqiService.getCachedEntry('delhi').cacheStatus, 'stale');

    clock += 21 * 60 * 1000; // +31 min total (> 30 min)
    const refetched = await aqiService.fetchAQIWithCache('delhi');
    assert.equal(networkCalls, 2);
    assert.equal(refetched.cacheStatus, 'fresh');
  } finally {
    globalThis.fetch = prevFetch;
    Date.now = prevNow;
  }
});

test('Cache Engine (aqiService.ts): forceRefresh, AbortSignal cancellation, and invalidation', async () => {
  const prevFetch = globalThis.fetch;
  try {
    const aqiService = loadTsModule('services/aqiService.ts');
    aqiService.clearAllCache();

    let networkCalls = 0;
    globalThis.fetch = async () => {
      networkCalls++;
      return { ok: true, status: 200, json: async () => ({ aqi: 100 + networkCalls }) };
    };

    await aqiService.fetchAQIWithCache('delhi');
    const forced = await aqiService.fetchAQIWithCache('delhi', { forceRefresh: true });
    assert.equal(networkCalls, 2);
    assert.equal(forced.data.aqi, 102);

    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      () => aqiService.fetchAQIWithCache('mumbai', { signal: controller.signal }),
      { name: 'AbortError' }
    );
    assert.equal(aqiService.getCachedEntry('mumbai'), null);

    aqiService.invalidateCache('Delhi');
    assert.equal(aqiService.getCachedEntry('delhi'), null);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('Profile Store (profileService.ts): recovers corrupt/incomplete schema, guards builtins, merges fields, and parses NL', async () => {
  const prevStorage = globalThis.localStorage;
  const prevFetch = globalThis.fetch;

  try {
    globalThis.localStorage = createMemoryStorage();
    const profileService = loadTsModule('services/profileService.ts');

    assert.equal(profileService.getActiveId(), 'daily_commuter');
    assert.equal(Object.keys(profileService.getAllProfiles()).length, 3);

    globalThis.localStorage.setItem('vayusense_profiles', '{corrupt-json');
    assert.equal(profileService.getActiveId(), 'daily_commuter');

    // Partial JSON missing activeId recovers cleanly rather than returning undefined
    globalThis.localStorage.setItem('vayusense_profiles', JSON.stringify({ profiles: {} }));
    assert.equal(profileService.getActiveId(), 'daily_commuter');
    assert.equal(profileService.getActiveProfile().profile_name, profileService.BUILTIN_PRESETS.daily_commuter.profile_name);

    const custom = { ...profileService.BUILTIN_PRESETS.family, profile_name: 'Custom Home' };
    profileService.saveProfile('custom_1', custom);
    profileService.setActiveId('custom_1');
    assert.equal(profileService.getActiveId(), 'custom_1');
    assert.equal(profileService.getActiveProfile().profile_name, 'Custom Home');

    profileService.deleteProfile('daily_commuter');
    assert.ok(profileService.getAllProfiles().daily_commuter, 'Builtin preset must not be deletable');

    profileService.deleteProfile('custom_1');
    assert.equal(profileService.getActiveId(), 'daily_commuter');

    const merged = profileService.mergeParsedFields(profileService.BUILTIN_PRESETS.daily_commuter, {
      num_older_adults: 2,
      has_asthma_or_respiratory_vulnerability: true,
      commute_minutes: 75,
      has_air_purifier: true,
      confidence: 0.9,
    });
    assert.equal(merged.num_older_adults, 2);
    assert.equal(merged.has_asthma_or_respiratory_vulnerability, true);
    assert.equal(merged.commute_habits.estimated_daily_commute_minutes, 75);
    assert.equal(merged.purifier_setup.has_air_purifier, true);
    assert.equal(merged.num_adults, profileService.BUILTIN_PRESETS.daily_commuter.num_adults);

    globalThis.fetch = async () => ({
      ok: false,
      status: 429,
      json: async () => ({ detail: 'Too many requests.' }),
    });
    await assert.rejects(() => profileService.parseNLDescription('Two adults in Delhi with asthma'), {
      message: 'Too many requests.',
    });
  } finally {
    globalThis.localStorage = prevStorage;
    globalThis.fetch = prevFetch;
  }
});
