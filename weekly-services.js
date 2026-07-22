(() => {
  'use strict';

  const SECTION_ID = 'hpWeeklyServices';
  const FLOW_ID = 'hpWeeklyFlow';
  const USER_KEY = 'nutritiliousUser';
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  let currentService = '';

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function accountId() {
    const user = getUser();
    const raw = user.uid || user.email || user.phone || 'guest';
    return String(raw).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function dietProfileKey() {
    return `nutritiliousDietProfile_${accountId()}`;
  }

  function weeklyDraftKey() {
    return `nutritiliousWeeklyDraft_${accountId()}`;
  }

  function weeklyPlanKey() {
    return `nutritiliousWeeklyPlan_${accountId()}`;
  }

  function getDietProfile() {
    try {
      return JSON.parse(localStorage.getItem(dietProfileKey()) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function safe(value) {
    return String(value == null ? '' : value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function localDateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function nextMondayValue() {
    const date = new Date();
    const day = date.getDay();
    const daysUntilMonday = day === 0 ? 1 : 8 - day;
    date.setDate(date.getDate() + daysUntilMonday);
    return localDateValue(date);
  }

  function todayValue() {
    return localDateValue(new Date());
  }

  function serviceSectionMarkup() {
    return `
      <section class="hp-weekly-services" id="${SECTION_ID}" aria-labelledby="hpWeeklyServicesTitle">
        <div class="hp-weekly-services-head">
          <h2 id="hpWeeklyServicesTitle">Choose your weekly meal plan</h2>
          <p>Fresh meals planned for your entire week</p>
        </div>
        <div class="hp-weekly-service-list">
          <button class="hp-weekly-service-card" type="button" data-weekly-service="my-menu">
            <span>
              <span class="hp-weekly-service-meta"><span class="hp-weekly-service-number">01</span><span class="hp-weekly-badge">WEEKLY</span></span>
              <h3>My Menu</h3>
              <p>Choose your delivery days and select every meal your way.</p>
            </span>
            <span class="hp-weekly-service-arrow" aria-hidden="true">›</span>
          </button>

          <button class="hp-weekly-service-card ai" type="button" data-weekly-service="ai-diet">
            <span>
              <span class="hp-weekly-service-meta"><span class="hp-weekly-service-number">02</span><span class="hp-weekly-badge">PERSONALIZED</span></span>
              <h3>AI Made Diet</h3>
              <p>A seven-day meal plan based on your goal, body and routine.</p>
            </span>
            <span class="hp-weekly-service-arrow" aria-hidden="true">›</span>
          </button>

          <button class="hp-weekly-service-card recipe" type="button" data-weekly-service="recipe-plan">
            <span>
              <span class="hp-weekly-service-meta"><span class="hp-weekly-service-number">03</span><span class="hp-weekly-badge">CUSTOM</span></span>
              <h3>My Recipe Plan</h3>
              <p>Share your own diet and recipes. Our kitchen prepares them.</p>
            </span>
            <span class="hp-weekly-service-arrow" aria-hidden="true">›</span>
          </button>
        </div>
      </section>`;
  }

  function flowShellMarkup() {
    return `
      <section class="hp-weekly-flow" id="${FLOW_ID}" aria-hidden="true">
        <div class="hp-weekly-flow-screen" role="dialog" aria-modal="true" aria-labelledby="hpWeeklyFlowTitle">
          <header class="hp-weekly-flow-head">
            <button class="hp-weekly-back" id="hpWeeklyBack" type="button" aria-label="Go back">‹</button>
            <div class="hp-weekly-flow-title"><strong id="hpWeeklyFlowTitle"></strong><span id="hpWeeklyFlowSubtitle"></span></div>
            <span>7 DAYS</span>
          </header>
          <main class="hp-weekly-flow-body" id="hpWeeklyFlowBody"></main>
        </div>
      </section>`;
  }

  function mount() {
    const page = document.getElementById('page-home');
    if (!page) return;

    const main = page.querySelector(':scope > .app > main');
    if (main && !page.querySelector(`#${SECTION_ID}`)) {
      main.insertAdjacentHTML('afterbegin', serviceSectionMarkup());
    }

    if (!page.querySelector(`#${FLOW_ID}`)) {
      page.insertAdjacentHTML('beforeend', flowShellMarkup());
      bindFlowControls(page);
    }

    page.querySelectorAll('[data-weekly-service]').forEach(button => {
      if (button.dataset.weeklyBound === 'true') return;
      button.dataset.weeklyBound = 'true';
      button.addEventListener('click', () => openService(button.dataset.weeklyService));
    });
  }

  function bindFlowControls(page) {
    const flow = page.querySelector(`#${FLOW_ID}`);
    const back = page.querySelector('#hpWeeklyBack');
    back.addEventListener('click', closeFlow);

    flow.addEventListener('click', event => {
      const day = event.target.closest('[data-weekly-day]');
      if (day) {
        day.classList.toggle('selected');
        clearError();
        return;
      }

      const meal = event.target.closest('[data-weekly-meal]');
      if (meal) {
        meal.classList.toggle('selected');
        clearError();
        return;
      }

      const action = event.target.closest('[data-weekly-action]');
      if (!action) return;
      handleAction(action.dataset.weeklyAction);
    });

    flow.addEventListener('input', clearError);
    flow.addEventListener('change', clearError);
  }

  function setFlowHeader(title, subtitle) {
    const page = document.getElementById('page-home');
    page.querySelector('#hpWeeklyFlowTitle').textContent = title;
    page.querySelector('#hpWeeklyFlowSubtitle').textContent = subtitle;
  }

  function openService(service) {
    const page = document.getElementById('page-home');
    const flow = page && page.querySelector(`#${FLOW_ID}`);
    if (!flow) return;

    currentService = service;
    if (service === 'my-menu') {
      setFlowHeader('My Menu', 'Build your own weekly menu');
      renderMyMenu();
    } else if (service === 'ai-diet') {
      setFlowHeader('AI Made Diet', 'Personalized for your week');
      renderAiDiet();
    } else {
      setFlowHeader('My Recipe Plan', 'Your recipes, prepared by us');
      renderRecipePlan();
    }

    flow.classList.add('show');
    flow.setAttribute('aria-hidden', 'false');
    const body = page.querySelector('#hpWeeklyFlowBody');
    body.scrollTo({ top: 0, behavior: 'auto' });
  }

  function closeFlow() {
    const page = document.getElementById('page-home');
    const flow = page && page.querySelector(`#${FLOW_ID}`);
    if (!flow) return;
    flow.classList.remove('show');
    flow.setAttribute('aria-hidden', 'true');
    currentService = '';
  }

  function dayButtons(selectedAll = true) {
    return DAYS.map(day => `<button class="hp-weekly-day${selectedAll ? ' selected' : ''}" type="button" data-weekly-day="${day}">${day}</button>`).join('');
  }

  function mealButtons() {
    return ['Breakfast', 'Lunch', 'Snacks', 'Dinner']
      .map(meal => `<button class="hp-weekly-meal" type="button" data-weekly-meal="${meal.toLowerCase()}">${meal}</button>`)
      .join('');
  }

  function renderMyMenu() {
    const body = document.getElementById('hpWeeklyFlowBody');
    body.innerHTML = `
      <div class="hp-weekly-intro">
        <p class="eyebrow">YOUR WEEK, YOUR CHOICE</p>
        <h2>Build a menu that fits your week.</h2>
        <p>Pick delivery days and meal slots first. You can choose the actual dishes from our menu next.</p>
      </div>

      <div class="hp-weekly-group">
        <div class="hp-weekly-label"><span>Delivery days</span><small>Choose at least one</small></div>
        <div class="hp-weekly-day-grid">${dayButtons(true)}</div>
      </div>

      <div class="hp-weekly-group">
        <div class="hp-weekly-label"><span>Meals each day</span><small>Select your slots</small></div>
        <div class="hp-weekly-meal-grid">${mealButtons()}</div>
      </div>

      <label class="hp-weekly-field hp-weekly-group">
        <span>Week starts on</span>
        <input id="hpMyMenuStart" type="date" min="${todayValue()}" value="${nextMondayValue()}">
      </label>

      <div class="hp-weekly-note hp-weekly-group">Your final weekly price will be calculated after you choose dishes and portions.</div>
      <p class="hp-weekly-error" id="hpWeeklyError" role="alert"></p>
      <button class="hp-weekly-primary" type="button" data-weekly-action="save-my-menu">Continue to choose meals</button>`;
  }

  function goalText(goal) {
    const map = {
      'lose-weight': 'Lose weight',
      'gain-muscle': 'Gain muscle',
      'maintain-weight': 'Maintain weight',
      'eat-healthier': 'Eat healthier'
    };
    return map[goal] || 'Personal goal';
  }

  function dietText(diet) {
    const map = {
      vegetarian: 'Vegetarian',
      eggetarian: 'Eggetarian',
      'non-vegetarian': 'Non-vegetarian',
      vegan: 'Vegan'
    };
    return map[diet] || 'Flexible diet';
  }

  function profileSummary(profile) {
    const allergies = [];
    if (Array.isArray(profile.allergies)) allergies.push(...profile.allergies.filter(item => item !== 'none'));
    if (Array.isArray(profile.customAllergies)) allergies.push(...profile.customAllergies);
    else if (profile.customAllergies) allergies.push(profile.customAllergies);

    const pieces = [
      goalText(profile.goal),
      dietText(profile.dietType),
      profile.mealsPerDay ? `${profile.mealsPerDay} meals/day` : '',
      allergies.length ? `Avoid: ${allergies.join(', ')}` : 'No listed allergies'
    ].filter(Boolean);

    return pieces.map(item => `<span>${safe(item)}</span>`).join('');
  }

  function renderAiDiet() {
    const profile = getDietProfile();
    const body = document.getElementById('hpWeeklyFlowBody');
    body.innerHTML = `
      <div class="hp-weekly-intro">
        <p class="eyebrow">PERSONALIZED WEEKLY PLAN</p>
        <h2>Let your profile shape the menu.</h2>
        <p>We will use your goal, food preference, allergies and routine to prepare a seven-day diet.</p>
      </div>

      <div class="hp-weekly-group">
        <div class="hp-weekly-label"><span>Your diet profile</span><small>From onboarding</small></div>
        <div class="hp-weekly-profile-summary">${profileSummary(profile)}</div>
      </div>

      <label class="hp-weekly-field hp-weekly-group">
        <span>Week starts on</span>
        <input id="hpAiStart" type="date" min="${todayValue()}" value="${nextMondayValue()}">
      </label>

      <p class="hp-weekly-error" id="hpWeeklyError" role="alert"></p>
      <button class="hp-weekly-primary" type="button" data-weekly-action="generate-ai-plan">Generate my weekly diet</button>
      <div id="hpAiPlanResult"></div>`;
  }

  function allergySet(profile) {
    const values = [];
    if (Array.isArray(profile.allergies)) values.push(...profile.allergies);
    if (Array.isArray(profile.customAllergies)) values.push(...profile.customAllergies);
    else if (profile.customAllergies) values.push(...String(profile.customAllergies).split(','));
    return new Set(values.map(item => String(item).trim().toLowerCase()));
  }

  function generatedPlan(profile) {
    const diet = profile.dietType || 'vegetarian';
    const allergies = allergySet(profile);
    const avoidsMilk = allergies.has('milk') || allergies.has('dairy');
    const avoidsEggs = allergies.has('eggs') || allergies.has('egg');
    const avoidsSeafood = allergies.has('seafood') || allergies.has('fish');

    let breakfasts = ['Vegetable poha', 'Oats and fruit bowl', 'Moong dal chilla', 'Idli with sambar'];
    let lunches = ['Dal, rice and seasonal sabzi', 'Rajma bowl with salad', 'Roti, dal and mixed vegetables', 'Chole rice bowl'];
    let snacks = ['Roasted chana and fruit', 'Sprouts chaat', 'Makhana bowl', 'Peanut-free energy bowl'];
    let dinners = ['Khichdi with vegetables', 'Roti with light sabzi', 'Millet pulao and dal', 'Vegetable soup with paneer'];

    if (diet === 'vegan') {
      breakfasts = ['Vegetable poha', 'Oats with fruit and seeds', 'Moong dal chilla', 'Idli with sambar'];
      dinners = ['Tofu vegetable bowl', 'Roti with light sabzi', 'Millet pulao and dal', 'Vegetable soup with tofu'];
    }

    if (diet === 'eggetarian' && !avoidsEggs) {
      breakfasts[1] = 'Egg bhurji with roti';
      dinners[2] = 'Egg curry with rice';
    }

    if (diet === 'non-vegetarian') {
      if (!avoidsEggs) breakfasts[1] = 'Egg and vegetable breakfast bowl';
      lunches[1] = 'Chicken rice bowl with salad';
      dinners[1] = avoidsSeafood ? 'Chicken stew with roti' : 'Fish curry with rice';
      dinners[3] = 'Grilled chicken with vegetables';
    }

    if (avoidsMilk) {
      dinners = dinners.map(item => item.replace('paneer', 'tofu'));
    }

    return DAYS.map((day, index) => ({
      day,
      breakfast: breakfasts[index % breakfasts.length],
      lunch: lunches[index % lunches.length],
      snack: snacks[index % snacks.length],
      dinner: dinners[index % dinners.length]
    }));
  }

  function aiPlanMarkup(plan) {
    return plan.map(item => `
      <article class="hp-ai-day">
        <strong>${item.day}</strong>
        <p>Breakfast · ${safe(item.breakfast)}</p>
        <p>Lunch · ${safe(item.lunch)}</p>
        <p>Snack · ${safe(item.snack)}</p>
        <p>Dinner · ${safe(item.dinner)}</p>
      </article>`).join('');
  }

  function renderRecipePlan() {
    const body = document.getElementById('hpWeeklyFlowBody');
    body.innerHTML = `
      <div class="hp-weekly-intro">
        <p class="eyebrow">YOUR DIET, PREPARED BY US</p>
        <h2>Tell us exactly what you want.</h2>
        <p>Share your weekly diet and preparation instructions. Our kitchen will review feasibility and confirm pricing.</p>
      </div>

      <label class="hp-weekly-field">
        <span>Plan name</span>
        <input id="hpRecipeTitle" type="text" maxlength="60" placeholder="e.g. My gym diet week">
      </label>

      <label class="hp-weekly-field hp-weekly-group">
        <span>Week starts on</span>
        <input id="hpRecipeStart" type="date" min="${todayValue()}" value="${nextMondayValue()}">
      </label>

      <label class="hp-weekly-field hp-weekly-group">
        <span>Your day-wise diet plan</span>
        <textarea id="hpRecipeDiet" maxlength="1600" placeholder="Example: Monday breakfast — oats; lunch — rice, dal and vegetables; dinner — paneer and roti..."></textarea>
      </label>

      <label class="hp-weekly-field hp-weekly-group">
        <span>Recipe and preparation instructions</span>
        <textarea id="hpRecipeInstructions" maxlength="1600" placeholder="Mention ingredients, oil level, spices, portion size and any special preparation instructions."></textarea>
      </label>

      <label class="hp-weekly-field hp-weekly-group">
        <span>Doctor or dietitian plan <small>(optional)</small></span>
        <input class="hp-weekly-file" id="hpRecipeFile" type="file" accept="image/*,.pdf">
      </label>

      <div class="hp-weekly-note hp-weekly-group">Submission does not activate the plan immediately. The kitchen will review ingredients, preparation and weekly pricing first.</div>
      <p class="hp-weekly-error" id="hpWeeklyError" role="alert"></p>
      <button class="hp-weekly-primary" type="button" data-weekly-action="submit-recipe-plan">Submit my weekly plan</button>`;
  }

  function selectedValues(selector, attribute) {
    return Array.from(document.querySelectorAll(`${selector}.selected`)).map(item => item.getAttribute(attribute));
  }

  function showError(message, focusSelector) {
    const error = document.getElementById('hpWeeklyError');
    if (error) error.textContent = message;
    const field = focusSelector ? document.querySelector(focusSelector) : null;
    if (field) {
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => field.focus({ preventScroll: true }), 350);
    }
  }

  function clearError() {
    const error = document.getElementById('hpWeeklyError');
    if (error) error.textContent = '';
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function handleAction(action) {
    if (action === 'save-my-menu') saveMyMenu();
    else if (action === 'generate-ai-plan') generateAiPlan();
    else if (action === 'use-ai-plan') useAiPlan();
    else if (action === 'submit-recipe-plan') submitRecipePlan();
    else if (action === 'choose-meals') goToMenu();
    else if (action === 'close-success') closeFlow();
  }

  function saveMyMenu() {
    const days = selectedValues('[data-weekly-day]', 'data-weekly-day');
    const meals = selectedValues('[data-weekly-meal]', 'data-weekly-meal');
    const startDate = document.getElementById('hpMyMenuStart').value;

    if (!days.length) return showError('Choose at least one delivery day.');
    if (!meals.length) return showError('Choose at least one meal slot.');
    if (!startDate) return showError('Choose when your week starts.', '#hpMyMenuStart');

    saveJson(weeklyDraftKey(), {
      service: 'my-menu',
      startDate,
      days,
      meals,
      status: 'menu-selection',
      updatedAt: new Date().toISOString()
    });

    renderSuccess(
      'Weekly menu setup saved',
      `${days.length} delivery days and ${meals.length} meal slots selected. Now choose dishes from the menu.`,
      '<button class="hp-weekly-primary" type="button" data-weekly-action="choose-meals">Choose meals now</button>'
    );
  }

  function generateAiPlan() {
    const startDate = document.getElementById('hpAiStart').value;
    if (!startDate) return showError('Choose when your week starts.', '#hpAiStart');

    const profile = getDietProfile();
    const plan = generatedPlan(profile);
    const result = document.getElementById('hpAiPlanResult');
    result.innerHTML = `
      <div class="hp-weekly-group">
        <div class="hp-weekly-label"><span>Your seven-day preview</span><small>Meals can be changed later</small></div>
        <div class="hp-ai-plan">${aiPlanMarkup(plan)}</div>
      </div>
      <button class="hp-weekly-primary" type="button" data-weekly-action="use-ai-plan">Use this weekly plan</button>`;

    result.dataset.plan = JSON.stringify({ startDate, meals: plan });
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function useAiPlan() {
    const result = document.getElementById('hpAiPlanResult');
    if (!result || !result.dataset.plan) return;
    const plan = JSON.parse(result.dataset.plan);
    saveJson(weeklyPlanKey(), {
      service: 'ai-diet',
      ...plan,
      status: 'selected',
      createdAt: new Date().toISOString()
    });

    renderSuccess(
      'AI weekly diet selected',
      'Your seven-day plan is saved. Delivery timing, portions and final pricing can be confirmed at weekly checkout.',
      '<button class="hp-weekly-primary" type="button" data-weekly-action="close-success">Done</button>'
    );
  }

  function submitRecipePlan() {
    const title = document.getElementById('hpRecipeTitle').value.trim();
    const startDate = document.getElementById('hpRecipeStart').value;
    const dietPlan = document.getElementById('hpRecipeDiet').value.trim();
    const instructions = document.getElementById('hpRecipeInstructions').value.trim();
    const file = document.getElementById('hpRecipeFile').files[0];

    if (!title) return showError('Give your weekly plan a name.', '#hpRecipeTitle');
    if (!startDate) return showError('Choose when your week starts.', '#hpRecipeStart');
    if (!dietPlan) return showError('Add your day-wise diet plan.', '#hpRecipeDiet');
    if (!instructions) return showError('Add your recipe and preparation instructions.', '#hpRecipeInstructions');

    saveJson(weeklyDraftKey(), {
      service: 'recipe-plan',
      title,
      startDate,
      dietPlan,
      instructions,
      attachmentName: file ? file.name : '',
      status: 'submitted-for-kitchen-review',
      submittedAt: new Date().toISOString()
    });

    renderSuccess(
      'Your plan has been submitted',
      'The kitchen will review the recipes, ingredients and preparation before confirming the weekly price.',
      `<div class="hp-weekly-status-list">
        <div class="hp-weekly-status-row done"><span>✓</span>Plan submitted</div>
        <div class="hp-weekly-status-row"><span>2</span>Kitchen review</div>
        <div class="hp-weekly-status-row"><span>3</span>Price confirmation</div>
        <div class="hp-weekly-status-row"><span>4</span>Weekly plan activated</div>
      </div>
      <button class="hp-weekly-primary" type="button" data-weekly-action="close-success">Done</button>`
    );
  }

  function renderSuccess(title, message, extraMarkup) {
    const body = document.getElementById('hpWeeklyFlowBody');
    body.innerHTML = `
      <div class="hp-weekly-success">
        <div class="hp-weekly-success-mark">✓</div>
        <h2>${safe(title)}</h2>
        <p>${safe(message)}</p>
        ${extraMarkup}
      </div>`;
    body.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goToMenu() {
    closeFlow();
    const target = document.getElementById('suggestedTitle') || document.getElementById('cravingTitle');
    if (target) setTimeout(() => target.closest('.section').scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  }

  function boot() {
    mount();
    const root = document.getElementById('root');
    if (root) new MutationObserver(mount).observe(root, { childList: true, subtree: true });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && document.querySelector(`#${FLOW_ID}.show`)) closeFlow();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
