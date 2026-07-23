(() => {
  'use strict';

  const MENU_VERSION = 'guruji-kitchen-menu-v2';
  const API_ENDPOINT = '/api/generate-diet';
  const USER_KEY = 'nutritiliousUser';
  const STATUS_ID = 'hpAiApiStatus';
  const STYLE_ID = 'hpAiApiBridgeStyles';

  let inFlight = false;
  let autoAttemptedFor = '';
  let retryTimer = null;

  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || '{}') || {}; }
    catch (error) { return {}; }
  }

  function accountId() {
    const user = getUser();
    return String(user.uid || user.email || user.phone || 'guest').replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function profileKey() { return `nutritiliousDietProfile_${accountId()}`; }
  function completionKey() { return `${profileKey()}_completed`; }
  function planKey() { return `nutritiliousAiMenuPlan_${accountId()}`; }
  function apiStateKey() { return `nutritiliousAiApiState_${accountId()}`; }

  function getJson(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch (error) { return fallback; }
  }

  function getProfile() { return getJson(profileKey(), {}) || {}; }
  function getPlan() { return getJson(planKey(), null); }

  function normalizeAllergy(value) {
    const normalized = String(value || '').trim().toLowerCase();
    const aliases = {
      dairy: 'milk',
      'tree nuts': 'tree-nuts',
      nuts: 'tree-nuts',
      peanut: 'peanuts',
      egg: 'eggs',
      fish: 'seafood'
    };
    return aliases[normalized] || normalized;
  }

  function allAllergies(profile) {
    const values = [];
    if (Array.isArray(profile.allergies)) values.push(...profile.allergies);
    if (Array.isArray(profile.customAllergies)) values.push(...profile.customAllergies);
    else if (profile.customAllergies) values.push(...String(profile.customAllergies).split(','));
    return [...new Set(values.map(normalizeAllergy).filter(value => value && value !== 'none'))];
  }

  function profileFingerprint(profile) {
    return JSON.stringify({
      goal: profile.goal || '',
      dietType: profile.dietType || '',
      allergies: allAllergies(profile).sort(),
      mealsPerDay: profile.mealsPerDay || '',
      wakeTime: profile.wakeTime || '',
      sleepTime: profile.sleepTime || '',
      activityLevel: profile.activityLevel || ''
    });
  }

  function startOfCurrentWeek() {
    const date = new Date();
    const day = date.getDay();
    date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function localDateValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function currentSignature(profile, plan) {
    return `${profileFingerprint(profile)}|${plan?.weekStart || localDateValue(startOfCurrentWeek())}|${MENU_VERSION}`;
  }

  function sanitizedProfile(profile) {
    return {
      goal: profile.goal || '',
      sex: profile.sex || '',
      age: profile.age || null,
      heightCm: profile.heightCm || null,
      weightKg: profile.weightKg || null,
      targetWeightKg: profile.targetWeightKg || null,
      dietType: profile.dietType || '',
      allergies: Array.isArray(profile.allergies) ? profile.allergies : [],
      customAllergies: Array.isArray(profile.customAllergies)
        ? profile.customAllergies
        : String(profile.customAllergies || '').split(',').map(value => value.trim()).filter(Boolean),
      activityLevel: profile.activityLevel || '',
      mealsPerDay: profile.mealsPerDay || 4,
      wakeTime: profile.wakeTime || '',
      sleepTime: profile.sleepTime || '',
      healthConditions: Array.isArray(profile.healthConditions) ? profile.healthConditions : []
    };
  }

  function scheduleFromPlan(plan) {
    if (!plan || !Array.isArray(plan.days) || plan.days.length !== 7) return null;
    return plan.days.map(day => ({
      label: day.label,
      shortLabel: day.shortLabel,
      date: day.date,
      slots: Array.isArray(day.meals) ? day.meals.map(meal => ({
        slotKey: meal.slotKey,
        slotLabel: meal.slotLabel,
        type: meal.type,
        time: meal.time
      })) : []
    }));
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #page-home .hp-ai-api-status {
        display: flex;
        align-items: center;
        gap: 9px;
        margin: 11px 1px 0;
        padding: 10px 12px;
        border: 1px solid #e7dfdc;
        border-radius: 14px;
        background: rgba(255,255,255,.82);
        color: #685d58;
        font-size: 10.5px;
        line-height: 1.35;
        font-weight: 750;
      }
      #page-home .hp-ai-api-status::before {
        content: '';
        width: 8px;
        height: 8px;
        flex: 0 0 8px;
        border-radius: 50%;
        background: #96908c;
      }
      #page-home .hp-ai-api-status.loading::before {
        border: 2px solid #ead7d3;
        border-top-color: #a52c26;
        background: transparent;
        animation: hpAiApiSpin .75s linear infinite;
      }
      #page-home .hp-ai-api-status.success::before { background: #2f9e44; }
      #page-home .hp-ai-api-status.error::before { background: #d87b20; }
      @keyframes hpAiApiSpin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
  }

  function statusHost() {
    return document.querySelector('#hpAiDietDashboard .hp-ai-hero');
  }

  function setStatus(message, state = '') {
    ensureStyles();
    const host = statusHost();
    if (!host) return;
    let status = document.getElementById(STATUS_ID);
    if (!status) {
      status = document.createElement('div');
      status.id = STATUS_ID;
      status.className = 'hp-ai-api-status';
      host.insertAdjacentElement('afterend', status);
    }
    status.className = `hp-ai-api-status ${state}`.trim();
    status.textContent = message;
  }

  function hideStatusLater(delay = 5000) {
    window.setTimeout(() => {
      const status = document.getElementById(STATUS_ID);
      if (status && !status.classList.contains('loading')) status.remove();
    }, delay);
  }

  function menuIds() {
    const menu = Array.isArray(window.HAPYCURE_AVAILABLE_MENU) ? window.HAPYCURE_AVAILABLE_MENU : [];
    return new Set(menu.map(item => item.id).concat('no-safe-menu-item'));
  }

  function validApiDays(days, schedule) {
    if (!Array.isArray(days) || days.length !== 7 || !Array.isArray(schedule) || schedule.length !== 7) return false;
    const ids = menuIds();
    return days.every((day, dayIndex) => {
      const expected = schedule[dayIndex];
      if (!day || day.date !== expected.date || !Array.isArray(day.meals) || day.meals.length !== expected.slots.length) return false;
      return day.meals.every((meal, mealIndex) => {
        const slot = expected.slots[mealIndex];
        return meal && meal.slotKey === slot.slotKey && meal.type === slot.type && ids.has(meal.itemId);
      });
    });
  }

  function apiStateMatches(signature, plan) {
    const state = getJson(apiStateKey(), null);
    return Boolean(
      state &&
      state.signature === signature &&
      state.menuVersion === MENU_VERSION &&
      plan &&
      plan.aiSource === 'gemini' &&
      Array.isArray(plan.days) &&
      plan.days.length === 7
    );
  }

  async function requestGeminiPlan({ force = false } = {}) {
    if (inFlight) return;
    const page = document.getElementById('page-home');
    const dashboard = document.getElementById('hpAiDietDashboard');
    if (!page || !dashboard || !navigator.onLine) return;
    if (localStorage.getItem(completionKey()) !== 'true') return;

    const profile = getProfile();
    const localPlan = getPlan();
    const schedule = scheduleFromPlan(localPlan);
    if (!profile || !schedule) return;

    const signature = currentSignature(profile, localPlan);
    if (!force && apiStateMatches(signature, localPlan)) {
      setStatus('Personalized by Gemini · verified against the current kitchen menu', 'success');
      hideStatusLater(4500);
      return;
    }
    if (!force && autoAttemptedFor === signature) return;
    autoAttemptedFor = signature;
    inFlight = true;
    setStatus(force ? 'Gemini is rebuilding your weekly diet…' : 'Gemini is personalizing your available menu…', 'loading');

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 32000);
    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: sanitizedProfile(profile), schedule }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'AI recommendation failed.');
      if (!validApiDays(payload.days, schedule)) throw new Error('The AI response did not match the current menu schedule.');

      const aiPlan = {
        ...localPlan,
        version: MENU_VERSION,
        profileFingerprint: profileFingerprint(profile),
        aiSource: 'gemini',
        aiModel: payload.model || '',
        aiGeneratedAt: payload.generatedAt || new Date().toISOString(),
        days: payload.days
      };

      localStorage.setItem(planKey(), JSON.stringify(aiPlan));
      localStorage.setItem(apiStateKey(), JSON.stringify({
        signature,
        source: 'gemini',
        model: payload.model || '',
        generatedAt: payload.generatedAt || new Date().toISOString(),
        menuVersion: MENU_VERSION
      }));
      setStatus('Gemini plan ready. Applying your recommendations…', 'success');
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      const message = error && error.name === 'AbortError'
        ? 'Gemini timed out. Your safe local plan is still active.'
        : (error && error.message ? error.message : 'Gemini is unavailable. Your safe local plan is still active.');
      setStatus(message, 'error');
      hideStatusLater(7500);
    } finally {
      window.clearTimeout(timeout);
      inFlight = false;
    }
  }

  function interceptRegenerate(event) {
    const button = event.target.closest('[data-ai-action="regenerate"]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    localStorage.removeItem(apiStateKey());
    requestGeminiPlan({ force: true });
  }

  function scheduleAutoAttempt() {
    window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(() => requestGeminiPlan({ force: false }), 220);
  }

  function boot() {
    ensureStyles();
    document.addEventListener('click', interceptRegenerate, true);
    scheduleAutoAttempt();

    const observer = new MutationObserver(scheduleAutoAttempt);
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('online', scheduleAutoAttempt);
    window.addEventListener('pageshow', scheduleAutoAttempt);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
