const PATCH_VERSION = '2026-07-31-cross-device-scroll-v34';
const HTML_CACHE = 'hapycure-shell-' + PATCH_VERSION;

const ORDER_SCROLL_PATCH = `
<style id="hapycure-order-scroll-fix">
  #page-home #cartPage,
  #page-home #ordersPage {
    position: fixed !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100vh !important;
    height: 100dvh !important;
    max-height: none !important;
    overflow: visible !important;
    touch-action: auto !important;
  }

  #page-home #cartPage .notification-screen,
  #page-home #ordersPage .notification-screen {
    width: 100% !important;
    height: 100vh !important;
    height: 100dvh !important;
    min-height: 0 !important;
    max-height: none !important;
    display: grid !important;
    grid-template-rows: auto minmax(0, 1fr) !important;
    overflow: visible !important;
    padding: 0 !important;
    touch-action: auto !important;
  }

  #page-home #cartPage .notify-head,
  #page-home #ordersPage .notify-head {
    position: relative !important;
    top: auto !important;
    z-index: 30 !important;
    height: 68px !important;
    min-height: 68px !important;
    margin: 0 !important;
    padding: max(8px, env(safe-area-inset-top)) 16px 0 !important;
    background: #fff !important;
  }

  #page-home #cartPage .hp-menu-cart-root {
    width: 100% !important;
    min-width: 0 !important;
    min-height: 0 !important;
    height: auto !important;
    display: grid !important;
    grid-template-rows: minmax(0, 1fr) auto !important;
    overflow: visible !important;
    touch-action: auto !important;
  }

  #page-home #cartPage .hp-menu-cart-scroll {
    position: relative !important;
    width: 100% !important;
    min-width: 0 !important;
    min-height: 0 !important;
    height: auto !important;
    max-height: none !important;
    display: block !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior: auto !important;
    -webkit-overflow-scrolling: touch !important;
    touch-action: auto !important;
    padding-bottom: 24px !important;
    scrollbar-width: none;
  }

  #page-home #cartPage .hp-menu-cart-scroll::-webkit-scrollbar,
  #page-home #ordersPage .hp-menu-orders-root::-webkit-scrollbar {
    display: none;
  }

  #page-home #cartPage .hp-menu-cart-checkout {
    position: relative !important;
    inset: auto !important;
    z-index: 40 !important;
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
    padding-bottom: max(12px, env(safe-area-inset-bottom)) !important;
    background: #fff !important;
    touch-action: auto !important;
  }

  #page-home #ordersPage .hp-menu-orders-root {
    width: 100% !important;
    min-width: 0 !important;
    min-height: 0 !important;
    height: auto !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior: auto !important;
    -webkit-overflow-scrolling: touch !important;
    touch-action: auto !important;
    padding: 15px 14px calc(24px + env(safe-area-inset-bottom)) !important;
    scrollbar-width: none;
  }

  #page-home #ordersPage .hp-menu-orders-empty {
    min-height: 100% !important;
    height: auto !important;
  }

  #page-home .hp-menu-buy-page {
    position: fixed !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100vh !important;
    height: 100dvh !important;
    max-height: none !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior: auto !important;
    -webkit-overflow-scrolling: touch !important;
    touch-action: auto !important;
  }

  #page-home .hp-menu-buy-screen {
    min-height: 100vh !important;
    min-height: 100dvh !important;
    height: auto !important;
    overflow: visible !important;
  }

  #page-home .hp-menu-buy-header {
    position: sticky !important;
    top: 0;
    z-index: 5;
  }

  body.scroll-locked:has(#cartPage.show),
  body.scroll-locked:has(#ordersPage.show),
  body.scroll-locked:has(.hp-menu-buy-page.show) {
    height: auto !important;
    overflow-y: auto !important;
  }
</style>`;

