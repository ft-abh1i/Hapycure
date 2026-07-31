(() => {
  'use strict';

  const DASHBOARD_ID = 'hpAiDietDashboard';
  const OVERLAY_ID = 'hpAiDietOverlay';
  const USER_KEY = 'nutritiliousUser';
  let menuVersion = 'merchant-catalog-empty';

  const UNAVAILABLE_ITEM = Object.freeze({
    id: 'no-safe-menu-item',
    name: 'No matching meal available',
    description: 'No active merchant dish currently matches this meal slot.',
    kitchen: 'Hapycure Partner',
    types: [],
    price: 0,
    serving: 'Unavailable',
    calories: 0,
    protein: 0,
    tags: [],
    allergens: [],
    unavailable: true
  });

  let MENU = [];

  const CATEGORY_ORDER = ['breakfast', 'lunch', 'dinner', 'snacks', 'drinks', 'desserts'];
  const CATEGORY_CONFIG = Object.freeze({
    breakfast: { label: 'Breakfast', menuType: 'breakfast', accent: 'sunrise' },
    lunch: { label: 'Lunch', menuType: 'lunch', accent: 'green' },
    dinner: { label: 'Dinner', menuType: 'dinner', accent: 'plum' },
    snacks: { label: 'Snacks', menuType: 'snack', accent: 'orange' },
    drinks: { label: 'Drinks', menuType: 'drink', accent: 'blue' },
    desserts: { label: 'Desserts', menuType: 'dessert', accent: 'rose' }
  });
  const CATEGORY_PAGE_ID = 'hpCategoryMenuPage';
  const BUY_PAGE_ID = 'hpMenuBuyPage';
  const CART_KEY_PREFIX = 'hapycureMenuCart_';
  const BUY_DRAFT_KEY_PREFIX = 'hapycureBuyNowDraft_';
  const ORDER_KEY_PREFIX = 'hapycureOrders_';
  const CHECKOUT_CONTACT_KEY_PREFIX = 'hapycureCheckoutContact_';
  const HOME_RECOMMENDED_ID = 'hpHomeRecommended';
  const VEG_FILTER_KEY = 'hapycureVegOnly';
  const DELIVERY_FEE = 0;

  let plan = null;
  let selectedDay = currentDayIndex();
  let searchTerm = '';
  let observer = null;
  let mountQueued = false;
  let cartToastTimer = null;
  let buyNowState = null;
  let vegOnly = loadVegFilter();
  let catalogUnsubscribe = null;

  window.HAPYCURE_AVAILABLE_MENU = [];
  window.HAPYCURE_MENU_VERSION = menuVersion;

  function safe(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function applyMerchantCatalog(snapshot) {
    if (!snapshot?.ready?.restaurants || !snapshot?.ready?.dishes) return;
    const nextMenu = window.HapycureMerchantCatalog.menuItems(snapshot);
    const nextVersion = `merchant-menu-${snapshot.version}`;
    if (nextVersion === menuVersion && JSON.stringify(nextMenu) === JSON.stringify(MENU)) return;

    MENU = nextMenu;
    menuVersion = nextVersion;
    window.HAPYCURE_AVAILABLE_MENU = MENU.map(item => ({ ...item }));
    window.HAPYCURE_MENU_VERSION = menuVersion;

    localStorage.removeItem(planKey());
    plan = loadPlan();
    const page = document.getElementById('page-home');
    if (page) {
      refreshHomeRecommendations(page);
      renderMenuCart();
      updateMenuCartBadge();
      const categoryPage = document.getElementById(CATEGORY_PAGE_ID);
      const activeCategory = page.querySelector('[data-home-category].active');
      if (categoryPage?.classList.contains('show') && activeCategory) {
        openCategoryMenu(activeCategory.dataset.homeCategory);
      }
      if (document.getElementById(DASHBOARD_ID)) renderDashboard();
      if (document.getElementById(BUY_PAGE_ID)?.classList.contains('show') && !buyNowState?.orderPlaced) renderMenuBuyPage();
    }

    window.dispatchEvent(new CustomEvent('hapycure:menu-updated', {
      detail: { version: menuVersion, count: MENU.length }
    }));
  }

  function bindMerchantCatalog() {
    if (catalogUnsubscribe || !window.HapycureMerchantCatalog) return;
    catalogUnsubscribe = window.HapycureMerchantCatalog.subscribe(applyMerchantCatalog, error => {
      console.error('Live merchant menu unavailable:', error);
    });
  }

  function loadVegFilter() {
    try {
      return localStorage.getItem(VEG_FILTER_KEY) === 'true';
    } catch (error) {
      return false;
    }
  }

  function saveVegFilter() {
    try {
      localStorage.setItem(VEG_FILTER_KEY, String(vegOnly));
    } catch (error) {}
  }

  function isVegetarian(item) {
    return Boolean(item && item.isVeg === true);
  }

  function visibleMenuItems() {
    return vegOnly ? MENU.filter(isVegetarian) : MENU.slice();
  }

  function categoryItems(categoryKey) {
    const config = CATEGORY_CONFIG[categoryKey];
    if (!config) return [];
    return visibleMenuItems().filter(item => item.types.includes(config.menuType));
  }

  function categoryDishIcon() {
    return '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="13"></circle><circle cx="24" cy="24" r="7"></circle><path d="M8 12v12M5 12v7c0 3 6 3 6 0v-7M8 24v12M38 12v24M34 20c0-5 1.8-8 4-8"></path></svg>';
  }

  function menuItemImageMarkup(item, className) {
    if (!item?.image) return '';
    return '<img class="' + safe(className) + '" src="' + safe(item.image) + '" alt="' + safe(item.name) + '" loading="lazy" decoding="async">';
  }

  function recommendedDishStyle(item) {
    const type = (item.types || [])[0] || 'meal';
    if (type === 'breakfast') return { label: 'Breakfast', accent: 'sunrise' };
    if (type === 'lunch') return { label: 'Lunch', accent: 'green' };
    if (type === 'dinner') return { label: 'Dinner', accent: 'plum' };
    if (type === 'snack') return { label: 'Snacks', accent: 'orange' };
    if (type === 'drink') return { label: 'Drinks', accent: 'blue' };
    if (type === 'dessert') return { label: 'Desserts', accent: 'rose' };
    return { label: 'Meal', accent: 'sunrise' };
  }

  function homeRecommendedCardMarkup(item) {
    const style = recommendedDishStyle(item);
    const tag = item.tags && item.tags.length
      ? '<span>' + safe(item.tags[0].replace(/-/g, ' ')) + '</span>'
      : '';
    const image = menuItemImageMarkup(item, 'hp-home-dish-image');
    return '<article class="hp-home-dish-card">' +
      '<div class="hp-home-dish-visual ' + safe(style.accent) + (image ? ' has-image' : '') + '"><span>' + safe(style.label) + '</span>' + (image || categoryDishIcon()) + '</div>' +
      '<div class="hp-home-dish-body"><small>' + safe(item.kitchen) + '</small><h3>' + safe(item.name) + '</h3>' +
      '<div class="hp-home-dish-price"><strong>₹' + safe(item.price) + '</strong><span>' + safe(item.serving) + '</span></div>' +
      '<div class="hp-home-dish-meta">' + tag + '</div>' +
      '<div class="hp-home-dish-actions"><button type="button" class="hp-home-dish-add" data-menu-cart-add="' + safe(item.id) + '" aria-label="Add ' + safe(item.name) + ' to cart">Add to Cart</button><button type="button" class="hp-home-dish-buy" data-menu-buy-now="' + safe(item.id) + '" aria-label="Buy ' + safe(item.name) + ' now">Buy Now</button></div></div>' +
      '</article>';
  }

  function homeRecommendedMarkup() {
    const items = visibleMenuItems();
    const eyebrow = vegOnly ? 'VEGETARIAN DISHES' : 'ALL AVAILABLE DISHES';
    const countLabel = items.length + (vegOnly ? ' veg ' : ' ') + (items.length === 1 ? 'dish' : 'dishes');
    const content = items.length
      ? items.map(homeRecommendedCardMarkup).join('')
      : '<div class="hp-category-empty"><h2>No merchant dishes available yet</h2><p>Dishes will appear automatically after a partner publishes them.</p></div>';
    return '<section class="hp-home-recommended" id="' + HOME_RECOMMENDED_ID + '" aria-labelledby="hpHomeRecommendedTitle">' +
      '<div class="hp-home-recommended-head"><div><span>' + eyebrow + '</span><h2 id="hpHomeRecommendedTitle">Recommended for you</h2></div><strong>' + countLabel + '</strong></div>' +
      '<div class="hp-home-recommended-grid">' + content + '</div>' +
      '</section>';
  }

  function refreshHomeRecommendations(page) {
    const categories = page && page.querySelector('.home-categories');
    if (!categories) return;
    const current = categories.querySelector('#' + HOME_RECOMMENDED_ID);
    if (current) current.outerHTML = homeRecommendedMarkup();
    else categories.insertAdjacentHTML('beforeend', homeRecommendedMarkup());
  }

  function ensureHomeRecommendations(page) {
    const categories = page.querySelector('.home-categories');
    if (!categories || categories.querySelector('#' + HOME_RECOMMENDED_ID)) return;
    categories.insertAdjacentHTML('beforeend', homeRecommendedMarkup());
  }

  function categoryCardMarkup(item, categoryKey) {
    const config = CATEGORY_CONFIG[categoryKey];
    const tags = (item.tags || []).slice(0, 2).map(tag => '<span>' + safe(tag.replace(/-/g, ' ')) + '</span>').join('');
    const description = item.description ? '<p>' + safe(item.description) + '</p>' : '';
    const image = menuItemImageMarkup(item, 'hp-category-dish-image');
    return '<article class="hp-category-dish-card">' +
      '<div class="hp-category-dish-visual ' + safe(config.accent) + (image ? ' has-image' : '') + '">' + (image || categoryDishIcon()) + '</div>' +
      '<div class="hp-category-dish-copy"><div class="hp-category-dish-top"><div><h2>' + safe(item.name) + '</h2><small>' + safe(item.kitchen) + '</small></div><strong>₹' + safe(item.price) + '</strong></div>' +
      description +
      '<div class="hp-category-dish-meta"><span>' + safe(item.serving) + '</span>' + tags + '</div>' +
      '<div class="hp-category-dish-actions"><button type="button" class="hp-category-add-cart" data-menu-cart-add="' + safe(item.id) + '" aria-label="Add ' + safe(item.name) + ' to cart">Add to Cart</button><button type="button" class="hp-category-buy-now" data-menu-buy-now="' + safe(item.id) + '" data-menu-buy-category="' + safe(categoryKey) + '" aria-label="Buy ' + safe(item.name) + ' now">Buy Now</button></div></div>' +
      '</article>';
  }

  function categoryEmptyMarkup(config) {
    return '<div class="hp-category-empty">' + categoryDishIcon() + '<h2>No ' + safe(config.label.toLowerCase()) + ' available yet</h2><p>New dishes will appear here as soon as they are added to the current kitchen menu.</p></div>';
  }

  function ensureCategoryMenuPage(page) {
    let menuPage = page.querySelector('#' + CATEGORY_PAGE_ID);
    if (menuPage) return menuPage;
    menuPage = document.createElement('section');
    menuPage.id = CATEGORY_PAGE_ID;
    menuPage.className = 'hp-category-menu-page';
    menuPage.setAttribute('aria-hidden', 'true');
    menuPage.innerHTML = '<div class="hp-category-menu-screen"><header class="hp-category-menu-header"><button type="button" class="hp-category-menu-back" data-home-category-close aria-label="Back to categories"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg></button><div><span>LIVE PARTNER MENU</span><h1 id="hpCategoryMenuTitle">Category</h1></div><strong id="hpCategoryMenuCount" aria-live="polite"></strong></header><div class="hp-category-menu-content" id="hpCategoryMenuContent"></div></div>';
    page.appendChild(menuPage);
    return menuPage;
  }

  function closeCategoryMenu() {
    const menuPage = document.getElementById(CATEGORY_PAGE_ID);
    if (!menuPage || !menuPage.classList.contains('show')) return false;
    menuPage.classList.remove('show');
    menuPage.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('hp-category-menu-open');
    const activeCategory = document.querySelector('[data-home-category].active');
    if (activeCategory) {
      activeCategory.classList.remove('active');
      activeCategory.focus({ preventScroll: true });
    }
    return true;
  }

  function openCategoryMenu(categoryKey) {
    const config = CATEGORY_CONFIG[categoryKey];
    const page = document.getElementById('page-home');
    if (!config || !page) return;
    const menuPage = ensureCategoryMenuPage(page);
    const items = categoryItems(categoryKey);
    const title = menuPage.querySelector('#hpCategoryMenuTitle');
    const count = menuPage.querySelector('#hpCategoryMenuCount');
    const content = menuPage.querySelector('#hpCategoryMenuContent');
    if (title) title.textContent = config.label;
    if (count) count.textContent = items.length + (items.length === 1 ? ' dish' : ' dishes');
    if (content) content.innerHTML = items.length ? '<div class="hp-category-dish-list">' + items.map(item => categoryCardMarkup(item, categoryKey)).join('') + '</div>' : categoryEmptyMarkup(config);
    page.querySelectorAll('[data-home-category]').forEach(button => button.classList.toggle('active', button.dataset.homeCategory === categoryKey));
    menuPage.classList.add('show');
    menuPage.setAttribute('aria-hidden', 'false');
    document.body.classList.add('hp-category-menu-open');
    const backButton = menuPage.querySelector('[data-home-category-close]');
    if (backButton) backButton.focus({ preventScroll: true });
  }

  function bindCategoryCards(page) {
    page.querySelectorAll('.home-categories .cat').forEach((button, index) => {
      const categoryKey = CATEGORY_ORDER[index];
      const config = CATEGORY_CONFIG[categoryKey];
      if (!config) return;
      button.type = 'button';
      button.dataset.homeCategory = categoryKey;
      button.setAttribute('aria-controls', CATEGORY_PAGE_ID);
      button.setAttribute('aria-label', 'View ' + config.label + ' dishes');
    });
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
  function planKey() { return `nutritiliousAiMenuPlan_${accountId()}`; }
  function orderDraftKey() { return `nutritiliousAiWeeklyOrderDraft_${accountId()}`; }
  function menuCartKey() { return CART_KEY_PREFIX + accountId(); }

  function loadMenuCart() {
    try {
      const stored = JSON.parse(localStorage.getItem(menuCartKey()) || '[]');
      if (!Array.isArray(stored)) return [];
      return stored.map(entry => ({ id: String(entry && entry.id || ''), quantity: Math.max(1, Math.min(20, Number(entry && entry.quantity) || 1)) }))
        .filter(entry => MENU.some(item => item.id === entry.id));
    } catch (error) {
      return [];
    }
  }

  function saveMenuCart(cart) {
    const normalized = cart.filter(entry => entry && entry.id && entry.quantity > 0);
    localStorage.setItem(menuCartKey(), JSON.stringify(normalized));
    renderMenuCart();
    updateMenuCartBadge();
  }

  function showMenuCartToast(message) {
    const page = document.getElementById('page-home');
    if (!page) return;
    let toast = page.querySelector('#hpMenuCartToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'hpMenuCartToast';
      toast.className = 'hp-menu-cart-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      page.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    if (cartToastTimer) clearTimeout(cartToastTimer);
    cartToastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  function addMenuItemToCart(itemId, notifyUser) {
    const item = MENU.find(entry => entry.id === itemId);
    if (!item) return null;
    const cart = loadMenuCart();
    const existing = cart.find(entry => entry.id === itemId);
    if (existing) existing.quantity = Math.min(20, existing.quantity + 1);
    else cart.push({ id: itemId, quantity: 1 });
    saveMenuCart(cart);
    if (notifyUser !== false) showMenuCartToast(item.name + ' added to cart');
    return item;
  }

  function changeMenuCartQuantity(itemId, delta) {
    const cart = loadMenuCart();
    const entry = cart.find(item => item.id === itemId);
    if (!entry) return;
    entry.quantity = Math.max(0, Math.min(20, entry.quantity + delta));
    saveMenuCart(cart.filter(item => item.quantity > 0));
  }

  function removeMenuCartItem(itemId) {
    saveMenuCart(loadMenuCart().filter(item => item.id !== itemId));
  }

  function menuCartIcon() {
    return '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="13"></circle><circle cx="24" cy="24" r="7"></circle><path d="M8 12v12M5 12v7c0 3 6 3 6 0v-7M8 24v12M38 12v24M34 20c0-5 1.8-8 4-8"></path></svg>';
  }

  function menuCartItemMarkup(entry) {
    const item = MENU.find(menuItem => menuItem.id === entry.id);
    if (!item) return '';
    const image = menuItemImageMarkup(item, 'hp-menu-cart-item-image');
    return '<article class="hp-menu-cart-item">' +
      '<div class="hp-menu-cart-item-icon' + (image ? ' has-image' : '') + '">' + (image || menuCartIcon()) + '</div>' +
      '<div class="hp-menu-cart-item-copy"><div class="hp-menu-cart-item-head"><div><h2>' + safe(item.name) + '</h2><small>' + safe(item.kitchen) + ' · ' + safe(item.serving) + '</small><span>₹' + safe(item.price) + ' each</span></div><strong>₹' + safe(item.price * entry.quantity) + '</strong></div>' +
      '<div class="hp-menu-cart-item-actions"><button type="button" class="hp-menu-cart-remove" data-menu-cart-remove="' + safe(item.id) + '">Remove</button><div class="hp-menu-cart-quantity" aria-label="Quantity for ' + safe(item.name) + '"><button type="button" data-menu-cart-item="' + safe(item.id) + '" data-menu-cart-change="-1" aria-label="Decrease quantity">−</button><span>' + safe(entry.quantity) + '</span><button type="button" data-menu-cart-item="' + safe(item.id) + '" data-menu-cart-change="1" aria-label="Increase quantity">+</button></div></div></div>' +
      '</article>';
  }

  function menuCartAddressMarkup() {
    const address = String(localStorage.getItem('nutritiliousLiveLocation') || '').trim();
    const icon = '<span class="hp-menu-cart-address-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2.5"></circle></svg></span>';
    if (!address) {
      return '<section class="hp-menu-cart-address missing">' + icon + '<div><span>DELIVERY ADDRESS</span><h2>Add a location to continue</h2><p>We need your address before checkout.</p></div><button type="button" data-menu-cart-location>Add</button></section>';
    }
    return '<section class="hp-menu-cart-address">' + icon + '<div><span>DELIVER TO</span><h2>' + safe(address) + '</h2><p>Delivery instructions can be added at checkout.</p></div><button type="button" data-menu-cart-location>Change</button></section>';
  }

  function emptyMenuCartMarkup() {
    return '<div class="empty-notify hp-menu-cart-empty"><div class="empty-icon"><svg viewBox="0 0 24 24"><path d="M6 6h15l-2 8H8L6 6z"></path><path d="M6 6 5 3H2"></path><circle cx="9" cy="20" r="1.5"></circle><circle cx="18" cy="20" r="1.5"></circle></svg></div><h2>Your cart is empty</h2><p>Add something delicious and it will appear here.</p><button type="button" data-menu-cart-shop>Browse dishes</button></div>';
  }

  function renderMenuCart() {
    const cartPage = document.getElementById('cartPage');
    const screen = cartPage && cartPage.querySelector('.notification-screen');
    if (!screen) return;
    let root = screen.querySelector('[data-menu-cart-root]');
    if (!root) {
      root = document.createElement('div');
      root.className = 'hp-menu-cart-root';
      root.setAttribute('data-menu-cart-root', 'true');
      Array.from(screen.children).forEach(child => { if (!child.classList.contains('notify-head')) child.remove(); });
      screen.appendChild(root);
    }
    const cart = loadMenuCart();
    if (!cart.length) {
      root.innerHTML = emptyMenuCartMarkup();
      return;
    }
    const count = cart.reduce((sum, entry) => sum + entry.quantity, 0);
    const total = cart.reduce((sum, entry) => {
      const item = MENU.find(menuItem => menuItem.id === entry.id);
      return sum + (item ? item.price * entry.quantity : 0);
    }, 0);
    root.innerHTML =
      '<div class="hp-menu-cart-scroll">' +
        '<div class="hp-menu-cart-overview"><div><span>YOUR ORDER</span><h2>' + safe(count) + (count === 1 ? ' item' : ' items') + ' in your cart</h2></div><b>COD available</b></div>' +
        menuCartAddressMarkup() +
        '<section class="hp-menu-cart-items-section"><div class="hp-menu-cart-section-head"><h2>Order items</h2><span>' + safe(count) + '</span></div><div class="hp-menu-cart-list">' + cart.map(menuCartItemMarkup).join('') + '</div></section>' +
        '<section class="hp-menu-cart-summary"><h2>Bill details</h2><div><span>Item total</span><strong>₹' + safe(total) + '</strong></div><div><span>Delivery fee</span><strong class="free">FREE</strong></div><div class="total"><span>To pay</span><strong>₹' + safe(total + DELIVERY_FEE) + '</strong></div></section>' +
        '<div class="hp-menu-cart-trust"><span>✓</span><div><strong>Freshly prepared</strong><small>Your order is prepared after confirmation.</small></div></div>' +
      '</div>' +
      '<footer class="hp-menu-cart-checkout"><div><span>TOTAL</span><strong>₹' + safe(total + DELIVERY_FEE) + '</strong></div><button type="button" data-menu-cart-checkout>Proceed to checkout <span>›</span></button></footer>';
  }

  function updateMenuCartBadge() {
    const cartButton = document.getElementById('cartBtn');
    if (!cartButton) return;
    const count = loadMenuCart().reduce((sum, entry) => sum + entry.quantity, 0);
    let badge = cartButton.querySelector('.hp-menu-cart-badge');
    if (!count) {
      if (badge) badge.remove();
      cartButton.setAttribute('aria-label', 'Cart');
      return;
    }
    if (!badge) {
      badge = document.createElement('b');
      badge.className = 'hp-menu-cart-badge';
      cartButton.appendChild(badge);
    }
    badge.textContent = count > 99 ? '99+' : String(count);
    cartButton.setAttribute('aria-label', 'Cart, ' + count + (count === 1 ? ' item' : ' items'));
  }

  function buyNowDraftKey() { return BUY_DRAFT_KEY_PREFIX + accountId(); }
  function menuOrdersKey() { return ORDER_KEY_PREFIX + accountId(); }
  function checkoutContactKey() { return CHECKOUT_CONTACT_KEY_PREFIX + accountId(); }

  function profileAccountId() {
    const user = getUser();
    return String(user.uid || user.email || user.phone || user.provider || localStorage.getItem('nutritiliousAuthType') || 'guest').replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function savedProfileValue(field) {
    try { return localStorage.getItem('nutritiliousProfile_' + profileAccountId() + '_' + field) || ''; }
    catch (error) { return ''; }
  }

  function loadCheckoutContact() {
    const user = getUser();
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(checkoutContactKey()) || '{}') || {}; }
    catch (error) {}
    return {
      contactName: String(saved.contactName || savedProfileValue('Name') || user.name || user.displayName || '').trim(),
      contactPhone: String(saved.contactPhone || savedProfileValue('Phone') || user.phone || user.phoneNumber || '').replace(/\D/g, '').slice(-10),
      instructions: String(saved.instructions || '').slice(0, 120)
    };
  }

  function saveCheckoutContact(contact) {
    try {
      localStorage.setItem(checkoutContactKey(), JSON.stringify({
        contactName: String(contact.contactName || '').trim(),
        contactPhone: String(contact.contactPhone || '').replace(/\D/g, '').slice(-10),
        instructions: String(contact.instructions || '').trim().slice(0, 120)
      }));
    } catch (error) {}
  }

  function loadMenuOrders() {
    try {
      const orders = JSON.parse(localStorage.getItem(menuOrdersKey()) || '[]');
      return Array.isArray(orders) ? orders.filter(order => order && order.id) : [];
    } catch (error) {
      return [];
    }
  }

  function saveMenuOrders(orders) {
    localStorage.setItem(menuOrdersKey(), JSON.stringify(orders.slice(0, 30)));
    renderMenuOrders();
  }

  function createMenuOrderId() {
    return 'HAP' + Date.now().toString(36).toUpperCase().slice(-8);
  }

  function formatMenuOrderDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit'
      }).format(date);
    } catch (error) {
      return date.toLocaleString();
    }
  }

  function menuOrderCardMarkup(order) {
    const items = Array.isArray(order.items) ? order.items.filter(Boolean) : [];
    const item = items[0];
    if (!item) return '';
    const quantity = items.reduce((sum, entry) => sum + (Number(entry.quantity) || 1), 0);
    const itemTitle = items.length > 1 ? item.name + ' + ' + (items.length - 1) + ' more' : item.name;
    const kitchenCount = new Set(items.map(entry => entry.kitchen).filter(Boolean)).size;
    const kitchenTitle = kitchenCount > 1 ? item.kitchen + ' · Multiple kitchens' : item.kitchen;
    return '<article class="hp-menu-order-card">' +
      '<div class="hp-menu-order-card-head"><div><span>' + safe(order.status || 'Order placed') + '</span><h2>' + safe(itemTitle) + '</h2><small>' + safe(kitchenTitle || '') + '</small></div><strong>₹' + safe(order.total || 0) + '</strong></div>' +
      '<div class="hp-menu-order-card-meta"><span>' + safe(quantity) + (quantity === 1 ? ' item' : ' items') + '</span><span>' + safe(order.paymentMethod || 'Cash on Delivery') + '</span></div>' +
      '<div class="hp-menu-order-card-address"><b>Deliver to</b><p>' + safe(order.address || '') + '</p></div>' +
      '<footer><span>' + safe(order.id) + '</span><time>' + safe(formatMenuOrderDate(order.createdAt)) + '</time></footer>' +
      '</article>';
  }

  function emptyMenuOrdersMarkup() {
    return '<div class="empty-notify hp-menu-orders-empty"><div class="empty-icon"><svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"></path><path d="M9 8h6"></path><path d="M9 12h6"></path><path d="M9 16h4"></path></svg></div><h2>No orders yet!</h2><p>Your COD orders will appear here after checkout.</p></div>';
  }

  function renderMenuOrders() {
    const ordersPage = document.getElementById('ordersPage');
    const screen = ordersPage && ordersPage.querySelector('.notification-screen');
    if (!screen) return;
    let root = screen.querySelector('[data-menu-orders-root]');
    if (!root) {
      root = document.createElement('div');
      root.className = 'hp-menu-orders-root';
      root.setAttribute('data-menu-orders-root', 'true');
      Array.from(screen.children).forEach(child => { if (!child.classList.contains('notify-head')) child.remove(); });
      screen.appendChild(root);
    }
    const orders = loadMenuOrders();
    const signature = JSON.stringify(orders);
    if (root.dataset.ordersSignature === signature) return;
    root.dataset.ordersSignature = signature;
    root.innerHTML = orders.length
      ? '<div class="hp-menu-orders-list">' + orders.map(menuOrderCardMarkup).join('') + '</div>'
      : emptyMenuOrdersMarkup();
  }

  function ensureMenuBuyPage(page) {
    let buyPage = page.querySelector('#' + BUY_PAGE_ID);
    if (buyPage) return buyPage;
    buyPage = document.createElement('section');
    buyPage.id = BUY_PAGE_ID;
    buyPage.className = 'hp-menu-buy-page';
    buyPage.setAttribute('aria-hidden', 'true');
    buyPage.innerHTML = '<div class="hp-menu-buy-screen"><header class="hp-menu-buy-header"><button type="button" class="hp-menu-buy-back" data-menu-buy-close aria-label="Back to dishes"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg></button><div><span>BUY NOW</span><h1>Review your order</h1></div></header><div class="hp-menu-buy-content" id="hpMenuBuyContent"></div></div>';
    page.appendChild(buyPage);
    return buyPage;
  }

  function checkoutMenuEntries() {
    if (!buyNowState) return [];
    const rawEntries = buyNowState.source === 'cart'
      ? (Array.isArray(buyNowState.items) ? buyNowState.items : [])
      : [{ id: buyNowState.itemId, quantity: buyNowState.quantity }];
    return rawEntries.map(entry => {
      const item = MENU.find(menuItem => menuItem.id === entry.id);
      if (!item) return null;
      return {
        id: item.id,
        item,
        quantity: Math.max(1, Math.min(20, Number(entry.quantity) || 1))
      };
    }).filter(Boolean);
  }

  function buyPageItemMarkup(item, quantity, itemId) {
    const image = menuItemImageMarkup(item, 'hp-menu-buy-item-image');
    const itemTarget = itemId ? ' data-menu-buy-item-id="' + safe(itemId) + '"' : '';
    return '<section class="hp-menu-buy-item"><div class="hp-menu-buy-item-icon' + (image ? ' has-image' : '') + '">' + (image || menuCartIcon()) + '</div><div class="hp-menu-buy-item-copy"><div><h2>' + safe(item.name) + '</h2><small>' + safe(item.kitchen) + ' · ' + safe(item.serving) + '</small></div><strong>₹' + safe(item.price * quantity) + '</strong></div><div class="hp-menu-buy-quantity"><span>Quantity</span><div><button type="button" data-menu-buy-quantity="-1"' + itemTarget + ' aria-label="Decrease quantity">−</button><b>' + safe(quantity) + '</b><button type="button" data-menu-buy-quantity="1"' + itemTarget + ' aria-label="Increase quantity">+</button></div></div></section>';
  }

  function renderMenuBuyPage() {
    const buyPage = document.getElementById(BUY_PAGE_ID);
    const content = buyPage && buyPage.querySelector('#hpMenuBuyContent');
    const entries = checkoutMenuEntries();
    if (!content || !entries.length) return;
    const fromCart = buyNowState.source === 'cart';
    const quantity = entries.reduce((sum, entry) => sum + entry.quantity, 0);
    if (!fromCart) buyNowState.quantity = entries[0].quantity;
    const address = String(localStorage.getItem('nutritiliousLiveLocation') || '').trim();
    const itemTotal = entries.reduce((sum, entry) => sum + (entry.item.price * entry.quantity), 0);
    const total = itemTotal + DELIVERY_FEE;
    const contact = {
      contactName: String(buyNowState.contactName || ''),
      contactPhone: String(buyNowState.contactPhone || ''),
      instructions: String(buyNowState.instructions || '')
    };
    const deliveryMarkup = address
      ? '<section class="hp-menu-buy-address"><div><span>DELIVER TO</span><h2>' + safe(address) + '</h2></div><button type="button" data-menu-buy-location>Change</button></section>'
      : '<section class="hp-menu-buy-address missing"><div><span>DELIVERY LOCATION</span><h2>Add your delivery location to continue</h2></div><button type="button" data-menu-buy-location>Add</button></section>';
    const actionMarkup = address
      ? '<button type="button" class="hp-menu-buy-continue" data-menu-buy-place-order>Place COD order · ₹' + safe(total) + '</button>'
      : '<button type="button" class="hp-menu-buy-continue" data-menu-buy-location>Add delivery location</button>';
    const itemsMarkup = fromCart
      ? '<section class="hp-menu-buy-items-card"><div class="hp-menu-buy-section-title"><span>ORDER ITEMS</span><h2>' + safe(quantity) + (quantity === 1 ? ' item' : ' items') + ' in this order</h2></div><div class="hp-menu-buy-items-list">' + entries.map(entry => buyPageItemMarkup(entry.item, entry.quantity, entry.id)).join('') + '</div></section>'
      : buyPageItemMarkup(entries[0].item, entries[0].quantity, '');
    const contactMarkup = '<section class="hp-menu-buy-contact"><div class="hp-menu-buy-section-title"><span>CONTACT DETAILS</span><h2>Who should receive the order?</h2></div><label>Full name<input type="text" data-menu-buy-field="contactName" maxlength="60" autocomplete="name" placeholder="Enter your name" value="' + safe(contact.contactName) + '"></label><label>Mobile number<div class="hp-menu-buy-phone"><span>+91</span><input type="tel" inputmode="numeric" data-menu-buy-field="contactPhone" maxlength="10" autocomplete="tel" placeholder="10-digit number" value="' + safe(contact.contactPhone) + '"></div></label><label>Delivery note <small>(optional)</small><textarea data-menu-buy-field="instructions" maxlength="120" rows="2" placeholder="Landmark or instructions for delivery">' + safe(contact.instructions) + '</textarea></label></section>';
    const paymentMarkup = '<section class="hp-menu-buy-payment"><div class="hp-menu-buy-section-title"><span>PAYMENT</span><h2>Payment method</h2></div><div class="hp-menu-buy-payment-option"><div class="hp-menu-buy-cash-icon">₹</div><div><strong>Cash on Delivery</strong><span>Pay ₹' + safe(total) + ' when your order arrives</span></div><b>✓</b></div><p>COD is the only payment option available right now.</p></section>';
    content.innerHTML = itemsMarkup + deliveryMarkup + contactMarkup + paymentMarkup + '<section class="hp-menu-buy-summary"><h2>Price details</h2><div><span>Item total</span><strong>₹' + safe(itemTotal) + '</strong></div><div><span>Delivery charges</span><strong class="free">FREE</strong></div><div class="total"><span>Total</span><strong>₹' + safe(total) + '</strong></div></section><p class="hp-menu-buy-status" id="hpMenuBuyStatus" role="status" aria-live="polite"></p><div class="hp-menu-buy-footer">' + actionMarkup + '<small>By placing this order, you agree to pay the total in cash at delivery.</small></div>';
  }

  function openMenuBuyPage(itemId, categoryKey) {
    const item = MENU.find(entry => entry.id === itemId);
    const page = document.getElementById('page-home');
    if (!item || !page) return;
    buyNowState = { source: 'buy-now', itemId: item.id, categoryKey: categoryKey || '', quantity: 1, ...loadCheckoutContact() };
    closeCategoryMenu();
    const buyPage = ensureMenuBuyPage(page);
    const headerTitle = buyPage.querySelector('.hp-menu-buy-header h1');
    if (headerTitle) headerTitle.textContent = 'Review your order';
    renderMenuBuyPage();
    buyPage.classList.add('show');
    buyPage.setAttribute('aria-hidden', 'false');
    document.body.classList.add('hp-menu-buy-open');
    const backButton = buyPage.querySelector('[data-menu-buy-close]');
    if (backButton) backButton.focus({ preventScroll: true });
  }

  function openMenuCartCheckout() {
    const cart = loadMenuCart();
    const page = document.getElementById('page-home');
    if (!cart.length || !page) return;
    buyNowState = {
      source: 'cart',
      items: cart.map(entry => ({ id: entry.id, quantity: entry.quantity })),
      categoryKey: '',
      ...loadCheckoutContact()
    };
    const buyPage = ensureMenuBuyPage(page);
    const headerTitle = buyPage.querySelector('.hp-menu-buy-header h1');
    if (headerTitle) headerTitle.textContent = 'Checkout';
    renderMenuBuyPage();
    buyPage.classList.add('show');
    buyPage.setAttribute('aria-hidden', 'false');
    document.body.classList.add('hp-menu-buy-open');
    const backButton = buyPage.querySelector('[data-menu-buy-close]');
    if (backButton) backButton.focus({ preventScroll: true });
  }

  function closeMenuBuyPage(returnToCategory) {
    const buyPage = document.getElementById(BUY_PAGE_ID);
    if (!buyPage || !buyPage.classList.contains('show')) return false;
    const categoryKey = buyNowState && buyNowState.categoryKey;
    buyPage.classList.remove('show');
    buyPage.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('hp-menu-buy-open');
    buyNowState = null;
    if (returnToCategory && categoryKey) window.requestAnimationFrame(() => openCategoryMenu(categoryKey));
    return true;
  }

  function changeBuyNowQuantity(delta, itemId) {
    if (!buyNowState) return;
    if (buyNowState.source === 'cart') {
      const entry = buyNowState.items.find(item => item.id === itemId);
      if (!entry) return;
      entry.quantity = Math.max(1, Math.min(20, Number(entry.quantity) + delta));
      saveMenuCart(buyNowState.items);
    } else {
      buyNowState.quantity = Math.max(1, Math.min(20, buyNowState.quantity + delta));
    }
    renderMenuBuyPage();
  }

  function openBuyDeliveryLocation() {
    const locationButton = document.getElementById('locationBtn');
    if (locationButton) locationButton.click();
  }

  function showMenuBuyStatus(message, type) {
    const status = document.getElementById('hpMenuBuyStatus');
    if (!status) return;
    status.textContent = message;
    status.classList.add('show');
    status.classList.toggle('error', type === 'error');
  }

  function renderMenuOrderSuccess(order) {
    const buyPage = document.getElementById(BUY_PAGE_ID);
    const content = buyPage && buyPage.querySelector('#hpMenuBuyContent');
    const headerTitle = buyPage && buyPage.querySelector('.hp-menu-buy-header h1');
    if (!content) return;
    if (headerTitle) headerTitle.textContent = 'Order placed';
    content.innerHTML = '<section class="hp-menu-buy-success"><div class="hp-menu-buy-success-icon">✓</div><span>ORDER PLACED</span><h2>Your COD order is placed</h2><p>Keep ₹' + safe(order.total) + ' ready. You can view the saved order and its details in Orders.</p><div class="hp-menu-buy-success-id"><span>Order ID</span><strong>' + safe(order.id) + '</strong></div><div class="hp-menu-buy-success-row"><span>Payment</span><strong>Cash on Delivery</strong></div><div class="hp-menu-buy-success-row"><span>Deliver to</span><strong>' + safe(order.address) + '</strong></div><button type="button" class="hp-menu-buy-continue" data-menu-buy-view-orders>View order</button><button type="button" class="hp-menu-buy-secondary" data-menu-buy-continue-ordering>Continue ordering</button></section>';
  }

  function placeMenuCodOrder() {
    const entries = checkoutMenuEntries();
    const address = String(localStorage.getItem('nutritiliousLiveLocation') || '').trim();
    if (!entries.length || !address) {
      openBuyDeliveryLocation();
      return;
    }
    const nameInput = document.querySelector('[data-menu-buy-field="contactName"]');
    const phoneInput = document.querySelector('[data-menu-buy-field="contactPhone"]');
    const instructionsInput = document.querySelector('[data-menu-buy-field="instructions"]');
    const contactName = String(nameInput ? nameInput.value : buyNowState.contactName || '').trim();
    const contactPhone = String(phoneInput ? phoneInput.value : buyNowState.contactPhone || '').replace(/\D/g, '').slice(-10);
    const instructions = String(instructionsInput ? instructionsInput.value : buyNowState.instructions || '').trim().slice(0, 120);
    if (!contactName) {
      showMenuBuyStatus('Please enter the receiver name.', 'error');
      if (nameInput) nameInput.focus();
      return;
    }
    if (contactPhone.length !== 10) {
      showMenuBuyStatus('Please enter a valid 10-digit mobile number.', 'error');
      if (phoneInput) phoneInput.focus();
      return;
    }

    const itemTotal = entries.reduce((sum, entry) => sum + (entry.item.price * entry.quantity), 0);
    const createdAt = new Date().toISOString();
    const order = {
      id: createMenuOrderId(),
      createdAt,
      status: 'Order placed',
      paymentMethod: 'Cash on Delivery',
      paymentStatus: 'Pay on delivery',
      address,
      customer: { name: contactName, phone: contactPhone },
      instructions,
      itemTotal,
      deliveryFee: DELIVERY_FEE,
      total: itemTotal + DELIVERY_FEE,
      items: entries.map(entry => ({
        id: entry.item.id,
        name: entry.item.name,
        kitchen: entry.item.kitchen,
        serving: entry.item.serving,
        price: entry.item.price,
        quantity: entry.quantity
      }))
    };
    const fromCart = buyNowState.source === 'cart';
    buyNowState.contactName = contactName;
    buyNowState.contactPhone = contactPhone;
    buyNowState.instructions = instructions;
    saveCheckoutContact(buyNowState);
    saveMenuOrders([order, ...loadMenuOrders()]);
    localStorage.setItem(buyNowDraftKey(), JSON.stringify({
      orderId: order.id,
      source: fromCart ? 'cart' : 'buy-now',
      items: order.items.map(item => ({ id: item.id, quantity: item.quantity })),
      total: order.total,
      address,
      paymentMethod: order.paymentMethod,
      createdAt,
      status: 'placed'
    }));
    if (fromCart) saveMenuCart([]);
    buyNowState.orderPlaced = true;
    renderMenuOrderSuccess(order);
  }

  function openPlacedMenuOrder() {
    closeMenuBuyPage(false);
    renderMenuOrders();
    const ordersButton = document.getElementById('ordersBtn');
    if (ordersButton) ordersButton.click();
  }

  function continueMenuOrdering() {
    const fromCart = buyNowState && buyNowState.source === 'cart';
    closeMenuBuyPage(true);
    if (fromCart) {
      const homeButton = document.getElementById('homeBtn');
      if (homeButton) homeButton.click();
    }
  }

  function handleMenuBuyInput(event) {
    const field = event.target.closest('[data-menu-buy-field]');
    if (!field || !buyNowState) return;
    const name = field.dataset.menuBuyField;
    if (!['contactName', 'contactPhone', 'instructions'].includes(name)) return;
    let value = field.value;
    if (name === 'contactPhone') {
      value = value.replace(/\D/g, '').slice(0, 10);
      if (field.value !== value) field.value = value;
    }
    buyNowState[name] = value;
  }

  function getProfile() {
    try { return JSON.parse(localStorage.getItem(profileKey()) || '{}') || {}; }
    catch (error) { return {}; }
  }

  function currentDayIndex() {
    const day = new Date().getDay();
    return day === 0 ? 6 : day - 1;
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
    const lunch = Math.max(12 * 60 + 30, breakfast + 240);
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
    if (count === 6) slots.push({ key: 'light-supper', label: 'Light Supper', type: 'snack', time: formatMinutes(Math.min(sleep - 45, dinner + 90)) });
    return slots;
  }

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

  function isItemAllowed(item, profile) {
    const allergies = allAllergies(profile);
    const diet = String(profile.dietType || '').toLowerCase();
    const itemAllergens = (item.allergens || []).map(normalizeAllergy);
    if (['vegetarian', 'vegan'].includes(diet) && !item.isVeg) return false;
    if (diet === 'vegan' && itemAllergens.some(allergen => allergen === 'milk' || allergen === 'eggs')) return false;
    if (allergies.some(allergy => itemAllergens.includes(allergy))) return false;
    const itemText = normalizeAllergy(`${item.name} ${item.description || ''}`);
    if (allergies.some(allergy => allergy.length > 2 && itemText.includes(allergy))) return false;
    return true;
  }

  function menuScore(item) {
    return item.price > 0 ? 1 / item.price : 0;
  }

  function stringSeed(value) {
    return String(value).split('').reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 7);
  }

  function availableForType(type, profile) {
    return visibleMenuItems()
      .filter(item => item.types.includes(type) && isItemAllowed(item, profile))
      .sort((a, b) => {
        const difference = menuScore(b) - menuScore(a);
        return difference || a.price - b.price;
      });
  }

  function chooseItem(type, profile, dayIndex, slotIndex, previousId) {
    const choices = availableForType(type, profile);
    if (!choices.length) return UNAVAILABLE_ITEM;
    const seed = stringSeed(`${accountId()}-${localDateValue(startOfCurrentWeek())}-${type}`);
    let index = (seed + dayIndex + (slotIndex * 2)) % choices.length;
    if (choices.length > 1 && choices[index].id === previousId) index = (index + 1) % choices.length;
    return choices[index];
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

  function generatePlan(profile) {
    const weekStart = startOfCurrentWeek();
    const slots = mealSlots(profile);
    const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const shorts = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    let previousId = '';

    const days = Array.from({ length: 7 }, (_, dayIndex) => {
      const meals = slots.map((slot, slotIndex) => {
        const item = chooseItem(slot.type, profile, dayIndex, slotIndex, previousId);
        if (!item.unavailable) previousId = item.id;
        return { slotKey: slot.key, slotLabel: slot.label, type: slot.type, time: slot.time, itemId: item.id };
      });
      return { label: names[dayIndex], shortLabel: shorts[dayIndex], date: localDateValue(addDays(weekStart, dayIndex)), meals };
    });

    return {
      version: menuVersion,
      weekStart: localDateValue(weekStart),
      profileFingerprint: profileFingerprint(profile),
      vegOnly,
      createdAt: new Date().toISOString(),
      days
    };
  }

  function loadPlan() {
    const profile = getProfile();
    const expectedWeek = localDateValue(startOfCurrentWeek());
    try {
      const saved = JSON.parse(localStorage.getItem(planKey()) || 'null');
      if (saved && saved.version === menuVersion && saved.weekStart === expectedWeek && saved.profileFingerprint === profileFingerprint(profile) && saved.vegOnly === vegOnly && Array.isArray(saved.days) && saved.days.length === 7) return saved;
    } catch (error) {}
    const freshPlan = generatePlan(profile);
    localStorage.setItem(planKey(), JSON.stringify(freshPlan));
    return freshPlan;
  }

  function itemById(id) {
    if (id === UNAVAILABLE_ITEM.id) return UNAVAILABLE_ITEM;
    return MENU.find(item => item.id === id) || UNAVAILABLE_ITEM;
  }

  function greeting() {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  }

  function firstName() {
    const user = getUser();
    const stored = localStorage.getItem(`nutritiliousProfile_${accountId()}_Name`) || '';
    return (stored || user.name || '').trim().split(/\s+/)[0] || 'there';
  }

  function goalLabel(goal) {
    return ({ 'lose-weight': 'Weight loss', 'gain-muscle': 'Muscle gain', 'maintain-weight': 'Maintain weight', 'eat-healthier': 'Eat healthier' })[goal] || 'Balanced eating';
  }

  function dietLabel(diet) {
    return ({ vegetarian: 'Vegetarian', eggetarian: 'Eggetarian', 'non-vegetarian': 'Non-vegetarian', vegan: 'Vegan' })[diet] || 'Flexible';
  }

  function compactDate(value) {
    return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`));
  }

  function longDate(value) {
    return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00`));
  }

  function slotIcon(type) {
    if (type === 'breakfast') return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5"></circle><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"></path></svg>';
    if (type === 'lunch') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11h16a8 8 0 0 1-16 0Z"></path><path d="M7 7.5c0-1 1-1.4 1-2.4M12 7.5c0-1 1-1.4 1-2.4M17 7.5c0-1 1-1.4 1-2.4"></path></svg>';
    if (type === 'dinner') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 15.2A8 8 0 0 1 8.8 4.5 8.3 8.3 0 1 0 19.5 15.2Z"></path></svg>';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20c5-3 7-7.2 7-12-4.8 0-9 2-12 7 1.5 2.5 3.2 4.2 5 5Z"></path><path d="M6 20c2.4-4 5.4-7 9-9"></path></svg>';
  }

  function recommendationLabel(item, profile) {
    if (item.unavailable) return 'Needs review';
    return 'Available from partner';
  }

  function dayTotals(day) {
    return day.meals.reduce((total, meal) => {
      const item = itemById(meal.itemId);
      total.price += item.price;
      total.calories += item.calories;
      total.protein += item.protein;
      if (item.unavailable) total.unavailable += 1;
      return total;
    }, { price: 0, calories: 0, protein: 0, unavailable: 0 });
  }

  function weeklyTotals() {
    return plan.days.reduce((total, day) => {
      const daily = dayTotals(day);
      total.price += daily.price;
      total.calories += daily.calories;
      total.protein += daily.protein;
      total.meals += day.meals.length;
      total.unavailable += daily.unavailable;
      return total;
    }, { price: 0, calories: 0, protein: 0, meals: 0, unavailable: 0 });
  }

  function profileNotice(profile) {
    const conditions = Array.isArray(profile.healthConditions) ? profile.healthConditions.filter(value => value && value !== 'none') : [];
    const custom = allAllergies(profile).filter(value => !['milk', 'peanuts', 'tree-nuts', 'gluten', 'soy', 'eggs', 'seafood'].includes(value));
    const notices = [];
    if (custom.length) notices.push(`Confirm custom avoid-list with the kitchen: ${custom.join(', ')}.`);
    if (conditions.length) notices.push('A health condition is saved in your profile; review this general plan with a qualified professional.');
    return notices;
  }

  function dayTabsMarkup() {
    return plan.days.map((day, index) => `<button class="hp-ai-day-tab${index === selectedDay ? ' selected' : ''}" type="button" data-ai-day="${index}"><strong>${day.shortLabel}</strong><span>${index === currentDayIndex() ? 'Today' : compactDate(day.date)}</span></button>`).join('');
  }

  function mealCardMarkup(meal, dayIndex, profile) {
    const item = itemById(meal.itemId);
    const matches = !searchTerm || `${item.name} ${meal.slotLabel} ${item.description || ''}`.toLowerCase().includes(searchTerm);
    const unavailableClass = item.unavailable ? ' hp-ai-meal-unavailable' : '';
    const image = menuItemImageMarkup(item, 'hp-ai-meal-image');
    const replaceButton = item.unavailable
      ? '<button type="button" data-ai-replace="' + dayIndex + ':' + safe(meal.slotKey) + '">Find available option</button>'
      : '<button type="button" data-ai-replace="' + dayIndex + ':' + safe(meal.slotKey) + '">Replace</button>';
    const nutrition = item.nutritionAvailable
      ? `<span>~${item.calories} kcal</span><span>~${item.protein}g protein</span>`
      : '';

    return `<article class="hp-ai-meal-card${matches ? '' : ' hp-ai-search-hidden'}${unavailableClass}">
      <div class="hp-ai-meal-icon ${safe(meal.type)}${image ? ' has-image' : ''}">${image || slotIcon(meal.type)}</div>
      <div class="hp-ai-meal-copy">
        <div class="hp-ai-meal-top"><span>${safe(meal.slotLabel)} · ${safe(meal.time)}</span><strong>${item.unavailable ? '—' : `₹${item.price}`}</strong></div>
        <h3>${safe(item.name)}</h3>${item.description ? `<p>${safe(item.description)}</p>` : ''}
        <div class="hp-ai-meal-meta"><span>${safe(item.serving)}</span>${item.unavailable ? '' : nutrition}</div>
        <div class="hp-ai-meal-footer"><span>${safe(recommendationLabel(item, profile))}</span>${replaceButton}</div>
      </div>
    </article>`;
  }

  function dashboardMarkup() {
    const profile = getProfile();
    const day = plan.days[selectedDay] || plan.days[0];
    const totals = dayTotals(day);
    const week = weeklyTotals();
    const notices = profileNotice(profile);
    const orderDisabled = week.unavailable > 0;

    return `<section class="hp-ai-home" id="${DASHBOARD_ID}">
      <div class="hp-ai-hero">
        <div class="hp-ai-hero-top"><span class="hp-ai-kicker"><i>✦</i> AI MADE DIET</span><button class="hp-ai-refresh" type="button" data-ai-action="regenerate" aria-label="Regenerate weekly diet"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5"></path><path d="M19 11a7 7 0 1 0 .3 4"></path></svg></button></div>
        <h1>${safe(greeting())}, ${safe(firstName())}</h1>
        <p>Your weekly menu uses only dishes currently published by Hapycure partners.</p>
        <div class="hp-ai-profile-chips"><span>${safe(goalLabel(profile.goal))}</span><span>${safe(dietLabel(profile.dietType))}</span><span>${Number(profile.mealsPerDay) || 4} meals/day</span></div>
      </div>
      ${notices.length ? `<div class="hp-ai-safety-note"><strong>Before ordering</strong>${notices.map(notice => `<p>${safe(notice)}</p>`).join('')}</div>` : ''}
      ${week.unavailable ? `<div class="hp-ai-safety-note"><strong>Plan needs attention</strong><p>${week.unavailable} meal slot${week.unavailable === 1 ? '' : 's'} has no matching active merchant dish yet.</p></div>` : ''}
      <div class="hp-ai-summary-row"><div><span>This week</span><strong>${week.meals}</strong><small>planned meals</small></div><div><span>Estimated total</span><strong>₹${week.price}</strong><small>menu pricing</small></div><div><span>Live partners</span><strong>${new Set(MENU.map(item => item.restaurantId)).size}</strong><small>current kitchens</small></div></div>
      <div class="hp-ai-section-head"><div><span>YOUR 7-DAY PLAN</span><h2>${safe(longDate(day.date))}</h2></div><button type="button" data-ai-action="full-week">View full week</button></div>
      <div class="hp-ai-day-tabs" aria-label="Select a day">${dayTabsMarkup()}</div>
      <div class="hp-ai-meal-list" id="hpAiMealList">${day.meals.map(meal => mealCardMarkup(meal, selectedDay, profile)).join('')}<div class="hp-ai-search-empty" id="hpAiSearchEmpty">No meal in this day matches your search.</div></div>
      <div class="hp-ai-day-total"><div><span>Today's plan</span><strong>${day.meals.length} meals from the live partner menu</strong></div><strong>₹${totals.price}</strong></div>
      <button class="hp-ai-order-button" type="button" data-ai-action="order" ${orderDisabled ? 'disabled aria-disabled="true"' : ''}><span><small>7-day plan</small><strong>${orderDisabled ? 'Some meal slots are unavailable' : 'Order this week'}</strong></span><span>₹${week.price} <b>→</b></span></button>
      <p class="hp-ai-disclaimer">Dish names, prices and availability come directly from Hapycure partners.</p>
    </section>`;
  }

  function renderDashboard() {
    const dashboard = document.getElementById(DASHBOARD_ID);
    if (!dashboard || !plan) return;
    dashboard.outerHTML = dashboardMarkup();
    syncSearchEmptyState();
  }

  function ensureOverlay(page) {
    if (page.querySelector(`#${OVERLAY_ID}`)) return;
    page.insertAdjacentHTML('beforeend', `<section class="hp-ai-overlay" id="${OVERLAY_ID}" aria-hidden="true"><div class="hp-ai-overlay-backdrop" data-ai-action="close-overlay"></div><div class="hp-ai-overlay-panel" role="dialog" aria-modal="true" aria-labelledby="hpAiOverlayTitle"><div class="hp-ai-overlay-handle"></div><header><div><span id="hpAiOverlayEyebrow"></span><h2 id="hpAiOverlayTitle"></h2></div><button type="button" data-ai-action="close-overlay" aria-label="Close">×</button></header><div class="hp-ai-overlay-body" id="hpAiOverlayBody"></div></div></section>`);
  }

  function openOverlay(eyebrow, title, content, expanded = false) {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    const eyebrowNode = overlay.querySelector('#hpAiOverlayEyebrow');
    const titleNode = overlay.querySelector('#hpAiOverlayTitle');
    const bodyNode = overlay.querySelector('#hpAiOverlayBody');
    if (!eyebrowNode || !titleNode || !bodyNode) return;
    eyebrowNode.textContent = eyebrow;
    titleNode.textContent = title;
    bodyNode.innerHTML = content;
    overlay.classList.toggle('expanded', Boolean(expanded));
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('hp-ai-overlay-open');
  }

  function closeOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    overlay.classList.remove('show', 'expanded');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('hp-ai-overlay-open');
  }

  function openReplace(dayIndex, slotKey) {
    const profile = getProfile();
    const day = plan && plan.days[dayIndex];
    const meal = day && day.meals.find(entry => entry.slotKey === slotKey);
    if (!meal) return;
    const current = itemById(meal.itemId);
    const choices = availableForType(meal.type, profile).filter(item => item.id !== current.id);
    const list = choices.map(item => `<button type="button" class="hp-ai-replacement" data-ai-use-replacement="${dayIndex}:${safe(slotKey)}:${safe(item.id)}"><span><strong>${safe(item.name)}</strong><small>${safe(item.kitchen)} · ${safe(item.serving)}</small></span><span>₹${item.price}<b>+</b></span></button>`).join('');
    const content = `<div class="hp-ai-current-choice"><span>Current ${safe(meal.slotLabel)}</span><strong>${safe(current.name)}</strong></div><div class="hp-ai-replacement-list">${list}</div>${choices.length ? '' : '<p class="hp-ai-no-choice">No other active merchant dish currently matches this meal.</p>'}`;
    openOverlay('PERSONALIZE MEAL', `Replace ${meal.slotLabel}`, content);
  }

  function useReplacement(dayIndex, slotKey, itemId) {
    const day = plan && plan.days[dayIndex];
    const meal = day && day.meals.find(entry => entry.slotKey === slotKey);
    const replacement = MENU.find(item => item.id === itemId);
    if (!meal || !replacement || (vegOnly && !isVegetarian(replacement)) || !isItemAllowed(replacement, getProfile())) return;
    meal.itemId = replacement.id;
    localStorage.setItem(planKey(), JSON.stringify(plan));
    closeOverlay();
    selectedDay = dayIndex;
    renderDashboard();
  }

  function fullWeekMarkup() {
    return `<div class="hp-ai-full-week">${plan.days.map((day, dayIndex) => {
      const total = dayTotals(day);
      return `<article class="hp-ai-week-day"><header><div><span>${safe(compactDate(day.date))}</span><h3>${safe(day.label)}</h3></div><strong>₹${total.price}</strong></header><div>${day.meals.map(meal => {
        const item = itemById(meal.itemId);
        return `<button type="button" data-ai-jump-day="${dayIndex}"><span>${safe(meal.time)}</span><strong>${safe(item.name)}</strong><small>${safe(meal.slotLabel)}</small></button>`;
      }).join('')}</div></article>`;
    }).join('')}</div>`;
  }

  function openOrderSummary() {
    const totals = weeklyTotals();
    if (totals.unavailable) return;
    const content = `<div class="hp-ai-order-summary"><div class="hp-ai-order-success">✓</div><h3>Your AI plan is ready</h3><p>${safe(compactDate(plan.days[0].date))} – ${safe(compactDate(plan.days[6].date))} · ${totals.meals} meals</p><div class="hp-ai-order-breakdown"><span><small>Menu subtotal</small><strong>₹${totals.price}</strong></span><span><small>Delivery & final pricing</small><strong>At checkout</strong></span></div><button class="hp-ai-confirm-order" type="button" data-ai-action="save-order">Continue with this plan</button><small>Payment and kitchen confirmation will be connected when the ordering API is set up.</small></div>`;
    openOverlay('WEEKLY ORDER', 'Review your plan', content);
  }

  function saveOrderDraft() {
    const totals = weeklyTotals();
    if (totals.unavailable) return;
    localStorage.setItem(orderDraftKey(), JSON.stringify({
      source: 'ai-made-diet',
      menuVersion,
      plan,
      estimatedMenuTotal: totals.price,
      meals: totals.meals,
      status: 'ready-for-api-checkout',
      createdAt: new Date().toISOString()
    }));
    const body = document.getElementById('hpAiOverlayBody');
    if (body) body.innerHTML = '<div class="hp-ai-order-summary saved"><div class="hp-ai-order-success">✓</div><h3>Weekly plan saved</h3><p>Your selected AI diet is ready for checkout integration.</p><button class="hp-ai-confirm-order" type="button" data-ai-action="close-overlay">Done</button></div>';
  }

  function regeneratePlan() {
    localStorage.removeItem(planKey());
    plan = generatePlan(getProfile());
    localStorage.setItem(planKey(), JSON.stringify(plan));
    selectedDay = currentDayIndex();
    renderDashboard();
  }

  function syncSearchEmptyState() {
    const list = document.getElementById('hpAiMealList');
    const empty = document.getElementById('hpAiSearchEmpty');
    if (!list || !empty) return;
    empty.classList.toggle('show', list.querySelectorAll('.hp-ai-meal-card:not(.hp-ai-search-hidden)').length === 0);
  }

  function applySearch(value) {
    searchTerm = String(value || '').trim().toLowerCase();
    document.querySelectorAll('#hpAiMealList .hp-ai-meal-card').forEach(card => {
      card.classList.toggle('hp-ai-search-hidden', Boolean(searchTerm) && !card.textContent.toLowerCase().includes(searchTerm));
    });
    syncSearchEmptyState();
  }

  function handleClick(event) {
    const ordersButton = event.target.closest('#ordersBtn');
    if (ordersButton) {
      renderMenuOrders();
      return;
    }

    const cartButton = event.target.closest('#cartBtn');
    if (cartButton) {
      renderMenuCart();
      return;
    }

    const savedAddressButton = event.target.closest('#saveAddress');
    if (savedAddressButton) {
      window.requestAnimationFrame(() => {
        renderMenuCart();
        if (buyNowState) renderMenuBuyPage();
      });
      return;
    }

    const addToCartButton = event.target.closest('[data-menu-cart-add]');
    if (addToCartButton) {
      addMenuItemToCart(addToCartButton.dataset.menuCartAdd, true);
      return;
    }

    const buyNowButton = event.target.closest('[data-menu-buy-now]');
    if (buyNowButton) {
      openMenuBuyPage(buyNowButton.dataset.menuBuyNow, buyNowButton.dataset.menuBuyCategory);
      return;
    }

    const buyCloseButton = event.target.closest('[data-menu-buy-close]');
    if (buyCloseButton) {
      closeMenuBuyPage(true);
      return;
    }

    const buyQuantityButton = event.target.closest('[data-menu-buy-quantity]');
    if (buyQuantityButton) {
      changeBuyNowQuantity(Number(buyQuantityButton.dataset.menuBuyQuantity) || 0, buyQuantityButton.dataset.menuBuyItemId || '');
      return;
    }

    const buyLocationButton = event.target.closest('[data-menu-buy-location]');
    if (buyLocationButton) {
      openBuyDeliveryLocation();
      return;
    }

    const buyPlaceOrderButton = event.target.closest('[data-menu-buy-place-order]');
    if (buyPlaceOrderButton) {
      placeMenuCodOrder();
      return;
    }

    const buyViewOrdersButton = event.target.closest('[data-menu-buy-view-orders]');
    if (buyViewOrdersButton) {
      openPlacedMenuOrder();
      return;
    }

    const buyContinueOrderingButton = event.target.closest('[data-menu-buy-continue-ordering]');
    if (buyContinueOrderingButton) {
      continueMenuOrdering();
      return;
    }

    const quantityButton = event.target.closest('[data-menu-cart-change]');
    if (quantityButton) {
      changeMenuCartQuantity(quantityButton.dataset.menuCartItem, Number(quantityButton.dataset.menuCartChange) || 0);
      return;
    }

    const removeButton = event.target.closest('[data-menu-cart-remove]');
    if (removeButton) {
      removeMenuCartItem(removeButton.dataset.menuCartRemove);
      return;
    }

    const cartLocationButton = event.target.closest('[data-menu-cart-location]');
    if (cartLocationButton) {
      openBuyDeliveryLocation();
      return;
    }

    const cartCheckoutButton = event.target.closest('[data-menu-cart-checkout]');
    if (cartCheckoutButton) {
      openMenuCartCheckout();
      return;
    }

    const cartShopButton = event.target.closest('[data-menu-cart-shop]');
    if (cartShopButton) {
      const homeButton = document.getElementById('homeBtn');
      if (homeButton) homeButton.click();
      return;
    }

    const categoryClose = event.target.closest('[data-home-category-close]');
    if (categoryClose) {
      closeCategoryMenu();
      return;
    }

    const categoryButton = event.target.closest('[data-home-category]');
    if (categoryButton) {
      const searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.blur();
      openCategoryMenu(categoryButton.dataset.homeCategory);
      return;
    }

    const dayButton = event.target.closest('[data-ai-day]');
    if (dayButton) {
      selectedDay = Math.max(0, Math.min(6, Number(dayButton.dataset.aiDay) || 0));
      renderDashboard();
      return;
    }

    const replaceButton = event.target.closest('[data-ai-replace]');
    if (replaceButton) {
      const [dayIndex, slotKey] = replaceButton.dataset.aiReplace.split(':');
      openReplace(Number(dayIndex), slotKey);
      return;
    }

    const replacement = event.target.closest('[data-ai-use-replacement]');
    if (replacement) {
      const [dayIndex, slotKey, itemId] = replacement.dataset.aiUseReplacement.split(':');
      useReplacement(Number(dayIndex), slotKey, itemId);
      return;
    }

    const jump = event.target.closest('[data-ai-jump-day]');
    if (jump) {
      selectedDay = Math.max(0, Math.min(6, Number(jump.dataset.aiJumpDay) || 0));
      closeOverlay();
      renderDashboard();
      return;
    }

    const actionButton = event.target.closest('[data-ai-action]');
    if (!actionButton || actionButton.disabled) return;
    const action = actionButton.dataset.aiAction;
    if (action === 'regenerate') regeneratePlan();
    else if (action === 'full-week') openOverlay('AI WEEKLY DIET', 'Your full week', fullWeekMarkup(), true);
    else if (action === 'order') openOrderSummary();
    else if (action === 'save-order') saveOrderDraft();
    else if (action === 'close-overlay') closeOverlay();
  }

  function preserveLegacyHome(main) {
    Array.from(main.children).forEach(child => {
      if (child.id === DASHBOARD_ID) return;
      if (child.classList.contains('home-categories')) {
        child.hidden = false;
        child.removeAttribute('aria-hidden');
        return;
      }
      if (child.dataset.hpLegacyHome === 'true') return;
      child.dataset.hpLegacyHome = 'true';
      child.hidden = true;
      child.setAttribute('aria-hidden', 'true');
    });
  }

  function applyVegFilter(page, enabled, notifyUser) {
    vegOnly = Boolean(enabled);
    saveVegFilter();

    const toggle = page && page.querySelector('#vegToggle');
    if (toggle) toggle.checked = vegOnly;
    refreshHomeRecommendations(page);

    const categoryPage = document.getElementById(CATEGORY_PAGE_ID);
    const activeCategory = page && page.querySelector('[data-home-category].active');
    if (categoryPage && categoryPage.classList.contains('show') && activeCategory) {
      openCategoryMenu(activeCategory.dataset.homeCategory);
    }

    localStorage.removeItem(planKey());
    plan = generatePlan(getProfile());
    localStorage.setItem(planKey(), JSON.stringify(plan));
    if (document.getElementById(DASHBOARD_ID)) renderDashboard();

    if (notifyUser) {
      showMenuCartToast(vegOnly ? 'Showing vegetarian dishes only' : 'Showing all dishes');
    }
  }

  function bindHeaderControls(page, main) {
    const searchInput = page.querySelector('#searchInput');
    if (searchInput && searchInput.dataset.aiDietSearchBound !== 'true') {
      searchInput.dataset.aiDietSearchBound = 'true';
      searchInput.placeholder = 'Search meals in your AI diet';
      searchInput.addEventListener('input', event => applySearch(event.target.value));
    }

    const vegToggle = page.querySelector('#vegToggle');
    if (vegToggle) {
      vegToggle.checked = vegOnly;
      vegToggle.disabled = false;
      vegToggle.removeAttribute('aria-disabled');
      if (vegToggle.dataset.vegFilterBound !== 'true') {
        vegToggle.dataset.vegFilterBound = 'true';
        vegToggle.addEventListener('change', event => applyVegFilter(page, event.currentTarget.checked, true));
      }
      const vegLabel = page.querySelector('#onlyVegText');
      if (vegLabel) vegLabel.textContent = 'Only Veg';
    }

    const homeButton = page.querySelector('#homeBtn');
    if (homeButton && homeButton.dataset.aiHomeBound !== 'true') {
      homeButton.dataset.aiHomeBound = 'true';
      homeButton.addEventListener('click', () => main.scrollTo({ top: 0, behavior: 'smooth' }));
    }
  }

  function mount() {
    mountQueued = false;
    const page = document.getElementById('page-home');
    if (!page) return;
    const main = page.querySelector(':scope > .app > main');
    if (!main) return;

    preserveLegacyHome(main);
    ensureCategoryMenuPage(page);
    ensureMenuBuyPage(page);
    bindCategoryCards(page);
    ensureHomeRecommendations(page);
    renderMenuCart();
    renderMenuOrders();
    updateMenuCartBadge();
    if (!main.querySelector(`#${DASHBOARD_ID}`)) {
      plan = loadPlan();
      main.insertAdjacentHTML('afterbegin', dashboardMarkup());
    } else if (!plan) {
      plan = loadPlan();
    }

    ensureOverlay(page);
    bindHeaderControls(page, main);
    syncSearchEmptyState();
  }

  function queueMount() {
    if (mountQueued) return;
    mountQueued = true;
    requestAnimationFrame(mount);
  }

  function boot() {
    bindMerchantCatalog();
    queueMount();
    const root = document.getElementById('root');
    if (root && !observer) {
      observer = new MutationObserver(queueMount);
      observer.observe(root, { childList: true, subtree: true });
    }
    document.addEventListener('click', handleClick);
    document.addEventListener('input', handleMenuBuyInput);
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !closeMenuBuyPage(true) && !closeCategoryMenu()) closeOverlay(); });
    window.addEventListener('pageshow', queueMount);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
