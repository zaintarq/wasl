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
    main, bottomNav, logoutBtn,
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
      <div class="card live-session" data-live-root="1">
        <div class="live-badge">⚡ Live Random</div>
        ${body}
      </div>`;
  }

  function clearListeners() {
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
    logoutBtn.classList.add('hidden');
    main.innerHTML = `
      <div class="card">
        <h2>Welcome back</h2>
        <p class="sub">Sign up or log in — Discover, Chats, Clubs, and Live work on the web.</p>
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
    logoutBtn.classList.add('hidden');
    main.innerHTML = `
      <div class="card">
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
    logoutBtn.classList.add('hidden');
    drawSignupStep();
  }

  function drawSignupStep() {
    if (signupStep === 'email') {
      main.innerHTML = `
        <div class="card">
          <h2>Sign up</h2>
          <p class="step-hint">Step 1 of 4 — verify your email</p>
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
        <div class="card">
          <h2>Enter code</h2>
          <p class="step-hint">Step 2 of 4 — check your inbox</p>
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
        <div class="card">
          <h2>Your profile</h2>
          <p class="step-hint">Step 3 of 4 — pick a username</p>
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
        <div class="card">
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
    await setDoc(doc(db, 'users', from, 'likesSent', to), {
      toUid: to, action: 'like', createdAt: serverTimestamp(),
    }, { merge: true });
    await setDoc(doc(db, 'users', to, 'likesReceived', from), {
      fromUid: from, action: 'like', createdAt: serverTimestamp(),
    }, { merge: true });
    const reciprocal = await getDoc(doc(db, 'users', from, 'likesReceived', to));
    if (reciprocal.exists() && reciprocal.data()?.action === 'like') {
      const matchId = getMatchId(from, to);
      const sorted = [from, to].sort();
      await setDoc(doc(db, 'matches', matchId), {
        id: matchId,
        uids: sorted,
        status: 'active',
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        source: 'web_discovery',
      }, { merge: true });
      return { matched: true, matchId };
    }
    return { matched: false };
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
        <div class="card">
          <h2>Discover</h2>
          <div class="empty">No one new right now. Check back later or adjust your profile in the app.</div>
          <button type="button" class="btn btn-outline" id="discRefresh">Refresh</button>
        </div>`, gen);
      document.getElementById('discRefresh')?.addEventListener('click', () => showAppScreen('discover', auth.currentUser));
      return;
    }
    const img = photoUrl(c);
    const name = esc(c.name || 'Someone');
    const age = c.age ? `, ${esc(String(c.age))}` : '';
    const bio = esc(c.bio || '');
    const city = esc(c.city || c.location?.city || '');
    if (!paint(`
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

    document.getElementById('discPass').onclick = async () => {
      await passUser(auth.currentUser.uid, c.id);
      discoverIndex += 1;
      renderDiscoverCard(gen);
    };
    document.getElementById('discLike').onclick = async () => {
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
    paint(`<div class="card"><h2>Discover</h2><p class="sub">Loading people near you…</p></div>`, gen);
    try {
      discoverCandidates = await loadDiscoverCandidates(user.uid);
      if (isStale(gen)) return;
      discoverIndex = 0;
      renderDiscoverCard(gen);
    } catch (e) {
      paint(`<div class="card"><h2>Discover</h2><div class="empty">${esc(e.message)}</div></div>`, gen);
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

  async function renderChatThread(user, matchId, gen) {
    clearListeners();
    chatMatchId = matchId;
    const matchSnap = await getDoc(doc(db, 'matches', matchId));
    if (!matchSnap.exists()) {
      main.innerHTML = `<div class="card"><div class="empty">Chat not found.</div></div>`;
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
        msgsEl.innerHTML = `<div class="empty">Say salam — start the conversation.</div>`;
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
      await addDoc(collection(db, 'matches', matchId, 'messages'), {
        fromUid: user.uid,
        type: 'text',
        text,
        createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'matches', matchId), {
        lastMessageAt: serverTimestamp(),
        lastMessageText: text,
      }, { merge: true });
    };
  }

  async function renderChats(user, gen) {
    clearListeners();
    clubRoomId = null;
    paint(`<div class="card"><h2>Chats</h2><p class="sub">Loading…</p></div>`, gen);
    try {
      const res = await httpsCallable(functions, 'webListMatches')({});
      if (isStale(gen)) return;
      const { matches = [], users = {} } = res.data || {};

      if (!matches.length) {
        paint(`<div class="card"><h2>Chats</h2><div class="empty">No matches yet — like people in Discover.</div></div>`, gen);
        return;
      }

      const rows = matches.map((m) => {
        const otherUid = (m.uids || []).find((u) => u !== user.uid) || '';
        const other = users[otherUid] || {};
        const preview = esc(m.lastMessageText || 'New match — tap to chat');
        return `<button type="button" class="list-item list-btn" data-mid="${esc(m.id)}">
          <strong>${esc(other.name || 'Match')}</strong>
          <span>${preview}</span>
        </button>`;
      }).join('');

      if (!paint(`<div class="card"><h2>Chats</h2>${rows}</div>`, gen)) return;
      main.querySelectorAll('[data-mid]').forEach((btn) => {
        btn.onclick = () => {
          chatMatchId = btn.dataset.mid;
          renderChatThread(user, chatMatchId, bumpScreen());
        };
      });
    } catch (e) {
      paint(`<div class="card"><h2>Chats</h2><div class="empty">${esc(e.message)}</div></div>`, gen);
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
      msgsEl.innerHTML = `<div class="empty">No messages yet — say hello.</div>`;
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
    paint(`<div class="card"><h2>Club</h2><p class="sub">Loading…</p></div>`, gen);
    try {
      const res = await httpsCallable(functions, 'webGetClubRoom')({ clubId: String(clubId) });
      if (isStale(gen)) return;
      const { club, isMember, messages = [] } = res.data || {};
      if (!club) {
        main.innerHTML = `<div class="card"><div class="empty">Club not found.</div></div>`;
        return;
      }
      if (!isMember) {
        main.innerHTML = `<div class="card"><div class="empty">Join this club to view messages.</div></div>`;
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
      main.innerHTML = `<div class="card"><div class="empty">${esc(e.message || 'Could not open club.')}</div></div>`;
    }
  }

  async function renderClubs(user, gen) {
    clearListeners();
    chatMatchId = null;
    paint(`<div class="card"><h2>Clubs</h2><p class="sub">Loading…</p></div>`, gen);
    try {
      const res = await httpsCallable(functions, 'webListClubs')({});
      if (isStale(gen)) return;
      const { clubs = [], joinedIds = [] } = res.data || {};
      const joined = new Set(joinedIds);

      if (!clubs.length) {
        paint(`<div class="card"><h2>Clubs</h2><div class="empty">No public clubs yet.</div></div>`, gen);
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

      if (!paint(`<div class="card"><h2>Clubs</h2><p class="sub">Public clubs — join and chat here on the web.</p>${rows}</div>`, gen)) return;

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
      paint(`<div class="card"><h2>Clubs</h2><div class="empty">${esc(e.message)}</div></div>`, gen);
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
        <p class="sub">Connected with ${esc(partner.name || 'someone')}. Chat here on web — video works best in the Android app.</p>
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
        : `<div class="empty">Session started — say hi.</div>`;
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }));

    document.getElementById('liveForm').onsubmit = async (ev) => {
      ev.preventDefault();
      const input = document.getElementById('liveInput');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      await addDoc(collection(db, 'liveRandomSessions', sessionId, 'messages'), {
        fromUid: user.uid,
        text: text.slice(0, 500),
        createdAt: serverTimestamp(),
      });
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
        <p class="step-hint" id="liveStatus"></p>`), gen)) return;

    document.getElementById('liveStart').onclick = async () => {
      const btn = document.getElementById('liveStart');
      const status = document.getElementById('liveStatus');
      btn.disabled = true;
      status.textContent = 'Looking for someone…';
      try {
        const res = await enterLivePool(user.uid);
        if (res.type === 'matched') {
          await renderLiveSession(user, res.sessionId, res.partnerUid, gen, res.partnerName);
        } else {
          status.textContent = 'Waiting for a partner… keep this open.';
          await pollLiveMatch(user, gen);
        }
      } catch (e) {
        status.textContent = e.message || 'Could not join live.';
        btn.disabled = false;
      }
    };
  }

  // ─── Navigation ───────────────────────────────────────────────────────

  async function showAppScreen(screen, user) {
    const gen = bumpScreen();
    currentScreen = screen;
    document.querySelectorAll('.nav-item').forEach((n) => {
      n.classList.toggle('on', n.dataset.screen === screen);
    });

    if (screen === 'live') {
      paint(liveShellHtml(`<h2>Live Random</h2><p class="sub">Loading…</p>`), gen);
    }

    if (screen === 'discover') await renderDiscover(user, gen);
    else if (screen === 'chats') {
      if (chatMatchId) await renderChatThread(user, chatMatchId, gen);
      else await renderChats(user, gen);
    } else if (screen === 'clubs') {
      if (clubRoomId) await renderClubRoom(user, clubRoomId, gen);
      else await renderClubs(user, gen);
    } else if (screen === 'live') await renderLive(user, gen);
  }

  function enterApp(user) {
    main.classList.remove('no-nav');
    bottomNav.classList.add('on');
    logoutBtn.classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.onclick = () => {
        if (btn.dataset.screen !== 'chats') chatMatchId = null;
        if (btn.dataset.screen !== 'clubs') clubRoomId = null;
        showAppScreen(btn.dataset.screen, user);
      };
    });
    showAppScreen('discover', user);
  }

  logoutBtn.onclick = () => {
    clearListeners();
    signOut(auth);
  };

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
