/**
 * Huzz web client — Discover, Chats, Clubs, Live (GitHub Pages / docs/app.html)
 */

function getMatchId(uidA, uidB) {
  const [a, b] = [String(uidA), String(uidB)].sort();
  return `${a}_${b}`;
}

function tsMillis(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v === 'number') return v;
  return 0;
}

function photoUrl(user) {
  if (!user) return '';
  const images = user.images;
  if (Array.isArray(images)) {
    const hit = images.find((x) => typeof x === 'string' && String(x).trim());
    if (hit) return String(hit).trim();
  }
  if (user.photoURL && String(user.photoURL).trim()) return String(user.photoURL).trim();
  if (user.photoUrl && String(user.photoUrl).trim()) return String(user.photoUrl).trim();
  const photos = user.photos;
  if (Array.isArray(photos) && photos.length) {
    const p = photos[0];
    if (typeof p === 'string' && p.trim()) return p.trim();
    if (p?.url) return String(p.url);
  }
  return '';
}

function normGender(g) {
  return String(g || '').trim().toLowerCase();
}

function getPrefs(user) {
  const raw = user?.genderPreferences || user?.preferences?.gender || [];
  return Array.isArray(raw) ? raw.map(String) : [];
}

function isAgeVerified(profile) {
  return profile?.ageChecked18Plus === true;
}

const AGE_VERIFY_HOST =
  'https://us-central1-huzz-10264.cloudfunctions.net/ageVerifyPage';

const GAMES_CLIENT_URL = 'https://huzz-games.pages.dev';

function filterCandidate(me, candidate, swiped, blocked) {
  const uid = String(candidate?.id || candidate?.uid || '');
  const myUid = String(me?.id || me?.uid || '');
  if (!uid || uid === myUid) return false;
  if (candidate?.isDisabled) return false;
  if (swiped.has(uid)) return false;
  if (blocked.has(uid)) return false;

  const myGender = normGender(me?.gender);
  const theirGender = normGender(candidate?.gender);
  if (!theirGender) return false;

  const myReligion = String(me?.religion || '').trim();
  const theirReligion = String(candidate?.religion || '').trim();
  const iAmMuslim = myReligion === 'Muslim' || myReligion === 'Islam';
  const theyAreMuslim = theirReligion === 'Muslim' || theirReligion === 'Islam';
  const myPrefs = getPrefs(me);
  const theirPrefs = getPrefs(candidate);

  if (iAmMuslim) {
    if (myGender === 'male' && theirGender !== 'female') return false;
    if (myGender === 'female' && theirGender !== 'male') return false;
    if (theyAreMuslim && theirPrefs.length) {
      const wantsMe =
        (theirPrefs.includes('boys') && myGender === 'male')
        || (theirPrefs.includes('girls') && myGender === 'female');
      if (!wantsMe) return false;
    }
  } else if (myPrefs.length) {
    const ok =
      (myPrefs.includes('boys') && theirGender === 'male')
      || (myPrefs.includes('girls') && theirGender === 'female');
    if (!ok) return false;
    if (theirPrefs.length) {
      const wantsMe =
        (theirPrefs.includes('boys') && myGender === 'male')
        || (theirPrefs.includes('girls') && myGender === 'female');
      if (!wantsMe) return false;
    }
  }

  return true;
}

