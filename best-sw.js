const PATCH_VERSION = '2026-07-22-food-preference-v1';

const FIREBASE_CONFIG_SCRIPT = `
<script id="hapycure-firebase-config">
  window.NUTRITILIOUS_FIREBASE_CONFIG = {
    apiKey: "AIzaSyCzD-QcA0K-rSXM5VZYsGB2bE3FEfhkyX0",
    authDomain: "nutrilious-ceebd.firebaseapp.com",
    projectId: "nutrilious-ceebd",
    storageBucket: "nutrilious-ceebd.firebasestorage.app",
    messagingSenderId: "904909524137",
    appId: "1:904909524137:web:e20913ddbd9aa3d3856db8"
  };
</script>`;

const DIET_ONBOARDING_ASSETS = `
<link rel="stylesheet" href="./diet-onboarding.css?v=${PATCH_VERSION}" />
<script src="./diet-onboarding.js?v=${PATCH_VERSION}" defer></script>`;

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

  /* Use the uploaded Hepicure logo throughout the diet onboarding header. */
  #hapycureDietOnboarding .hp-brand-mark {
    width: clamp(118px, 34vw, 150px) !important;
    height: 46px !important;
    flex: 0 0 clamp(118px, 34vw, 150px) !important;
    border-radius: 0 !important;
    background: url('./hepicure_logo_transparent.png?v=${PATCH_VERSION}') left center / contain no-repeat !important;
    color: transparent !important;
    font-size: 0 !important;
    box-shadow: none !important;
  }
  #hapycureDietOnboarding .hp-onboarding-header > div:nth-child(2) {
    display: none !important;
  }

  /* Food preference: four clean, full-width choices with no icons. */
  #hapycureDietOnboarding .hp-food-grid {
    grid-template-columns: 1fr !important;
  }
  #hapycureDietOnboarding .hp-food-grid .hp-option-card {
    min-height: 78px !important;
    align-items: center !important;
    flex-direction: row !important;
    padding: 14px 16px !important;
  }
  #hapycureDietOnboarding .hp-food-grid .hp-option-icon {
    display: none !important;
  }

  #hapycureDietOnboarding .hp-custom-allergy-field {
    display: block;
    margin-top: 18px;
  }
  #hapycureDietOnboarding .hp-custom-allergy-field > span {
    display: block;
    margin-bottom: 9px;
    color: #514845;
    font-size: 11.5px;
    font-weight: 900;
    line-height: 1.3;
  }
  #hapycureDietOnboarding .hp-custom-allergy-field small {
    color: #978c87;
    font-weight: 650;
  }
  #hapycureDietOnboarding .hp-custom-allergy-field input {
    width: 100%;
    height: 52px;
    padding: 0 14px;
    border: 1px solid #e8e0dd;
    border-radius: 16px;
    outline: 0;
    background: #faf8f7;
    color: #201c1b;
    font: inherit;
    font-size: 13px;
    font-weight: 750;
  }
  #hapycureDietOnboarding .hp-custom-allergy-field input::placeholder {
    color: #a09692;
    font-weight: 650;
  }
  #hapycureDietOnboarding .hp-custom-allergy-field input:focus {
    border-color: #dd6b64;
    background: #fff;
    box-shadow: 0 0 0 3px rgba(208, 52, 44, .08);
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
      if (root) new MutationObserver(syncPageScroll).observe(root, { childList: true, subtree: true });
    });
    window.addEventListener('popstate', syncPageScroll);
  })();
