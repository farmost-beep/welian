// Auto-generated from app.js — do not edit manually

import { CLERK_PUBLISHABLE_KEY, CLOUD_URL, DISCOVERY_URL, I18N, authBtn, body, clerkInstance, clerkReady, clerkUserId, cliCallback, cliLoginInitialUserId, conversationHistory, currentLang, existingUserId, input, isAuthed, isCliLogin, isCloud, isLive, isPageReload, modeBadge } from './state.js';
import { navStatus, setClerkInstance, setClerkReady, setClerkUserId, setCliLoginInitialUserId, setConversationHistory, setExistingUserId, setIsAuthed, setIsCliLogin, setIsCloud, setIsLive, setSmsPhone, setUserInitiatedLogin, smsPhone, userInitiatedLogin, wechatToken } from './state.js';
import { addSystemMsg, clearChat, closeSidebar, loadChatEnhancements, loadSessionList, send, showWelcome } from './chat.js';
import { autoConnectAgent, removeBridge } from './agent-bridge.js';
import { checkOnboardingNeeded } from './proactive.js';
import { openMine } from './misc.js';

export async function getClerkToken() {
  try {
    if (window.Clerk) {
      // Try to get session — Clerk may need to refresh
      const session = window.Clerk.session || (window.Clerk.user?.sessions?.find(s => s.status === 'active'));
      if (session) {
        const token = await session.getToken();
        return token;
      }
    }
  } catch (e) {
    console.log('[getClerkToken] failed:', e.message);
  }
  return null;
}

export async function initClerk() {
  if (!CLERK_PUBLISHABLE_KEY) {
    console.log('Clerk not configured — running in demo mode');
    return;
  }

  try {
    // Wait for Clerk CDN script to load and auto-init
    // The CDN script with data-clerk-publishable-key auto-initializes window.Clerk
    let attempts = 0;
    while (typeof window.Clerk === 'undefined' && attempts < 50) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }

    if (typeof window.Clerk === 'undefined') {
      console.error('Clerk CDN script failed to load');
      return;
    }

    console.log('Clerk global available, waiting for load...');
    setClerkInstance(window.Clerk);

    // Load UI bundle BEFORE clerkInstance.load() — Clerk JS v6 requires
    // the UI constructor to be passed in load() options for mountSignIn to work
    await window.loadClerkUI(CLERK_PUBLISHABLE_KEY);
    console.log('UI bundle loaded, ClerkUICtor:', typeof window.__internal_ClerkUICtor);

    // Wait for Clerk to be loaded, passing the UI constructor
    if (!clerkInstance.loaded) {
      const loadOpts = {};
      if (window.__internal_ClerkUICtor) {
        loadOpts.ui = { ClerkUI: window.__internal_ClerkUICtor };
      }
      await clerkInstance.load(loadOpts);
    }
    console.log('Clerk loaded, status:', clerkInstance.status);

    setClerkReady(true);

    // Check if user initiated login in this browser session (survives page reload)
    const loginInitiated = sessionStorage.getItem('welian_login_initiated') === '1';
    if (loginInitiated) {
      console.log('Login was initiated this session — accepting session');
    }

    // Record existing session to ignore it (no auto-login) unless login was initiated
    setExistingUserId(clerkInstance.user ? clerkInstance.user.id : null);
    if (existingUserId && !loginInitiated) {
      console.log('Existing Clerk session found, will ignore (no auto-login):', existingUserId);
    }

    // Set CLI login mode
    if (cliCallback) {
      setIsCliLogin(true);
      setCliLoginInitialUserId(existingUserId);
      console.log('CLI login: initial user:', cliLoginInitialUserId);
    }

    // Handle WeChat OAuth return: set session from token
    if (wechatToken) {
      try {
        console.log('Setting WeChat session token…');
        await clerkInstance.setActive({ session: wechatToken });
        console.log('WeChat session set, reloading…');
      } catch(e) {
        console.error('WeChat session set failed:', e);
        addSystemMsg('微信登录失败：' + e.message);
      }
    }

    // Listen for auth state changes
    // Auto-login if there's an existing valid session
    clerkInstance.addListener((event) => {
      console.log('Clerk event:', Object.keys(event), 'user:', !!event.user, 'isAuthed:', isAuthed);
      if (event.user && !isAuthed) {
        if (isCliLogin && event.user.id === cliLoginInitialUserId) {
          console.log('CLI login: ignoring existing session for', event.user.id);
          return;
        }
        setIsCliLogin(false);
        setUserInitiatedLogin(false);
        sessionStorage.removeItem('welian_login_initiated');
        onAuthed(event.user);
      } else if (!event.user && isAuthed) {
        sessionStorage.removeItem('welian_login_initiated');
        onSignedOut();
      }
    });

    // CLI login flow: show sign-in form immediately
    if (cliCallback) {
      console.log('CLI login: showing form, initial user:', cliLoginInitialUserId);
      document.getElementById('clerk-auth').classList.add('show');
      const container = document.getElementById('clerk-container');

      if (cliLoginInitialUserId) {
        container.innerHTML = '<div style="text-align:center;padding:8px 0 12px;font-size:.8em;color:var(--dim)">当前账号: ' + cliLoginInitialUserId.slice(-8) + '<br>请用其他账号登录，或关闭此页保持当前账号</div>';
        const formDiv = document.createElement('div');
        container.appendChild(formDiv);
        clerkInstance.mountSignIn(formDiv);
      } else {
        mountClerkSignIn(container);
      }
      console.log('CLI login: sign-in form shown, waiting for new login');
    }
    // No auto-login: user must click "Sign in" manually
  } catch(e) {
    console.error('Clerk init failed:', e);
    setClerkReady(false);
  }
}

