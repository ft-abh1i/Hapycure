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
<link rel="stylesheet" href="./diet-onboarding.css" />
<script src="./diet-onboarding.js" defer></script>`;

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

const FIREBASE_LOGIN_LOGIC = `function initLoginPage(navigate) {

    const phoneNumber=document.getElementById("phoneNumber"),continueLogin=document.getElementById("continueLogin"),googleLogin=document.getElementById("googleLogin"),loginMsg=document.getElementById("loginMsg");
    const firebaseConfig=window.NUTRITILIOUS_FIREBASE_CONFIG;

    function setMsg(message,success=false){
      loginMsg.style.color=success?"#267e3e":"#d0342c";
      loginMsg.textContent=message||"";
    }

    function setBusy(isBusy){
      googleLogin.disabled=isBusy;
      continueLogin.disabled=isBusy;
      googleLogin.setAttribute("aria-busy",String(isBusy));
    }

    function getFirebaseAuth(){
      if(!window.firebase||!firebase.auth)throw new Error("Firebase Authentication failed to load.");
      if(!firebaseConfig)throw new Error("Firebase configuration is missing.");
      if(!firebase.apps.length)firebase.initializeApp(firebaseConfig);
      return firebase.auth();
    }

    function saveSignedInUser(user){
      const userData={
        uid:user.uid||"",
        name:user.displayName||"",
        email:user.email||"",
        phone:user.phoneNumber||"",
        photoURL:user.photoURL||"",
        isAnonymous:false,
        provider:"google"
      };
      localStorage.setItem("nutritiliousAuthType","google");
      localStorage.setItem("nutritiliousUser",JSON.stringify(userData));
      localStorage.removeItem("nutritiliousLoggedOut");

      const accountId=String(userData.uid||userData.email||"google").replace(/[^a-zA-Z0-9_-]/g,"_");
      if(userData.name)localStorage.setItem("nutritiliousProfile_"+accountId+"_Name",userData.name);
      if(userData.email)localStorage.setItem("nutritiliousProfile_"+accountId+"_Email",userData.email);
      if(userData.phone)localStorage.setItem("nutritiliousProfile_"+accountId+"_Phone",userData.phone);

      try{
        firebase.firestore().collection("users").doc(userData.uid).set({
          uid:userData.uid,
          name:userData.name,
          email:userData.email,
          phone:userData.phone,
          photoURL:userData.photoURL,
          provider:"google",
          lastLoginAt:firebase.firestore.FieldValue.serverTimestamp()
        },{merge:true}).catch(function(){});
      }catch(error){}
    }

    function friendlyGoogleError(error){
      const code=error&&error.code?error.code:"";
      if(code==="auth/popup-closed-by-user")return "Google sign-in was cancelled.";
      if(code==="auth/popup-blocked")return "Your browser blocked the Google sign-in window. Please allow pop-ups and try again.";
      if(code==="auth/unauthorized-domain")return "This website domain is not authorized in Firebase Authentication.";
      if(code==="auth/network-request-failed")return "Network error. Check your internet connection and try again.";
      if(code==="auth/account-exists-with-different-credential")return "An account already exists with this email using another sign-in method.";
      return (error&&error.message)||"Google sign-in failed. Please try again.";
    }

    async function completeGoogleSignIn(user){
      if(!user)throw new Error("Google did not return a user account.");
      saveSignedInUser(user);
      setMsg("Signed in successfully.",true);
      navigate("home");
    }

    async function startGoogleSignIn(){
      setBusy(true);
      setMsg("Opening Google sign-in...",true);
      try{
        const auth=getFirebaseAuth();
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        const provider=new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({prompt:"select_account"});
        const isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        if(isMobile){
          sessionStorage.setItem("nutritiliousGoogleRedirectPending","true");
          await auth.signInWithRedirect(provider);
          return;
        }

        try{
          const result=await auth.signInWithPopup(provider);
          await completeGoogleSignIn(result.user);
        }catch(error){
          if(error&&error.code==="auth/popup-blocked"){
            sessionStorage.setItem("nutritiliousGoogleRedirectPending","true");
            await auth.signInWithRedirect(provider);
            return;
          }
          throw error;
        }
      }catch(error){
        setMsg(friendlyGoogleError(error));
      }finally{
        if(document.getElementById("page-login"))setBusy(false);
      }
    }

    phoneNumber.addEventListener("input",()=>{
      phoneNumber.value=phoneNumber.value.replace(/\\D/g,"").slice(0,10);
      setMsg("");
    });
    phoneNumber.addEventListener("keydown",event=>{
      if(event.key==="Enter")event.preventDefault();
    });
    continueLogin.addEventListener("click",()=>{
      const digits=phoneNumber.value.replace(/\\D/g,"");
      if(digits.length!==10){
        setMsg("Enter a valid 10-digit mobile number.");
        phoneNumber.focus();
        return;
      }
      setMsg("Phone login is not available yet. Continue with Google.");
    });
    googleLogin.addEventListener("click",startGoogleSignIn);

    try{
      const auth=getFirebaseAuth();
      auth.getRedirectResult().then(result=>{
        if(result&&result.user){
          sessionStorage.removeItem("nutritiliousGoogleRedirectPending");
          completeGoogleSignIn(result.user).catch(error=>setMsg(friendlyGoogleError(error)));
        }
      }).catch(error=>{
        sessionStorage.removeItem("nutritiliousGoogleRedirectPending");
        setMsg(friendlyGoogleError(error));
      });
    }catch(error){
      setMsg(friendlyGoogleError(error));
    }

    }`;

function patchAppShell(html) {
  const loginPattern=/function initLoginPage\(navigate\)\s*\{[\s\S]*?\n\s*\}\n\n\s*\/\* ============ Help & Support page logic/;

  return html
    .replace(
      /<button\s+class=["']login-skip-btn["'][^>]*id=["']skipLogin["'][^>]*>[\s\S]*?<\/button>/i,
      ''
    )
    .replace(loginPattern,FIREBASE_LOGIN_LOGIC+'\n\n    /* ============ Help & Support page logic')
    .replace(
      /function logout\(\)\{clearStoredLocation\(\);/,
      'function logout(){try{if(window.firebase&&firebase.apps.length)firebase.auth().signOut().catch(function(){})}catch(error){}clearStoredLocation();'
    )
    .replace('</head>',FIREBASE_CONFIG_SCRIPT+'\n'+DIET_ONBOARDING_ASSETS+'\n'+HOME_RUNTIME_PATCH+'\n</head>');
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
