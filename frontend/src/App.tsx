/**
 * VayuSense — Root Application
 *
 * Integrated Intelligence Layers:
 *  - Live WAQI AQI feed with caching, stale detection, and city/station search
 *  - Interactive household personalization (presets, member cards, schedule, indoor air)
 *  - Deterministic 0–100 VayuSense Exposure Risk score with component breakdown
 *  - Gemini GenAI personalized reasoning with routine, indoor air, swaps & alerts
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { fetchAIPlan, fetchRuleRecommendations, fetchHealth } from './services/api';
import { useAQI } from './hooks/useAQI';
import { useProfile } from './hooks/useProfile';
import type { AQIResponse, LocationSelection } from './types/aqi';
import type {
  AIPersonalizedPlan,
  RiskAssessmentResult,
  RuleRecommendation,
} from './types/recommendation';
import type { HouseholdProfile } from './types/profile';
import {
  DESIGN_FIXTURE_AQI_DELHI,
  DESIGN_FIXTURE_AI_PLAN,
} from './fixtures/designFixtures';
import { Sidebar, type NavigationTab } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import {
  AQIHeroCardSkeleton,
  PollutantBreakdownSkeleton,
  ExposureRiskSkeleton,
  GenericCardSkeleton,
} from './components/common/Skeleton';
import { AQIHeroCard } from './components/dashboard/AQIHeroCard';
import { PollutantBreakdown } from './components/dashboard/PollutantBreakdown';
import { AQITrendChart } from './components/dashboard/AQITrendChart';
import { ExposureRiskScoreCard } from './components/dashboard/ExposureRiskScoreCard';
import { RecommendedActionsCard } from './components/dashboard/RecommendedActionsCard';
import { IndoorAirCard } from './components/dashboard/IndoorAirCard';
import { SustainableSwapsCard } from './components/dashboard/SustainableSwapsCard';
import { PersonalizedAlertsBanner } from './components/dashboard/PersonalizedAlertsBanner';
import { ProfileSetupPage } from './components/profile/ProfileSetupPage';
import { ExplainableRecommendationCard } from './components/explainability/ExplainableRecommendationCard';
import { DailyTimelineView } from './components/explainability/DailyTimelineView';
import { CompletionTrackerCard } from './components/explainability/CompletionTrackerCard';
import { WhatChangedInspector, type WhatChangedState } from './components/explainability/WhatChangedInspector';
import {
  AlertTriangle,
  WifiOff,
  RefreshCw,
  ServerCrash,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────
type AIPlanStatus = 'idle' | 'loading' | 'success' | 'error';

// ─── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_LOCATION: LocationSelection = { query: 'delhi', label: 'Delhi' };

// ─── Component ─────────────────────────────────────────────────────────────────
export const App: React.FC = () => {
  // ── Navigation & UI state ──────────────────────────────────────────────────
  const [currentTab, setCurrentTab] = useState<NavigationTab>('overview');
  const [currentLocation, setCurrentLocation] = useState<LocationSelection>(DEFAULT_LOCATION);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  // ── Backend health state ───────────────────────────────────────────────────
  const [isBackendConnected, setIsBackendConnected] = useState(false);

  // ── Household Profile Hook (localStorage persistence + presets + NL parser) ─
  const {
    activeProfile,
    allProfiles,
    activeId,
    switchProfile,
    updateProfile,
    applyPreset,
    saveCurrentAs,
    isParsingNL,
    nlParseError,
    parsedSuggestion,
    parseDescription,
    confirmParsedFields,
    discardParsedFields,
  } = useProfile();

  // ── AQI Data Hook (TTL cache, stale detection, auto-refresh) ───────────────
  const {
    data: liveAqiData,
    status: aqiStatus,
    error: aqiError,
    lastFetched,
    refresh: refreshAQI,
    isRefreshing,
  } = useAQI(currentLocation.query);

  // ── Intelligence State: Deterministic Risk & Gemini Plan ───────────────────
  const [riskAssessment, setRiskAssessment] = useState<RiskAssessmentResult | null>(null);
  const [ruleRecommendations, setRuleRecommendations] = useState<RuleRecommendation[]>([]);
  const [aiPlan, setAiPlan] = useState<AIPersonalizedPlan | null>(null);
  const [aiPlanStatus, setAiPlanStatus] = useState<AIPlanStatus>('idle');

  // ── Phase 5: Recommendation Completion Tracker (localStorage per date) ────
  const todayKey = new Date().toISOString().split('T')[0];
  const [completedActionKeys, setCompletedActionKeys] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(`vayusense_completed_${todayKey}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const handleToggleAction = (actionKey: string) => {
    setCompletedActionKeys((prev) => {
      const updated = prev.includes(actionKey)
        ? prev.filter((k) => k !== actionKey)
        : [...prev, actionKey];
      try {
        localStorage.setItem(`vayusense_completed_${todayKey}`, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleResetCompleted = () => {
    setCompletedActionKeys([]);
    try {
      localStorage.removeItem(`vayusense_completed_${todayKey}`);
    } catch {}
  };

  // ── Phase 5: "What Changed?" State & Audit Delta Inspector ─────────────────
  const prevSnapshotRef = React.useRef<{
    location: string;
    aqi: number | null;
    profileName: string;
    riskScore: number;
    ruleTitles: string[];
  } | null>(null);
  const planRequestIdRef = React.useRef<number>(0);
  const [whatChangedDelta, setWhatChangedDelta] = useState<WhatChangedState | null>(null);

  // ── Derived display data ───────────────────────────────────────────────────
  const [forceDemoMode, setForceDemoMode] = useState<boolean>(false);
  // Fixture mode: activated when forceDemoMode is toggled OR when backend is unreachable AND no live data is available
  const isFixtureMode = forceDemoMode || (aqiStatus === 'error' && liveAqiData === null);
  const displayAqi: AQIResponse | null = isFixtureMode ? DESIGN_FIXTURE_AQI_DELHI : liveAqiData;
  const displayAiPlan: AIPersonalizedPlan | null = isFixtureMode ? DESIGN_FIXTURE_AI_PLAN : aiPlan;

  // Show skeleton when loading with zero data yet
  const showSkeletons = aqiStatus === 'loading' && !liveAqiData;

  // ── Health check on mount ──────────────────────────────────────────────────
  useEffect(() => {
    fetchHealth()
      .then(() => setIsBackendConnected(true))
      .catch(() => setIsBackendConnected(false));
  }, []);

  // Update backend connection indicator based on AQI hook outcome
  useEffect(() => {
    if (aqiStatus === 'success' || aqiStatus === 'stale') {
      setIsBackendConnected(true);
    } else if (aqiStatus === 'error' && !liveAqiData) {
      setIsBackendConnected(false);
    }
  }, [aqiStatus, liveAqiData]);

  // ── Personalization Engine: Re-evaluate when profile or AQI changes ────────
  const loadPersonalizedIntelligence = useCallback(
    async (profile: HouseholdProfile, aqiData?: AQIResponse | null) => {
      const requestId = ++planRequestIdRef.current;
      setAiPlanStatus('loading');
      try {
        // 1. Fetch deterministic risk assessment and rule recommendations
        const rulesResponse = await fetchRuleRecommendations({
          profile,
          aqi_data: aqiData || undefined,
          location: currentLocation.query,
        });

        // Drop response if a newer request was dispatched while waiting
        if (requestId !== planRequestIdRef.current) return;

        setRiskAssessment(rulesResponse.risk_assessment);
        setRuleRecommendations(rulesResponse.recommendations);

        // Compute "What Changed?" delta if a previous state exists
        const currRisk = rulesResponse.risk_assessment.exposure_risk_score;
        const currRules = rulesResponse.recommendations.map((r) => r.action);
        const currAqiVal = aqiData?.aqi ?? null;

        if (prevSnapshotRef.current) {
          const prev = prevSnapshotRef.current;
          const locationChanged = prev.location !== currentLocation.label;
          const profileChanged = prev.profileName !== (profile.profile_name || 'Household');
          const aqiChanged = prev.aqi !== currAqiVal;
          const riskChanged = Math.abs(prev.riskScore - currRisk) >= 0.5;

          if (locationChanged || profileChanged || aqiChanged || riskChanged) {
            const added = currRules.filter((r) => !prev.ruleTitles.includes(r));
            const removed = prev.ruleTitles.filter((r) => !currRules.includes(r));

            let rationale = '';
            if (locationChanged && profileChanged) {
              rationale = `Shifted from ${prev.location} to ${currentLocation.label} and changed household to ${profile.profile_name || 'Household'}. Baseline ambient exposure and household vulnerability were both re-computed deterministically.`;
            } else if (locationChanged) {
              const aqiDiff = (currAqiVal ?? 0) - (prev.aqi ?? 0);
              rationale = `Location changed from ${prev.location} to ${currentLocation.label}. Ambient AQI shifted by ${aqiDiff > 0 ? `+${aqiDiff}` : aqiDiff} points, modulating the base ambient risk component.`;
            } else if (profileChanged) {
              rationale = `Household profile changed from "${prev.profileName}" to "${profile.profile_name || 'Household'}". Demographic vulnerability multiplier and activity timing scores were updated.`;
            } else {
              rationale = `Exposure parameters were adjusted; deterministic risk recalculated to ${currRisk.toFixed(1)}/100.`;
            }

            setWhatChangedDelta({
              prevLocation: prev.location,
              currLocation: currentLocation.label,
              prevAqi: prev.aqi,
              currAqi: currAqiVal,
              prevProfileName: prev.profileName,
              currProfileName: profile.profile_name || 'Household',
              prevRiskScore: prev.riskScore,
              currRiskScore: currRisk,
              addedRuleTitles: added,
              removedRuleTitles: removed,
              changeRationale: rationale,
            });
          }
        }

        prevSnapshotRef.current = {
          location: currentLocation.label,
          aqi: currAqiVal,
          profileName: profile.profile_name || 'Household',
          riskScore: currRisk,
          ruleTitles: currRules,
        };

        // 2. Fetch Gemini AI personalized plan
        const plan = await fetchAIPlan({
          profile,
          aqi_data: aqiData || undefined,
          location: currentLocation.query,
        });

        if (requestId !== planRequestIdRef.current) return;

        setAiPlan(plan);
        setAiPlanStatus('success');
      } catch (err) {
        if (requestId !== planRequestIdRef.current) return;
        if (import.meta.env.DEV) {
          console.warn('Personalized intelligence call failed, using fallback:', err);
        }
        setAiPlanStatus('error');
      }
    },
    [currentLocation.query, currentLocation.label]
  );

  // Trigger intelligence refresh when activeProfile or liveAqiData updates
  useEffect(() => {
    loadPersonalizedIntelligence(activeProfile, liveAqiData);
  }, [activeProfile, liveAqiData, loadPersonalizedIntelligence]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleLocationChange = (selection: LocationSelection) => {
    setCurrentLocation(selection);
  };

  const handleRefresh = () => {
    refreshAQI();
    loadPersonalizedIntelligence(activeProfile, liveAqiData);
  };

  // ── Screen Reader Announcements (polite, user-action triggered) ─────────
  const isInitialAqiMount = useRef(true);
  const isInitialProfileMount = useRef(true);

  useEffect(() => {
    if (isInitialAqiMount.current) {
      isInitialAqiMount.current = false;
      return;
    }
    if (displayAqi) {
      setAnnouncement(
        `Air quality data updated for ${displayAqi.location_name || displayAqi.station_name}: AQI ${displayAqi.aqi ?? 'unreported'}, ${displayAqi.classification?.category || ''}`
      );
    }
  }, [displayAqi?.aqi, displayAqi?.station_name]);

  useEffect(() => {
    if (isInitialProfileMount.current) {
      isInitialProfileMount.current = false;
      return;
    }
    if (activeProfile.profile_name) {
      setAnnouncement(`Household profile switched to ${activeProfile.profile_name}`);
    }
  }, [activeProfile.profile_name]);

  useEffect(() => {
    if (aqiStatus === 'error' && aqiError) {
      setAnnouncement(`Air quality request error: ${aqiError}`);
    }
  }, [aqiStatus, aqiError]);

  // ── Render Helpers ─────────────────────────────────────────────────────────
  const renderErrorState = () => (
    <div className="rounded-2xl bg-white border border-rose-200 shadow-sm p-8 flex flex-col items-center justify-center gap-4 text-center">
      <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center">
        <ServerCrash className="w-6 h-6 text-rose-500" />
      </div>
      <div>
        <h3 className="text-base font-bold text-slate-900">Unable to reach monitoring station</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">
          {aqiError || 'The backend could not retrieve live AQI data for this location.'}
        </p>
      </div>
      <button
        onClick={handleRefresh}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        Retry
      </button>
      <p className="text-xs text-slate-500 max-w-xs">
        Displaying labeled design fixtures for layout evaluation while backend is offline.
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-canvas flex">
      {/* ── Skip to Main Content Link (WCAG 2.4.1 Bypass Blocks) ── */}
      <a
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          const target = document.getElementById('main-content');
          if (target) {
            target.focus();
            target.scrollIntoView();
          }
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-slate-900 focus:text-white focus:rounded-xl focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-vayu-500 text-xs font-bold"
      >
        Skip to main content
      </a>

      {/* ── Screen Reader Live Announcement Region ── */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>

      {/* ── Sidebar Navigation ── */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        isBackendConnected={isBackendConnected}
      />

      {/* ── Main View Area ── */}
      <div className="flex-1 lg:pl-72 flex flex-col min-w-0">
        {/* ── Header ── */}
        <Header
          currentLocation={currentLocation}
          onLocationChange={handleLocationChange}
          selectedPreset={activeId}
          onPresetChange={(presetKey) => applyPreset(presetKey)}
          onRefresh={handleRefresh}
          isLoading={aqiStatus === 'loading'}
          isRefreshing={isRefreshing}
          isBackendConnected={isBackendConnected}
          lastFetched={lastFetched}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          profiles={allProfiles}
          isDemoMode={isFixtureMode}
          onToggleDemoMode={() => setForceDemoMode((prev) => !prev)}
        />

        {/* ── Offline / Fixture Mode Alert Banner ── */}
        {isFixtureMode && (
          <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-semibold flex items-center justify-between border-b border-amber-600 shadow-inner">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-slate-950" />
              <span>
                <strong>DEMO DATA MODE ACTIVE:</strong> Offline evaluation design fixtures are currently loaded. Never mixed with live readings.
              </span>
            </span>
            <div className="flex items-center gap-3 shrink-0 ml-4">
              {forceDemoMode ? (
                <button
                  type="button"
                  onClick={() => setForceDemoMode(false)}
                  className="text-[11px] underline font-extrabold hover:text-slate-800 cursor-pointer"
                >
                  Switch back to Live Feed
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="text-[11px] underline font-bold hover:text-slate-800 cursor-pointer"
                >
                  Retry Live Connection
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Stale Data Notice ── */}
        {aqiStatus === 'stale' && liveAqiData && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-xs text-amber-800 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
            Monitoring station data is stale — values may not reflect current conditions.
          </div>
        )}

        {/* ── Error Banner With Existing Data ── */}
        {aqiStatus === 'error' && liveAqiData && (
          <div className="bg-rose-50 border-b border-rose-200 px-4 py-1.5 text-xs text-rose-800 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <WifiOff className="w-3.5 h-3.5 shrink-0 text-rose-500" />
              Latest refresh failed — showing last known data.{' '}
              {aqiError && <span className="text-rose-700">{aqiError}</span>}
            </span>
            <button onClick={handleRefresh} className="text-[11px] underline font-semibold hover:text-rose-900">
              Retry
            </button>
          </div>
        )}

        {/* ── Main Tab Content ── */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 p-4 lg:p-8 max-w-7xl w-full mx-auto space-y-6 focus:outline-none"
        >
          <h1 className="sr-only">VayuSense — Urban Air Quality Intelligence & Personalized Exposure Protection</h1>

          {/* Personalized Alerts Banner */}
          <PersonalizedAlertsBanner alerts={displayAiPlan?.personalized_alerts} />

          {/* ════════════════════════════════════════════════════════════════
              TAB 1: OVERVIEW DASHBOARD
          ════════════════════════════════════════════════════════════════ */}
          {currentTab === 'overview' && (
            <div className="space-y-6">
              {/* Top Row: AQI Hero + Exposure Risk Card */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-7">
                  {showSkeletons ? (
                    <AQIHeroCardSkeleton />
                  ) : aqiStatus === 'error' && !displayAqi ? (
                    renderErrorState()
                  ) : (
                    displayAqi && (
                      <AQIHeroCard
                        aqiData={displayAqi}
                        isFixture={isFixtureMode}
                        isRefreshing={isRefreshing}
                      />
                    )
                  )}
                </div>

                <div className="lg:col-span-5">
                  {showSkeletons ? (
                    <ExposureRiskSkeleton />
                  ) : (
                    <ExposureRiskScoreCard
                      riskScore={
                        riskAssessment?.exposure_risk_score ??
                        displayAiPlan?.exposure_risk_score ??
                        50.0
                      }
                      riskLevel={
                        riskAssessment?.risk_level ??
                        displayAiPlan?.risk_level ??
                        'Moderate'
                      }
                      confidenceScore={riskAssessment?.confidence_score ?? 0.85}
                      freshnessIndicator={
                        riskAssessment?.freshness_indicator ??
                        displayAqi?.data_freshness ??
                        'Live'
                      }
                      isStaleOrMissing={
                        riskAssessment?.is_stale_or_missing ?? aqiStatus === 'stale'
                      }
                      breakdown={
                        riskAssessment?.breakdown ?? {
                          base_aqi_component: 38.5,
                          vulnerability_factor: 1.25,
                          exposure_duration_score: 7.0,
                          activity_timing_score: 4.5,
                          indoor_environment_score: 2.0,
                          freshness_penalty: aqiStatus === 'stale' ? 5.0 : 0.0,
                          explanations: [
                            `Base AQI mapped from ${currentLocation.label} station reading`,
                            `Vulnerability multiplier tailored for ${activeProfile.profile_name || 'Household'}`,
                          ],
                        }
                      }
                      summary={
                        riskAssessment?.summary ??
                        `VayuSense Exposure Risk tailored for ${activeProfile.profile_name || 'Household'} at ${currentLocation.label}.`
                      }
                    />
                  )}
                </div>
              </div>

              {/* Pollutant Breakdown Strip */}
              {showSkeletons ? (
                <PollutantBreakdownSkeleton />
              ) : (
                displayAqi && <PollutantBreakdown pollutants={displayAqi.pollutants} />
              )}

              {/* AQI Trend Chart */}
              {!showSkeletons && displayAqi && (
                <AQITrendChart
                  currentAqi={displayAqi.aqi ?? null}
                  forecast={displayAqi.forecast ?? null}
                />
              )}

              {/* Recommended Routine Actions */}
              {showSkeletons ? (
                <GenericCardSkeleton rows={5} />
              ) : (
                <RecommendedActionsCard
                  todayRoutine={displayAiPlan?.today_routine}
                  isAiGenerated={!displayAiPlan?.is_fallback && aiPlanStatus === 'success'}
                />
              )}

              {/* Indoor Air + Sustainable Swaps */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {showSkeletons ? (
                  <>
                    <GenericCardSkeleton rows={4} />
                    <GenericCardSkeleton rows={4} />
                  </>
                ) : (
                  <>
                    <IndoorAirCard indoorActions={displayAiPlan?.indoor_air_action} />
                    <SustainableSwapsCard sustainableSwaps={displayAiPlan?.sustainable_swaps} />
                  </>
                )}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              TAB 2: MY HOUSEHOLD (Interactive Setup Page)
          ════════════════════════════════════════════════════════════════ */}
          {currentTab === 'household' && (
            <ProfileSetupPage
              activeProfile={activeProfile}
              activePresetId={activeId}
              onSelectPreset={(presetId) => applyPreset(presetId)}
              onUpdateProfile={updateProfile}
              onSaveAs={saveCurrentAs}
              onParseNL={parseDescription}
              isParsingNL={isParsingNL}
              nlParseError={nlParseError}
              parsedSuggestion={parsedSuggestion}
              onConfirmParsed={confirmParsedFields}
              onDiscardParsed={discardParsedFields}
              isRecalculating={aiPlanStatus === 'loading'}
            />
          )}

          {/* ════════════════════════════════════════════════════════════════
              TAB 3: DAILY PLAN (Timeline + Completion Tracker + Actions)
          ════════════════════════════════════════════════════════════════ */}
          {currentTab === 'daily_plan' && (
            <div className="space-y-6">
              {showSkeletons ? (
                <>
                  <GenericCardSkeleton rows={4} />
                  <GenericCardSkeleton rows={6} />
                  <GenericCardSkeleton rows={4} />
                </>
              ) : (
                <>
                  {/* Phase 5: Recommendation Completion Tracker */}
                  <CompletionTrackerCard
                    recommendations={ruleRecommendations}
                    completedActionKeys={completedActionKeys}
                    onToggleAction={handleToggleAction}
                    onResetCompleted={handleResetCompleted}
                  />

                  {/* Phase 5: 24-Hour Diurnal Daily Timeline View */}
                  <DailyTimelineView
                    recommendations={ruleRecommendations}
                    profile={activeProfile}
                    currentAqi={displayAqi?.aqi ?? null}
                  />

                  {/* Phase 5: Complete Prioritized Action Cards with Expandable "Why this?" & Causal Chains */}
                  <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm p-6 space-y-4">
                    <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">
                          Active Protective Recommendations ({ruleRecommendations.length})
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Every card includes an expandable causal chain, multi-category impact ratings, and trade-off audit.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {ruleRecommendations.map((rec, i) => (
                        <ExplainableRecommendationCard
                          key={rec.supporting_data_rule || i}
                          recommendation={rec}
                          isCompleted={completedActionKeys.includes(rec.supporting_data_rule || rec.action)}
                          onToggleComplete={() => handleToggleAction(rec.supporting_data_rule || rec.action)}
                        />
                      ))}
                    </div>
                  </div>

                  <SustainableSwapsCard sustainableSwaps={displayAiPlan?.sustainable_swaps} />
                </>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              TAB 4: INDOOR AIR
          ════════════════════════════════════════════════════════════════ */}
          {currentTab === 'indoor_air' && (
            <div className="space-y-6">
              {showSkeletons ? (
                <GenericCardSkeleton rows={6} />
              ) : (
                <IndoorAirCard indoorActions={displayAiPlan?.indoor_air_action} />
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              TAB 5: EXPOSURE INSIGHTS (What Changed? + Risk Audit + Trends)
          ════════════════════════════════════════════════════════════════ */}
          {currentTab === 'exposure_insights' && (
            <div className="space-y-6">
              {showSkeletons ? (
                <>
                  <GenericCardSkeleton rows={4} />
                  <ExposureRiskSkeleton />
                  <GenericCardSkeleton rows={3} />
                </>
              ) : (
                <>
                  {/* Phase 5: "What Changed?" Interactive Audit Inspector */}
                  <WhatChangedInspector delta={whatChangedDelta} />

                  {/* Deterministic Exposure Risk Gauge */}
                  {displayAqi && (
                    <>
                      <ExposureRiskScoreCard
                        riskScore={
                          riskAssessment?.exposure_risk_score ??
                          displayAiPlan?.exposure_risk_score ??
                          50.0
                        }
                        riskLevel={
                          riskAssessment?.risk_level ??
                          displayAiPlan?.risk_level ??
                          'Moderate'
                        }
                        confidenceScore={riskAssessment?.confidence_score ?? 0.85}
                        freshnessIndicator={
                          riskAssessment?.freshness_indicator ??
                          displayAqi.data_freshness
                        }
                        isStaleOrMissing={
                          riskAssessment?.is_stale_or_missing ?? aqiStatus === 'stale'
                        }
                        breakdown={
                          riskAssessment?.breakdown ?? {
                            base_aqi_component: 38.5,
                            vulnerability_factor: 1.25,
                            exposure_duration_score: 7.0,
                            activity_timing_score: 4.5,
                            indoor_environment_score: 2.0,
                            freshness_penalty: aqiStatus === 'stale' ? 5.0 : 0.0,
                            explanations: [
                              `Base AQI mapped from ${currentLocation.label} station reading`,
                              `Vulnerability multiplier for ${activeProfile.profile_name || 'Household'}`,
                            ],
                          }
                        }
                        summary={
                          riskAssessment?.summary ??
                          `VayuSense Exposure Risk score for ${activeProfile.profile_name || 'Household'} at ${currentLocation.label}.`
                        }
                      />
                      <AQITrendChart
                        currentAqi={displayAqi.aqi ?? null}
                        forecast={displayAqi.forecast ?? null}
                      />
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Medical disclaimer footer */}
          <footer className="pt-6 pb-8 border-t border-slate-200/80 text-center text-xs text-slate-600 space-y-1">
            <p>
              VayuSense provides environmental exposure intelligence based on verified ambient
              measurements and reported household habits.
            </p>
            <p className="text-[11px]">
              Not a clinical medical diagnosis or healthcare provider. Consult a qualified medical
              practitioner for persistent respiratory symptoms.
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
};

export default App;