export function wechatLogin() {
  // Redirect to Worker's WeChat OAuth endpoint
  // Worker will redirect to WeChat, then back with session token
  const redirect = encodeURIComponent(location.origin + location.pathname);
  window.location.href = `${DISCOVERY_URL}/auth/wechat?redirect=${redirect}`;
}

export function showPhoneLogin() {
  const d = I18N[currentLang];
  // Replace auth card content with phone login form
  const card = document.querySelector('#clerk-auth .card');
  card.innerHTML = `
    <button class="close" onclick="toggleAuth()">×</button>
    <h2>${d.phone_title}</h2>
    <div id="phone-login-form" style="margin-top:16px">
      <input id="phone-input" type="tel" placeholder="${d.phone_ph}" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:.95em;margin-bottom:10px;box-sizing:border-box" autocomplete="off">
      <button id="phone-send-btn" onclick="sendSMS()" style="width:100%;padding:10px 16px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:.9em;cursor:pointer">${d.phone_send}</button>
      <div id="phone-msg" style="font-size:.8em;margin-top:8px;min-height:1em"></div>
    </div>
    <div id="phone-verify-form" style="display:none;margin-top:16px">
      <input id="phone-code-input" type="text" placeholder="${d.phone_code_ph}" maxlength="6" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:1.1em;letter-spacing:4px;margin-bottom:10px;box-sizing:border-box;text-align:center" autocomplete="off">
      <button id="phone-verify-btn" onclick="verifySMS()" style="width:100%;padding:10px 16px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:.9em;cursor:pointer;margin-bottom:8px">${d.phone_verify}</button>
      <button onclick="showPhoneLogin()" style="width:100%;padding:8px;background:none;border:none;color:var(--dim);font-size:.85em;cursor:pointer">${d.phone_back}</button>
    </div>
  `;
}

export async function sendSMS() {
  const d = I18N[currentLang];
  const phone = document.getElementById('phone-input').value.trim();
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    document.getElementById('phone-msg').textContent = d.phone_err_phone;
    document.getElementById('phone-msg').style.color = '#C65D5D';
    return;
  }
  setSmsPhone(phone);
  const btn = document.getElementById('phone-send-btn');
  btn.disabled = true;
  btn.textContent = d.phone_sending;

  try {
    const resp = await fetch(`${DISCOVERY_URL}/auth/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const data = await resp.json();
    if (data.ok) {
      document.getElementById('phone-msg').textContent = d.phone_sent;
      document.getElementById('phone-msg').style.color = '#4a9';
      // Show verify form
      document.getElementById('phone-login-form').style.display = 'none';
      document.getElementById('phone-verify-form').style.display = 'block';
      document.getElementById('phone-code-input').focus();
      // Countdown
      let count = 60;
      btn.textContent = count + d.phone_countdown;
      const timer = setInterval(() => {
        count--;
        if (count <= 0) {
          clearInterval(timer);
          btn.disabled = false;
          btn.textContent = d.phone_send;
        } else {
          btn.textContent = count + d.phone_countdown;
        }
      }, 1000);
    } else {
      btn.disabled = false;
      btn.textContent = d.phone_send;
      document.getElementById('phone-msg').textContent = d.phone_err + (data.error || '');
      document.getElementById('phone-msg').style.color = '#C65D5D';
    }
  } catch (e) {
    btn.disabled = false;
    btn.textContent = d.phone_send;
    document.getElementById('phone-msg').textContent = d.phone_err + e.message;
    document.getElementById('phone-msg').style.color = '#C65D5D';
  }
}

export async function verifySMS() {
  const d = I18N[currentLang];
  const code = document.getElementById('phone-code-input').value.trim();
  if (!code || code.length !== 6) {
    return;
  }
  const btn = document.getElementById('phone-verify-btn');
  btn.disabled = true;
  btn.textContent = d.phone_verifying;

  try {
    const resp = await fetch(`${DISCOVERY_URL}/auth/sms/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: smsPhone, code }),
    });
    const data = await resp.json();
    if (data.ok && data.jwt) {
      // Set Clerk session
      if (clerkInstance) {
        await clerkInstance.setActive({ session: data.jwt });
      }
      // Close modal — onAuthed will fire from Clerk listener
      document.getElementById('clerk-auth').classList.remove('show');
    } else {
      btn.disabled = false;
      btn.textContent = d.phone_verify;
      const msg = document.createElement('div');
      msg.style.cssText = 'font-size:.8em;color:#C65D5D;margin-top:8px';
      msg.textContent = data.error || d.phone_err_code;
      document.getElementById('phone-verify-form').appendChild(msg);
    }
  } catch (e) {
    btn.disabled = false;
    btn.textContent = d.phone_verify;
  }
}

