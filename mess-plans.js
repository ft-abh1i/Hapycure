(() => {
  'use strict';

  const PAGE_ID = 'hpMessPlansPage';
  const USER_KEY = 'nutritiliousUser';
  const BOOKING_KEY_PREFIX = 'hapycureMessBookings_';

  let providers = [];
  let selectedProviderId = '';
  let selectedDuration = 'weekly';
  let screen = 'list';
  let loading = true;
  let loadError = false;
  let catalogUnsubscribe = null;
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

  function stringList(value) {
    if (Array.isArray(value)) return value.map(String).map(item => item.trim()).filter(Boolean);
    if (typeof value === 'string') return value.split(/[,|]/).map(item => item.trim()).filter(Boolean);
    return [];
  }

  function planDuration(plan) {
    const cycle = String(plan?.cycle || '').trim().toLowerCase();
    if (cycle === 'weekly') return 'weekly';
    if (cycle === 'monthly') return 'monthly';
    return '';
  }

  function menuEntries(menu) {
    if (!menu || typeof menu !== 'object' || Array.isArray(menu)) return [];
    return Object.entries(menu)
      .map(([day, item]) => [String(day || '').trim(), String(item || '').trim()])
      .filter(([, item]) => item)
      .map(([day, item]) => day ? `${day}: ${item}` : item);
  }

  function normalizeRestaurant(restaurant) {
    const businessName = String(restaurant.name || 'Hapycure Mess').trim();
    return {
      id: String(restaurant.__id),
      restaurantId: String(restaurant.__id),
      name: businessName,
      businessName,
      area: String(restaurant.address || 'Nearby'),
      rating: 'New',
      image: String(restaurant.bannerImage || restaurant.image || ''),
      description: `Mess profile published by ${businessName}.`,
      foodType: String(restaurant.foodType || 'Mess service'),
      deliveryTime: 'Plans coming soon',
      meals: [],
      sampleMenu: [],
      features: [],
      weekly: null,
      monthly: null,
      profileOnly: true
    };
  }

  function normalizePlan(plan, restaurant) {
    const duration = planDuration(plan);
    if (!duration) return null;
    const price = Number(plan.price);
    if (!Number.isFinite(price) || price <= 0) return null;

    const businessName = String(restaurant.name || 'Hapycure Partner').trim();
    const planName = String(plan.name || `${duration === 'weekly' ? 'Weekly' : 'Monthly'} plan`).trim();
    const meals = stringList(plan.meals);
    const deliveryDays = String(plan.deliveryDays || '').trim();
    const sampleMenu = menuEntries(plan.menu);
    const planData = {
      id: plan.__id,
      days: duration === 'weekly' ? 7 : 30,
      price,
      label: planName,
      meals,
      deliveryDays,
      sampleMenu
    };

    return {
      id: String(plan.__id),
      restaurantId: String(plan.restaurantId || ''),
      name: planName,
      businessName,
      area: String(restaurant.address || 'Nearby'),
      rating: 'New',
      image: String(restaurant.bannerImage || restaurant.image || ''),
      description: `Published by ${businessName}.`,
      foodType: String(restaurant.foodType || 'Mess service'),
      deliveryTime: deliveryDays || 'Schedule shared by partner',
      meals,
      sampleMenu,
      features: [
        `${duration === 'weekly' ? 'Weekly' : 'Monthly'} subscription`,
        deliveryDays ? `Delivery: ${deliveryDays}` : '',
        meals.length ? `Meals: ${meals.join(', ')}` : ''
      ].filter(Boolean),
      weekly: duration === 'weekly' ? planData : null,
      monthly: duration === 'monthly' ? planData : null,
      profileOnly: false
    };
  }

  function providersFromSnapshot(snapshot) {
    const messRestaurants = (snapshot.restaurants || []).filter(restaurant =>
      restaurant.source === 'hapycure-merchant' &&
      restaurant.service === 'mess' &&
      restaurant.open !== false &&
      restaurant.published !== false
    );
    const restaurants = new Map(messRestaurants.map(restaurant => [restaurant.__id, restaurant]));

    const planProviders = (snapshot.messPlans || [])
      .filter(plan =>
        plan.source === 'hapycure-merchant' &&
        plan.active !== false
      )
      .map(plan => {
        const restaurantId = String(plan.restaurantId || '');
        const restaurant = restaurants.get(restaurantId) || {
          __id: restaurantId,
          name: 'Hapycure Mess',
          address: 'Nearby',
          foodType: 'Mess service',
          image: '',
          bannerImage: ''
        };
        return normalizePlan(plan, restaurant);
      })
      .filter(Boolean);
    const restaurantsWithPlans = new Set(planProviders.map(provider => provider.restaurantId));
    const newMessProfiles = messRestaurants
      .filter(restaurant => !restaurantsWithPlans.has(String(restaurant.__id)))
      .map(normalizeRestaurant);

    return [...planProviders, ...newMessProfiles]
      .sort((a, b) => a.businessName.localeCompare(b.businessName) || a.name.localeCompare(b.name));
  }

  function applyCatalog(snapshot) {
    if (!snapshot?.ready?.messPlans) return;
    providers = providersFromSnapshot(snapshot);
    loading = false;
    loadError = false;
    if (selectedProviderId && !providers.some(provider => provider.id === selectedProviderId)) {
      selectedProviderId = '';
      screen = 'list';
    }
    if (document.getElementById(PAGE_ID)?.classList.contains('show')) render();
  }

  function bindCatalog() {
    if (catalogUnsubscribe || !window.HapycureMerchantCatalog) {
      if (!window.HapycureMerchantCatalog) {
        loading = false;
        loadError = true;
      }
      return;
    }
    catalogUnsubscribe = window.HapycureMerchantCatalog.subscribe(applyCatalog, (error, collectionName) => {
      if (collectionName !== 'restaurants' && collectionName !== 'messPlans' && collectionName !== 'setup') return;
      console.error('Live merchant mess plans unavailable:', error);
      loading = false;
      loadError = true;
      if (document.getElementById(PAGE_ID)?.classList.contains('show')) render();
    });
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

  function priceLabel(price) {
    return price ? `₹${price.toLocaleString('en-IN')}` : 'Price on confirmation';
  }

  function imageMarkup(provider, className) {
    if (provider.image) {
      return `<img class="${className}" src="${safe(provider.image)}" alt="${safe(provider.businessName)}" loading="lazy" decoding="async">`;
    }
    const initials = provider.businessName.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();
    return `<div class="${className} hp-mess-image-fallback"><span>${safe(initials || 'M')}</span></div>`;
  }

  function modeChooserMarkup() {
    return `<div class="hp-order-types" id="hpOrderTypes" aria-label="Choose ordering type">
      <button type="button" class="hp-order-type active" data-order-mode="once"><strong>Order food</strong></button>
      <button type="button" class="hp-order-type" data-order-mode="mess"><strong>Mess plans</strong></button>
    </div>`;
  }

  function pageHeader(title, eyebrow, backAction) {
    return `<header class="hp-mess-header">
      <button type="button" class="hp-mess-back" ${backAction} aria-label="Go back"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"></path></svg></button>
      <div><span>${safe(eyebrow)}</span><h1>${safe(title)}</h1></div>
    </header>`;
  }

  function availableDurations(provider) {
    return ['weekly', 'monthly'].filter(duration => provider[duration]);
  }

  function messCardMarkup(provider) {
    const durations = availableDurations(provider);
    const duration = durations[0];
    const plan = duration ? provider[duration] : null;
    const pureVegClass = String(provider.foodType || '').trim().toLowerCase() === 'pure veg'
      ? ' pure-veg'
      : '';
    const planSummary = plan
      ? `<div class="hp-mess-card-offer"><span>${duration === 'weekly' ? 'Weekly' : 'Monthly'}</span><strong>${safe(priceLabel(plan.price))}</strong><b>→</b></div>`
      : '<div class="hp-mess-card-offer pending"><span>Plans coming soon</span><b>→</b></div>';

    return `<button type="button" class="hp-mess-card" data-mess-provider="${safe(provider.id)}" aria-label="View ${safe(provider.name)}">
      <div class="hp-mess-card-media">${imageMarkup(provider, 'hp-mess-card-image')}</div>
      <div class="hp-mess-card-body">
        <div class="hp-mess-card-title"><h2>${safe(provider.name)}</h2><span class="hp-mess-title-food${pureVegClass}">${safe(provider.foodType)}</span></div>
        ${planSummary}
      </div>
    </button>`;
  }

  function listMarkup() {
    const emptyText = loadError
      ? 'Live mess plans could not be loaded. Check Firestore access and try again.'
      : 'Mess providers will appear automatically after completing partner onboarding.';
    const body = loading
      ? '<div class="hp-mess-loading"><i></i><p>Loading live mess plans…</p></div>'
      : providers.length
        ? `<div class="hp-mess-list">${providers.map(messCardMarkup).join('')}</div>`
        : `<div class="hp-mess-empty"><div>🍱</div><h2>No mess provider available</h2><p>${safe(emptyText)}</p><button type="button" data-mess-retry>Try again</button></div>`;

    return `<div class="hp-mess-screen">
      ${pageHeader('Mess plans', 'LIVE PARTNER PLANS', 'data-mess-close')}
      <main class="hp-mess-content">
        <section class="hp-mess-list-hero"><span>REGULAR MEALS, MADE EASY</span><h2>Healthy meals, every day.</h2><p>Choose a trusted mess partner and subscribe to a weekly or monthly meal plan.</p></section>
        <div class="hp-mess-list-head"><div><h2>Available mess providers</h2><p>${providers.length ? `${providers.length} listing${providers.length === 1 ? '' : 's'} found` : 'Live merchant catalogue'}</p></div></div>
        ${body}
      </main>
    </div>`;
  }

  function planTabsMarkup(provider) {
    return `<div class="hp-mess-plan-tabs" role="tablist">
      ${availableDurations(provider).map(duration => {
        const plan = provider[duration];
        return `<button type="button" class="${selectedDuration === duration ? 'selected' : ''}" data-mess-duration="${duration}" role="tab" aria-selected="${selectedDuration === duration}">
          <span><b>${duration === 'weekly' ? 'Weekly plan' : 'Monthly plan'}</b><small>${plan.days} days</small></span><strong>${safe(priceLabel(plan.price))}</strong><i aria-hidden="true">✓</i>
        </button>`;
      }).join('')}
    </div>`;
  }

  function selectedProvider() {
    return providers.find(provider => provider.id === selectedProviderId) || null;
  }

  function detailMarkup() {
    const provider = selectedProvider();
    if (!provider) return listMarkup();
    const durations = availableDurations(provider);
    const plan = provider[selectedDuration] || provider[durations[0]];
    if (!plan) {
      return `<div class="hp-mess-screen hp-mess-detail-screen">
        ${pageHeader('Plan details', 'MESS PLAN', 'data-mess-back-list')}
        <main class="hp-mess-content">
          <section class="hp-mess-detail-hero">
            ${imageMarkup(provider, 'hp-mess-detail-image')}
            <div class="hp-mess-detail-overlay"><span>${safe(provider.foodType)}</span><h2>${safe(provider.name)}</h2></div>
          </section>
          <div class="hp-mess-empty hp-mess-profile-empty"><div>—</div><h2>Plans coming soon</h2><p>This mess partner has not published a weekly or monthly plan yet.</p></div>
        </main>
      </div>`;
    }
    const savedAddress = localStorage.getItem('nutritiliousLiveLocation') || '';
    const minimum = localDate(new Date());
    const menuSection = provider.sampleMenu.length
      ? `<section class="hp-mess-section"><div class="hp-mess-section-title"><div><span>SAMPLE MENU</span><h2>Day-wise meals</h2></div></div><div class="hp-mess-menu-list">${provider.sampleMenu.map((item, index) => `<div><b>${index + 1}</b><span>${safe(item)}</span></div>`).join('')}</div></section>`
      : '';
    const mealOptions = provider.meals.map(meal => `<option value="${safe(meal)}">${safe(meal)}</option>`).join('');
    const cycleLabel = selectedDuration === 'monthly' ? 'Monthly' : 'Weekly';

    return `<div class="hp-mess-screen hp-mess-detail-screen">
      ${pageHeader('Plan details', 'MESS PLAN', 'data-mess-back-list')}
      <main class="hp-mess-content">
        <section class="hp-mess-detail-hero">
          ${imageMarkup(provider, 'hp-mess-detail-image')}
          <div class="hp-mess-detail-overlay"><span>${safe(provider.foodType)}</span><h2>${safe(provider.name)}</h2></div>
        </section>
        <section class="hp-mess-section">
          <div class="hp-mess-section-title"><div><span>CHOOSE YOUR PLAN</span><h2>Select a duration</h2></div></div>
          <div id="hpMessPlanTabs">${planTabsMarkup(provider)}</div>
        </section>
        <section class="hp-mess-plan-info" id="hpMessPlanInfo">
          <div class="hp-mess-includes-title"><span>PLAN INCLUDES</span><h2>What you get</h2></div>
          <div class="hp-mess-info-grid">
            <div><small>MEALS</small><strong>${safe(provider.meals.join(' & ') || 'Partner selection')}</strong></div>
            <div><small>SCHEDULE</small><strong>${safe(provider.deliveryTime)}</strong></div>
          </div>
        </section>
        ${menuSection}
        <section class="hp-mess-section hp-mess-book-section">
          <div class="hp-mess-section-title"><div><span>START YOUR PLAN</span><h2>Delivery details</h2></div></div>
          <div class="hp-mess-field-grid">
            <label class="hp-mess-field"><span>START DATE</span><input id="hpMessStartDate" type="date" min="${minimum}" value="${defaultStartDate()}"></label>
            <label class="hp-mess-field"><span>MEAL</span><select id="hpMessMeal">${mealOptions}<option value="Published plan">Published plan</option></select></label>
            <div class="hp-mess-location-card full${savedAddress ? '' : ' empty'}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.1 7-12a7 7 0 10-14 0c0 5.9 7 12 7 12z"></path><circle cx="12" cy="9" r="2.5"></circle></svg>
              <div><small>DELIVER TO</small><strong id="hpMessAddressText">${safe(savedAddress || 'Select location from homepage')}</strong></div>
              <button type="button" data-mess-change-location>${savedAddress ? 'Change' : 'Add'}</button>
            </div>
          </div>
          <p class="hp-mess-message" id="hpMessMessage" role="status" aria-live="polite"></p>
          <button type="button" class="hp-mess-book-button" data-mess-book><span><small>${safe(cycleLabel)} · ${safe(priceLabel(plan.price))}</small><strong>Book this plan</strong></span><b>→</b></button>
        </section>
        <p class="hp-mess-note">Final delivery charges, if any, will be confirmed before payment.</p>
      </main>
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
    try {
      page.innerHTML = screen === 'detail' ? detailMarkup() : listMarkup();
    } catch (error) {
      console.error('Mess plan page render failed:', error);
      page.innerHTML = `<div class="hp-mess-screen">
        ${pageHeader('Mess plans', 'LIVE PARTNER PLANS', 'data-mess-close')}
        <main class="hp-mess-content">
          <div class="hp-mess-empty"><div>!</div><h2>Mess plans could not be displayed</h2><p>Refresh the live catalogue and try again.</p><button type="button" data-mess-retry>Try again</button></div>
        </main>
      </div>`;
    }
    page.scrollTop = 0;
  }

  function retryLoad() {
    loading = true;
    loadError = false;
    render();
    window.HapycureMerchantCatalog?.refresh();
  }

  function open() {
    screen = 'list';
    selectedProviderId = '';
    selectedDuration = 'weekly';
    const page = ensurePage();
    if (!page) return;
    bindCatalog();
    render();
    page.classList.add('show');
    page.setAttribute('aria-hidden', 'false');
    document.body.classList.add('hp-mess-open');
    document.querySelectorAll('[data-order-mode]').forEach(button => button.classList.toggle('active', button.dataset.orderMode === 'mess'));
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
    const provider = providers.find(item => item.id === providerId);
    if (!provider) return;
    selectedProviderId = providerId;
    selectedDuration = availableDurations(provider)[0] || '';
    screen = 'detail';
    render();
  }

  function backToList() {
    screen = 'list';
    render();
  }

  function setDuration(duration) {
    const provider = selectedProvider();
    if (!provider?.[duration]) return;
    const date = document.getElementById('hpMessStartDate');
    const meal = document.getElementById('hpMessMeal');
    const formState = {
      date: date && date.value,
      meal: meal && meal.value
    };
    selectedDuration = duration;
    render();
    if (formState.date) document.getElementById('hpMessStartDate').value = formState.date;
    if (formState.meal) document.getElementById('hpMessMeal').value = formState.meal;
  }

  function syncDeliveryAddress(address) {
    const value = String(address || localStorage.getItem('nutritiliousLiveLocation') || '').trim();
    const card = document.querySelector('.hp-mess-location-card');
    const text = document.getElementById('hpMessAddressText');
    const button = card && card.querySelector('[data-mess-change-location]');
    if (text) text.textContent = value || 'Select location from homepage';
    if (card) card.classList.toggle('empty', !value);
    if (button) button.textContent = value ? 'Change' : 'Add';
  }

  function setMessage(message) {
    const box = document.getElementById('hpMessMessage');
    if (box) box.textContent = message || '';
  }

  function saveBooking() {
    const provider = selectedProvider();
    const plan = provider?.[selectedDuration];
    if (!provider || !plan) return;
    const startDate = document.getElementById('hpMessStartDate');
    const meal = document.getElementById('hpMessMeal');
    const startValue = startDate && startDate.value;
    const mealValue = meal && meal.value;
    const addressValue = String(localStorage.getItem('nutritiliousLiveLocation') || '').trim();

    if (!startValue) {
      setMessage('Choose a start date.');
      if (startDate) startDate.focus();
      return;
    }
    if (!addressValue) {
      setMessage('Select your delivery location first.');
      const locationButton = document.querySelector('[data-mess-change-location]');
      if (locationButton) locationButton.focus();
      return;
    }

    const booking = {
      id: `mess-${Date.now()}`,
      source: 'mess-listing',
      providerId: provider.id,
      restaurantId: provider.restaurantId,
      providerName: provider.businessName,
      planName: provider.name,
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
    if (event.target.closest('[data-mess-close]')) return void close();
    if (event.target.closest('[data-mess-back-list]')) return void backToList();
    if (event.target.closest('[data-mess-retry]')) return void retryLoad();
    if (event.target.closest('[data-mess-change-location]')) {
      document.getElementById('locationBtn')?.click();
      return;
    }

    const provider = event.target.closest('[data-mess-provider]');
    if (provider) return void openProvider(provider.dataset.messProvider);
    const duration = event.target.closest('[data-mess-duration]');
    if (duration) return void setDuration(duration.dataset.messDuration);
    if (event.target.closest('[data-mess-book]')) saveBooking();
  }

  function boot() {
    bindCatalog();
    queueMount();
    const root = document.getElementById('root');
    if (root && !observer) {
      observer = new MutationObserver(queueMount);
      observer.observe(root, { childList: true, subtree: true });
    }
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (document.getElementById('locationSheet')?.classList.contains('show')) return;
      if (screen === 'detail') backToList();
      else close();
    });
    window.addEventListener('pageshow', queueMount);
    window.addEventListener('hapycure:location-changed', event => syncDeliveryAddress(event.detail?.address));
    window.HapycureMessPlans = Object.freeze({ open, close });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
