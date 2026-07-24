(() => {
  'use strict';

  const MENU_VERSION = 'guruji-kitchen-menu-v2';
  const API_ENDPOINT = '/api/generate-diet';
  const USER_KEY = 'nutritiliousUser';
  const STATUS_ID = 'hpAiApiStatus';
  const FLOW_ID = 'hpAiGeneratingScreen';
  const STYLE_ID = 'hpAiApiBridgeStyles';
  const MIN_SAVING_MS = 2000;
  const MIN_GENERATING_MS = 1250;
  const REQUEST_TIMEOUT_MS = 32000;
  const PROFILE_SAVE_TIMEOUT_MS = 15000;

  let inFlight = false;
  let autoAttemptedFor = '';
  let retryTimer = null;
  let firstFlowPoll = null;
  let firstFlowDeadline = null;

  const firstFlow = {
    active: false,
    requestStarted: false,
    submitAt: 0,
    generatingAt: 0,
    generatingTimer: null
  };

  function wait(ms) {
    return new Promise(resolve => window.setTimeout(resolve, Math.max(0, ms)));
  }

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
  function pendingFlowKey() { return `nutritiliousAiFirstFlowPending_${accountId()}`; }

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

  // Must stay compatible with weekly-services.js so an AI plan survives reload.
  function planFingerprint(profile) {
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

  // Includes every profile field that can affect Gemini recommendations.
  function recommendationFingerprint(profile) {
    const conditions = Array.isArray(profile.healthConditions)
      ? [...profile.healthConditions].map(String).sort()
      : [];
    return JSON.stringify({
      goal: profile.goal || '',
      sex: profile.sex || '',
      age: Number(profile.age) || null,
      heightCm: Number(profile.heightCm) || null,
      weightKg: Number(profile.weightKg) || null,
      targetWeightKg: Number(profile.targetWeightKg) || null,
      dietType: profile.dietType || '',
      allergies: allAllergies(profile).sort(),
      activityLevel: profile.activityLevel || '',
      mealsPerDay: Number(profile.mealsPerDay) || 4,
      wakeTime: profile.wakeTime || '',
      sleepTime: profile.sleepTime || '',
      healthConditions: conditions
    });
  }

  function startOfCurrentWeek() {
    const date = new Date();
    const day = date.getDay();
    date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function addDays(date, count) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + count);
    return copy;
  }

  function localDateValue(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function parseTime(value, fallbackMinutes) {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return fallbackMinutes;
    const [hours, minutes] = value.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallbackMinutes;
    return (hours * 60) + minutes;
  }

  function formatMinutes(totalMinutes) {
    const normalized = ((totalMinutes % 1440) + 1440) % 1440;
    const hours = Math.floor(normalized / 60);
    const minutes = normalized % 60;
    return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
  }

  function mealSlots(profile) {
    const count = Math.max(2, Math.min(6, Number(profile.mealsPerDay) || 4));
    const wake = parseTime(profile.wakeTime, 7 * 60);
    const sleep = parseTime(profile.sleepTime, 23 * 60);
    const breakfast = wake + 60;
    const lunch = Math.max((12 * 60) + 30, breakfast + 240);
    const dinner = Math.max(lunch + 180, Math.min(sleep - 120, 21 * 60));
    const snack = Math.round((lunch + dinner) / 2);

    if (count === 2) return [
      { key: 'lunch', label: 'Lunch', type: 'lunch', time: formatMinutes(lunch) },
      { key: 'dinner', label: 'Dinner', type: 'dinner', time: formatMinutes(dinner) }
    ];
    if (count === 3) return [
      { key: 'breakfast', label: 'Breakfast', type: 'breakfast', time: formatMinutes(breakfast) },
      { key: 'lunch', label: 'Lunch', type: 'lunch', time: formatMinutes(lunch) },
      { key: 'dinner', label: 'Dinner', type: 'dinner', time: formatMinutes(dinner) }
    ];
    if (count === 4) return [
      { key: 'breakfast', label: 'Breakfast', type: 'breakfast', time: formatMinutes(breakfast) },
      { key: 'lunch', label: 'Lunch', type: 'lunch', time: formatMinutes(lunch) },
      { key: 'snack', label: 'Evening Snack', type: 'snack', time: formatMinutes(snack) },
      { key: 'dinner', label: 'Dinner', type: 'dinner', time: formatMinutes(dinner) }
    ];

    const morningSnack = Math.round((breakfast + lunch) / 2);
    const slots = [
      { key: 'breakfast', label: 'Breakfast', type: 'breakfast', time: formatMinutes(breakfast) },
      { key: 'morning-snack', label: 'Mid-morning', type: 'snack', time: formatMinutes(morningSnack) },
      { key: 'lunch', label: 'Lunch', type: 'lunch', time: formatMinutes(lunch) },
      { key: 'evening-snack', label: 'Evening Snack', type: 'snack', time: formatMinutes(snack) },
      { key: 'dinner', label: 'Dinner', type: 'dinner', time: formatMinutes(dinner) }
    ];
    if (count === 6) slots.push({
      key: 'light-supper',
      label: 'Light Supper',
      type: 'snack',
      time: formatMinutes(Math.min(sleep - 45, dinner + 90))
    });
    return slots;
  }

  function buildSchedule(profile) {
    const weekStart = startOfCurrentWeek();
    const slots = mealSlots(profile);
    const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const shorts = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return names.map((label, index) => ({
      label,
      shortLabel: shorts[index],
      date: localDateValue(addDays(weekStart, index)),
      slots: slots.map(slot => ({
        slotKey: slot.key,
        slotLabel: slot.label,
        type: slot.type,
        time: slot.time
      }))
    }));
  }

  function currentSignature(profile, schedule) {
    return `${recommendationFingerprint(profile)}|${schedule[0]?.date || localDateValue(startOfCurrentWeek())}|${MENU_VERSION}`;
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

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #page-home .hp-ai-api-status{display:flex;align-items:center;gap:9px;margin:11px 1px 0;padding:10px 12px;border:1px solid #e7dfdc;border-radius:14px;background:rgba(255,255,255,.82);color:#685d58;font-size:10.5px;line-height:1.35;font-weight:750}
      #page-home .hp-ai-api-status::before{content:'';width:8px;height:8px;flex:0 0 8px;border-radius:50%;background:#96908c}
      #page-home .hp-ai-api-status.loading::before{border:2px solid #ead7d3;border-top-color:#a52c26;background:transparent;animation:hpAiApiSpin .75s linear infinite}
      #page-home .hp-ai-api-status.success::before{background:#2f9e44}
      #page-home .hp-ai-api-status.error::before{background:#d87b20}
      @keyframes hpAiApiSpin{to{transform:rotate(360deg)}}
      #${FLOW_ID}{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;overflow:hidden;padding:24px;background:#fbf8f5;color:#241c19;text-align:center;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif}
      #${FLOW_ID}::before,#${FLOW_ID}::after{content:'';position:absolute;border-radius:50%;pointer-events:none}
      #${FLOW_ID}::before{width:320px;height:320px;top:-190px;right:-150px;background:rgba(131,30,25,.08)}
      #${FLOW_ID}::after{width:250px;height:250px;bottom:-170px;left:-130px;background:rgba(131,30,25,.06)}
      #${FLOW_ID} .hp-gen-shell{position:relative;z-index:1;width:min(100%,390px)}
      #${FLOW_ID} .hp-gen-logo{width:146px;height:48px;margin:0 auto 30px;object-fit:contain}
      #${FLOW_ID} .hp-gen-visual{position:relative;width:154px;height:154px;margin:0 auto 31px;display:grid;place-items:center}
      #${FLOW_ID} .hp-gen-ring{position:absolute;inset:0;border:1px solid rgba(131,30,25,.16);border-radius:50%;animation:hpGenPulse 2.1s ease-in-out infinite}
      #${FLOW_ID} .hp-gen-ring:nth-child(2){inset:17px;animation-delay:.28s}
      #${FLOW_ID} .hp-gen-orbit{position:absolute;inset:7px;border-radius:50%;border-top:2px solid #8d211c;border-right:2px solid transparent;animation:hpGenOrbit 1.15s linear infinite}
      #${FLOW_ID} .hp-gen-core{width:76px;height:76px;display:grid;place-items:center;border-radius:25px;background:linear-gradient(145deg,#711713,#a4322b);color:#fff;box-shadow:0 18px 38px rgba(105,24,20,.24);font-size:31px;font-weight:900;transform:rotate(8deg)}
      #${FLOW_ID} .hp-gen-core span{transform:rotate(-8deg)}
      #${FLOW_ID} .hp-gen-eyebrow{margin:0 0 9px;color:#9b2a24;font-size:10px;font-weight:950;letter-spacing:1.5px}
      #${FLOW_ID} h1{max-width:350px;margin:0 auto;color:#241c19;font-size:29px;line-height:1.08;letter-spacing:-1px;font-weight:950}
      #${FLOW_ID} .hp-gen-message{min-height:42px;max-width:310px;margin:13px auto 0;color:#776b66;font-size:13px;line-height:1.55;font-weight:650}
      #${FLOW_ID} .hp-gen-progress{height:5px;margin:27px auto 0;overflow:hidden;border-radius:999px;background:#eee4df}
      #${FLOW_ID} .hp-gen-progress span{display:block;width:34%;height:100%;border-radius:inherit;background:#8d211c;animation:hpGenProgress 1.45s ease-in-out infinite}
      #${FLOW_ID} .hp-gen-steps{display:flex;justify-content:center;gap:7px;margin-top:17px;color:#9a8e88;font-size:9px;font-weight:850}
      #${FLOW_ID} .hp-gen-steps span{padding:7px 9px;border-radius:999px;background:#f1ebe7}
      #${FLOW_ID} .hp-gen-steps span.done{background:#e9f6ec;color:#287b3b}
      #${FLOW_ID} .hp-gen-steps span.active{background:#f7e5e2;color:#952821}
      #${FLOW_ID}.ready .hp-gen-orbit{animation-duration:2.4s}
      #${FLOW_ID}.ready .hp-gen-core{background:linear-gradient(145deg,#287b3b,#3d9c57)}
      @keyframes hpGenOrbit{to{transform:rotate(360deg)}}
      @keyframes hpGenPulse{0%,100%{transform:scale(.93);opacity:.42}50%{transform:scale(1.04);opacity:1}}
      @keyframes hpGenProgress{0%{transform:translateX(-110%)}50%{transform:translateX(95%)}100%{transform:translateX(300%)}}
      @media(max-height:620px){#${FLOW_ID} .hp-gen-logo{margin-bottom:18px}#${FLOW_ID} .hp-gen-visual{width:125px;height:125px;margin-bottom:20px}#${FLOW_ID} h1{font-size:25px}#${FLOW_ID} .hp-gen-progress{margin-top:18px}}
      @media(prefers-reduced-motion:reduce){#${FLOW_ID} *,#page-home .hp-ai-api-status::before{animation-duration:2.5s!important}}
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

  function createFlowScreen() {
    ensureStyles();
    let screen = document.getElementById(FLOW_ID);
    if (screen) return screen;
    screen = document.createElement('section');
    screen.id = FLOW_ID;
    screen.setAttribute('role', 'status');
    screen.setAttribute('aria-live', 'polite');
    screen.innerHTML = `
      <div class="hp-gen-shell">
        <img class="hp-gen-logo" src="./hepicure_logo_transparent.png" alt="Hepicure">
        <div class="hp-gen-visual" aria-hidden="true"><span class="hp-gen-ring"></span><span class="hp-gen-ring"></span><span class="hp-gen-orbit"></span><div class="hp-gen-core"><span>✦</span></div></div>
        <p class="hp-gen-eyebrow" id="hpGenEyebrow">PERSONAL DIET SETUP</p>
        <h1 id="hpGenTitle">Saving your profile</h1>
        <p class="hp-gen-message" id="hpGenMessage">Securing your preferences and health details…</p>
        <div class="hp-gen-progress" aria-hidden="true"><span></span></div>
        <div class="hp-gen-steps"><span class="active" id="hpGenStepProfile">Profile</span><span id="hpGenStepMenu">Menu</span><span id="hpGenStepPlan">7-day plan</span></div>
      </div>`;
    document.body.appendChild(screen);
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return screen;
  }

  function showGeneratingState() {
    const screen = createFlowScreen();
    if (!firstFlow.generatingAt) firstFlow.generatingAt = Date.now();
    screen.querySelector('#hpGenEyebrow').textContent = 'HEPICURE AI';
    screen.querySelector('#hpGenTitle').textContent = 'Hepicure AI is generating your diet plan for you';
    screen.querySelector('#hpGenMessage').textContent = 'Matching your profile with meals currently available in our kitchen…';
    screen.querySelector('#hpGenStepProfile').className = 'done';
    screen.querySelector('#hpGenStepProfile').textContent = 'Profile saved';
    screen.querySelector('#hpGenStepMenu').className = 'active';
    screen.querySelector('#hpGenStepPlan').className = '';
    window.setTimeout(() => {
      const current = document.getElementById(FLOW_ID);
      if (!current || current.classList.contains('ready')) return;
      current.querySelector('#hpGenMessage').textContent = 'Checking your food preference, allergies, goal and meal timings…';
      current.querySelector('#hpGenStepMenu').className = 'done';
      current.querySelector('#hpGenStepPlan').className = 'active';
    }, 1350);
  }

  function showReadyState(aiReady) {
    const screen = createFlowScreen();
    screen.classList.add('ready');
    screen.querySelector('#hpGenEyebrow').textContent = aiReady ? 'YOUR PLAN IS READY' : 'STARTER PLAN READY';
    screen.querySelector('#hpGenTitle').textContent = aiReady ? 'Your personalized diet is ready' : 'Your safe starter diet is ready';
    screen.querySelector('#hpGenMessage').textContent = aiReady
      ? 'Taking you to your Hepicure home screen…'
      : 'Gemini could not respond right now, so we prepared a safe menu-based plan for you.';
    screen.querySelector('#hpGenStepProfile').className = 'done';
    screen.querySelector('#hpGenStepMenu').className = 'done';
    screen.querySelector('#hpGenStepPlan').className = 'done';
  }

  function clearFirstFlowTimers() {
    if (firstFlowPoll) window.clearInterval(firstFlowPoll);
    if (firstFlowDeadline) window.clearTimeout(firstFlowDeadline);
    if (firstFlow.generatingTimer) window.clearTimeout(firstFlow.generatingTimer);
    firstFlowPoll = null;
    firstFlowDeadline = null;
    firstFlow.generatingTimer = null;
  }

  function resetFirstFlow({ keepScreen = false } = {}) {
    clearFirstFlowTimers();
    firstFlow.active = false;
    firstFlow.requestStarted = false;
    firstFlow.submitAt = 0;
    firstFlow.generatingAt = 0;
    sessionStorage.removeItem(pendingFlowKey());
    if (!keepScreen) document.getElementById(FLOW_ID)?.remove();
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
      state && state.signature === signature && state.menuVersion === MENU_VERSION &&
      plan && plan.aiSource === 'gemini' && Array.isArray(plan.days) && plan.days.length === 7
    );
  }

  function retryBlocked(signature) {
    const state = getJson(apiStateKey(), null);
    return Boolean(state && state.signature === signature && state.retryAfter && Number(state.retryAfter) > Date.now());
  }


  async function finishFirstFlow(aiReady) {
    const switchAt = firstFlow.submitAt + MIN_SAVING_MS;
    await wait(switchAt - Date.now());
    if (!firstFlow.generatingAt) showGeneratingState();
    await wait(MIN_GENERATING_MS - (Date.now() - firstFlow.generatingAt));
    showReadyState(aiReady);
    sessionStorage.removeItem(pendingFlowKey());
    await wait(850);
    window.location.reload();
  }

  async function requestGeminiPlan({ force = false, firstRun = false } = {}) {
    if (inFlight) {
      if (firstRun) await finishFirstFlow(false);
      return false;
    }
    if (localStorage.getItem(completionKey()) !== 'true') return false;

    const profile = getProfile();
    if (!profile || !profile.goal || !profile.dietType) {
      if (firstRun) await finishFirstFlow(false);
      return false;
    }

    const schedule = buildSchedule(profile);
    const signature = currentSignature(profile, schedule);
    const localPlan = getPlan();

    if (!force && apiStateMatches(signature, localPlan)) {
      if (firstRun) await finishFirstFlow(true);
      else {
        setStatus('Personalized by Gemini · verified against the current kitchen menu', 'success');
        hideStatusLater(4500);
      }
      return true;
    }

    if (!navigator.onLine) {
      if (firstRun) await finishFirstFlow(false);
      else {
        setStatus('You are offline. Your safe local plan is still active.', 'error');
        hideStatusLater(6000);
      }
      return false;
    }

    if (!force && retryBlocked(signature)) return false;
    if (!force && !firstRun && autoAttemptedFor === signature) return false;

    autoAttemptedFor = signature;
    inFlight = true;
    if (!firstRun) setStatus(force ? 'Gemini is rebuilding your weekly diet…' : 'Gemini is personalizing your available menu…', 'loading');

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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
      if (payload.menuVersion !== MENU_VERSION) throw new Error('The kitchen menu changed. Please try again.');
      if (!validApiDays(payload.days, schedule)) throw new Error('The AI response did not match the current menu schedule.');

      const aiPlan = {
        ...(localPlan || {}),
        version: MENU_VERSION,
        weekStart: schedule[0].date,
        profileFingerprint: planFingerprint(profile),
        aiRecommendationFingerprint: recommendationFingerprint(profile),
        createdAt: localPlan?.createdAt || new Date().toISOString(),
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

      if (firstRun) await finishFirstFlow(true);
      else {
        setStatus('Gemini plan ready. Applying your recommendations…', 'success');
        window.setTimeout(() => window.location.reload(), 450);
      }
      return true;
    } catch (error) {
      localStorage.setItem(apiStateKey(), JSON.stringify({
        signature,
        source: 'local-fallback',
        menuVersion: MENU_VERSION,
        failedAt: Date.now(),
        retryAfter: Date.now() + (15 * 60 * 1000)
      }));

      if (firstRun) await finishFirstFlow(false);
      else {
        const message = error?.name === 'AbortError'
          ? 'Gemini timed out. Your safe local plan is still active.'
          : (error?.message || 'Gemini is unavailable. Your safe local plan is still active.');
        setStatus(message, 'error');
        hideStatusLater(7500);
      }
      return false;
    } finally {
      window.clearTimeout(timeout);
      inFlight = false;
    }
  }

  function startFirstFlow(submitAt = Date.now()) {
    if (firstFlow.active) return;
    firstFlow.active = true;
    firstFlow.requestStarted = false;
    firstFlow.submitAt = Number(submitAt) || Date.now();
    firstFlow.generatingAt = 0;
    sessionStorage.setItem(pendingFlowKey(), String(firstFlow.submitAt));
    createFlowScreen();
    firstFlow.generatingTimer = window.setTimeout(showGeneratingState, Math.max(0, (firstFlow.submitAt + MIN_SAVING_MS) - Date.now()));

    firstFlowPoll = window.setInterval(() => {
      if (!firstFlow.active || firstFlow.requestStarted) return;
      if (localStorage.getItem(completionKey()) !== 'true') return;
      const saved = getProfile();
      if (!saved?.goal || !saved?.dietType) return;
      firstFlow.requestStarted = true;
      if (firstFlowPoll) window.clearInterval(firstFlowPoll);
      requestGeminiPlan({ force: true, firstRun: true });
    }, 100);

    firstFlowDeadline = window.setTimeout(() => {
      if (!firstFlow.active || firstFlow.requestStarted) return;
      const screen = document.getElementById(FLOW_ID);
      if (screen) {
        screen.querySelector('#hpGenTitle').textContent = 'Profile could not be saved';
        screen.querySelector('#hpGenMessage').textContent = 'Please review your details and try again.';
      }
      window.setTimeout(() => resetFirstFlow(), 1200);
    }, PROFILE_SAVE_TIMEOUT_MS);
  }

  function captureProfileSubmit(event) {
    const button = event.target.closest('#hpNextBtn');
    if (!button || button.disabled || firstFlow.active || localStorage.getItem(completionKey()) === 'true') return;
    const label = button.querySelector('span')?.textContent || button.textContent || '';
    if (!/create my profile/i.test(label)) return;
    startFirstFlow(Date.now());
  }

  function resumePendingFirstFlow() {
    const pendingAt = Number(sessionStorage.getItem(pendingFlowKey()) || 0);
    if (!pendingAt) return;
    if (localStorage.getItem(completionKey()) !== 'true') {
      sessionStorage.removeItem(pendingFlowKey());
      return;
    }
    startFirstFlow(pendingAt);
  }

  function interceptRegenerate(event) {
    const button = event.target.closest('[data-ai-action="regenerate"]');
    if (!button || button.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    localStorage.removeItem(apiStateKey());
    requestGeminiPlan({ force: true, firstRun: false });
  }

  function scheduleAutoAttempt() {
    if (firstFlow.active) return;
    window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(() => {
      if (firstFlow.active) return;
      if (!document.getElementById('page-home') || !document.getElementById('hpAiDietDashboard')) return;
      requestGeminiPlan({ force: false, firstRun: false });
    }, 260);
  }

  function boot() {
    ensureStyles();
    document.addEventListener('click', captureProfileSubmit, true);
    document.addEventListener('click', interceptRegenerate, true);
    resumePendingFirstFlow();
    scheduleAutoAttempt();

    const observer = new MutationObserver(scheduleAutoAttempt);
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('online', scheduleAutoAttempt);
    window.addEventListener('pageshow', scheduleAutoAttempt);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();