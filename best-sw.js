const PATCH_VERSION = '2026-08-10-action-colors-v53';
const HTML_CACHE = 'hapycure-shell-' + PATCH_VERSION;

const NATIVE_SCROLL_PATCH = `
<style id="hapycure-order-scroll-fix">
  #page-home #cartPage,
  #page-home #ordersPage {
    position: fixed !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100vh !important;
    height: 100dvh !important;
    max-height: 100dvh !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior-y: auto !important;
    -webkit-overflow-scrolling: touch !important;
    touch-action: pan-y !important;
  }

  #page-home #cartPage *,
  #page-home #ordersPage * {
    touch-action: pan-y;
  }

  #page-home #cartPage button,
  #page-home #ordersPage button,
  #page-home #cartPage a,
  #page-home #ordersPage a,
  #page-home #cartPage input,
  #page-home #ordersPage input {
    touch-action: manipulation !important;
  }

  #page-home #cartPage .notification-screen,
  #page-home #ordersPage .notification-screen {
    width: 100% !important;
    min-height: 100% !important;
    height: auto !important;
    max-height: none !important;
    display: block !important;
    overflow: visible !important;
    padding: 0 !important;
  }

  #page-home #cartPage .notify-head,
  #page-home #ordersPage .notify-head {
    position: sticky !important;
    top: 0 !important;
    z-index: 50 !important;
    height: 68px !important;
    min-height: 68px !important;
    margin: 0 !important;
    padding: max(8px, env(safe-area-inset-top)) 16px 0 !important;
    background: #fff !important;
  }

  #page-home #cartPage .hp-menu-cart-root {
    width: 100% !important;
    min-height: 0 !important;
    height: auto !important;
    display: block !important;
    overflow: visible !important;
  }

  #page-home #cartPage .hp-menu-cart-scroll {
    position: static !important;
    width: 100% !important;
    min-height: 0 !important;
    height: auto !important;
    max-height: none !important;
    display: block !important;
    overflow: visible !important;
    padding-bottom: calc(108px + env(safe-area-inset-bottom)) !important;
    scroll-padding-bottom: calc(108px + env(safe-area-inset-bottom));
  }

  #page-home #cartPage .hp-menu-cart-checkout {
    position: fixed !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    transform: none !important;
    z-index: 999 !important;
    width: 100% !important;
    max-width: 430px !important;
    min-width: 0 !important;
    display: grid !important;
    grid-template-columns: 82px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 12px !important;
    margin: 0 auto !important;
    box-sizing: border-box !important;
    padding-bottom: max(12px, env(safe-area-inset-bottom)) !important;
    background: #fff !important;
    box-shadow: 0 -8px 24px rgba(47, 34, 28, .12) !important;
  }

  #page-home #cartPage .hp-menu-cart-checkout > div,
  #page-home #cartPage .hp-menu-cart-checkout button {
    min-width: 0 !important;
  }

  #page-home #cartPage .hp-menu-cart-checkout button {
    width: 100% !important;
  }

  @media (max-width: 360px) {
    #page-home #cartPage .hp-menu-cart-checkout {
      grid-template-columns: 72px minmax(0, 1fr) !important;
      gap: 9px !important;
      padding-left: 11px !important;
      padding-right: 11px !important;
    }
  }

  #page-home #ordersPage .hp-menu-orders-root {
    width: 100% !important;
    min-height: calc(100dvh - 68px) !important;
    height: auto !important;
    overflow: visible !important;
    padding: 15px 14px calc(24px + env(safe-area-inset-bottom)) !important;
  }

  #page-home #ordersPage .hp-menu-orders-empty {
    min-height: calc(100dvh - 98px) !important;
    height: auto !important;
  }

  #page-home .hp-menu-buy-page {
    position: fixed !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100vh !important;
    height: 100dvh !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior-y: auto !important;
    -webkit-overflow-scrolling: touch !important;
    touch-action: pan-y !important;
  }

  #page-home .hp-menu-buy-screen {
    min-height: 100% !important;
    height: auto !important;
    overflow: visible !important;
  }

  #page-home .hp-menu-buy-header {
    position: sticky !important;
    top: 0 !important;
    z-index: 50 !important;
  }
</style>`;

function patchAppShell(html) {
  let patched = html
    .replace(/\.\/weekly-services\.css\?v=[^"']+/g, './weekly-services.css?v=' + PATCH_VERSION)
    .replace(/\.\/weekly-services\.js\?v=[^"']+/g, './weekly-services.js?v=' + PATCH_VERSION);

  patched = patched.replace(/<style id="hapycure-order-scroll-fix">[\s\S]*?<\/style>/, '');
  patched = patched.replace(/<script id="hapycure-scroll-unlock-fix">[\s\S]*?<\/script>/, '');
  patched = patched.replace('</head>', NATIVE_SCROLL_PATCH + '\n</head>');
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
