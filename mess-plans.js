(() => {
  'use strict';

  const PAGE_ID = 'hpMessPlansPage';
  const USER_KEY = 'nutritiliousUser';
  const API_BASE = 'https://hapycure-register.onrender.com';
  const API_ENDPOINTS = ['/api/kitchens', '/api/admin/kitchen-requests'];
  const BOOKING_KEY_PREFIX = 'hapycureMessBookings_';
  const DEFAULT_MESS = Object.freeze({
    id: 'guruji-kitchen',
    name: "Guruji's Kitchen",
    area: 'Nearby',
    rating: 'New',
    image: '',
    description: 'Fresh, home-style meals prepared daily with simple ingredients.',
    foodType: 'Veg & home-style',
    deliveryTime: 'Daily delivery',
    meals: ['Lunch', 'Dinner'],
    sampleMenu: ['Dal, rice, seasonal sabzi and roti', 'Khichdi or pulao with curd', 'Weekly special thali'],
    features: ['Freshly prepared meals', 'Flexible start date', 'Pause or skip support'],
    weekly: { days: 7, price: null, label: '7-day plan' },
    monthly: { days: 30, price: null, label: '30-day plan' }
  });

  let providers = [];
  let selectedProviderId = '';
  let selectedDuration = 'weekly';
  let screen = 'list';
  let loading = false;
  let loadAttempted = false;
  let observer = null;
  let mountQueued = false;

  function safe(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function valueFrom(source, keys) {
    for (const key of keys) {
      if (source && source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
    }
    return '';
  }

  function numberFrom(value) {
    const number = Number(String(value == null ? '' : value).replace(/[^0-9.]/g, ''));
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function arrayFrom(value) {
    if (Array.isArray(value)) return value.filter(Boolean).map(item => String(item));
    if (typeof value === 'string') return value.split(/[,|]/).map(item => item.trim()).filter(Boolean);
    return [];
  }

  function payloadArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.kitchens)) return payload.kitchens;
    if (payload && Array.isArray(payload.approvedKitchens)) return payload.approvedKitchens;
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (payload && Array.isArray(payload.result)) return payload.result;
    return [];
  }

  function isApproved(kitchen) {
    const status = String(valueFrom(kitchen, ['status', 'approvalStatus', 'requestStatus']) || '').toLowerCase();
    return !status || status === 'approved' || status === 'active';
  }

  function nestedPrice(kitchen, duration) {
    const direct = duration === 'weekly'
      ? valueFrom(kitchen, ['weeklyPrice', 'weeklyPlanPrice', 'pricePerWeek'])
      : valueFrom(kitchen, ['monthlyPrice', 'monthlyPlanPrice', 'pricePerMonth']);
    if (direct) return numberFrom(direct);
    const plan = kitchen && (kitchen[duration] || (kitchen.plans && kitchen.plans[duration]) || (kitchen.messPlans && kitchen.messPlans[duration]));
    return numberFrom(valueFrom(plan, ['price', 'amount', 'total', 'startingPrice']));
  }

  function normalizeKitchen(kitchen, index) {
    const name = valueFrom(kitchen, ['kitchenName', 'businessName', 'name', 'title']) || `Mess ${index + 1}`;
    const weeklyPrice = nestedPrice(kitchen, 'weekly');
    const monthlyPrice = nestedPrice(kitchen, 'monthly');
    const rawMeals = arrayFrom(valueFrom(kitchen, ['mealTypes', 'meals', 'servedMeals', 'availableMeals']));
    const rawMenu = valueFrom(kitchen, ['foodItems', 'menu', 'foods', 'items']);
    const menuNames = Array.isArray(rawMenu)
      ? rawMenu.slice(0, 5).map(item => typeof item === 'string' ? item : valueFrom(item, ['name', 'title', 'foodName'])).filter(Boolean)
      : [];
    const id = valueFrom(kitchen, ['id', '_id', 'uid', 'slug']) || `${name}-${index}`;

    return {
      id: String(id),
      name: String(name),
      area: String(valueFrom(kitchen, ['area', 'city', 'location', 'address']) || 'Nearby'),
      rating: String(valueFrom(kitchen, ['rating', 'averageRating']) || 'New'),
      image: String(valueFrom(kitchen, ['image', 'imageUrl', 'photoUrl']) || (kitchen.photo && kitchen.photo.url) || (kitchen.coverPhoto && kitchen.coverPhoto.url) || ''),
      description: String(valueFrom(kitchen, ['description', 'about', 'bio']) || 'Fresh home-style meals prepared for regular delivery.'),
      foodType: String(valueFrom(kitchen, ['foodType', 'category', 'preference']) || 'Home-style meals'),
      deliveryTime: String(valueFrom(kitchen, ['deliveryTime', 'time', 'openingTime']) || 'Daily delivery'),
      meals: rawMeals.length ? rawMeals.slice(0, 3) : ['Lunch', 'Dinner'],
      sampleMenu: menuNames.length ? menuNames : DEFAULT_MESS.sampleMenu.slice(),
      features: arrayFrom(valueFrom(kitchen, ['features', 'benefits', 'services'])).slice(0, 4).concat(DEFAULT_MESS.features).slice(0, 3),
      weekly: { days: 7, price: weeklyPrice, label: '7-day plan' },
      monthly: { days: 30, price: monthlyPrice, label: '30-day plan' }
    };
  }

  function user() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || '{}') || {}; }
    catch (error) { return {}; }
  }

  function accountId() {
    const current = user();
    return String(current.uid || current.email || current.phone || 'guest').replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function bookingsKey() {
    return BOOKING_KEY_PREFIX + accountId();
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

  function priceLabel(price, suffix) {
    return price ? `₹${price.toLocaleString('en-IN')}${suffix || ''}` : 'Price on confirmation';
  }

  function imageMarkup(provider, className) {
    if (provider.image) {
      return `<img class="${className}" src="${safe(provider.image)}" alt="${safe(provider.name)}" loading="lazy" decoding="async">`;
    }
    const initials = provider.name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();
    return `<div class="${className} hp-mess-image-fallback"><span>${safe(initials || 'M')}</span></div>`;
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

  function pageHeader(title, eyebrow, backAction) {
    return `<header class="hp-mess-header">
      <button type="button" class="hp-mess-back" ${backAction} aria-label="Go back"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"></path></svg></button>
      <div><span>${safe(eyebrow)}</span><h1>${safe(title)}</h1></div>
    </header>`;
  }

  function messCardMarkup(provider) {
    return `<button type="button" class="hp-mess-card" data-mess-provider="${safe(provider.id)}" aria-label="View ${safe(provider.name)} plans">
      <div class="hp-mess-card-media">${imageMarkup(provider, 'hp-mess-card-image')}<span class="hp-mess-open-badge">OPEN</span></div>
      <div class="hp-mess-card-body">
        <div class="hp-mess-card-title"><div><h2>${safe(provider.name)}</h2><p>${safe(provider.area)}</p></div><span class="hp-mess-rating">${safe(provider.rating)}${provider.rating === 'New' ? '' : ' ★'}</span></div>
        <p class="hp-mess-card-description">${safe(provider.description)}</p>
        <div class="hp-mess-card-tags"><span>${safe(provider.foodType)}</span><span>${safe(provider.deliveryTime)}</span></div>
        <div class="hp-mess-card-prices">
          <div><small>WEEKLY</small><strong>${safe(priceLabel(provider.weekly.price))}</strong></div>
          <div><small>MONTHLY</small><strong>${safe(priceLabel(provider.monthly.price))}</strong></div>
          <b>→</b>
        </div>
      </div>
    </button>`;
  }

  function listMarkup() {
    const body = loading
      ? '<div class="hp-mess-loading"><i></i><p>Finding available mess services…</p></div>'
      : providers.length
        ? `<div class="hp-mess-list">${providers.map(messCardMarkup).join('')}</div>`
        : '<div class="hp-mess-empty"><div>🍱</div><h2>No mess service available</h2><p>New mess providers will appear here after approval.</p><button type="button" data-mess-retry>Try again</button></div>';

    return `<div class="hp-mess-screen">
      ${pageHeader('Mess plans', 'WEEKLY & MONTHLY MEALS', 'data-mess-close')}
      <main class="hp-mess-content">
        <section class="hp-mess-list-hero"><span>REGULAR MEALS, MADE EASY</span><h2>Choose a mess near you</h2><p>Compare weekly and monthly plans, see full meal details and book the one you prefer.</p></section>
        <div class="hp-mess-list-head"><div><h2>Available mess services</h2><p>${providers.length ? `${providers.length} provider${providers.length === 1 ? '' : 's'} found` : 'Updated from approved kitchens'}</p></div></div>
        ${body}
      </main>
    </div>`;
  }

  function planTabsMarkup(provider) {
    return `<div class="hp-mess-plan-tabs" role="tablist">
      ${['weekly', 'monthly'].map(duration => {
        const plan = provider[duration];
        return `<button type="button" class="${selectedDuration === duration ? 'selected' : ''}" data-mess-duration="${duration}" role="tab" aria-selected="${selectedDuration === duration}">
          <span>${duration === 'weekly' ? 'Weekly' : 'Monthly'}</span><strong>${safe(priceLabel(plan.price))}</strong><small>${plan.days} days</small>
        </button>`;
      }).join('')}
    </div>`;
  }

  function selectedProvider() {
    return providers.find(provider => provider.id === selectedProviderId) || providers[0] || DEFAULT_MESS;
  }

  function detailMarkup() {
    const provider = selectedProvider();
    const plan = provider[selectedDuration];
    const savedAddress = localStorage.getItem('nutritiliousLiveLocation') || '';
    const minimum = localDate(new Date());

    return `<div class="hp-mess-screen hp-mess-detail-screen">
      ${pageHeader(provider.name, 'MESS DETAILS', 'data-mess-back-list')}
      <main class="hp-mess-content">
        <section class="hp-mess-detail-hero">
          ${imageMarkup(provider, 'hp-mess-detail-image')}
          <div class="hp-mess-detail-overlay"><span>${safe(provider.foodType)}</span><h2>${safe(provider.name)}</h2><p>${safe(provider.area)} · ${safe(provider.rating)}${provider.rating === 'New' ? '' : ' ★'}</p></div>
        </section>
        <p class="hp-mess-about">${safe(provider.description)}</p>

        <section class="hp-mess-section">
          <div class="hp-mess-section-title"><div><span>CHOOSE A PLAN</span><h2>Weekly or monthly</h2></div></div>
          <div id="hpMessPlanTabs">${planTabsMarkup(provider)}</div>
        </section>

        <section class="hp-mess-plan-info" id="hpMessPlanInfo">
          <div class="hp-mess-plan-price"><div><span>${safe(plan.label.toUpperCase())}</span><strong>${safe(priceLabel(plan.price))}</strong></div><b>${plan.days}<small>days</small></b></div>
          <div class="hp-mess-info-grid">
            <div><span>🍽️</span><strong>${safe(provider.meals.join(' & '))}</strong><small>Meals available</small></div>
            <div><span>🛵</span><strong>${safe(provider.deliveryTime)}</strong><small>Delivery schedule</small></div>
          </div>
        </section>

        <section class="hp-mess-section">
          <div class="hp-mess-section-title"><div><span>WHAT YOU GET</span><h2>Plan includes</h2></div></div>
          <div class="hp-mess-feature-list">${provider.features.map(feature => `<div><i>✓</i><span>${safe(feature)}</span></div>`).join('')}</div>
        </section>

        <section class="hp-mess-section">
          <div class="hp-mess-section-title"><div><span>SAMPLE ITEMS</span><h2>Typical menu</h2></div><small>Menu can rotate</small></div>
          <div class="hp-mess-menu-list">${provider.sampleMenu.map((item, index) => `<div><b>${index + 1}</b><span>${safe(item)}</span></div>`).join('')}</div>
        </section>

        <section class="hp-mess-section hp-mess-book-section">
          <div class="hp-mess-section-title"><div><span>BOOK THIS PLAN</span><h2>Delivery details</h2></div></div>
          <div class="hp-mess-field-grid">
            <label class="hp-mess-field"><span>START DATE</span><input id="hpMessStartDate" type="date" min="${minimum}" value="${defaultStartDate()}"></label>
            <label class="hp-mess-field"><span>MEAL</span><select id="hpMessMeal">${provider.meals.map(meal => `<option value="${safe(meal)}">${safe(meal)}</option>`).join('')}<option value="All selected meals">All selected meals</option></select></label>
            <label class="hp-mess-field full"><span>DELIVERY ADDRESS</span><textarea id="hpMessAddress" placeholder="House/flat, street and area">${safe(savedAddress)}</textarea></label>
          </div>
          <p class="hp-mess-message" id="hpMessMessage" role="status" aria-live="polite"></p>
        </section>

        <p class="hp-mess-note">${plan.price ? 'The amount shown is the mess plan price. Any extra delivery charge will be shown during final payment.' : 'The mess will confirm the final price before payment.'}</p>
      </main>
      <footer class="hp-mess-footer"><button type="button" class="hp-mess-book-button" data-mess-book><span><small>${safe(selectedDuration.toUpperCase())} PLAN</small><strong>Book this mess</strong></span><b>→</b></button></footer>
    </div>`;
  }

  function successMarkup(booking) {
    return `<div class="hp-mess-screen">
      ${pageHeader('Booking requested', 'MESS PLAN', 'data-mess-close')}
      <div class="hp-mess-success">
        <div class="hp-mess-success-icon">✓</div>
        <h2>Mess plan booked</h2>
        <p>Your ${safe(booking.duration)} plan request for <strong>${safe(booking.providerName)}</strong> has been saved.</p>
        <div class="hp-mess-success-card"><div><span>Plan</span><strong>${safe(booking.durationLabel)}</strong></div><div><span>Starts</span><strong>${safe(booking.startDate)}</strong></div><div><span>Meal</span><strong>${safe(booking.meal)}</strong></div><div><span>Status</span><strong>Confirmation pending</strong></div></div>
        <button type="button" data-mess-close>Back to homepage</button>
      </div>
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

  function render() {
    const page = ensurePage();
    if (!page) return;
    page.innerHTML = screen === 'detail' ? detailMarkup() : listMarkup();
    page.scrollTop = 0;
  }

  async function loadProviders(force) {
    if (loading || (loadAttempted && !force)) return;
    loading = true;
    loadAttempted = true;
    if (screen === 'list') render();
    const kitchens = [];

    for (const endpoint of API_ENDPOINTS) {
      try {
        const response = await fetch(API_BASE + endpoint);
        if (!response.ok) continue;
        const payload = await response.json();
        payloadArray(payload).filter(isApproved).forEach(kitchen => kitchens.push(kitchen));
        if (kitchens.length) break;
      } catch (error) {}
    }

    const seen = new Set();
    providers = kitchens.map(normalizeKitchen).filter(provider => {
      const key = provider.id || provider.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!providers.length) providers = [{ ...DEFAULT_MESS, weekly: { ...DEFAULT_MESS.weekly }, monthly: { ...DEFAULT_MESS.monthly } }];
    loading = false;
    if (screen === 'list') render();
  }

  function open() {
    screen = 'list';
    selectedProviderId = '';
    selectedDuration = 'weekly';
    const page = ensurePage();
    if (!page) return;
    render();
    page.classList.add('show');
    page.setAttribute('aria-hidden', 'false');
    document.body.classList.add('hp-mess-open');
    document.querySelectorAll('[data-order-mode]').forEach(button => button.classList.toggle('active', button.dataset.orderMode === 'mess'));
    loadProviders(false);
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

  function openProvider(providerId) {
    if (!providers.some(provider => provider.id === providerId)) return;
    selectedProviderId = providerId;
    selectedDuration = 'weekly';
    screen = 'detail';
    render();
  }

  function backToList() {
    screen = 'list';
    render();
  }

  function setDuration(duration) {
    if (!['weekly', 'monthly'].includes(duration)) return;
    const date = document.getElementById('hpMessStartDate');
    const meal = document.getElementById('hpMessMeal');
    const address = document.getElementById('hpMessAddress');
    const formState = {
      date: date && date.value,
      meal: meal && meal.value,
      address: address && address.value
    };
    selectedDuration = duration;
    render();
    if (formState.date) document.getElementById('hpMessStartDate').value = formState.date;
    if (formState.meal) document.getElementById('hpMessMeal').value = formState.meal;
    if (formState.address) document.getElementById('hpMessAddress').value = formState.address;
  }

  function setMessage(message) {
    const box = document.getElementById('hpMessMessage');
    if (box) box.textContent = message || '';
  }

  function saveBooking() {
    const provider = selectedProvider();
    const plan = provider[selectedDuration];
    const startDate = document.getElementById('hpMessStartDate');
    const meal = document.getElementById('hpMessMeal');
    const address = document.getElementById('hpMessAddress');
    const startValue = startDate && startDate.value;
    const mealValue = meal && meal.value;
    const addressValue = address && address.value.trim();

    if (!startValue) {
      setMessage('Choose a start date.');
      if (startDate) startDate.focus();
      return;
    }
    if (!addressValue) {
      setMessage('Add your complete delivery address.');
      if (address) address.focus();
      return;
    }

    const booking = {
      id: `mess-${Date.now()}`,
      source: 'mess-listing',
      providerId: provider.id,
      providerName: provider.name,
      duration: selectedDuration,
      durationLabel: plan.label,
      days: plan.days,
      price: plan.price,
      meal: mealValue,
      startDate: startValue,
      address: addressValue,
      status: 'confirmation-pending',
      createdAt: new Date().toISOString()
    };

    let bookings = [];
    try {
      const stored = JSON.parse(localStorage.getItem(bookingsKey()) || '[]');
      if (Array.isArray(stored)) bookings = stored;
    } catch (error) {}
    bookings.unshift(booking);
    localStorage.setItem(bookingsKey(), JSON.stringify(bookings.slice(0, 20)));
    localStorage.setItem('nutritiliousLiveLocation', addressValue);
    screen = 'success';
    const page = ensurePage();
    if (page) {
      page.innerHTML = successMarkup(booking);
      page.scrollTop = 0;
    }
  }

  function mountChooser() {
    mountQueued = false;
    const home = document.getElementById('page-home');
    const categories = home && home.querySelector('.home-categories');
    if (!categories || categories.querySelector('#hpOrderTypes')) return;
    categories.insertAdjacentHTML('afterbegin', modeChooserMarkup());
    ensurePage();
  }

  function queueMount() {
    if (mountQueued) return;
    mountQueued = true;
    requestAnimationFrame(mountChooser);
  }

  function handleClick(event) {
    const mode = event.target.closest('[data-order-mode]');
    if (mode) {
      if (mode.dataset.orderMode === 'mess') open();
      else {
        close();
        const categories = document.querySelector('#page-home .category-row');
        if (categories) categories.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    if (event.target.closest('[data-mess-close]')) {
      close();
      return;
    }
    if (event.target.closest('[data-mess-back-list]')) {
      backToList();
      return;
    }
    if (event.target.closest('[data-mess-retry]')) {
      loadProviders(true);
      return;
    }

    const provider = event.target.closest('[data-mess-provider]');
    if (provider) {
      openProvider(provider.dataset.messProvider);
      return;
    }

    const duration = event.target.closest('[data-mess-duration]');
    if (duration) {
      setDuration(duration.dataset.messDuration);
      return;
    }

    if (event.target.closest('[data-mess-book]')) saveBooking();
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
      if (event.key !== 'Escape') return;
      if (screen === 'detail') backToList();
      else close();
    });
    window.addEventListener('pageshow', queueMount);
    window.HapycureMessPlans = Object.freeze({ open, close });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
