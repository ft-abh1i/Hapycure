(() => {
  'use strict';

  function clearHomepageContent() {
    const page = document.getElementById('page-home');
    if (!page) return;

    const main = page.querySelector(':scope > .app > main');
    if (main && main.childElementCount) main.replaceChildren();

    const weeklyFlow = page.querySelector('#hpWeeklyFlow');
    if (weeklyFlow) weeklyFlow.remove();
  }

  function boot() {
    clearHomepageContent();
    const root = document.getElementById('root');
    if (root) {
      new MutationObserver(clearHomepageContent).observe(root, {
        childList: true,
        subtree: true
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
