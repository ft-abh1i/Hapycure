const PATCH_VERSION = '2026-07-31-order-scroll-v31';
const HTML_CACHE = 'hapycure-shell-' + PATCH_VERSION;

const ORDER_SCROLL_PATCH = `
<style id="hapycure-order-scroll-fix">
  #page-home #ordersPage {
    position: fixed !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100dvh !important;
    max-height: 100dvh !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y !important;
  }

  #page-home #ordersPage .notification-screen {
    width: 100% !important;
    min-height: 100dvh !important;
    height: max-content !important;
    overflow: visible !important;
    padding: 0 !important;
  }

  #page-home #ordersPage .notify-head {
    position: sticky !important;
    top: 0;
    z-index: 5;
    height: 68px;
    margin: 0;
    padding: max(8px, env(safe-area-inset-top)) 16px 0;
    background: #fff;
  }

  #page-home #ordersPage .hp-menu-orders-root {
    min-height: calc(100dvh - 68px) !important;
    padding-bottom: calc(104px + env(safe-area-inset-bottom));
  }

  #page-home #cartPage {
    position: fixed !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100dvh !important;
    max-height: 100dvh !important;
    overflow: hidden !important;
  }

  #page-home #cartPage .notification-screen {
    width: 100% !important;
    height: 100dvh !important;
    min-height: 0 !important;
    display: flex !important;
    overflow: hidden !important;
    flex-direction: column !important;
  }

  #page-home #cartPage .hp-menu-cart-root {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    overflow: hidden !important;
  }

  #page-home #cartPage .hp-menu-cart-scroll {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y !important;
  }

  #page-home .hp-menu-buy-page {
    position: fixed !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100dvh !important;
    max-height: 100dvh !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y !important;
  }

  #page-home .hp-menu-buy-screen {
    min-height: 100dvh !important;
    height: auto !important;
    overflow: visible !important;
  }

  #page-home .hp-menu-buy-header {
    position: sticky !important;
    top: 0;
    z-index: 5;
  }
</style>`;

function patchAppShell(html) {
  let patched = html
    .replace(/\.\/weekly-services\.css\?v=[^"']+/g, './weekly-services.css?v=' + PATCH_VERSION)
    .replace(/\.\/weekly-services\.js\?v=[^"']+/g, './weekly-services.js?v=' + PATCH_VERSION);

  if (!patched.includes('id="hapycure-order-scroll-fix"')) {
    patched = patched.replace('</head>', ORDER_SCROLL_PATCH + '\n</head>');
  }

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
