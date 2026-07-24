const PATCH_VERSION = '2026-07-24-mess-plans-v12';
const HTML_CACHE = 'hapycure-shell-' + PATCH_VERSION;

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

const APP_ASSETS = `
<link rel="stylesheet" href="./diet-onboarding.css?v=${PATCH_VERSION}" />
<link rel="stylesheet" href="./weekly-services.css?v=${PATCH_VERSION}" />
<link rel="stylesheet" href="./mess-plans.css?v=${PATCH_VERSION}" />
<script src="./diet-onboarding.js?v=${PATCH_VERSION}" defer></script>
<script src="./weekly-services.js?v=${PATCH_VERSION}" defer></script>
<script src="./mess-plans.js?v=${PATCH_VERSION}" defer></script>
<script src="./ai-diet-api.js?v=${PATCH_VERSION}" defer></script>`;

const HOME_RUNTIME_PATCH = `
<style id="hapycure-home-runtime-styles">
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

  #page-home > .app > main {
    display: block !important;
  }

  #page-home > .app > main > * {
    display: none !important;
  }

  #page-home > .app > main > .home-categories {
    display: block !important;
  }

  #page-home [data-hp-legacy-home="true"],
  #page-home [hidden] {
    display: none !important;
  }

  #page-home .hp-ai-order-button:disabled {
    cursor: not-allowed !important;
    opacity: .58;
    filter: grayscale(.15);
  }

  #page-home .hp-ai-meal-unavailable {
    border-color: #e6a8a3 !important;
    background: #fff8f7 !important;
  }

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
    window.addEventListener('pageshow', syncPageScroll);
  })();
</script>
<script id="hapycure-firebase-bootstrap">
  (() => {
    function bootFirebase() {
      try {
        if (window.firebase && firebase.initializeApp && window.NUTRITILIOUS_FIREBASE_CONFIG && !firebase.apps.length) {
          firebase.initializeApp(window.NUTRITILIOUS_FIREBASE_CONFIG);
        }
      } catch (error) {}
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootFirebase, { once: true });
    else bootFirebase();
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

      if (!phoneNumber || !continueLogin || !googleLogin || !loginMsg) return;

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
        if (code === 'auth/popup-blocked') return 'Your browser blocked the sign-in window. Redirecting to Google sign-in…';
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
          const result = await currentAuth.signInWithPopup(provider);
          completeGoogleSignIn(result && result.user);
        } catch (error) {
          signInCompleted = false;
          const code = error && error.code ? error.code : '';
          if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
            try {
              sessionStorage.setItem('nutritiliousGoogleRedirectPending', 'true');
              setMsg('Redirecting to Google sign-in…', true);
              await getAuth().signInWithRedirect(new firebase.auth.GoogleAuthProvider());
              return;
            } catch (redirectError) {
              setMsg(friendlyGoogleError(redirectError), false);
            }
          } else {
            setMsg(friendlyGoogleError(error), false);
          }
        } finally {
          if (document.getElementById('page-login')) setBusy(false);
        }
      }

      phoneNumber.addEventListener('input', function () {
        phoneNumber.value = phoneNumber.value.replace(/[^0-9]/g, '').slice(0, 10);
        setMsg('');
      });

      phoneNumber.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') event.preventDefault();
      });

      continueLogin.addEventListener('click', function () {
        const digits = phoneNumber.value.replace(/[^0-9]/g, '');
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
        currentAuth.getRedirectResult().then(function (result) {
          if (result && result.user) completeGoogleSignIn(result.user);
        }).catch(function (error) {
          if (sessionStorage.getItem('nutritiliousGoogleRedirectPending') === 'true') setMsg(friendlyGoogleError(error), false);
          sessionStorage.removeItem('nutritiliousGoogleRedirectPending');
        });
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

  let patched = html
    .replace(/<button\s+class=["']login-skip-btn["'][^>]*id=["']skipLogin["'][^>]*>[\s\S]*?<\/button>/i, '')
    .replace(loginPattern, FIREBASE_LOGIN_LOGIC + '\n\n    /* ============ Help & Support page logic')
    .replace(appPattern, AUTH_AWARE_APP_LOGIC + '\n\n    const root = ReactDOM.createRoot')
    .replace(
      /function logout\(\)\{clearStoredLocation\(\);/,
      "function logout(){try{if(window.firebase&&firebase.apps.length)firebase.auth().signOut().catch(function(){})}catch(error){}clearStoredLocation();"
    )
    .replace(/<title>[\s\S]*?<\/title>/i, '<title>Hapycure</title>')
    .replace(/content="Nutritilious[^\"]*"/i, 'content="Hapycure — personalized weekly meals from trusted local kitchens."');

  if (!patched.includes('id="hapycure-firebase-config"')) {
    patched = patched.replace('</head>', FIREBASE_CONFIG_SCRIPT + '\n' + APP_ASSETS + '\n' + HOME_RUNTIME_PATCH + '\n</head>');
  }
  return patched;
}

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.filter(name => name.startsWith('hapycure-shell-') && name !== HTML_CACHE).map(name => caches.delete(name)));
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
      if (!html.includes('id="root"')) {
        return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
      }

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
      return new Response('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hapycure</title></head><body style="font-family:Arial,sans-serif;padding:32px;text-align:center"><h1>You are offline</h1><p>Reconnect to the internet and refresh Hapycure.</p></body></html>', {
        status: 503,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }
  })());
});