export function closeAuth() {
  document.getElementById('clerk-auth').classList.remove('show');
  setUserInitiatedLogin(false);
  sessionStorage.removeItem('welian_login_initiated');
}

export function toggleAuth(mode) {
  if (isAuthed) {
    // Sign out
    if (clerkInstance) clerkInstance.signOut();
    onSignedOut();
    return;
  }
  // User manually initiated login — accept the next auth event
  setUserInitiatedLogin(true);
  sessionStorage.setItem('welian_login_initiated', '1');
  // Show auth modal
  document.getElementById('clerk-auth').classList.add('show');

  const mountFn = mode === 'signup' ? mountClerkSignUp : mountClerkSignIn;

  // Re-mount Clerk (clear previous mount first)
  const container = document.getElementById('clerk-container');
  container.innerHTML = '';
  if (!clerkReady || !clerkInstance) {
    container.innerHTML = '<p style="text-align:center;color:var(--dim);padding:12px;font-size:.8em">加载中…</p>';
    const wait = setInterval(() => {
      if (clerkReady && clerkInstance) {
        clearInterval(wait);
        mountFn(container);
      }
    }, 500);
    setTimeout(() => clearInterval(wait), 10000);
    return;
  }
  mountFn(container);
}

export function mountClerkSignIn(container) {
  try {
    container.innerHTML = '';
    const freshDiv = document.createElement('div');
    container.appendChild(freshDiv);
    clerkInstance.mountSignIn(freshDiv, {
      initialValues: { identifier: '' },
      appearance: {
        elements: {
          socialButtonsBlockButton: { order: '10' },
          socialButtonsBlockButton__google: { order: '11' },
          socialButtonsBlockButton__apple: { order: '12' },
          socialButtonsBlockButton__wechat: { order: '13' },
          formFieldIdentifier: { order: '1' },
          formButtonPrimary: { order: '2' },
        },
      },
    });
    console.log('mountSignIn called with email-first layout');
  } catch(e) {
    console.error('mountSignIn failed:', e);
    container.innerHTML = '<p style="color:#C65D5D;text-align:center;padding:20px">Failed to load sign-in form.<br><small>' + e.message + '</small></p>';
  }
}

export function mountClerkSignUp(container) {
  container = container || document.getElementById('clerk-container');
  try {
    container.innerHTML = '';
    const freshDiv = document.createElement('div');
    container.appendChild(freshDiv);
    clerkInstance.mountSignUp(freshDiv, {
      appearance: {
        elements: {
          socialButtonsBlockButton: { order: '10' },
          socialButtonsBlockButton__google: { order: '11' },
          socialButtonsBlockButton__apple: { order: '12' },
          socialButtonsBlockButton__wechat: { order: '13' },
          formFieldEmail: { order: '1' },
          formButtonPrimary: { order: '5' },
        },
      },
    });
    console.log('mountSignUp called with email-first layout');
  } catch(e) {
    console.error('mountSignUp failed:', e);
    container.innerHTML = '<p style="color:#C65D5D;text-align:center;padding:20px">Failed to load sign-up form.<br><small>' + e.message + '</small></p>';
  }
}