export function createWebApp(ctx) {
  const {
    auth, db, functions,
    getAuth, signInWithEmailAndPassword, signInWithCustomToken, signOut,
    getFirestore, collection, query, where, orderBy, limit, getDocs, getDoc, doc,
    setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, runTransaction,
    httpsCallable, onAuthStateChanged,
    main, bottomNav, profileBtn,
  } = ctx;

  let signupSessionId = '';
  let signupStep = 'email';
  let currentScreen = 'discover';
  let chatMatchId = null;
  let clubRoomId = null;
  let discoverIndex = 0;
  let discoverCandidates = [];
  let meProfile = null;
  let unsubscribers = [];
  let screenGen = 0;
  let liveWaitingInPool = false;

  function bumpScreen() {
    screenGen += 1;
    return screenGen;
  }

  function isStale(gen) {
    return gen !== screenGen;
  }

  function paint(html, gen) {
    if (isStale(gen)) return false;
    main.innerHTML = html;
    return true;
  }

  function liveShellHtml(body) {
    return `
      <div class="shell-card live-session" data-live-root="1">
        <div class="live-badge">⚡ Live Random</div>
        ${body}
      </div>`;
  }

  function clearListeners() {
    if (liveWaitingInPool) {
      liveWaitingInPool = false;
      httpsCallable(functions, 'webLeaveLivePool')({}).catch(() => {});
    }
    unsubscribers.forEach((fn) => { try { fn(); } catch {} });
    unsubscribers = [];
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function showErr(msg) {
    main.querySelector('.err')?.remove();
    main.insertAdjacentHTML('beforeend', `<div class="err">${esc(msg)}</div>`);
  }

  async function loadMe(uid) {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  }

  // ─── Auth ───────────────────────────────────────────────────────────────

  function renderWelcome() {
    clearListeners();
    main.classList.add('no-nav');
    bottomNav.classList.remove('on');
    profileBtn.classList.add('hidden');
    main.innerHTML = `
      <div class="shell-card">
        <h2>Welcome back</h2>
        <p class="sub">Same account on web and Android.</p>
        <button type="button" class="btn btn-primary" id="goSignup">Sign up with email</button>
        <button type="button" class="btn btn-outline" id="goLogin">Log in</button>
      </div>`;
    document.getElementById('goSignup').onclick = () => renderSignup();
    document.getElementById('goLogin').onclick = () => renderLogin();
  }

  function renderLogin() {
    clearListeners();
    main.classList.add('no-nav');
    bottomNav.classList.remove('on');
    profileBtn.classList.add('hidden');
    main.innerHTML = `
      <div class="shell-card">
        <h2>Log in</h2>
        <p class="sub">Same account as the Android app.</p>
        <label for="loginEmail">Email</label>
        <input id="loginEmail" type="email" autocomplete="email" inputmode="email" />
        <label for="loginPass">Password</label>
        <input id="loginPass" type="password" autocomplete="current-password" />
        <button type="button" class="btn btn-primary" id="loginSubmit">Log in</button>
        <button type="button" class="btn btn-outline" id="loginToSignup">Create account</button>
      </div>`;
    document.getElementById('loginToSignup').onclick = () => renderSignup();
    document.getElementById('loginSubmit').onclick = async () => {
      const btn = document.getElementById('loginSubmit');
      btn.disabled = true;
      main.querySelector('.err')?.remove();
      try {
        await signInWithEmailAndPassword(
          auth,
          document.getElementById('loginEmail').value.trim(),
          document.getElementById('loginPass').value
        );
      } catch (e) {
        showErr(e.message || 'Could not log in.');
        btn.disabled = false;
      }
    };
  }

  function renderSignup() {
    signupStep = 'email';
    signupSessionId = '';
    clearListeners();
    main.classList.add('no-nav');
    bottomNav.classList.remove('on');
    profileBtn.classList.add('hidden');
    drawSignupStep();
  }

  function drawSignupStep() {
    if (signupStep === 'email') {
      main.innerHTML = `
        <div class="shell-card">
          <h2>Sign up</h2>
          <p class="step-hint">Step 1 of 4: verify your email</p>
          <label for="suEmail">Email</label>
          <input id="suEmail" type="email" autocomplete="email" />
          <button type="button" class="btn btn-primary" id="suSendOtp">Send code</button>
          <button type="button" class="btn btn-outline" id="suToLogin">Already have an account</button>
        </div>`;
      document.getElementById('suToLogin').onclick = () => renderLogin();
      document.getElementById('suSendOtp').onclick = async () => {
        const btn = document.getElementById('suSendOtp');
        btn.disabled = true;
        main.querySelector('.err')?.remove();
        try {
          await httpsCallable(functions, 'sendSignupEmailOtp')({
            email: document.getElementById('suEmail').value.trim(),
          });
          main.dataset.email = document.getElementById('suEmail').value.trim();
          signupStep = 'otp';
          drawSignupStep();
        } catch (e) {
          showErr(e.message || 'Could not send code.');
          btn.disabled = false;
        }
      };
    } else if (signupStep === 'otp') {
      main.innerHTML = `
        <div class="shell-card">
          <h2>Enter code</h2>
          <p class="step-hint">Step 2 of 4: check your inbox</p>
          <label for="suOtp">6-digit code</label>
          <input id="suOtp" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" />
          <button type="button" class="btn btn-primary" id="suVerifyOtp">Verify</button>
        </div>`;
      document.getElementById('suVerifyOtp').onclick = async () => {
        const btn = document.getElementById('suVerifyOtp');
        btn.disabled = true;
        main.querySelector('.err')?.remove();
        try {
          const res = await httpsCallable(functions, 'verifySignupEmailOtp')({
            email: main.dataset.email || '',
            code: document.getElementById('suOtp').value.trim(),
          });
          signupSessionId = res.data.sessionId;
          if (!signupSessionId) throw new Error('Invalid response');
          signupStep = 'profile';
          drawSignupStep();
        } catch (e) {
          showErr(e.message || 'Invalid code.');
          btn.disabled = false;
        }
      };
    } else if (signupStep === 'profile') {
      main.innerHTML = `
        <div class="shell-card">
          <h2>Your profile</h2>
          <p class="step-hint">Step 3 of 4: pick a username</p>
          <label for="suName">Name</label>
          <input id="suName" type="text" autocomplete="name" />
          <label for="suUser">Username</label>
          <input id="suUser" type="text" autocomplete="username" autocapitalize="none" />
          <button type="button" class="btn btn-primary" id="suNext">Continue</button>
        </div>`;
      document.getElementById('suNext').onclick = () => {
        const name = document.getElementById('suName').value.trim();
        const username = document.getElementById('suUser').value.trim();
        if (name.length < 2) return showErr('Name is too short.');
        if (username.length < 3) return showErr('Username is too short.');
        main.dataset.name = name;
        main.dataset.username = username;
        signupStep = 'password';
        drawSignupStep();
      };
    } else if (signupStep === 'password') {
      main.innerHTML = `
        <div class="shell-card">
          <h2>Create password</h2>
          <p class="step-hint">Step 4 of 4</p>
          <label for="suPass">Password</label>
          <input id="suPass" type="password" autocomplete="new-password" />
          <button type="button" class="btn btn-primary" id="suFinish">Create account</button>
        </div>`;
      document.getElementById('suFinish').onclick = async () => {
        const btn = document.getElementById('suFinish');
        btn.disabled = true;
        main.querySelector('.err')?.remove();
        try {
          const res = await httpsCallable(functions, 'finalizeSignupWithSession')({
            sessionId: signupSessionId,
            password: document.getElementById('suPass').value,
            name: main.dataset.name,
            username: main.dataset.username,
          });
          if (!res.data.customToken) throw new Error('Signup failed.');
          await signInWithCustomToken(auth, res.data.customToken);
        } catch (e) {
          showErr(e.message || 'Could not create account.');
          btn.disabled = false;
        }
      };
    }
  }

  // ─── Age verification ───────────────────────────────────────────────────

  function ageVerifyBannerHtml() {
    return `
      <div class="shell-card age-banner">
        <strong>Verify you're 18+</strong>
        <p class="sub">Quick face scan unlocks likes, matches, chat, live, and clubs.</p>
        <button type="button" class="btn btn-primary" id="goAgeVerify">Verify now</button>
      </div>`;
  }

  function renderAgeVerify(user, gen) {
    clearListeners();
    chatMatchId = null;
    clubRoomId = null;
    const url = `${AGE_VERIFY_HOST}?uid=${encodeURIComponent(user.uid)}&t=${Date.now()}`;
    if (!paint(`
      <div class="shell-card age-verify-card">
        <h2>18+ face scan</h2>
        <p class="sub">Allow camera access when prompted. The scan runs on your device. Huzz only receives a signed pass/fail from ZoiVera.</p>
        <iframe id="ageFrame" class="age-frame" src="${url}" allow="camera *; microphone" title="Age verification"></iframe>
        <button type="button" class="btn btn-outline" id="ageBack">Back to Discover</button>
        <div id="ageErr" class="err hidden"></div>
      </div>`, gen)) return;

    const onMsg = async (ev) => {
      try {
        const raw = typeof ev.data === 'string' ? ev.data : '';
        if (!raw.startsWith('{')) return;
        const msg = JSON.parse(raw);
        if (msg.type === 'success' && msg.attestationJwt) {
          await httpsCallable(functions, 'finalizeZoiVeraAgeCheck')({
            attestationJwt: msg.attestationJwt,
          });
          meProfile = await loadMe(user.uid);
          showAppScreen('discover', user);
        } else if (msg.type === 'failed' && msg.reason) {
          const el = document.getElementById('ageErr');
          if (el) {
            el.textContent = String(msg.reason);
            el.classList.remove('hidden');
          }
        } else if (msg.type === 'error' && msg.message) {
          const el = document.getElementById('ageErr');
          if (el) {
            el.textContent = String(msg.message);
            el.classList.remove('hidden');
          }
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('message', onMsg);
    unsubscribers.push(() => window.removeEventListener('message', onMsg));
    document.getElementById('ageBack').onclick = () => showAppScreen('discover', user);
  }

  // ─── Discover ─────────────────────────────────────────────────────────

  async function loadDiscoverCandidates(uid) {
    const res = await httpsCallable(functions, 'webDiscoverFeed')({});
    const data = res.data || {};
    meProfile = data.me || null;
    const swiped = new Set(data.swipedIds || []);
    const blocked = new Set(data.blockedIds || []);
    return (data.users || []).filter((u) => filterCandidate(meProfile, u, swiped, blocked));
  }

  async function likeUser(from, to) {
    const res = await httpsCallable(functions, 'recordLike')({ toUid: to, source: 'web_discovery' });
    const data = res.data || {};
    return {
      matched: !!data.matched,
      matchId: data.matchId || null,
      error: data.error || null,
    };
  }

  async function passUser(from, to) {
    await setDoc(doc(db, 'users', from, 'likesSent', to), {
      toUid: to, action: 'pass', createdAt: serverTimestamp(),
    }, { merge: true });
  }

  function renderDiscoverCard(gen) {
    if (isStale(gen)) return;
    const c = discoverCandidates[discoverIndex];
    if (!c) {
      paint(`
        ${!isAgeVerified(meProfile) ? ageVerifyBannerHtml() : ''}
        <div class="shell-card">
          <h2>Home</h2>
          <div class="empty">No one new right now. Check back later or update your profile.</div>
          <button type="button" class="btn btn-outline" id="discRefresh">Refresh</button>
        </div>`, gen);
      document.getElementById('goAgeVerify')?.addEventListener('click', () => renderAgeVerify(auth.currentUser, gen));
      document.getElementById('discRefresh')?.addEventListener('click', () => showAppScreen('discover', auth.currentUser));
      return;
    }
    const img = photoUrl(c);
    const name = esc(c.name || 'Someone');
    const age = c.age ? `, ${esc(String(c.age))}` : '';
    const bio = esc(c.bio || '');
    const city = esc(c.city || c.location?.city || '');
    if (!paint(`
      ${!isAgeVerified(meProfile) ? ageVerifyBannerHtml() : ''}
      <div class="discover-wrap">
        <div class="discover-card">
          ${img
            ? `<img class="discover-photo" src="${esc(img)}" alt="" loading="lazy" />`
            : `<div class="discover-photo discover-photo-empty">No photo</div>`}
          <div class="discover-meta">
            <strong>${name}${age}</strong>
            ${city ? `<span class="discover-loc">${city}</span>` : ''}
            ${bio ? `<p class="discover-bio">${bio}</p>` : ''}
          </div>
        </div>
        <div class="discover-actions">
          <button type="button" class="disc-btn disc-pass" id="discPass" aria-label="Pass">✕</button>
          <button type="button" class="disc-btn disc-like" id="discLike" aria-label="Like">♥</button>
        </div>
        <p class="discover-count">${discoverIndex + 1} / ${discoverCandidates.length}</p>
      </div>
      <div id="discToast" class="ok hidden"></div>`, gen)) return;

    document.getElementById('goAgeVerify')?.addEventListener('click', () => renderAgeVerify(auth.currentUser, gen));
    document.getElementById('discPass').onclick = async () => {
      if (!isAgeVerified(meProfile)) {
        renderAgeVerify(auth.currentUser, gen);
        return;
      }
      await passUser(auth.currentUser.uid, c.id);
      discoverIndex += 1;
      renderDiscoverCard(gen);
    };
    document.getElementById('discLike').onclick = async () => {
      if (!isAgeVerified(meProfile)) {
        renderAgeVerify(auth.currentUser, gen);
        return;
      }
      const res = await likeUser(auth.currentUser.uid, c.id);
      const toast = document.getElementById('discToast');
      if (res.matched && toast) {
        toast.textContent = "It's a match! Open Chats to message.";
        toast.classList.remove('hidden');
      }
      discoverIndex += 1;
      renderDiscoverCard(gen);
    };
  }

  async function renderDiscover(user, gen) {
    clearListeners();
    chatMatchId = null;
    clubRoomId = null;
    paint(`<div class="shell-card"><h2>Home</h2><p class="sub">Loading people near you…</p></div>`, gen);
    try {
      discoverCandidates = await loadDiscoverCandidates(user.uid);
      if (isStale(gen)) return;
      discoverIndex = 0;
      renderDiscoverCard(gen);
    } catch (e) {
      paint(`<div class="shell-card"><h2>Home</h2><div class="empty">${esc(e.message)}</div></div>`, gen);
    }
  }

  // ─── Chats ────────────────────────────────────────────────────────────

  async function loadUserMap(uids) {
    const map = {};
    await Promise.all(uids.map(async (uid) => {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) map[uid] = { id: snap.id, ...snap.data() };
    }));
    return map;
  }

  function requireAgeForScreen(user, gen) {
    if (isAgeVerified(meProfile)) return true;
    renderAgeVerify(user, gen);
    return false;
  }

  async function renderChatThread(user, matchId, gen) {
    if (!isAgeVerified(meProfile)) {
      renderAgeVerify(user, gen);
      return;
    }
    clearListeners();
    chatMatchId = matchId;
    const matchSnap = await getDoc(doc(db, 'matches', matchId));
    if (!matchSnap.exists()) {
      main.innerHTML = `<div class="shell-card"><div class="empty">Chat not found.</div></div>`;
      return;
    }
    const m = matchSnap.data();
    const otherUid = (m.uids || []).find((u) => u !== user.uid) || '';
    const users = await loadUserMap([otherUid]);
    const other = users[otherUid] || {};
    const title = esc(other.name || 'Chat');

    main.innerHTML = `
      <div class="thread-head">
        <button type="button" class="thread-back" id="threadBack">← Chats</button>
        <strong>${title}</strong>
      </div>
      <div class="thread-msgs" id="threadMsgs"></div>
      <form class="thread-compose" id="threadForm">
        <input id="threadInput" type="text" maxlength="2000" placeholder="Message…" autocomplete="off" />
        <button type="submit">Send</button>
      </form>`;

    document.getElementById('threadBack').onclick = () => {
      chatMatchId = null;
      showAppScreen('chats', user);
    };

    const msgsEl = document.getElementById('threadMsgs');
    const qRef = query(
      collection(db, 'matches', matchId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );
    unsubscribers.push(onSnapshot(qRef, (snap) => {
      if (snap.empty) {
        msgsEl.innerHTML = `<div class="empty">Say salam. Start the conversation.</div>`;
        return;
      }
      msgsEl.innerHTML = snap.docs.map((d) => {
        const msg = d.data();
        const mine = msg.fromUid === user.uid;
        return `<div class="bubble ${mine ? 'mine' : 'theirs'}">${esc(msg.text || '')}</div>`;
      }).join('');
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }, (err) => {
      msgsEl.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    }));

    document.getElementById('threadForm').onsubmit = async (ev) => {
      ev.preventDefault();
      const input = document.getElementById('threadInput');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      try {
        await httpsCallable(functions, 'webSendMatchMessage')({ matchId, text });
      } catch (e) {
        input.value = text;
        showErr(e.message || 'Could not send message.');
      }
    };
  }

  async function renderChats(user, gen) {
    clearListeners();
    clubRoomId = null;
    paint(`<div class="shell-card"><h2>Chats</h2><p class="sub">Loading…</p></div>`, gen);
    try {
      const res = await httpsCallable(functions, 'webListMatches')({});
      if (isStale(gen)) return;
      const { matches = [], users = {} } = res.data || {};

      if (!matches.length) {
        paint(`<div class="shell-card"><h2>Chats</h2><div class="empty">No matches yet. Like people in Home.</div></div>`, gen);
        return;
      }

      const rows = matches.map((m) => {
        const otherUid = (m.uids || []).find((u) => u !== user.uid) || '';
        const other = users[otherUid] || {};
        const preview = esc(m.lastMessageText || 'New match. Tap to chat');
        return `<button type="button" class="list-item list-btn" data-mid="${esc(m.id)}">
          <strong>${esc(other.name || 'Match')}</strong>
          <span>${preview}</span>
        </button>`;
      }).join('');

      if (!paint(`<div class="shell-card"><h2>Chats</h2>${rows}</div>`, gen)) return;
      main.querySelectorAll('[data-mid]').forEach((btn) => {
        btn.onclick = () => {
          chatMatchId = btn.dataset.mid;
          renderChatThread(user, chatMatchId, bumpScreen());
        };
      });
    } catch (e) {
      paint(`<div class="shell-card"><h2>Chats</h2><div class="empty">${esc(e.message)}</div></div>`, gen);
    }
  }

  // ─── Clubs ────────────────────────────────────────────────────────────

  async function joinClub(uid, clubId) {
    try {
      const res = await httpsCallable(functions, 'webJoinClub')({ clubId: String(clubId) });
      if (!res.data?.joined) throw new Error('Could not join club.');
    } catch (e) {
      throw new Error(e.message || 'Could not join club.');
    }
  }

  function renderClubMessages(msgsEl, messages, uid) {
    if (!messages?.length) {
      msgsEl.innerHTML = `<div class="empty">No messages yet. Say hello.</div>`;
      return;
    }
    msgsEl.innerHTML = messages.map((msg) => {
      const mine = msg.fromUid === uid;
      return `<div class="bubble ${mine ? 'mine' : 'theirs'}">${esc(msg.text || '')}</div>`;
    }).join('');
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  async function renderClubRoom(user, clubId, gen) {
    clearListeners();
    clubRoomId = clubId;
    paint(`<div class="shell-card"><h2>Club</h2><p class="sub">Loading…</p></div>`, gen);
    try {
      const res = await httpsCallable(functions, 'webGetClubRoom')({ clubId: String(clubId) });
      if (isStale(gen)) return;
      const { club, isMember, messages = [] } = res.data || {};
      if (!club) {
        main.innerHTML = `<div class="shell-card"><div class="empty">Club not found.</div></div>`;
        return;
      }
      if (!isMember) {
        main.innerHTML = `<div class="shell-card"><div class="empty">Join this club to view messages.</div></div>`;
        return;
      }

      main.innerHTML = `
        <div class="thread-head">
          <button type="button" class="thread-back" id="clubBack">← Clubs</button>
          <strong>${esc(club.name || 'Club')}</strong>
        </div>
        <p class="club-desc">${esc(club.description || '')}</p>
        <div class="thread-msgs" id="clubMsgs"></div>
        <form class="thread-compose" id="clubForm">
          <input id="clubInput" type="text" maxlength="2000" placeholder="Message the club…" autocomplete="off" />
          <button type="submit">Send</button>
        </form>`;

      document.getElementById('clubBack').onclick = () => {
        clubRoomId = null;
        showAppScreen('clubs', user);
      };

      const msgsEl = document.getElementById('clubMsgs');
      renderClubMessages(msgsEl, messages, user.uid);

      stopClubPoll();
      clubPollTimer = setInterval(async () => {
        if (isStale(gen)) {
          stopClubPoll();
          return;
        }
        try {
          const poll = await httpsCallable(functions, 'webGetClubRoom')({ clubId: String(clubId) });
          if (isStale(gen)) return;
          renderClubMessages(msgsEl, poll.data?.messages || [], user.uid);
        } catch {
          /* keep last messages on poll failure */
        }
      }, 3000);
      unsubscribers.push(() => stopClubPoll());

      document.getElementById('clubForm').onsubmit = async (ev) => {
        ev.preventDefault();
        const input = document.getElementById('clubInput');
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        try {
          await httpsCallable(functions, 'webSendClubMessage')({
            clubId: String(clubId),
            text,
          });
          const poll = await httpsCallable(functions, 'webGetClubRoom')({ clubId: String(clubId) });
          renderClubMessages(msgsEl, poll.data?.messages || [], user.uid);
        } catch (e) {
          showErr(e.message || 'Could not send message.');
        }
      };
    } catch (e) {
      main.innerHTML = `<div class="shell-card"><div class="empty">${esc(e.message || 'Could not open club.')}</div></div>`;
    }
  }

  async function renderClubs(user, gen) {
    clearListeners();
    chatMatchId = null;
    paint(`<div class="shell-card"><h2>Clubs</h2><p class="sub">Loading…</p></div>`, gen);
    try {
      const res = await httpsCallable(functions, 'webListClubs')({});
      if (isStale(gen)) return;
      const { clubs = [], joinedIds = [] } = res.data || {};
      const joined = new Set(joinedIds);

      if (!clubs.length) {
        paint(`<div class="shell-card"><h2>Clubs</h2><div class="empty">No public clubs yet.</div></div>`, gen);
        return;
      }

      const rows = clubs.map((c) => {
        const isMember = joined.has(c.id);
        return `<div class="list-item club-row">
          <div>
            <strong>${esc(c.name || 'Club')}</strong>
            <span>${esc(c.description || 'Public club')} · ${Number(c.memberCount || 0)} members</span>
          </div>
          ${isMember
            ? `<button type="button" class="mini-btn" data-open="${esc(c.id)}">Open</button>`
            : `<button type="button" class="mini-btn mini-primary" data-join="${esc(c.id)}">Join</button>`}
        </div>`;
      }).join('');

      if (!paint(`<div class="shell-card"><h2>Clubs</h2><p class="sub">Public clubs. Join and chat on the web.</p>${rows}</div>`, gen)) return;

      main.querySelectorAll('[data-join]').forEach((btn) => {
        btn.onclick = async () => {
          btn.disabled = true;
          try {
            await joinClub(user.uid, btn.dataset.join);
            clubRoomId = btn.dataset.join;
            await renderClubRoom(user, clubRoomId, bumpScreen());
          } catch (e) {
            showErr(e.message);
            btn.disabled = false;
          }
        };
      });
      main.querySelectorAll('[data-open]').forEach((btn) => {
        btn.onclick = async () => {
          clubRoomId = btn.dataset.open;
          try {
            await renderClubRoom(user, clubRoomId, bumpScreen());
          } catch (e) {
            showErr(e.message || 'Could not open club.');
          }
        };
      });
    } catch (e) {
      paint(`<div class="shell-card"><h2>Clubs</h2><div class="empty">${esc(e.message)}</div></div>`, gen);
    }
  }

  // ─── Live ─────────────────────────────────────────────────────────────

  let livePollTimer = null;
  let clubPollTimer = null;

  function stopLivePoll() {
    if (livePollTimer) {
      clearInterval(livePollTimer);
      livePollTimer = null;
    }
  }

  function stopClubPoll() {
    if (clubPollTimer) {
      clearInterval(clubPollTimer);
      clubPollTimer = null;
    }
  }

  async function enterLivePool(uid) {
    const res = await httpsCallable(functions, 'webEnterLivePool')({});
    return res.data || { type: 'waiting' };
  }

  async function pollLiveMatch(user, gen, onWaiting) {
    stopLivePoll();
    livePollTimer = setInterval(async () => {
      if (isStale(gen)) {
        stopLivePoll();
        return;
      }
      try {
        const liveRes = await httpsCallable(functions, 'webLiveState')({});
        if (isStale(gen)) return;
        const s = liveRes.data?.session;
        if (s?.id) {
          stopLivePoll();
          liveWaitingInPool = false;
          await renderLiveSession(user, s.id, s.partnerUid, gen, s.partnerName);
        }
      } catch (err) {
        console.warn('[live] poll', err?.message || err);
      }
    }, 2000);
    unsubscribers.push(() => stopLivePoll());
    if (onWaiting) onWaiting();
  }

  async function renderLiveSession(user, sessionId, partnerUid, gen, partnerName) {
    clearListeners();
    const partner = partnerName ? { name: partnerName } : (await loadUserMap([partnerUid]))[partnerUid] || {};
    if (!paint(liveShellHtml(`
        <h2>You're live</h2>
        <p class="sub">Connected with ${esc(partner.name || 'someone')}. Text chat works here. Video works best in the Android app.</p>
        <div class="thread-msgs live-msgs" id="liveMsgs"></div>
        <form class="thread-compose" id="liveForm">
          <input id="liveInput" type="text" maxlength="500" placeholder="Say hi…" autocomplete="off" />
          <button type="submit">Send</button>
        </form>
        <button type="button" class="btn btn-outline" id="liveEnd">Leave session</button>`), gen)) return;

    const msgsEl = document.getElementById('liveMsgs');
    const qRef = query(
      collection(db, 'liveRandomSessions', sessionId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(50)
    );
    unsubscribers.push(onSnapshot(qRef, (snap) => {
      msgsEl.innerHTML = snap.docs.length
        ? snap.docs.map((d) => {
          const msg = d.data();
          const mine = msg.fromUid === user.uid;
          return `<div class="bubble ${mine ? 'mine' : 'theirs'}">${esc(msg.text || '')}</div>`;
        }).join('')
        : `<div class="empty">Session started. Say hi.</div>`;
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }));

    document.getElementById('liveForm').onsubmit = async (ev) => {
      ev.preventDefault();
      const input = document.getElementById('liveInput');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      try {
        await httpsCallable(functions, 'webSendLiveRandomMessage')({ sessionId, text });
      } catch (e) {
        input.value = text;
        showErr(e.message || 'Could not send message.');
      }
    };

    document.getElementById('liveEnd').onclick = async () => {
      await updateDoc(doc(db, 'liveRandomSessions', sessionId), {
        status: 'ended',
        endedAt: serverTimestamp(),
        endedBy: user.uid,
        endedReason: 'leave',
      });
      showAppScreen('live', user);
    };
  }

  async function renderLive(user, gen) {
    clearListeners();
    chatMatchId = null;
    clubRoomId = null;
    paint(liveShellHtml(`<h2>Live Random</h2><p class="sub">Loading…</p>`), gen);
    if (isStale(gen)) return;

    try {
      const res = await httpsCallable(functions, 'webLiveState')({});
      if (isStale(gen)) return;
      const session = res.data?.session;
      if (session?.id) {
        await renderLiveSession(user, session.id, session.partnerUid, gen, session.partnerName);
        return;
      }
    } catch (e) {
      console.warn('[live] webLiveState', e?.message || e);
    }

    if (!paint(liveShellHtml(`
        <h2>Live Random</h2>
        <p class="sub">Get matched with another signed-in user for a short session. Text chat works here on the web; camera and mic work best in the Android app.</p>
        <button type="button" class="btn btn-primary" id="liveStart">Find someone live</button>
        <button type="button" class="btn btn-outline hidden" id="liveCancel">Cancel search</button>
        <p class="step-hint" id="liveStatus"></p>`), gen)) return;

    document.getElementById('liveStart').onclick = async () => {
      const btn = document.getElementById('liveStart');
      const cancelBtn = document.getElementById('liveCancel');
      const status = document.getElementById('liveStatus');
      btn.disabled = true;
      status.textContent = 'Looking for someone…';
      try {
        const res = await enterLivePool(user.uid);
        if (res.type === 'matched') {
          liveWaitingInPool = false;
          cancelBtn.classList.add('hidden');
          await renderLiveSession(user, res.sessionId, res.partnerUid, gen, res.partnerName);
        } else {
          liveWaitingInPool = true;
          cancelBtn.classList.remove('hidden');
          status.textContent = 'Waiting for a partner… keep this open or cancel below.';
          await pollLiveMatch(user, gen, () => {
            liveWaitingInPool = true;
          });
        }
      } catch (e) {
        liveWaitingInPool = false;
        cancelBtn.classList.add('hidden');
        status.textContent = e.message || 'Could not join live.';
        btn.disabled = false;
      }
    };

    document.getElementById('liveCancel').onclick = async () => {
      liveWaitingInPool = false;
      stopLivePoll();
      try {
        await httpsCallable(functions, 'webLeaveLivePool')({});
      } catch {}
      document.getElementById('liveCancel').classList.add('hidden');
      document.getElementById('liveStart').disabled = false;
      document.getElementById('liveStatus').textContent = '';
    };
  }

  // ─── Social ───────────────────────────────────────────────────────────

  async function renderSocial(user, gen) {
    clearListeners();
    chatMatchId = null;
    clubRoomId = null;
    paint(`<div class="shell-card"><h2>Social</h2><p class="sub">Loading your circle…</p></div>`, gen);
    try {
      const matchSnap = await getDocs(
        query(collection(db, 'matches'), where('uids', 'array-contains', user.uid), limit(40))
      );
      const active = matchSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((m) => m.status === 'active' && m.isBlocked !== true);
      const friendUids = [
        ...new Set(
          active
            .map((m) => (m.uids || []).find((u) => u !== user.uid))
            .filter(Boolean)
        ),
      ];
      const users = await loadUserMap(friendUids);
      const rows = friendUids.length
        ? friendUids.map((uid) => {
          const u = users[uid] || {};
          const img = photoUrl(u);
          const mid = getMatchId(user.uid, uid);
          return `
            <div class="friend-row">
              ${img ? `<img class="friend-avatar" src="${esc(img)}" alt="" />` : '<div class="friend-avatar"></div>'}
              <div style="flex:1">
                <strong>${esc(u.name || 'User')}</strong>
                <span>${esc(u.username ? `@${u.username}` : 'Match')}</span>
              </div>
              <button type="button" class="mini-btn mini-primary" data-chat="${esc(mid)}">Chat</button>
              <button type="button" class="mini-btn" data-game="${esc(uid)}">Play</button>
            </div>`;
        }).join('')
        : `<div class="empty">No social connections yet. Match with someone or join a club.</div>`;

      if (!paint(`
        <div class="shell-card">
          <h2>Social</h2>
          <p class="sub">People from your matches. Chat or launch a game.</p>
          ${rows}
          <a class="btn btn-outline" href="${GAMES_CLIENT_URL}" target="_blank" rel="noopener" style="text-decoration:none;margin-top:12px">Open games hub</a>
        </div>`, gen)) return;

      main.querySelectorAll('[data-chat]').forEach((btn) => {
        btn.onclick = () => {
          chatMatchId = btn.dataset.chat;
          showAppScreen('chats', user);
        };
      });
      main.querySelectorAll('[data-game]').forEach((btn) => {
        btn.onclick = () => {
          window.open(`${GAMES_CLIENT_URL}?opponent=${encodeURIComponent(btn.dataset.game)}`, '_blank');
        };
      });
    } catch (e) {
      paint(`<div class="shell-card"><h2>Social</h2><div class="empty">${esc(e.message)}</div></div>`, gen);
    }
  }

  // ─── Profile & Settings ───────────────────────────────────────────────

  async function renderProfile(user, gen) {
    clearListeners();
    chatMatchId = null;
    clubRoomId = null;
    if (!meProfile) meProfile = await loadMe(user.uid);
    const p = meProfile || {};
    const img = photoUrl(p);
    const verified = isAgeVerified(p) ? '<span class="pill">18+ verified</span>' : '<span class="pill">Verify age</span>';

    if (!paint(`
      <div class="shell-card">
        <h2>Profile</h2>
        ${img ? `<img class="profile-photo" src="${esc(img)}" alt="" />` : ''}
        <p style="text-align:center;font-weight:700;font-size:1.1rem">${esc(p.name || 'You')}</p>
        <p style="text-align:center;color:var(--muted);font-size:0.85rem">@${esc(p.username || 'username')}</p>
        <p style="text-align:center;margin:8px 0">${verified}</p>
        <p class="sub">${esc(p.bio || 'Add a bio in the Android app or edit below.')}</p>
        <label for="profBio">Bio</label>
        <textarea id="profBio" maxlength="500">${esc(p.bio || '')}</textarea>
        <button type="button" class="btn btn-primary" id="profSave">Save bio</button>
        <button type="button" class="btn btn-outline" id="goSettings">Settings</button>
        ${!isAgeVerified(p) ? '<button type="button" class="btn btn-outline" id="profAge">Verify 18+</button>' : ''}
      </div>`, gen)) return;

    document.getElementById('goSettings').onclick = () => showAppScreen('settings', user);
    document.getElementById('profAge')?.addEventListener('click', () => renderAgeVerify(user, gen));
    document.getElementById('profSave').onclick = async () => {
      const bio = document.getElementById('profBio').value.trim();
      await updateDoc(doc(db, 'users', user.uid), { bio, updatedAt: serverTimestamp() });
      meProfile = { ...p, bio };
      const toast = document.createElement('div');
      toast.className = 'ok';
      toast.textContent = 'Profile updated.';
      main.querySelector('.shell-card').appendChild(toast);
    };
  }

  async function renderSettings(user, gen) {
    clearListeners();
    if (!paint(`
      <div class="shell-card">
        <h2>Settings</h2>
        <p class="sub">Account, safety, and policies.</p>
        <a class="settings-link" href="trust.html">Trust center <span>→</span></a>
        <a class="settings-link" href="community.html">Community &amp; moderation <span>→</span></a>
        <a class="settings-link" href="privacy.html">Privacy policy <span>→</span></a>
        <a class="settings-link" href="terms.html">Terms of service <span>→</span></a>
        <a class="settings-link" href="child-safety.html">Child safety <span>→</span></a>
        <a class="settings-link" href="mailto:zain.tariq@mail.com">Contact support <span>→</span></a>
        <button type="button" class="btn btn-outline" id="settingsBlocked">Blocked users</button>
        <button type="button" class="btn btn-outline" id="settingsLogout">Log out</button>
      </div>`, gen)) return;

    document.getElementById('settingsLogout').onclick = () => {
      clearListeners();
      signOut(auth);
    };
    document.getElementById('settingsBlocked').onclick = async () => {
      const snap = await getDocs(collection(db, 'users', user.uid, 'blocks'));
      const ids = snap.docs.map((d) => d.id);
      const users = await loadUserMap(ids);
      const rows = ids.length
        ? ids.map((id) => `<div class="list-item"><strong>${esc(users[id]?.name || id)}</strong></div>`).join('')
        : '<div class="empty">No blocked users.</div>';
      paint(`<div class="shell-card"><button type="button" class="thread-back" id="settingsBack">← Settings</button><h2>Blocked</h2>${rows}</div>`, gen);
      document.getElementById('settingsBack').onclick = () => renderSettings(user, bumpScreen());
    };
  }

  // ─── Navigation ───────────────────────────────────────────────────────

  async function showAppScreen(screen, user) {
    const gen = bumpScreen();
    currentScreen = screen;
    document.querySelectorAll('.nav-tile').forEach((n) => {
      n.classList.toggle('on', n.dataset.screen === screen);
    });

    if (screen === 'live') {
      paint(liveShellHtml(`<h2>Live Random</h2><p class="sub">Loading…</p>`), gen);
    }

    if (screen === 'discover') await renderDiscover(user, gen);
    else if (screen === 'ageVerify') renderAgeVerify(user, gen);
    else if (screen === 'chats') {
      if (!requireAgeForScreen(user, gen)) return;
      if (chatMatchId) await renderChatThread(user, chatMatchId, gen);
      else await renderChats(user, gen);
    } else if (screen === 'clubs') {
      if (!requireAgeForScreen(user, gen)) return;
      if (clubRoomId) await renderClubRoom(user, clubRoomId, gen);
      else await renderClubs(user, gen);
    } else if (screen === 'live') {
      if (!requireAgeForScreen(user, gen)) return;
      await renderLive(user, gen);
    else if (screen === 'social') await renderSocial(user, gen);
    else if (screen === 'profile') await renderProfile(user, gen);
    else if (screen === 'settings') await renderSettings(user, gen);
  }

  function enterApp(user) {
    main.classList.remove('no-nav');
    bottomNav.classList.add('on');
    profileBtn.classList.remove('hidden');
    document.querySelectorAll('.nav-tile').forEach((btn) => {
      btn.onclick = () => {
        if (btn.dataset.screen !== 'chats') chatMatchId = null;
        if (btn.dataset.screen !== 'clubs') clubRoomId = null;
        showAppScreen(btn.dataset.screen, user);
      };
    });
    profileBtn.onclick = () => showAppScreen('profile', user);
    showAppScreen('discover', user);
  }

  function start(startMode) {
    onAuthStateChanged(auth, (user) => {
      main.querySelector('.err')?.remove();
      if (user) enterApp(user);
      else if (startMode === 'login') renderLogin();
      else if (startMode === 'signup') renderSignup();
      else renderWelcome();
    });
  }

  return { start };
}
