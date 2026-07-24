(() => {
  'use strict';

  const APP_NAME = 'Hapycure';
  const OVERLAY_ID = 'hapycureDietOnboarding';
  const AUTH_TYPE_KEY = 'nutritiliousAuthType';
  const USER_KEY = 'nutritiliousUser';
  const CUSTOM_ALLERGY_DRAFT_PREFIX = 'nutritiliousCustomAllergiesDraft_';
  const ROUTINE_DRAFT_PREFIX = 'nutritiliousRoutineDraft_';
  const bodyOverflowBeforeOpen = { value: '' };

  const steps = [
    { id: 'goal', title: 'What is your main goal?', subtitle: 'We will use this to shape your daily meal plan.' },
    { id: 'body', title: 'Tell us about your body', subtitle: 'These details help us estimate your nutritional needs.' },
    { id: 'food', title: 'What do you like to eat?', subtitle: 'Choose your food preference and anything you avoid.' },
    { id: 'routine', title: 'What does your day look like?', subtitle: 'Your activity and routine help us plan meal timing.' },
    { id: 'health', title: 'Any health considerations?', subtitle: 'This helps us keep recommendations more relevant and careful.' }
  ];

  const profile = {
    goal: '',
    sex: '',
    age: '',
    heightCm: '',
    weightKg: '',
    targetWeightKg: '',
    dietType: '',
    allergies: [],
    customAllergies: '',
    activityLevel: '',
    mealsPerDay: '',
    wakeTime: '',
    sleepTime: '',
    healthConditions: [],
    notes: ''
  };

  let currentStep = 0;
  let overlay = null;

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function accountId(user) {
    const raw = user.uid || user.email || 'google';
    return String(raw).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function completionKey(user) {
    return `nutritiliousDietProfile_${accountId(user)}_completed`;
  }

  function profileKey(user) {
    return `nutritiliousDietProfile_${accountId(user)}`;
  }

  function customAllergyDraftKey() {
    return CUSTOM_ALLERGY_DRAFT_PREFIX + accountId(getUser());
  }

  function routineDraftKey() {
    return ROUTINE_DRAFT_PREFIX + accountId(getUser());
  }

  function isEligible() {
    const user = getUser();
    return localStorage.getItem(AUTH_TYPE_KEY) === 'google' && Boolean(user.uid || user.email);
  }

  function isComplete() {
    return localStorage.getItem(completionKey(getUser())) === 'true';
  }


  function ensureEnhancementStyles() {
    if (document.getElementById('hpOnboardingEnhancementStyles')) return;
    const style = document.createElement('style');
    style.id = 'hpOnboardingEnhancementStyles';
    style.textContent = `
      #${OVERLAY_ID} .hp-food-grid [data-select-value="vegetarian"].selected {
        border-color: #2f9e44 !important;
      }
      #${OVERLAY_ID} .hp-custom-allergy-field {
        display: block;
        margin-top: 18px;
      }
      #${OVERLAY_ID} .hp-custom-allergy-field > span {
        display: block;
        margin-bottom: 9px;
        color: #514845;
        font-size: 11.5px;
        font-weight: 900;
        line-height: 1.3;
      }
      #${OVERLAY_ID} .hp-custom-allergy-field small {
        color: #978c87;
        font-weight: 650;
      }
      #${OVERLAY_ID} .hp-custom-allergy-field input {
        width: 100%;
        height: 52px;
        padding: 0 14px;
        border: 1px solid #e8e0dd;
        border-radius: 16px;
        outline: 0;
        background: #faf8f7;
        color: #201c1b;
        font: inherit;
        font-size: 13px;
        font-weight: 750;
      }
      #${OVERLAY_ID} .hp-custom-allergy-field input:focus {
        border-color: #dd6b64;
        background: #fff;
        box-shadow: 0 0 0 3px rgba(208, 52, 44, .08);
      }
      #${OVERLAY_ID} .hp-routine-grid .hp-option-icon {
        display: none !important;
      }
      #${OVERLAY_ID} .hp-routine-grid .hp-option-card {
        padding-left: 16px;
      }
      #${OVERLAY_ID} .hp-attention {
        border-radius: 18px;
        outline: 2px solid rgba(208, 52, 44, .36);
        outline-offset: 8px;
        animation: hpSectionAttention .55s ease 2;
      }
      #${OVERLAY_ID} .hp-routine-details .hp-input-field.invalid > div {
        border-color: #d0342c;
        box-shadow: 0 0 0 3px rgba(208, 52, 44, .08);
      }
      @keyframes hpSectionAttention {
        0%, 100% { outline-color: rgba(208, 52, 44, .2); }
        50% { outline-color: rgba(208, 52, 44, .72); }
      }
    `;
    document.head.appendChild(style);
  }

  function optionCard(group, value, title, description, icon = '') {
    const iconMarkup = icon ? `<span class="hp-option-icon" aria-hidden="true">${icon}</span>` : '';
    return `
      <button class="hp-option-card" type="button" data-select-group="${group}" data-select-value="${value}">
        ${iconMarkup}
        <span class="hp-option-copy"><strong>${title}</strong><small>${description}</small></span>
        <span class="hp-option-check" aria-hidden="true">✓</span>
      </button>`;
  }

  function chip(group, value, label) {
    return `<button type="button" class="hp-chip" data-multi-group="${group}" data-multi-value="${value}">${label}<span>✓</span></button>`;
  }

  function stepMarkup(index) {
    if (index === 0) {
      return `
        <div class="hp-option-grid hp-goal-grid">
          ${optionCard('goal', 'lose-weight', 'Lose weight', 'A balanced calorie-deficit plan')}
          ${optionCard('goal', 'gain-muscle', 'Gain muscle', 'Protein-focused meals for strength')}
          ${optionCard('goal', 'maintain-weight', 'Maintain weight', 'Stay consistent and energetic')}
          ${optionCard('goal', 'eat-healthier', 'Eat healthier', 'Improve everyday food choices')}
        </div>`;
    }

    if (index === 1) {
      return `
        <div class="hp-field-group">
          <label class="hp-label">Sex</label>
          <div class="hp-segmented" role="group" aria-label="Sex">
            <button type="button" data-select-group="sex" data-select-value="female">Female</button>
            <button type="button" data-select-group="sex" data-select-value="male">Male</button>
            <button type="button" data-select-group="sex" data-select-value="other">Other</button>
          </div>
        </div>
        <div class="hp-input-grid">
          <label class="hp-input-field"><span>Age</span><div><input id="hpAge" type="number" inputmode="numeric" min="13" max="100" placeholder="21"><em>years</em></div></label>
          <label class="hp-input-field"><span>Height</span><div><input id="hpHeight" type="number" inputmode="decimal" min="100" max="230" placeholder="170"><em>cm</em></div></label>
          <label class="hp-input-field"><span>Current weight</span><div><input id="hpWeight" type="number" inputmode="decimal" min="25" max="300" step="0.1" placeholder="65"><em>kg</em></div></label>
          <label class="hp-input-field"><span>Target weight <small>(optional)</small></span><div><input id="hpTargetWeight" type="number" inputmode="decimal" min="25" max="300" step="0.1" placeholder="60"><em>kg</em></div></label>
        </div>`;
    }

    if (index === 2) {
      return `
        <div class="hp-field-group">
          <label class="hp-label">Food preference</label>
          <div class="hp-option-grid hp-food-grid">
            ${optionCard('dietType', 'vegetarian', 'Vegetarian', 'No meat or fish')}
            ${optionCard('dietType', 'eggetarian', 'Eggetarian', 'Vegetarian meals with eggs')}
            ${optionCard('dietType', 'non-vegetarian', 'Non-vegetarian', 'Includes meat, fish and eggs')}
            ${optionCard('dietType', 'vegan', 'Vegan', 'No animal-derived foods')}
          </div>
        </div>
        <div class="hp-field-group hp-top-gap hp-allergy-group" id="hpAllergySection">
          <label class="hp-label">Allergies or foods to avoid <small>(choose at least one option)</small></label>
          <div class="hp-chip-wrap">
            ${chip('allergies', 'none', 'None')}
            ${chip('allergies', 'milk', 'Milk')}
            ${chip('allergies', 'peanuts', 'Peanuts')}
            ${chip('allergies', 'tree-nuts', 'Tree nuts')}
            ${chip('allergies', 'gluten', 'Gluten')}
            ${chip('allergies', 'soy', 'Soy')}
            ${chip('allergies', 'eggs', 'Eggs')}
            ${chip('allergies', 'seafood', 'Seafood')}
          </div>
          <label class="hp-custom-allergy-field">
            <span>Add manually <small>(optional)</small></span>
            <input id="hpCustomAllergies" type="text" maxlength="180" autocomplete="off" placeholder="e.g. sesame, mushroom, mustard" aria-label="Add other allergies manually">
          </label>
        </div>`;
    }

    if (index === 3) {
      return `
        <div class="hp-field-group">
          <label class="hp-label">Activity level</label>
          <div class="hp-option-grid hp-routine-grid">
            ${optionCard('activityLevel', 'sedentary', 'Mostly sitting', 'Little or no regular exercise')}
            ${optionCard('activityLevel', 'light', 'Lightly active', 'Exercise 1–3 days a week')}
            ${optionCard('activityLevel', 'moderate', 'Moderately active', 'Exercise 3–5 days a week')}
            ${optionCard('activityLevel', 'very-active', 'Very active', 'Hard exercise most days')}
          </div>
        </div>
        <div class="hp-input-grid hp-top-gap hp-routine-details" id="hpRoutineDetails">
          <label class="hp-input-field" data-routine-field="meals"><span>Meals per day</span><div><select id="hpMeals"><option value="">Select</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="6">6</option></select></div></label>
          <label class="hp-input-field" data-routine-field="wake"><span>Wake-up time</span><div><input id="hpWakeTime" type="time"></div></label>
          <label class="hp-input-field" data-routine-field="sleep"><span>Sleep time</span><div><input id="hpSleepTime" type="time"></div></label>
        </div>`;
    }

    return `
      <div class="hp-field-group">
        <label class="hp-label">Health conditions <small>(choose all that apply)</small></label>
        <div class="hp-chip-wrap hp-health-chips">
          ${chip('healthConditions', 'none', 'None')}
          ${chip('healthConditions', 'diabetes', 'Diabetes')}
          ${chip('healthConditions', 'high-bp', 'High BP')}
          ${chip('healthConditions', 'thyroid', 'Thyroid')}
          ${chip('healthConditions', 'pcos', 'PCOS')}
          ${chip('healthConditions', 'high-cholesterol', 'High cholesterol')}
          ${chip('healthConditions', 'kidney', 'Kidney condition')}
          ${chip('healthConditions', 'other', 'Other')}
        </div>
      </div>
      <label class="hp-textarea-field hp-top-gap"><span>Anything else we should know? <small>(optional)</small></span><textarea id="hpNotes" maxlength="300" placeholder="Food dislikes, medical guidance, schedule constraints, etc."></textarea></label>
      <div class="hp-safety-note"><strong>Important:</strong> ${APP_NAME} provides general nutrition guidance, not medical treatment. For a diagnosed condition, pregnancy, eating disorder or medication-related diet, consult a qualified doctor or dietitian.</div>`;
  }

  function createOverlay() {
    if (overlay || document.getElementById(OVERLAY_ID)) return;
    ensureEnhancementStyles();
    restoreRoutineDraft();
    bodyOverflowBeforeOpen.value = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    overlay = document.createElement('section');
    overlay.id = OVERLAY_ID;
    overlay.className = 'hp-onboarding';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'hpStepTitle');
    overlay.innerHTML = `
      <div class="hp-onboarding-shell">
        <header class="hp-onboarding-header">
          <div class="hp-brand-mark">H</div>
          <div><strong>${APP_NAME}</strong><span>Personal diet setup</span></div>
          <span class="hp-step-count" id="hpStepCount"></span>
        </header>
        <div class="hp-progress" aria-hidden="true"><span id="hpProgressBar"></span></div>
        <main class="hp-onboarding-main">
          <div class="hp-step-copy"><p id="hpEyebrow"></p><h1 id="hpStepTitle"></h1><p id="hpStepSubtitle"></p></div>
          <div class="hp-step-content" id="hpStepContent"></div>
          <p class="hp-form-message" id="hpFormMessage" role="alert"></p>
        </main>
        <footer class="hp-onboarding-footer">
          <button class="hp-back-btn" id="hpBackBtn" type="button">Back</button>
          <button class="hp-next-btn" id="hpNextBtn" type="button"><span>Continue</span><b>→</b></button>
        </footer>
      </div>`;

    document.body.appendChild(overlay);
    overlay.querySelector('#hpBackBtn').addEventListener('click', goBack);
    overlay.querySelector('#hpNextBtn').addEventListener('click', goNext);
    overlay.addEventListener('click', handleSelection);
    overlay.addEventListener('input', handleInput);
    overlay.addEventListener('change', handleInput);
    renderStep();
  }

  function renderStep() {
    const step = steps[currentStep];
    overlay.querySelector('#hpStepCount').textContent = `${currentStep + 1} of ${steps.length}`;
    overlay.querySelector('#hpProgressBar').style.width = `${((currentStep + 1) / steps.length) * 100}%`;
    overlay.querySelector('#hpEyebrow').textContent = `STEP ${currentStep + 1}`;
    overlay.querySelector('#hpStepTitle').textContent = step.title;
    overlay.querySelector('#hpStepSubtitle').textContent = step.subtitle;
    overlay.querySelector('#hpStepContent').innerHTML = stepMarkup(currentStep);
    overlay.querySelector('#hpFormMessage').textContent = '';
    overlay.querySelector('#hpBackBtn').style.visibility = currentStep === 0 ? 'hidden' : 'visible';
    const next = overlay.querySelector('#hpNextBtn');
    next.disabled = false;
    next.querySelector('span').textContent = currentStep === steps.length - 1 ? 'Create my profile' : 'Continue';
    next.querySelector('b').textContent = currentStep === steps.length - 1 ? '✓' : '→';
    restoreStepValues();
    requestAnimationFrame(() => overlay.querySelector('.hp-onboarding-main').scrollTo({ top: 0, behavior: 'auto' }));
  }

  function restoreRoutineDraft() {
    try {
      const draft = JSON.parse(sessionStorage.getItem(routineDraftKey()) || '{}');
      if (!profile.mealsPerDay && draft.mealsPerDay) profile.mealsPerDay = draft.mealsPerDay;
      if (!profile.wakeTime && draft.wakeTime) profile.wakeTime = draft.wakeTime;
      if (!profile.sleepTime && draft.sleepTime) profile.sleepTime = draft.sleepTime;
    } catch (error) {}
  }

  function saveRoutineDraft() {
    sessionStorage.setItem(routineDraftKey(), JSON.stringify({
      mealsPerDay: profile.mealsPerDay,
      wakeTime: profile.wakeTime,
      sleepTime: profile.sleepTime
    }));
  }

  function restoreStepValues() {
    overlay.querySelectorAll('[data-select-group]').forEach(button => {
      button.classList.toggle('selected', profile[button.dataset.selectGroup] === button.dataset.selectValue);
    });

    overlay.querySelectorAll('[data-multi-group]').forEach(button => {
      const values = profile[button.dataset.multiGroup] || [];
      button.classList.toggle('selected', values.includes(button.dataset.multiValue));
    });

    const fieldValues = {
      hpAge: profile.age,
      hpHeight: profile.heightCm,
      hpWeight: profile.weightKg,
      hpTargetWeight: profile.targetWeightKg,
      hpCustomAllergies: profile.customAllergies || sessionStorage.getItem(customAllergyDraftKey()) || '',
      hpMeals: profile.mealsPerDay,
      hpWakeTime: profile.wakeTime,
      hpSleepTime: profile.sleepTime,
      hpNotes: profile.notes
    };

    Object.entries(fieldValues).forEach(([id, value]) => {
      const field = overlay.querySelector(`#${id}`);
      if (field && value !== undefined && value !== '') field.value = value;
    });
  }

  function handleInput(event) {
    if (event.target.id === 'hpCustomAllergies') {
      profile.customAllergies = event.target.value;
      sessionStorage.setItem(customAllergyDraftKey(), event.target.value);
      if (event.target.value.trim()) {
        profile.allergies = profile.allergies.filter(value => value !== 'none');
        const none = overlay.querySelector('[data-multi-group="allergies"][data-multi-value="none"]');
        if (none) none.classList.remove('selected');
        clearAttention('#hpAllergySection');
        clearMessage();
      }
      return;
    }

    if (['hpMeals', 'hpWakeTime', 'hpSleepTime'].includes(event.target.id)) {
      profile.mealsPerDay = overlay.querySelector('#hpMeals')?.value || '';
      profile.wakeTime = overlay.querySelector('#hpWakeTime')?.value || '';
      profile.sleepTime = overlay.querySelector('#hpSleepTime')?.value || '';
      event.target.closest('.hp-input-field')?.classList.remove('invalid');
      saveRoutineDraft();
      if (profile.mealsPerDay && profile.wakeTime && profile.sleepTime) {
        clearAttention('#hpRoutineDetails');
        clearMessage();
      }
    }
  }

  function handleSelection(event) {
    const single = event.target.closest('[data-select-group]');
    if (single) {
      const group = single.dataset.selectGroup;
      profile[group] = single.dataset.selectValue;
      overlay.querySelectorAll(`[data-select-group="${group}"]`).forEach(button => button.classList.toggle('selected', button === single));
      clearMessage();
      tapFeedback();
      return;
    }

    const multi = event.target.closest('[data-multi-group]');
    if (!multi) return;
    const group = multi.dataset.multiGroup;
    const value = multi.dataset.multiValue;
    const current = new Set(profile[group] || []);

    if (value === 'none') {
      current.clear();
      current.add('none');
      if (group === 'allergies') {
        profile.customAllergies = '';
        const customInput = overlay.querySelector('#hpCustomAllergies');
        if (customInput) customInput.value = '';
        sessionStorage.removeItem(customAllergyDraftKey());
      }
    } else {
      current.delete('none');
      current.has(value) ? current.delete(value) : current.add(value);
    }

    profile[group] = [...current];
    overlay.querySelectorAll(`[data-multi-group="${group}"]`).forEach(button => button.classList.toggle('selected', current.has(button.dataset.multiValue)));
    if (group === 'allergies' && current.size) clearAttention('#hpAllergySection');
    clearMessage();
    tapFeedback();
  }

  function collectCurrentStep() {
    if (currentStep === 1) {
      profile.age = overlay.querySelector('#hpAge').value.trim();
      profile.heightCm = overlay.querySelector('#hpHeight').value.trim();
      profile.weightKg = overlay.querySelector('#hpWeight').value.trim();
      profile.targetWeightKg = overlay.querySelector('#hpTargetWeight').value.trim();
    } else if (currentStep === 2) {
      const customInput = overlay.querySelector('#hpCustomAllergies');
      profile.customAllergies = customInput ? customInput.value.trim() : '';
      sessionStorage.setItem(customAllergyDraftKey(), profile.customAllergies);
    } else if (currentStep === 3) {
      profile.mealsPerDay = overlay.querySelector('#hpMeals').value;
      profile.wakeTime = overlay.querySelector('#hpWakeTime').value;
      profile.sleepTime = overlay.querySelector('#hpSleepTime').value;
      saveRoutineDraft();
    } else if (currentStep === 4) {
      profile.notes = overlay.querySelector('#hpNotes').value.trim();
    }
  }

  function numberInRange(value, min, max) {
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max;
  }

  function parsedCustomAllergies() {
    const seen = new Set();
    return String(profile.customAllergies || '')
      .split(',')
      .map(item => item.trim())
      .filter(item => {
        const normalized = item.toLowerCase();
        if (!normalized || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      })
      .slice(0, 20);
  }

  function guideToSection(selector, focusSelector) {
    const section = overlay.querySelector(selector);
    if (!section) return;
    section.classList.add('hp-attention');
    section.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      const focusTarget = focusSelector ? section.querySelector(focusSelector) : null;
      if (focusTarget) focusTarget.focus({ preventScroll: true });
    }, 420);
    setTimeout(() => section.classList.remove('hp-attention'), 1600);
  }

  function clearAttention(selector) {
    const section = overlay && overlay.querySelector(selector);
    if (section) section.classList.remove('hp-attention');
  }

  function guideToRoutineDetails() {
    const details = overlay.querySelector('#hpRoutineDetails');
    if (!details) return;
    details.querySelectorAll('.hp-input-field').forEach(field => field.classList.remove('invalid'));

    let invalidSelector = '';
    if (!profile.mealsPerDay) invalidSelector = '#hpMeals';
    else if (!profile.wakeTime) invalidSelector = '#hpWakeTime';
    else if (!profile.sleepTime) invalidSelector = '#hpSleepTime';

    const invalidInput = invalidSelector ? details.querySelector(invalidSelector) : null;
    invalidInput?.closest('.hp-input-field')?.classList.add('invalid');
    guideToSection('#hpRoutineDetails', invalidSelector || '#hpMeals');
  }

  function validateCurrentStep() {
    collectCurrentStep();
    if (currentStep === 0 && !profile.goal) return showMessage('Choose the goal that matters most to you.');

    if (currentStep === 1) {
      if (!profile.sex) return showMessage('Choose your sex.');
      if (!numberInRange(profile.age, 13, 100)) return showMessage('Enter an age between 13 and 100.');
      if (!numberInRange(profile.heightCm, 100, 230)) return showMessage('Enter a height between 100 and 230 cm.');
      if (!numberInRange(profile.weightKg, 25, 300)) return showMessage('Enter a weight between 25 and 300 kg.');
      if (profile.targetWeightKg && !numberInRange(profile.targetWeightKg, 25, 300)) return showMessage('Enter a valid target weight or leave it blank.');
    }

    if (currentStep === 2) {
      if (!profile.dietType) return showMessage('Choose your food preference.');
      const hasPresetAllergyChoice = Array.isArray(profile.allergies) && profile.allergies.length > 0;
      const hasManualAllergy = parsedCustomAllergies().length > 0;
      if (!hasPresetAllergyChoice && !hasManualAllergy) {
        showMessage('Please choose an allergy option, select None, or add one manually.');
        guideToSection('#hpAllergySection', '#hpCustomAllergies');
        return false;
      }
    }

    if (currentStep === 3) {
      if (!profile.activityLevel) return showMessage('Choose your activity level.');
      if (!profile.mealsPerDay || !profile.wakeTime || !profile.sleepTime) {
        showMessage('Please complete your meals, wake-up time and sleep time.');
        guideToRoutineDetails();
        return false;
      }
    }

    return true;
  }

  function showMessage(message, success = false) {
    const box = overlay.querySelector('#hpFormMessage');
    box.textContent = message;
    box.classList.toggle('success', success);
    return false;
  }

  function clearMessage() {
    const box = overlay && overlay.querySelector('#hpFormMessage');
    if (box) {
      box.textContent = '';
      box.classList.remove('success');
    }
  }

  function goBack() {
    collectCurrentStep();
    if (currentStep > 0) {
      currentStep -= 1;
      renderStep();
      tapFeedback();
    }
  }

  async function goNext() {
    if (!validateCurrentStep()) return;
    tapFeedback();
    if (currentStep < steps.length - 1) {
      currentStep += 1;
      renderStep();
      return;
    }
    await saveAndFinish();
  }

  async function saveAndFinish() {
    const button = overlay.querySelector('#hpNextBtn');
    button.disabled = true;
    button.querySelector('span').textContent = 'Saving your profile';
    button.querySelector('b').textContent = '…';
    clearMessage();

    const user = getUser();
    const customAllergies = parsedCustomAllergies();
    const savedProfile = {
      ...profile,
      allergies: customAllergies.length ? profile.allergies.filter(item => item !== 'none') : profile.allergies,
      customAllergies,
      age: Number(profile.age),
      heightCm: Number(profile.heightCm),
      weightKg: Number(profile.weightKg),
      targetWeightKg: profile.targetWeightKg ? Number(profile.targetWeightKg) : null,
      mealsPerDay: Number(profile.mealsPerDay),
      userId: user.uid || '',
      userEmail: user.email || '',
      version: 3,
      completedAt: new Date().toISOString()
    };

    localStorage.setItem(profileKey(user), JSON.stringify(savedProfile));
    localStorage.setItem(completionKey(user), 'true');
    sessionStorage.removeItem(customAllergyDraftKey());
    sessionStorage.removeItem(routineDraftKey());

    let cloudSaved = false;
    try {
      if (window.firebase && firebase.apps.length && user.uid) {
        await firebase.firestore().collection('users').doc(user.uid).set({
          dietProfile: savedProfile,
          dietProfileCompleted: true,
          dietProfileUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        cloudSaved = true;
      }
    } catch (error) {
      cloudSaved = false;
    }

    showMessage(cloudSaved ? 'Your diet profile is ready.' : 'Profile saved on this device. Cloud sync will retry later.', true);
    setTimeout(closeOverlay, 650);
  }

  function closeOverlay() {
    if (!overlay) return;
    overlay.classList.add('closing');
    setTimeout(() => {
      overlay.remove();
      overlay = null;
      document.body.style.overflow = bodyOverflowBeforeOpen.value;
    }, 220);
  }

  function tapFeedback() {
    try {
      if (navigator.vibrate) navigator.vibrate(8);
    } catch (error) {}
  }

  function boot() {
    ensureEnhancementStyles();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