</script>
<script id="hapycure-food-preference-patch">
  (() => {
    const DRAFT_PREFIX = 'nutritiliousCustomAllergiesDraft_';

    function getUser() {
      try {
        return JSON.parse(localStorage.getItem('nutritiliousUser') || '{}') || {};
      } catch (error) {
        return {};
      }
    }

    function accountId(user) {
      return String(user.uid || user.email || 'google').replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    function draftKey() {
      return DRAFT_PREFIX + accountId(getUser());
    }

    function parseCustomAllergies(value) {
      const seen = new Set();
      return String(value || '')
        .split(',')
        .map(item => item.trim())
        .filter(item => {
          const normalized = item.toLowerCase();
          if (!normalized || seen.has(normalized)) return false;
          seen.add(normalized);
          return true;
        })
        .slice(0, 20);
    }

    function addManualAllergyField() {
      const overlay = document.getElementById('hapycureDietOnboarding');
      if (!overlay || !overlay.querySelector('.hp-food-grid')) return;
      const chips = overlay.querySelector('.hp-food-grid')
        .closest('.hp-field-group')
        .nextElementSibling;
      if (!chips || chips.querySelector('#hpCustomAllergies')) return;

      const field = document.createElement('label');
      field.className = 'hp-custom-allergy-field';
      field.innerHTML = '<span>Add manually <small>(optional)</small></span>' +
        '<input id="hpCustomAllergies" type="text" maxlength="180" autocomplete="off" ' +
        'placeholder="e.g. sesame, mushroom, mustard" aria-label="Add other allergies manually">';
      chips.appendChild(field);

      const input = field.querySelector('input');
      input.value = sessionStorage.getItem(draftKey()) || '';
      input.addEventListener('input', function () {
        sessionStorage.setItem(draftKey(), input.value);
        if (input.value.trim()) {
          const none = overlay.querySelector('[data-multi-group="allergies"][data-multi-value="none"]');
          if (none) none.classList.remove('selected');
        }
      });
    }

    async function syncCustomAllergiesToProfile() {
      const user = getUser();
      const id = accountId(user);
      const raw = sessionStorage.getItem(DRAFT_PREFIX + id) || '';
      const customAllergies = parseCustomAllergies(raw);
      const profileKey = 'nutritiliousDietProfile_' + id;
      let savedProfile;

      try {
        savedProfile = JSON.parse(localStorage.getItem(profileKey) || 'null');
      } catch (error) {
        savedProfile = null;
      }
      if (!savedProfile) return false;

      const selected = Array.isArray(savedProfile.allergies) ? savedProfile.allergies : [];
      savedProfile.allergies = customAllergies.length ? selected.filter(item => item !== 'none') : selected;
      savedProfile.customAllergies = customAllergies;
      localStorage.setItem(profileKey, JSON.stringify(savedProfile));

      try {
        if (window.firebase && firebase.apps.length && user.uid) {
          await firebase.firestore().collection('users').doc(user.uid).set({
            dietProfile: savedProfile,
            dietProfileUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }
      } catch (error) {}

      sessionStorage.removeItem(DRAFT_PREFIX + id);
      return true;
    }

    function scheduleProfileSync() {
      [80, 250, 650, 1200].forEach(delay => {
        setTimeout(() => { syncCustomAllergiesToProfile(); }, delay);
      });
    }

    document.addEventListener('click', event => {
      const allergyChoice = event.target.closest('[data-multi-group="allergies"]');
      if (allergyChoice && allergyChoice.dataset.multiValue === 'none') {
        setTimeout(() => {
          const input = document.getElementById('hpCustomAllergies');
          if (input) input.value = '';
          sessionStorage.removeItem(draftKey());
        }, 0);
      }

      const next = event.target.closest('#hpNextBtn');
      if (!next) return;
      const count = document.getElementById('hpStepCount');
      if (count && count.textContent.trim().startsWith('5 ')) scheduleProfileSync();
    });

    function boot() {
      addManualAllergyField();
      const root = document.getElementById('root');
      if (root) new MutationObserver(addManualAllergyField).observe(root, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  })();
</script>`;

const FIREBASE_LOGIN_LOGIC = `function initLoginPage(navigate) {
      const phoneNumber = document.getElementById('phoneNumber');
      const continueLogin = document.getElementById('continueLogin');
      const googleLogin = document.getElementById('googleLogin');
      const loginMsg = document.getElementById('loginMsg');
      const firebaseConfig = window.NUTRITILIOUS_FIREBASE_CONFIG;
      let signInCompleted = false;
      let auth = null;

      function setMsg(message, success) {
        loginMsg.style.color = success ? '#267e3e' : '#d0342c';
        loginMsg.textContent = message || '';
      }

      function setBusy(isBusy) {
        googleLogin.disabled = isBusy;
        continueLogin.disabled = isBusy;
        googleLogin.setAttribute('aria-busy', String(isBusy));
      }

      function getAuth() {
        if (!window.firebase || !firebase.auth) throw new Error('Firebase Authentication failed to load.');
        if (!firebaseConfig) throw new Error('Firebase configuration is missing.');
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        if (!auth) auth = firebase.auth();
        return auth;
      }

      function saveSignedInUser(user) {
        const userData = {
          uid: user.uid || '',
          name: user.displayName || '',
          email: user.email || '',
          phone: user.phoneNumber || '',
          photoURL: user.photoURL || '',
          isAnonymous: false,
          provider: 'google'
        };

        localStorage.setItem('nutritiliousAuthType', 'google');
        localStorage.setItem('nutritiliousUser', JSON.stringify(userData));
        localStorage.removeItem('nutritiliousLoggedOut');

        const accountId = String(userData.uid || userData.email || 'google').replace(/[^a-zA-Z0-9_-]/g, '_');
        if (userData.name) localStorage.setItem('nutritiliousProfile_' + accountId + '_Name', userData.name);
        if (userData.email) localStorage.setItem('nutritiliousProfile_' + accountId + '_Email', userData.email);
        if (userData.phone) localStorage.setItem('nutritiliousProfile_' + accountId + '_Phone', userData.phone);

        try {
          firebase.firestore().collection('users').doc(userData.uid).set({
            uid: userData.uid,
            name: userData.name,
            email: userData.email,
            phone: userData.phone,
            photoURL: userData.photoURL,
            provider: 'google',
            lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true }).catch(function () {});
        } catch (error) {}
      }

      function friendlyGoogleError(error) {
        const code = error && error.code ? error.code : '';
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Google sign-in was cancelled.';
        if (code === 'auth/popup-blocked') return 'Please allow pop-ups for this website, then tap Continue with Google again.';
        if (code === 'auth/unauthorized-domain') return 'This website domain is not authorized in Firebase Authentication.';
        if (code === 'auth/network-request-failed') return 'Network error. Check your internet connection and try again.';
        if (code === 'auth/account-exists-with-different-credential') return 'An account already exists with this email using another sign-in method.';
        return error && error.message ? error.message : 'Google sign-in failed. Please try again.';
      }

      function completeGoogleSignIn(user) {
        if (signInCompleted || !user) return;
        signInCompleted = true;
        saveSignedInUser(user);
        sessionStorage.removeItem('nutritiliousGoogleRedirectPending');
        setMsg('Signed in successfully.', true);
        window.history.replaceState({ nutriView: 'home' }, '');
        navigate('home');
      }

      async function startGoogleSignIn() {
        if (googleLogin.disabled) return;
        setBusy(true);
        setMsg('Opening Google sign-in…', true);
        localStorage.removeItem('nutritiliousLoggedOut');

        try {
          const currentAuth = getAuth();
          const provider = new firebase.auth.GoogleAuthProvider();
          provider.setCustomParameters({ prompt: 'select_account' });

          // Popup is intentionally used on mobile too. Firebase redirect auth can lose
          // its pending result when the app and auth handler use different domains.
          const result = await currentAuth.signInWithPopup(provider);
          completeGoogleSignIn(result && result.user);
        } catch (error) {
          signInCompleted = false;
          setMsg(friendlyGoogleError(error), false);
        } finally {
          if (document.getElementById('page-login')) setBusy(false);
        }
      }

      phoneNumber.addEventListener('input', function () {
        phoneNumber.value = phoneNumber.value.replace(/\D/g, '').slice(0, 10);
        setMsg('');
      });
      phoneNumber.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') event.preventDefault();
      });
      continueLogin.addEventListener('click', function () {
        const digits = phoneNumber.value.replace(/\D/g, '');
        if (digits.length !== 10) {
          setMsg('Enter a valid 10-digit mobile number.');
          phoneNumber.focus();
          return;
        }
        setMsg('Phone login is not available yet. Continue with Google.');
      });
      googleLogin.addEventListener('click', startGoogleSignIn);

      try {
        const currentAuth = getAuth();
        currentAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function () {});
        currentAuth.onAuthStateChanged(function (user) {
          if (user && localStorage.getItem('nutritiliousLoggedOut') !== 'true') completeGoogleSignIn(user);
        });
      } catch (error) {
        setMsg(friendlyGoogleError(error), false);
      }
    }`;

const AUTH_AWARE_APP_LOGIC = `function App() {
      const getInitialView = () => {
        try {
          const user = JSON.parse(localStorage.getItem('nutritiliousUser') || '{}') || {};
          const isGoogleUser = localStorage.getItem('nutritiliousAuthType') === 'google' && Boolean(user.uid || user.email);
          const explicitlyLoggedOut = localStorage.getItem('nutritiliousLoggedOut') === 'true';
          return isGoogleUser && !explicitlyLoggedOut ? 'home' : 'login';
        } catch (error) {
          return 'login';
        }
      };

      const [view, setView] = useState(getInitialView);

      useEffect(() => {
        const initialView = getInitialView();
        window.history.replaceState({ nutriView: initialView }, '');
        if (initialView !== view) setView(initialView);

        const onPopState = (event) => {
          const requestedView = event.state && event.state.nutriView ? event.state.nutriView : getInitialView();
          const safeView = requestedView === 'login' && getInitialView() === 'home' ? 'home' : requestedView;
          setView(safeView);
        };

        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
      }, []);

      const navigate = (next) => {
        setView(next);
        if (next === 'home') window.history.replaceState({ nutriView: 'home' }, '');
        else window.history.pushState({ nutriView: next }, '');
      };

      if (view === 'help') return <HelpPage navigate={navigate} />;
      if (view === 'home') return <HomePage navigate={navigate} />;
      return <LoginPage navigate={navigate} />;
    }`;

function patchAppShell(html) {
  const loginPattern = /function initLoginPage\(navigate\)\s*\{[\s\S]*?\n\s*\}\n\n\s*\/\* ============ Help & Support page logic/;
  const appPattern = /function App\(\)\s*\{[\s\S]*?\n\s*\}\n\n\s*const root = ReactDOM\.createRoot/;

  return html
    .replace(/<button\s+class=["']login-skip-btn["'][^>]*id=["']skipLogin["'][^>]*>[\s\S]*?<\/button>/i, '')
    .replace(loginPattern, FIREBASE_LOGIN_LOGIC + '\n\n    /* ============ Help & Support page logic')
    .replace(appPattern, AUTH_AWARE_APP_LOGIC + '\n\n    const root = ReactDOM.createRoot')
    .replace(
      /function logout\(\)\{clearStoredLocation\(\);/,
      "function logout(){try{if(window.firebase&&firebase.apps.length)firebase.auth().signOut().catch(function(){})}catch(error){}clearStoredLocation();"
    )
    .replace('</head>', FIREBASE_CONFIG_SCRIPT + '\n' + DIET_ONBOARDING_ASSETS + '\n' + HOME_RUNTIME_PATCH + '\n</head>');
}

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type: 'window' });
    await Promise.all(windows.map(function (client) {
      return client.navigate(client.url).catch(function () { return null; });
    }));
  })());
});

self.addEventListener('fetch', function (event) {
  if (event.request.mode !== 'navigate') return;

  event.respondWith((async function () {
    const response = await fetch(event.request, { cache: 'no-store' });
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
      headers: headers
    });
  })());
});