export function onAuthed(user) {
  console.log('[onAuthed] called, isPageReload=', isPageReload, 'savedTab=', localStorage.getItem('welian_mine_tab'));
  setIsAuthed(true);
  setClerkUserId(user.id || null);

  // New user celebration: show if account was created within last 30s
  const createdAt = user.createdAt ? new Date(user.createdAt) : null;
  if (createdAt && (Date.now() - createdAt.getTime()) < 30000) {
    showCelebration();
  }

  // Build display name: prefer firstName, then username, then email, then phone, then user_id
  const email = user.primaryEmailAddress?.emailAddress || '';
  const phone = user.primaryPhoneNumber?.phoneNumber || '';
  const displayName = user.firstName || user.username || email || phone || clerkUserId.slice(-8);
  authBtn.textContent = displayName;
  // Tooltip with full identity info
  const tipParts = [`User ID: ${clerkUserId}`];
  if (email) tipParts.push(`Email: ${email}`);
  if (phone) tipParts.push(`Phone: ${phone}`);
  if (user.firstName) tipParts.push(`Name: ${user.firstName}`);
  authBtn.title = tipParts.join('\n');

  navStatus.style.display = 'inline-flex';
  document.getElementById('billingBtn').style.display = 'inline-block';
  // Load session list (sidebar shows on hover, no need to force open)
  loadSessionList();
  // Close auth modal if open
  document.getElementById('clerk-auth').classList.remove('show');

  // CLI login flow: redirect user_id back to CLI callback
  if (cliCallback && clerkUserId) {
    window.location.href = cliCallback + '?user_id=' + encodeURIComponent(clerkUserId);
    return;
  }

  // Auto-connect to local agent (no token needed)
  autoConnectAgent();

  // Process invite code from URL (?ref=XXXXXX)
  const refCode = new URLSearchParams(window.location.search).get('ref');
  if (refCode) {
    console.log('[onAuthed] Processing invite code:', refCode);
    // Call invite/redeem after a short delay to ensure user is fully registered
    setTimeout(async () => {
      try {
        const token = await getClerkToken();
        const resp = await fetch(`${CLOUD_URL}/ai/invite/redeem`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ code: refCode.toUpperCase() }),
        });
        const data = await resp.json();
        if (data.ok) {
          console.log('[onAuthed] Invite redeemed successfully:', data.reward, 'credits');
          // Clean URL
          const url = new URL(window.location);
          url.searchParams.delete('ref');
          window.history.replaceState({}, '', url);
        } else if (data.error === 'already_invited') {
          console.log('[onAuthed] Already invited by someone');
        } else {
          console.log('[onAuthed] Invite redeem result:', data.error);
        }
      } catch (e) {
        console.error('[onAuthed] Invite redeem error:', e);
      }
    }, 2000);
  }

  // Check if onboarding needed (new user with no contacts)
  checkOnboardingNeeded();

  // Load chat-page enhancements (dashboard, quick actions, sidebar, badges, reminder)
  loadChatEnhancements();

  // Paddle checkout success: auto-open billing tab
  if (window._pendingBillingOpen) {
    window._pendingBillingOpen = false;
    localStorage.setItem('welian_mine_tab', 'settings');
    sessionStorage.setItem('welian_mine_open', '1');
    setTimeout(() => openMine(), 800);
  } else if (sessionStorage.getItem('welian_mine_open') === '1') {
    // Auto-restore mine panel only if it was open before refresh (same tab session)
    const savedTab = localStorage.getItem('welian_mine_tab');
    if (savedTab) {
      setTimeout(() => openMine(), 300);
    }
  }
}

export function onSignedOut() {
  setIsAuthed(false);
  setIsLive(false);
  setIsCloud(false);
  setConversationHistory([]);
  removeBridge();
  authBtn.textContent = I18N[currentLang].sign_in;
  navStatus.style.display = 'none';
  document.getElementById('billingBtn').style.display = 'none';
  closeSidebar(); // H4: close sidebar on logout
  if (modeBadge) { modeBadge.textContent = ''; modeBadge.className = 'mode-badge'; }
  clearChat();
  showWelcome();
}

// ── Registration celebration animation ──
function showCelebration() {
  const overlay = document.getElementById('celebrationOverlay');
  if (!overlay) return;
  overlay.classList.add('show');
  // Auto-dismiss after 2.5s
  setTimeout(() => {
    overlay.classList.remove('show');
  }, 2500);
  // Click to dismiss early
  overlay.addEventListener('click', () => overlay.classList.remove('show'), { once: true });
}
