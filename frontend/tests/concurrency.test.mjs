import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Concurrency test harness modeling the exact request sequence guard
 * implemented in frontend/src/App.tsx (planRequestIdRef & loadPersonalizedIntelligence).
 */
function createIntelligenceCoordinator() {
  const planRequestIdRef = { current: 0 };
  const state = {
    riskAssessment: null,
    ruleRecommendations: null,
    aiPlan: null,
    aiPlanStatus: 'idle',
    appliedRulesRequests: [],
    appliedPlanRequests: [],
    droppedPhase1Count: 0,
    droppedPhase2Count: 0,
    droppedErrorCount: 0,
  };

  async function loadPersonalizedIntelligence({
    tag,
    profile,
    location,
    fetchRulesFn,
    fetchPlanFn,
  }) {
    const requestId = ++planRequestIdRef.current;
    state.aiPlanStatus = 'loading';

    try {
      // 1. Fetch deterministic risk assessment and rule recommendations
      const rulesResponse = await fetchRulesFn({ profile, location });

      // Drop response if a newer request was dispatched while waiting
      if (requestId !== planRequestIdRef.current) {
        state.droppedPhase1Count++;
        return;
      }

      state.riskAssessment = rulesResponse.risk_assessment;
      state.ruleRecommendations = rulesResponse.recommendations;
      state.appliedRulesRequests.push({ tag, requestId, score: rulesResponse.risk_assessment.exposure_risk_score });

      // 2. Fetch Gemini AI personalized plan
      const plan = await fetchPlanFn({ profile, location });

      if (requestId !== planRequestIdRef.current) {
        state.droppedPhase2Count++;
        return;
      }

      state.aiPlan = plan;
      state.aiPlanStatus = 'success';
      state.appliedPlanRequests.push({ tag, requestId, planId: plan.plan_id });
    } catch (err) {
      if (requestId !== planRequestIdRef.current) {
        state.droppedErrorCount++;
        return;
      }
      state.aiPlanStatus = 'error';
    }
  }

  return { planRequestIdRef, state, loadPersonalizedIntelligence };
}

// Helper to simulate asynchronous network latency
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Test 1: Out-of-order resolution (A starts first, B starts second, B resolves first, A resolves last) ──

test('Sequence Guard: Slow Request A does not overwrite faster Request B state when resolving out-of-order', async () => {
  const { state, loadPersonalizedIntelligence } = createIntelligenceCoordinator();

  // Request A: Slow network call (50ms rules, 50ms plan = 100ms total)
  const promiseA = loadPersonalizedIntelligence({
    tag: 'Request-A-Delhi-DailyCommuter',
    profile: { profile_name: 'Daily Commuter' },
    location: 'delhi',
    fetchRulesFn: async () => {
      await delay(50);
      return {
        risk_assessment: { exposure_risk_score: 42.5 },
        recommendations: [{ action: 'Commuter Morning Recirculate' }],
      };
    },
    fetchPlanFn: async () => {
      await delay(50);
      return { plan_id: 'plan_delhi_commuter_v1', summary: 'Delhi Commuter Plan' };
    },
  });

  // Small gap before user switches to Household B
  await delay(10);

  // Request B: Fast network call (10ms rules, 10ms plan = 20ms total)
  const promiseB = loadPersonalizedIntelligence({
    tag: 'Request-B-Mumbai-SeniorSensitive',
    profile: { profile_name: 'Senior Sensitive' },
    location: 'mumbai',
    fetchRulesFn: async () => {
      await delay(10);
      return {
        risk_assessment: { exposure_risk_score: 88.0 },
        recommendations: [{ action: 'Senior Clean Sanctuary Room' }],
      };
    },
    fetchPlanFn: async () => {
      await delay(10);
      return { plan_id: 'plan_mumbai_senior_v1', summary: 'Mumbai Senior Plan' };
    },
  });

  // Await both promises to settle
  await Promise.all([promiseA, promiseB]);

  // Request B finished first (~30ms total time), Request A finished last (~100ms total time).
  // Request A must be dropped and MUST NOT overwrite Request B!
  assert.equal(state.riskAssessment.exposure_risk_score, 88.0, 'Risk score must be from latest Request B');
  assert.equal(state.aiPlan.plan_id, 'plan_mumbai_senior_v1', 'AI Plan must be from latest Request B');
  assert.equal(state.aiPlanStatus, 'success');

  // Verify only Request B was applied to state
  assert.equal(state.appliedRulesRequests.length, 1);
  assert.equal(state.appliedRulesRequests[0].tag, 'Request-B-Mumbai-SeniorSensitive');
  assert.equal(state.appliedPlanRequests.length, 1);
  assert.equal(state.appliedPlanRequests[0].tag, 'Request-B-Mumbai-SeniorSensitive');

  // Verify Request A was intercepted and dropped at Phase 1
  assert.equal(state.droppedPhase1Count, 1);
});

// ── Test 2: In-order sequential resolution (A starts, B starts, A resolves first, B resolves second) ──