const SCROLL_UNLOCK_PATCH = `
<script id="hapycure-scroll-unlock-fix">
(function () {
  'use strict';

  function orderFlowOpen() {
    var cart = document.getElementById('cartPage');
    var orders = document.getElementById('ordersPage');
    var buy = document.querySelector('.hp-menu-buy-page.show');
    return Boolean(
      (cart && cart.classList.contains('show')) ||
      (orders && orders.classList.contains('show')) ||
      buy
    );
  }

  function removeScrollBlockers() {
    if (!orderFlowOpen()) return;

    document.body.classList.remove('scroll-locked');
    [document.documentElement, document.body].forEach(function (node) {
      if (!node) return;
      node.style.removeProperty('overflow');
      node.style.removeProperty('overflow-y');
      node.style.removeProperty('height');
      node.style.removeProperty('position');
      node.style.removeProperty('touch-action');
    });

    document.querySelectorAll(
      '#cartPage .hp-menu-cart-scroll, #ordersPage .hp-menu-orders-root, .hp-menu-buy-page'
    ).forEach(function (scroller) {
      scroller.style.setProperty('overflow-y', 'auto', 'important');
      scroller.style.setProperty('touch-action', 'auto', 'important');
      scroller.style.setProperty('-webkit-overflow-scrolling', 'touch', 'important');
    });
  }

  function scheduleUnlock() {
    removeScrollBlockers();
    requestAnimationFrame(removeScrollBlockers);
    setTimeout(removeScrollBlockers, 80);
  }

  function start() {
    scheduleUnlock();

    var root = document.getElementById('page-home') || document.body;
    if (root && window.MutationObserver) {
      new MutationObserver(scheduleUnlock).observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class']
      });
    }

    document.addEventListener('click', function (event) {
      if (event.target.closest('#cartBtn, #ordersBtn, [data-close="cartPage"], [data-close="ordersPage"]')) {
        scheduleUnlock();
      }
    }, true);

    window.addEventListener('pageshow', scheduleUnlock);
    window.addEventListener('resize', scheduleUnlock, { passive: true });
    window.addEventListener('orientationchange', scheduleUnlock, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
<\/script>`;

function patchAppShell(html) {
  let patched = html
    .replace(/\.\/weekly-services\.css\?v=[^"']+/g, './weekly-services.css?v=' + PATCH_VERSION)
    .replace(/\.\/weekly-services\.js\?v=[^"']+/g, './weekly-services.js?v=' + PATCH_VERSION)
    .replace(/body\.scroll-locked\s*\{\s*overflow\s*:\s*hidden\s*;\s*height\s*:\s*100%\s*;\s*\}/g, 'body.scroll-locked { overflow:hidden; }')
    .replace(/function openPage\(id,btn\)\{(?:document\.body\.classList\.remove\('scroll-locked'\);)?/, "function openPage(id,btn){document.body.classList.remove('scroll-locked');");

  patched = patched.replace(/<style id="hapycure-order-scroll-fix">[\s\S]*?<\/style>/, '');
  patched = patched.replace(/<script id="hapycure-scroll-unlock-fix">[\s\S]*?<\/script>/, '');
  patched = patched.replace('</head>', ORDER_SCROLL_PATCH + '\n</head>');
  patched = patched.replace('</body>', SCROLL_UNLOCK_PATCH + '\n</body>');
  return patched;
}

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter(name => name.startsWith('hapycure-shell-') && name !== HTML_CACHE)
        .map(name => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (event) {
  if (event.request.mode !== 'navigate') return;

  event.respondWith((async function () {
    try {
      const response = await fetch(event.request, { cache: 'no-store' });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) return response;

      const html = await response.text();
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      headers.set('content-type', 'text/html; charset=utf-8');
      headers.set('cache-control', 'no-store, max-age=0');

      const patchedResponse = new Response(patchAppShell(html), {
        status: response.status,
        statusText: response.statusText,
        headers
      });

      const cache = await caches.open(HTML_CACHE);
      cache.put(event.request, patchedResponse.clone()).catch(function () {});
      return patchedResponse;
    } catch (error) {
      const cached = await caches.match(event.request);
      if (cached) return cached;

      return new Response(
        '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hapycure</title></head><body style="font-family:Arial,sans-serif;padding:32px;text-align:center"><h1>You are offline</h1><p>Reconnect to the internet and refresh Hapycure.</p></body></html>',
        {
          status: 503,
          headers: { 'content-type': 'text/html; charset=utf-8' }
        }
      );
    }
  })());
});
