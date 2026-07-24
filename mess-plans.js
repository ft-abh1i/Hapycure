(() => {
  'use strict';

  const PAGE_ID = 'hpMessPlansPage';
  const USER_KEY = 'nutritiliousUser';
  const state = {
    duration: 'weekly',
    slots: ['lunch', 'dinner'],
    startDate: '',
    deliveryWindow: 'lunch-12-2',
    address: ''
  };
  let observer = null;
  let queued = false;

  const durationConfig = {
    weekly: { label: 'Weekly plan', days: 7, note: 'Renews every 7 days' },
    monthly: { label: 'Monthly plan', days: 30, note: 'Best for everyday meals' }
  };

  const slotConfig = {
    breakfast: { label: 'Breakfast', time: '7:30 AM – 10:00 AM', icon: '☀️' },
    lunch: { label: 'Lunch', time: '12:00 PM – 2:30 PM', icon: '🍱' },
    dinner: { label: 'Dinner', time: '7:00 PM – 10:00 PM', icon: '🌙' }
  };

  function safe(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function user() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || '{}') || {}; }
    catch (error) { return {}; }
  }

  function accountId() {
    const current = user();
    return String(current.uid || current.email || current.phone || 'guest').replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function draftKey() {
    return `hapycureMessPlanDraft_${accountId()}`;
  }

  function profileComplete() {
    return localStorage.getItem(`nutritiliousDietProfile_${accountId()}_completed`) === 'true';
  }

  function localDate(date) {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
  }

  function defaultStartDate() {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return localDate(date);
  }

  function loadDraft() {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey()) || 'null');
      if (!saved || typeof saved !== 'object') return;
      if (durationConfig[saved.duration]) state.duration = saved.duration;
      if (Array.isArray(saved.slots)) {
        const slots = saved.slots.filter(slot => slotConfig[slot]);
        if (slots.length) state.slots = slots;
      }
      if (saved.startDate) state.startDate = saved.startDate;
      if (saved.deliveryWindow) state.deliveryWindow = saved.deliveryWindow;
      if (saved.address) state.address = saved.address;
    } catch (error) {}
  }

  function currentAddress() {
    return state.address || localStorage.getItem('nutritiliousLiveLocation') || '';
  }

  function selectedMeals() {
    return durationConfig[state.duration].days * state.slots.length;
  }

  function slotNames() {
    return state.slots.map(slot => slotConfig[slot].label).join(', ');
  }

  function modeChooserMarkup() {
    return `<div class="hp-order-types" id="hpOrderTypes" aria-label="Choose ordering type">
      <button type="button" class="hp-order-type active" data-order-mode="once">
        <span class="hp-order-type-icon">🍽️</span>
        <span><strong>Order food</strong><small>One-time delivery</small></span>
      </button>
      <button type="button" class="hp-order-type" data-order-mode="mess">
        <span class="hp-order-type-icon">📅</span>
        <span><strong>Mess plans</strong><small>Weekly or monthly</small></span>
      </button>
    </div>`;
  }

  function durationMarkup() {
    return `<div class="hp-mess-duration-grid">
      <button type="button" class="hp-mess-duration${state.duration === 'weekly' ? ' selected' : ''}" data-mess-duration="weekly">
        <i>7</i><strong>Weekly</strong><small>7 days · flexible renewal</small>
      </button>
      <button type="button" class="hp-mess-duration${state.duration === 'monthly' ? ' selected' : ''}" data-mess-duration="monthly">
        <span class="hp-mess-duration-badge">BEST VALUE</span><i>30</i><strong>Monthly</strong><small>30 days · everyday convenience</small>
      </button>
    </div>`;
  }

  function slotsMarkup() {
    return `<div class="hp-mess-slot-grid">${Object.entries(slotConfig).map(([key, config]) => `
      <button type="button" class="hp-mess-slot${state.slots.includes(key) ? ' selected' : ''}" data-mess-slot="${key}" aria-pressed="${state.slots.includes(key)}">
        <span class="hp-mess-slot-icon">${config.icon}</span>
        <span><strong>${config.label}</strong><small>${config.time}</small></span>
        <span class="hp-mess-check">✓</span>
      </button>`).join('')}</div>`;
  }

  function formMarkup() {
    const minDate = localDate(new Date());
    return `<div class="hp-mess-field-grid">
      <label class="hp-mess-field"><span>START DATE</span><input id="hpMessStartDate" type="date" min="${minDate}" value="${safe(state.startDate || defaultStartDate())}"></label>
      <label class="hp-mess-field"><span>DELIVERY WINDOW</span><select id="hpMessDeliveryWindow">
        <option value="breakfast-8-10"${state.deliveryWindow === 'breakfast-8-10' ? ' selected' : ''}>8–10 AM</option>
        <option value="lunch-12-2"${state.deliveryWindow === 'lunch-12-2' ? ' selected' : ''}>12–2 PM</option>
        <option value="dinner-7-9"${state.deliveryWindow === 'dinner-7-9' ? ' selected' : ''}>7–9 PM</option>
      </select></label>
      <label class="hp-mess-field full"><span>DELIVERY ADDRESS</span><textarea id="hpMessAddress" placeholder="House/flat, street and area">${safe(currentAddress())}</textarea></label>
    </div>`;
  }

  function summaryMarkup() {
    const config = durationConfig[state.duration];
    return `<div class="hp-mess-summary" id="hpMessSummary">
      <div class="hp-mess-summary-row"><span>Plan</span><strong>${config.label}</strong></div>
      <div class="hp-mess-summary-row"><span>Meals selected</span><strong>${safe(slotNames())}</strong></div>
      <div class="hp-mess-summary-row"><span>Total deliveries</span><strong>${selectedMeals()} meals</strong></div>
      <div class="hp-mess-summary-row"><span>Price</span><strong>Shown at checkout</strong></div>
    </div>`;
  }

  function pageMarkup() {
    return `<div class="hp-mess-screen">
      <header class="hp-mess-header">
        <button type="button" class="hp-mess-back" data-mess-close aria-label="Back to homepage"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"></path></svg></button>
        <div><span>HAPYCURE SUBSCRIPTION</span><h1>Choose your mess plan</h1></div>
      </header>
      <main class="hp-mess-content">
        <section class="hp-mess-hero"><strong>Fresh meals,<br>on your schedule.</strong><p>Choose a weekly or monthly plan and select only the meals you want delivered.</p><div class="hp-mess-badges"><span>Flexible start date</span><span>Pause or skip later</span><span>Profile matched</span></div></section>
        <section class="hp-mess-section"><div class="hp-mess-section-title"><h2>Plan duration</h2><span>Choose one</span></div><div id="hpMessDurationRoot">${durationMarkup()}</div></section>
        <section class="hp-mess-section"><div class="hp-mess-section-title"><h2>Daily meals</h2><span>Select one or more</span></div><div id="hpMessSlotsRoot">${slotsMarkup()}</div></section>
        <section class="hp-mess-section"><div class="hp-mess-section-title"><h2>Delivery details</h2><span>You can change these later</span></div>${formMarkup()}</section>
        ${summaryMarkup()}
        <p class="hp-mess-note">Final menu, price and delivery availability will be confirmed at checkout. Your saved health profile is used only for suitable meal recommendations.</p>
        <p class="hp-mess-message" id="hpMessMessage" role="status" aria-live="polite"></p>
      </main>
      <footer class="hp-mess-footer"><button type="button" class="hp-mess-continue" data-mess-save><span><small>${selectedMeals()} SCHEDULED MEALS</small><strong>Continue to checkout</strong></span><b>→</b></button></footer>
    </div>`;
  }

  function ensurePage() {
    const home = document.getElementById('page-home');
    if (!home) return null;
    let page = home.querySelector(`#${PAGE_ID}`);
    if (!page) {
      page = document.createElement('section');
      page.id = PAGE_ID;
      page.className = 'hp-mess-page';
      page.setAttribute('aria-hidden', 'true');
      home.appendChild(page);
    }
    return page;
  }

  function renderPage() {
    const page = ensurePage();
    if (!page) return;
    page.innerHTML = pageMarkup();
  }

  function renderSelections() {
    const durationRoot = document.getElementById('hpMessDurationRoot');
    const slotsRoot = document.getElementById('hpMessSlotsRoot');
    const summary = document.getElementById('hpMessSummary');
    const footer = document.querySelector(`#${PAGE_ID} .hp-mess-footer`);
    if (durationRoot) durationRoot.innerHTML = durationMarkup();
    if (slotsRoot) slotsRoot.innerHTML = slotsMarkup();
    if (summary) summary.outerHTML = summaryMarkup();
    if (footer) footer.innerHTML = `<button type="button" class="hp-mess-continue" data-mess-save><span><small>${selectedMeals()} SCHEDULED MEALS</small><strong>Continue to checkout</strong></span><b>→</b></button>`;
  }

  function open() {
    loadDraft();
    if (!state.startDate) state.startDate = defaultStartDate();
    renderPage();
    const page = document.getElementById(PAGE_ID);
    if (!page) return;
    page.classList.add('show');
    page.setAttribute('aria-hidden', 'false');
    document.body.classList.add('hp-mess-open');
    const back = page.querySelector('[data-mess-close]');
    if (back) back.focus({ preventScroll: true });
  }

  function close() {
    const page = document.getElementById(PAGE_ID);
    if (!page || !page.classList.contains('show')) return false;
    page.classList.remove('show');
    page.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('hp-mess-open');
    document.querySelectorAll('[data-order-mode]').forEach(button => button.classList.toggle('active', button.dataset.orderMode === 'once'));
    return true;
  }

  function requestMessPlans() {
    if (profileComplete()) {
      const subscriptionButton = document.getElementById('subscriptionBtn');
      if (subscriptionButton) subscriptionButton.click();
      else open();
      return;
    }
    const subscriptionButton = document.getElementById('subscriptionBtn');
    if (subscriptionButton) subscriptionButton.click();
  }

  function setMessage(message) {
    const box = document.getElementById('hpMessMessage');
    if (box) box.textContent = message || '';
  }

  function collectForm() {
    const startDate = document.getElementById('hpMessStartDate');
    const deliveryWindow = document.getElementById('hpMessDeliveryWindow');
    const address = document.getElementById('hpMessAddress');
    state.startDate = startDate ? startDate.value : state.startDate;
    state.deliveryWindow = deliveryWindow ? deliveryWindow.value : state.deliveryWindow;
    state.address = address ? address.value.trim() : state.address;
  }

  function saveDraft() {
    collectForm();
    if (!state.slots.length) {
      setMessage('Select at least one daily meal.');
      return;
    }
    if (!state.startDate) {
      setMessage('Choose a start date.');
      return;
    }
    if (!state.address) {
      setMessage('Add your complete delivery address.');
      const address = document.getElementById('hpMessAddress');
      if (address) address.focus();
      return;
    }

    const config = durationConfig[state.duration];
    const draft = {
      source: 'mess-subscription',
      duration: state.duration,
      durationLabel: config.label,
      days: config.days,
      slots: state.slots.slice(),
      meals: selectedMeals(),
      startDate: state.startDate,
      deliveryWindow: state.deliveryWindow,
      address: state.address,
      status: 'ready-for-checkout',
      createdAt: new Date().toISOString()
    };
    localStorage.setItem(draftKey(), JSON.stringify(draft));
    const page = document.getElementById(PAGE_ID);
    if (!page) return;
    page.innerHTML = `<div class="hp-mess-screen"><header class="hp-mess-header"><button type="button" class="hp-mess-back" data-mess-close aria-label="Back to homepage"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"></path></svg></button><div><span>PLAN SAVED</span><h1>Mess subscription</h1></div></header><div class="hp-mess-success"><div class="hp-mess-success-icon">✓</div><h2>Your plan is ready</h2><p>${safe(config.label)} · ${selectedMeals()} scheduled meals starting ${safe(state.startDate)}. Final pricing and payment will be connected at checkout.</p><button type="button" data-mess-close>Back to homepage</button></div></div>`;
  }

  function mountChooser() {
    queued = false;
    const home = document.getElementById('page-home');
    const categories = home && home.querySelector('.home-categories');
    if (!categories || categories.querySelector('#hpOrderTypes')) return;
    categories.insertAdjacentHTML('afterbegin', modeChooserMarkup());
    ensurePage();
  }

  function queueMount() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(mountChooser);
  }

  function handleClick(event) {
    const mode = event.target.closest('[data-order-mode]');
    if (mode) {
      if (mode.dataset.orderMode === 'mess') requestMessPlans();
      else {
        document.querySelectorAll('[data-order-mode]').forEach(button => button.classList.toggle('active', button.dataset.orderMode === 'once'));
        const categories = document.querySelector('#page-home .category-row');
        if (categories) categories.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    if (event.target.closest('[data-mess-close]')) {
      close();
      return;
    }

    const duration = event.target.closest('[data-mess-duration]');
    if (duration) {
      collectForm();
      state.duration = duration.dataset.messDuration;
      renderSelections();
      setMessage('');
      return;
    }

    const slot = event.target.closest('[data-mess-slot]');
    if (slot) {
      collectForm();
      const key = slot.dataset.messSlot;
      if (state.slots.includes(key)) {
        if (state.slots.length === 1) {
          setMessage('Keep at least one daily meal selected.');
          return;
        }
        state.slots = state.slots.filter(value => value !== key);
      } else {
        state.slots.push(key);
      }
      renderSelections();
      setMessage('');
      return;
    }

    if (event.target.closest('[data-mess-save]')) saveDraft();
  }

  function boot() {
    queueMount();
    const root = document.getElementById('root');
    if (root && !observer) {
      observer = new MutationObserver(queueMount);
      observer.observe(root, { childList: true, subtree: true });
    }
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') close();
    });
    window.addEventListener('pageshow', queueMount);
    window.HapycureMessPlans = Object.freeze({ open, close });
    window.addEventListener('hapycure:open-mess-plans', open);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