test('Sequence Guard: In-order resolution correctly allows latest Request B to succeed Request A', async () => {
  const { state, loadPersonalizedIntelligence } = createIntelligenceCoordinator();

  // Request A: Fast call (10ms)
  const promiseA = loadPersonalizedIntelligence({
    tag: 'Request-A',
    profile: { profile_name: 'Persona A' },
    location: 'city_a',
    fetchRulesFn: async () => {
      await delay(10);
      return {
        risk_assessment: { exposure_risk_score: 30.0 },
        recommendations: [{ action: 'Action A' }],
      };
    },
    fetchPlanFn: async () => {
      await delay(10);
      return { plan_id: 'plan_A', summary: 'Plan A' };
    },
  });

  // Request B: Dispatched shortly after, takes slightly longer (30ms)
  await delay(5);
  const promiseB = loadPersonalizedIntelligence({
    tag: 'Request-B',
    profile: { profile_name: 'Persona B' },
    location: 'city_b',
    fetchRulesFn: async () => {
      await delay(30);
      return {
        risk_assessment: { exposure_risk_score: 75.0 },
        recommendations: [{ action: 'Action B' }],
      };
    },
    fetchPlanFn: async () => {
      await delay(30);
      return { plan_id: 'plan_B', summary: 'Plan B' };
    },
  });

  await Promise.all([promiseA, promiseB]);

  // Request A completed its phase while it was still active, but Request B succeeded it
  assert.equal(state.riskAssessment.exposure_risk_score, 75.0, 'Final state must be Request B');
  assert.equal(state.aiPlan.plan_id, 'plan_B', 'Final AI plan must be Request B');
  assert.equal(state.appliedPlanRequests[state.appliedPlanRequests.length - 1].tag, 'Request-B');
});

// ── Test 3: Interleaved phase race condition (Phase 1 finishes, but Phase 2 is superseded) ──

test('Sequence Guard: Mid-flight superseding between Phase 1 and Phase 2 drops stale AI plan', async () => {
  const { state, loadPersonalizedIntelligence } = createIntelligenceCoordinator();

  // Request A: Fast rules (5ms), but slow AI plan (80ms)
  const promiseA = loadPersonalizedIntelligence({
    tag: 'Request-A-FastRules-SlowAI',
    profile: { profile_name: 'Persona A' },
    location: 'delhi',
    fetchRulesFn: async () => {
      await delay(5);
      return {
        risk_assessment: { exposure_risk_score: 50.0 },
        recommendations: [{ action: 'Rules A' }],
      };
    },
    fetchPlanFn: async () => {
      await delay(80);
      return { plan_id: 'plan_A_obsolete', summary: 'Plan A' };
    },
  });

  // Wait until Request A has applied its rules (after 10ms)
  await delay(15);
  assert.equal(state.riskAssessment.exposure_risk_score, 50.0);

  // User now changes to Persona B
  const promiseB = loadPersonalizedIntelligence({
    tag: 'Request-B-Active',
    profile: { profile_name: 'Persona B' },
    location: 'bengaluru',
    fetchRulesFn: async () => {
      await delay(10);
      return {
        risk_assessment: { exposure_risk_score: 65.0 },
        recommendations: [{ action: 'Rules B' }],
      };
    },
    fetchPlanFn: async () => {
      await delay(10);
      return { plan_id: 'plan_B_latest', summary: 'Plan B' };
    },
  });

  await Promise.all([promiseA, promiseB]);

  // Request B must be the active plan; Request A's slow plan must be intercepted at Phase 2
  assert.equal(state.riskAssessment.exposure_risk_score, 65.0);
  assert.equal(state.aiPlan.plan_id, 'plan_B_latest');
  assert.equal(state.droppedPhase2Count, 1, 'Request A must be dropped at Phase 2 guard');
});

// ── Test 4: Stale request error does not overwrite active success state ──

test('Sequence Guard: Stale request failure does not clobber latest successful state', async () => {
  const { state, loadPersonalizedIntelligence } = createIntelligenceCoordinator();

  // Request A: Very slow request that eventually throws a network error
  const promiseA = loadPersonalizedIntelligence({
    tag: 'Request-A-Failing',
    profile: { profile_name: 'Persona A' },
    location: 'delhi',
    fetchRulesFn: async () => {
      await delay(60);
      throw new Error('Upstream timeout on Request A');
    },
    fetchPlanFn: async () => ({ plan_id: 'unreachable' }),
  });

  // User immediately switches to Persona B which succeeds quickly
  await delay(10);
  const promiseB = loadPersonalizedIntelligence({
    tag: 'Request-B-Successful',
    profile: { profile_name: 'Persona B' },
    location: 'kolkata',
    fetchRulesFn: async () => {
      await delay(10);
      return {
        risk_assessment: { exposure_risk_score: 72.0 },
        recommendations: [{ action: 'Rules B' }],
      };
    },
    fetchPlanFn: async () => {
      await delay(10);
      return { plan_id: 'plan_B_success', summary: 'Success' };
    },
  });

  await Promise.all([promiseA, promiseB]);

  // Request B succeeded; Request A's error arrived later (~60ms) but was safely dropped
  assert.equal(state.aiPlanStatus, 'success', 'Status must remain success from Request B');
  assert.equal(state.aiPlan.plan_id, 'plan_B_success');
  assert.equal(state.droppedErrorCount, 1, 'Error from Request A must be dropped');
});
