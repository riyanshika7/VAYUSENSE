import test from 'node:test';
import assert from 'node:assert/strict';

// Helper for safe URL validation
function isSafeUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

// Preset city suggestions
const PRESET_CITY_SUGGESTIONS = [
  { name: 'Jalandhar, Punjab', city: 'Jalandhar', state: 'Punjab', feedQuery: 'jalandhar' },
  { name: 'Delhi (Mandir Marg / Central)', city: 'Delhi', state: 'Delhi NCR', feedQuery: 'delhi' },
  { name: 'Mumbai (Bandra / Western)', city: 'Mumbai', state: 'Maharashtra', feedQuery: 'mumbai' },
  { name: 'Bengaluru (BTM Layout / South)', city: 'Bengaluru', state: 'Karnataka', feedQuery: 'bengaluru' },
  { name: 'Kolkata (Victoria / Central)', city: 'Kolkata', state: 'West Bengal', feedQuery: 'kolkata' },
  { name: 'Lucknow (Talkatora / Central)', city: 'Lucknow', state: 'Uttar Pradesh', feedQuery: 'lucknow' },
];

test('URL Security: isSafeUrl allows only HTTP and HTTPS protocols and rejects malformed URLs', () => {
  assert.equal(isSafeUrl('https://aqicn.org/city/delhi'), true);
  assert.equal(isSafeUrl('http://cpcb.nic.in'), true);
  assert.equal(isSafeUrl('javascript:alert(1)'), false);
  assert.equal(isSafeUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(isSafeUrl('file:///etc/passwd'), false);
  assert.equal(isSafeUrl('https://'), false);
  assert.equal(isSafeUrl('http://'), false);
  assert.equal(isSafeUrl(''), false);
  assert.equal(isSafeUrl(null), false);
  assert.equal(isSafeUrl(undefined), false);
});

test('City Search: Preset suggestions contain official 6 Indian hubs', () => {
  assert.equal(PRESET_CITY_SUGGESTIONS.length, 6);
  const cities = PRESET_CITY_SUGGESTIONS.map(c => c.feedQuery);
  assert.ok(cities.includes('delhi'));
  assert.ok(cities.includes('mumbai'));
  assert.ok(cities.includes('bengaluru'));
  assert.ok(cities.includes('kolkata'));
  assert.ok(cities.includes('lucknow'));
  assert.ok(cities.includes('jalandhar'));
});

test('Household Presets: Validate structure and vulnerability fields', () => {
  const commuter = {
    profile_name: 'Daily Two-Wheeler Commuters',
    num_adults: 2,
    children_ages: [],
    num_older_adults: 0,
    has_asthma_or_respiratory_vulnerability: false,
    has_respiratory_sensitivity: false,
    commute_habits: { is_daily_commuter: true, primary_mode: 'two_wheeler', estimated_daily_commute_minutes: 45 },
  };

  const family = {
    profile_name: 'Family with Young Children',
    num_adults: 2,
    children_ages: [5],
    num_older_adults: 0,
    has_asthma_or_respiratory_vulnerability: false,
    has_respiratory_sensitivity: false,
    has_outdoor_child_play: true,
  };

  const senior = {
    profile_name: 'Senior-Sensitive Household',
    num_adults: 0,
    children_ages: [],
    num_older_adults: 1,
    has_asthma_or_respiratory_vulnerability: true,
    has_respiratory_sensitivity: true,
    has_limited_mobility: true,
  };

  assert.equal(commuter.commute_habits.primary_mode, 'two_wheeler');
  assert.equal(family.children_ages[0], 5);
  assert.equal(senior.has_asthma_or_respiratory_vulnerability, true);
  assert.equal(senior.num_older_adults, 1);
});

test('API Response Parser: Safe error message extraction', async () => {
  async function parseResponse(res, fallbackAction) {
    if (!res.ok) {
      const errorData = (await res.json().catch(() => ({})));
      throw new Error(errorData.detail || `${fallbackAction}: HTTP ${res.status}`);
    }
    return res.json();
  }

  // Test successful resolution
  const mockSuccessRes = {
    ok: true,
    status: 200,
    json: async () => ({ status: 'healthy', provider: 'WAQI' }),
  };
  const successData = await parseResponse(mockSuccessRes, 'Health check failed');
  assert.equal(successData.status, 'healthy');

  // Test failed resolution with error detail
  const mockErrorRes = {
    ok: false,
    status: 400,
    json: async () => ({ detail: 'Invalid location specified' }),
  };
  await assert.rejects(
    async () => parseResponse(mockErrorRes, 'Query failed'),
    { message: 'Invalid location specified' }
  );

  // Test failed resolution with fallback message
  const mockFallbackRes = {
    ok: false,
    status: 502,
    json: async () => { throw new Error('Unparseable'); },
  };
  await assert.rejects(
    async () => parseResponse(mockFallbackRes, 'WAQI upstream unavailable'),
    { message: 'WAQI upstream unavailable: HTTP 502' }
  );

  // Test empty json error detail fallback
  const mockEmptyDetailRes = {
    ok: false,
    status: 500,
    json: async () => ({}),
  };
  await assert.rejects(
    async () => parseResponse(mockEmptyDetailRes, 'Server error'),
    { message: 'Server error: HTTP 500' }
  );
});

// ─── Cache TTL & Freshness Engine Tests ─────────────────────────────────────────

test('Cache Engine: Status transition across TTL thresholds', () => {
  const CACHE_FRESH_MS = 5 * 60 * 1000;  // 5 min
  const CACHE_STALE_MS = 30 * 60 * 1000; // 30 min

  function computeCacheStatus(fetchedAt, now = Date.now()) {
    const age = now - fetchedAt;
    if (age < CACHE_FRESH_MS) return 'fresh';
    if (age < CACHE_STALE_MS) return 'stale';
    return 'expired';
  }

  const baseNow = 1763700000000;

  // Fresh: 1 minute old
  assert.equal(computeCacheStatus(baseNow - 60 * 1000, baseNow), 'fresh');
  // Fresh boundary: 4 min 59 sec
  assert.equal(computeCacheStatus(baseNow - (CACHE_FRESH_MS - 1000), baseNow), 'fresh');

  // Stale: exactly 5 min old
  assert.equal(computeCacheStatus(baseNow - CACHE_FRESH_MS, baseNow), 'stale');
  // Stale: 15 min old
  assert.equal(computeCacheStatus(baseNow - 15 * 60 * 1000, baseNow), 'stale');
  // Stale boundary: 29 min 59 sec
  assert.equal(computeCacheStatus(baseNow - (CACHE_STALE_MS - 1000), baseNow), 'stale');

  // Expired: exactly 30 min old
  assert.equal(computeCacheStatus(baseNow - CACHE_STALE_MS, baseNow), 'expired');
  // Expired: 2 hours old
  assert.equal(computeCacheStatus(baseNow - 2 * 60 * 60 * 1000, baseNow), 'expired');
});

test('Cache Engine: Cache key normalization handles case and whitespace', () => {
  function cacheKey(location) {
    return (location || '').toLowerCase().trim();
  }

  assert.equal(cacheKey('Delhi'), 'delhi');
  assert.equal(cacheKey('  MUMBAI  '), 'mumbai');
  assert.equal(cacheKey('@7024'), '@7024');
  assert.equal(cacheKey(' Bengaluru \n'), 'bengaluru');
  assert.equal(cacheKey(''), '');
});

// ─── Profile Storage & Preset Invariant Tests ──────────────────────────────────

test('Profile Store: Fallback to default presets on corrupted storage', () => {
  const BUILTIN_PRESET_IDS = ['daily_commuter', 'family', 'senior_sensitive'];

  function readStoreMock(storedRaw) {
    try {
      if (!storedRaw) return { profiles: { daily_commuter: true, family: true, senior_sensitive: true }, activeId: 'daily_commuter' };
      const parsed = JSON.parse(storedRaw);
      if (!parsed.profiles || !parsed.activeId) throw new Error('Invalid schema');
      return parsed;
    } catch {
      return { profiles: { daily_commuter: true, family: true, senior_sensitive: true }, activeId: 'daily_commuter' };
    }
  }

  // Null storage
  const defaultStore = readStoreMock(null);
  assert.equal(defaultStore.activeId, 'daily_commuter');
  assert.equal(Object.keys(defaultStore.profiles).length, 3);

  // Corrupted JSON syntax
  const corruptStore = readStoreMock('{corrupted_json:');
  assert.equal(corruptStore.activeId, 'daily_commuter');

  // Incomplete schema (missing activeId)
  const incompleteStore = readStoreMock(JSON.stringify({ profiles: {} }));
  assert.equal(incompleteStore.activeId, 'daily_commuter');

  // Valid storage
  const validStore = readStoreMock(JSON.stringify({
    profiles: { custom_1: { profile_name: 'Custom Home' } },
    activeId: 'custom_1',
  }));
  assert.equal(validStore.activeId, 'custom_1');
  assert.ok(validStore.profiles.custom_1);
});
