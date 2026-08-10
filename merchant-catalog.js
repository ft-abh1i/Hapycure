(() => {
  'use strict';

  const SOURCE = 'hapycure-merchant';
  const STATIC_IMAGE_URLS = [
    './hepicure_logo_transparent.png',
    './assets/categories/breakfast.webp',
    './assets/categories/lunch.webp',
    './assets/categories/dinner.webp',
    './assets/categories/snacks.webp',
    './assets/categories/beverages.webp',
    './assets/categories/desserts.webp'
  ];
  const listeners = new Set();
  const errorListeners = new Set();
  const imagePromises = new Map();
  const imageReadyWaiters = new Set();
  let restaurants = [];
  let dishes = [];
  let messPlans = [];
  let unsubscribers = [];
  let started = false;
  let ready = { restaurants: false, dishes: false, messPlans: false };

  function preloadImage(url) {
    const source = String(url || '').trim();
    if (!source) return Promise.resolve();
    if (imagePromises.has(source)) return imagePromises.get(source);
    const promise = new Promise(resolve => {
      const image = new Image();
      const settle = () => resolve(source);
      image.onload = settle;
      image.onerror = settle;
      image.decoding = 'async';
      image.src = source;
      if (image.complete) settle();
    });
    imagePromises.set(source, promise);
    return promise;
  }

  function preloadImages(urls) {
    return Promise.allSettled(Array.from(new Set(urls || [])).map(preloadImage));
  }

  function preloadCatalogueImages() {
    return preloadImages([
      ...dishes.map(dish => dish.image),
      ...restaurants.map(restaurant => restaurant.image)
    ]);
  }

  function flushImageReadyWaiters() {
    if (!ready.restaurants || !ready.dishes) return;
    const currentTasks = Array.from(imagePromises.values());
    imageReadyWaiters.forEach(done => {
      Promise.allSettled(currentTasks).then(done);
    });
  }

  function whenImagesReady(timeout = 3500) {
    start();
    return new Promise(resolve => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        imageReadyWaiters.delete(done);
        resolve();
      };
      const timer = setTimeout(done, Math.max(0, Number(timeout) || 0));
      imageReadyWaiters.add(done);
      flushImageReadyWaiters();
    });
  }

  function firebaseContext() {
    if (!window.firebase?.initializeApp || !window.firebase?.firestore) {
      throw new Error('Firebase failed to load.');
    }
    if (!firebase.apps.length) {
      if (!window.NUTRITILIOUS_FIREBASE_CONFIG) throw new Error('Firebase configuration is missing.');
      firebase.initializeApp(window.NUTRITILIOUS_FIREBASE_CONFIG);
    }
    return firebase.firestore();
  }

  function documentData(snapshot) {
    return snapshot.docs.map(document => ({ __id: document.id, ...document.data() }));
  }

  function adminApproved(item) {
    return String(item?.approvalStatus || '').trim().toLowerCase() === 'approved';
  }

  function timestampValue(value) {
    if (value && typeof value.toMillis === 'function') return value.toMillis();
    if (value && Number.isFinite(Number(value.seconds))) return Number(value.seconds) * 1000;
    return 0;
  }

  function catalogueVersion() {
    const entries = [...restaurants, ...dishes, ...messPlans]
      .map(item => `${item.__id}:${timestampValue(item.updatedAt)}`)
      .sort()
      .join('|');
    let hash = 2166136261;
    for (let index = 0; index < entries.length; index += 1) {
      hash ^= entries.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `merchant-${entries.length}-${(hash >>> 0).toString(36)}`;
  }

  function snapshot() {
    return {
      restaurants: restaurants.map(item => ({ ...item })),
      dishes: dishes.map(item => ({ ...item })),
      messPlans: messPlans.map(item => ({ ...item, menu: { ...(item.menu || {}) } })),
      ready: { ...ready },
      version: catalogueVersion()
    };
  }

  function notify() {
    const value = snapshot();
    preloadCatalogueImages();
    listeners.forEach(listener => {
      try { listener(value); } catch (error) { console.error('Merchant catalogue listener failed:', error); }
    });
    flushImageReadyWaiters();
  }

  function notifyError(error, collectionName) {
    console.error(`Merchant ${collectionName} listener failed:`, error);
    errorListeners.forEach(listener => {
      try { listener(error, collectionName); } catch (_) {}
    });
  }

  function attach(collectionName, assign) {
    const db = firebaseContext();
    const unsubscribe = db.collection(collectionName)
      .where('approvalStatus', '==', 'approved')
      .onSnapshot(current => {
        assign(documentData(current).filter(item => item.source === SOURCE && adminApproved(item)));
        ready[collectionName] = true;
        notify();
      }, error => notifyError(error, collectionName));
    unsubscribers.push(unsubscribe);
  }

  function start() {
    if (started) return true;
    try {
      started = true;
      attach('restaurants', value => { restaurants = value; });
      attach('dishes', value => { dishes = value; });
      attach('messPlans', value => { messPlans = value; });
      return true;
    } catch (error) {
      started = false;
      notifyError(error, 'setup');
      return false;
    }
  }

  function stop() {
    unsubscribers.splice(0).forEach(unsubscribe => {
      try { unsubscribe(); } catch (_) {}
    });
    started = false;
    ready = { restaurants: false, dishes: false, messPlans: false };
  }

  function refresh() {
    stop();
    start();
  }

  function subscribe(listener, onError) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    if (typeof onError === 'function') errorListeners.add(onError);
    listener(snapshot());
    start();
    return () => {
      listeners.delete(listener);
      if (typeof onError === 'function') errorListeners.delete(onError);
    };
  }

  function categoryTypes(category) {
    const normalized = String(category || '').trim().toLowerCase();
    if (normalized === 'breakfast') return ['breakfast'];
    if (normalized === 'lunch') return ['lunch'];
    if (normalized === 'dinner') return ['dinner'];
    if (normalized === 'snacks' || normalized === 'snack') return ['snack'];
    if (normalized === 'drinks' || normalized === 'drink' || normalized === 'beverages' || normalized === 'beverage') return ['drink'];
    if (normalized === 'desserts' || normalized === 'dessert') return ['dessert'];
    return [];
  }

  function stringArray(value) {
    if (Array.isArray(value)) return value.map(String).map(item => item.trim()).filter(Boolean);
    if (typeof value === 'string') return value.split(',').map(item => item.trim()).filter(Boolean);
    return [];
  }

  function menuItems(value = snapshot()) {
    const restaurantById = new Map(
      value.restaurants
        .filter(restaurant =>
          restaurant.source === SOURCE &&
          restaurant.service === 'food' &&
          restaurant.open !== false &&
          restaurant.published !== false
        )
        .map(restaurant => [restaurant.__id, restaurant])
    );

    return value.dishes
      .filter(dish =>
        dish.source === SOURCE &&
        dish.active !== false &&
        dish.image &&
        restaurantById.has(dish.restaurantId)
      )
      .map(dish => {
        const restaurant = restaurantById.get(dish.restaurantId);
        const calories = Number(dish.calories);
        const protein = Number(dish.protein);
        return {
          id: dish.__id,
          restaurantId: dish.restaurantId,
          name: String(dish.name || '').trim(),
          description: String(dish.description || '').trim(),
          image: String(dish.image || ''),
          isVeg: String(dish.dietType || restaurant.foodType || '').toLowerCase() !== 'non-veg',
          kitchen: String(restaurant.name || 'Hapycure Partner'),
          types: categoryTypes(dish.category),
          price: Math.max(0, Number(dish.price) || 0),
          serving: String(dish.serving || '1 item'),
          calories: Number.isFinite(calories) && calories > 0 ? calories : 0,
          protein: Number.isFinite(protein) && protein > 0 ? protein : 0,
          nutritionAvailable: Number.isFinite(calories) && calories > 0 && Number.isFinite(protein) && protein > 0,
          tags: stringArray(dish.tags),
          allergens: stringArray(dish.allergens),
          source: SOURCE
        };
      })
      .filter(item => item.name && item.types.length && item.price > 0);
  }

  window.HapycureMerchantCatalog = Object.freeze({
    source: SOURCE,
    start,
    stop,
    refresh,
    subscribe,
    getSnapshot: snapshot,
    menuItems,
    preloadImages,
    whenImagesReady
  });

  preloadImages(STATIC_IMAGE_URLS);
})();
