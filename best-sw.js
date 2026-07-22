const HOME_RUNTIME_PATCH = `
<style id="hapycure-home-scroll-lock">
  #page-home {
    height: 100dvh !important;
    max-height: 100dvh !important;
    overflow: hidden !important;
    overscroll-behavior: none;
  }

  #page-home > .app {
    height: 100dvh !important;
    min-height: 0 !important;
    max-height: 100dvh !important;
    overflow: hidden !important;
  }
</style>
<script id="hapycure-home-scroll-sync">
  (() => {
    function syncPageScroll() {
      const isHomePage = Boolean(document.getElementById('page-home'));
      document.documentElement.style.overflowY = isHomePage ? 'hidden' : '';
      document.body.style.overflowY = isHomePage ? 'hidden' : '';
    }

    document.addEventListener('DOMContentLoaded', () => {
      syncPageScroll();
      const root = document.getElementById('root');
      if (root) {
        new MutationObserver(syncPageScroll).observe(root, {
          childList: true,
          subtree: true
        });
      }
    });

    window.addEventListener('popstate', syncPageScroll);
  })();
</script>`;

function patchAppShell(html) {
  return html
    .replace(
      /<button\s+class=["']login-skip-btn["'][^>]*id=["']skipLogin["'][^>]*>[\s\S]*?<\/button>/i,
      ''
    )
    .replace(
      /,skipLogin=document\.getElementById\(["']skipLogin["']\)/,
      ''
    )
    .replace(
      /\s*skipLogin\.addEventListener\(["']click["'],goHome\);?/,
      ''
    )
    .replace('</head>', `${HOME_RUNTIME_PATCH}\n</head>`);
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type: 'window' });
    await Promise.all(
      windows.map(client => client.navigate(client.url).catch(() => null))
    );
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;

  event.respondWith((async () => {
    const response = await fetch(event.request);
    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('text/html')) return response;

    const html = await response.text();
    if (!html.includes('id="root"')) {
      return new Response(html, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    }

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('content-type', 'text/html; charset=utf-8');

    return new Response(patchAppShell(html), {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  })());
});
