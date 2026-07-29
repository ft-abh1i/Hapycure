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
      image: String(restaurant.image || ''),
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
      monthly: duration === 'monthly' ? planData : null
    };
  }

  function providersFromSnapshot(snapshot) {
    const restaurants = new Map(
      (snapshot.restaurants || [])
        .filter(restaurant =>
          restaurant.source === 'hapycure-merchant' &&
          restaurant.service === 'mess' &&
          restaurant.open !== false &&
          restaurant.published !== false
        )
        .map(restaurant => [restaurant.__id, restaurant])
    );

    return (snapshot.messPlans || [])
      .filter(plan =>
        plan.source === 'hapycure-merchant' &&
        plan.active !== false &&
        restaurants.has(plan.restaurantId)
      )
      .map(plan => normalizePlan(plan, restaurants.get(plan.restaurantId)))
      .filter(Boolean)
      .sort((a, b) => a.businessName.localeCompare(b.businessName) || a.name.localeCompare(b.name));
  }

  function applyCatalog(snapshot) {
    if (!snapshot?.ready?.restaurants || !snapshot?.ready?.messPlans) return;
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
      if (collectionName !== 'messPlans' && collectionName !== 'setup') return;
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
    const prices = availableDurations(provider).map(duration => {
      const plan = provider[duration];
      return `<div><small>${duration.toUpperCase()}</small><strong>${safe(priceLabel(plan.price))}</strong></div>`;
    }).join('');

    return `<button type="button" class="hp-mess-card" data-mess-provider="${safe(provider.id)}" aria-label="View ${safe(provider.name)}">
      <div class="hp-mess-card-media">${imageMarkup(provider, 'hp-mess-card-image')}<span class="hp-mess-open-badge">OPEN</span></div>
      <div class="hp-mess-card-body">
        <div class="hp-mess-card-title"><div><h2>${safe(provider.name)}</h2><p>${safe(provider.businessName)} · ${safe(provider.area)}</p></div><span class="hp-mess-rating">${safe(provider.rating)}</span></div>
        <p class="hp-mess-card-description">${safe(provider.description)}</p>
        <div class="hp-mess-card-tags"><span>${safe(provider.foodType)}</span><span>${safe(provider.deliveryTime)}</span></div>
        <div class="hp-mess-card-prices">${prices}<b>→</b></div>
      </div>
    </button>`;
  }

  function listMarkup() {
    const emptyText = loadError
      ? 'Live mess plans could not be loaded. Check Firestore access and try again.'
      : 'Plans will appear automatically after a mess partner publishes them.';
    const body = loading
      ? '<div class="hp-mess-loading"><i></i><p>Loading live mess plans…</p></div>'
      : providers.length
        ? `<div class="hp-mess-list">${providers.map(messCardMarkup).join('')}</div>`
        : `<div class="hp-mess-empty"><div>🍱</div><h2>No mess plan available</h2><p>${safe(emptyText)}</p><button type="button" data-mess-retry>Try again</button></div>`;

    return `<div class="hp-mess-screen">
      ${pageHeader('Mess plans', 'LIVE PARTNER PLANS', 'data-mess-close')}
      <main class="hp-mess-content">
        <section class="hp-mess-list-hero"><span>REGULAR MEALS, MADE EASY</span><h2>Choose a published plan</h2><p>Every listing below comes directly from a Hapycure mess partner.</p></section>
        <div class="hp-mess-list-head"><div><h2>Available mess plans</h2><p>${providers.length ? `${providers.length} plan${providers.length === 1 ? '' : 's'} found` : 'Live merchant catalogue'}</p></div></div>
        ${body}
      </main>
    </div>`;
  }

  function planTabsMarkup(provider) {
    return `<div class="hp-mess-plan-tabs" role="tablist">
      ${availableDurations(provider).map(duration => {
        const plan = provider[duration];
        return `<button type="button" class="${selectedDuration === duration ? 'selected' : ''}" data-mess-duration="${duration}" role="tab" aria-selected="${selectedDuration === duration}">
          <span>${duration === 'weekly' ? 'Weekly' : 'Monthly'}</span><strong>${safe(priceLabel(plan.price))}</strong><small>${plan.days} days</small>
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
    const plan = provider[selectedDuration] || provider[availableDurations(provider)[0]];
    const savedAddress = localStorage.getItem('nutritiliousLiveLocation') || '';
    const minimum = localDate(new Date());
    const featureSection = provider.features.length
      ? `<section class="hp-mess-section"><div class="hp-mess-section-title"><div><span>PLAN DETAILS</span><h2>Published information</h2></div></div><div class="hp-mess-feature-list">${provider.features.map(feature => `<div><i>✓</i><span>${safe(feature)}</span></div>`).join('')}</div></section>`
      : '';
    const menuSection = provider.sampleMenu.length
      ? `<section class="hp-mess-section"><div class="hp-mess-section-title"><div><span>PUBLISHED MENU</span><h2>Day-wise items</h2></div></div><div class="hp-mess-menu-list">${provider.sampleMenu.map((item, index) => `<div><b>${index + 1}</b><span>${safe(item)}</span></div>`).join('')}</div></section>`
      : '';
    const mealOptions = provider.meals.map(meal => `<option value="${safe(meal)}">${safe(meal)}</option>`).join('');

    return `<div class="hp-mess-screen hp-mess-detail-screen">
      ${pageHeader(provider.name, 'MESS DETAILS', 'data-mess-back-list')}
      <main class="hp-mess-content">
        <section class="hp-mess-detail-hero">
          ${imageMarkup(provider, 'hp-mess-detail-image')}
          <div class="hp-mess-detail-overlay"><span>${safe(provider.foodType)}</span><h2>${safe(provider.name)}</h2><p>${safe(provider.businessName)} · ${safe(provider.area)}</p></div>
        </section>
        <p class="hp-mess-about">${safe(provider.description)}</p>
        <section class="hp-mess-section">
          <div class="hp-mess-section-title"><div><span>CHOOSE A PLAN</span><h2>Published duration</h2></div></div>
          <div id="hpMessPlanTabs">${planTabsMarkup(provider)}</div>
        </section>
        <section class="hp-mess-plan-info" id="hpMessPlanInfo">
          <div class="hp-mess-plan-price"><div><span>${safe(plan.label.toUpperCase())}</span><strong>${safe(priceLabel(plan.price))}</strong></div><b>${plan.days}<small>days</small></b></div>
          <div class="hp-mess-info-grid">
            <div><span>🍽️</span><strong>${safe(provider.meals.join(' & ') || 'Partner selection')}</strong><small>Meals available</small></div>
            <div><span>🛵</span><strong>${safe(provider.deliveryTime)}</strong><small>Delivery schedule</small></div>
          </div>
        </section>
        ${featureSection}
        ${menuSection}
        <section class="hp-mess-section hp-mess-book-section">
          <div class="hp-mess-section-title"><div><span>BOOK THIS PLAN</span><h2>Delivery details</h2></div></div>
          <div class="hp-mess-field-grid">
            <label class="hp-mess-field"><span>START DATE</span><input id="hpMessStartDate" type="date" min="${minimum}" value="${defaultStartDate()}"></label>
            <label class="hp-mess-field"><span>MEAL</span><select id="hpMessMeal">${mealOptions}<option value="Published plan">Published plan</option></select></label>
            <label class="hp-mess-field full"><span>DELIVERY ADDRESS</span><textarea id="hpMessAddress" placeholder="House/flat, street and area">${safe(savedAddress)}</textarea></label>
          </div>
          <p class="hp-mess-message" id="hpMessMessage" role="status" aria-live="polite"></p>
        </section>
        <p class="hp-mess-note">The amount shown is the merchant-published plan price. Any extra delivery charge will be shown during final payment.</p>
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
    selectedDuration = availableDurations(provider)[0];
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
    const plan = provider?.[selectedDuration];
    if (!provider || !plan) return;
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
    if (event.target.closest('[data-mess-close]')) return void close();
    if (event.target.closest('[data-mess-back-list]')) return void backToList();
    if (event.target.closest('[data-mess-retry]')) return void retryLoad();

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
      if (screen === 'detail') backToList();
      else close();
    });
    window.addEventListener('pageshow', queueMount);
    window.HapycureMessPlans = Object.freeze({ open, close });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
