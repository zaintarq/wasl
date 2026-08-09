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
  const photos = user?.photos;
  if (Array.isArray(photos) && photos.length) {
    const p = photos[0];
    if (typeof p === 'string') return p;
    if (p?.url) return p.url;
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
    const el = main.querySelector('.err');
    if (el) el.textContent = msg;
    else main.insertAdjacentHTML('beforeend', `<div class="err">${esc(msg)}</div>`);
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
    meProfile = await loadMe(uid);
    const [usersSnap, sentSnap, blocksSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), limit(200))),
      getDocs(collection(db, 'users', uid, 'likesSent')),
      getDocs(collection(db, 'users', uid, 'blocks')),
    ]);
    const swiped = new Set(sentSnap.docs.map((d) => d.id));
    const blocked = new Set(blocksSnap.docs.map((d) => d.id));
    const all = usersSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => filterCandidate(meProfile, u, swiped, blocked));
    return all;
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

  function renderDiscoverCard() {
    const c = discoverCandidates[discoverIndex];
    if (!c) {
      main.innerHTML = `
        <div class="card">
          <h2>Discover</h2>
          <div class="empty">No one new right now. Check back later or adjust your profile in the app.</div>
          <button type="button" class="btn btn-outline" id="discRefresh">Refresh</button>
        </div>`;
      document.getElementById('discRefresh')?.addEventListener('click', () => renderDiscover(auth.currentUser));
      return;
    }
    const img = photoUrl(c);
    const name = esc(c.name || 'Someone');
    const age = c.age ? `, ${esc(String(c.age))}` : '';
    const bio = esc(c.bio || '');
    const city = esc(c.city || c.location?.city || '');
    main.innerHTML = `
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
      <div id="discToast" class="ok hidden"></div>`;

    document.getElementById('discPass').onclick = async () => {
      await passUser(auth.currentUser.uid, c.id);
      discoverIndex += 1;
      renderDiscoverCard();
    };
    document.getElementById('discLike').onclick = async () => {
      const res = await likeUser(auth.currentUser.uid, c.id);
      const toast = document.getElementById('discToast');
      if (res.matched) {
        toast.textContent = "It's a match! Open Chats to message.";
        toast.classList.remove('hidden');
      }
      discoverIndex += 1;
      renderDiscoverCard();
    };
  }

  async function renderDiscover(user) {
    clearListeners();
    chatMatchId = null;
    clubRoomId = null;
    main.innerHTML = `<div class="card"><h2>Discover</h2><p class="sub">Loading people near you…</p></div>`;
    try {
      discoverCandidates = await loadDiscoverCandidates(user.uid);
      discoverIndex = 0;
      renderDiscoverCard();
    } catch (e) {
      main.innerHTML = `<div class="card"><h2>Discover</h2><div class="empty">${esc(e.message)}</div></div>`;
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

  async function renderChatThread(user, matchId) {
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
      renderChats(user);
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

  async function renderChats(user) {
    clearListeners();
    clubRoomId = null;
    main.innerHTML = `<div class="card"><h2>Chats</h2><p class="sub">Loading…</p></div>`;
    try {
      const qRef = query(collection(db, 'matches'), where('uids', 'array-contains', user.uid));
      const snap = await getDocs(qRef);
      const matches = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((m) => m.status === 'active' || !m.status)
        .sort((a, b) => tsMillis(b.lastMessageAt || b.createdAt) - tsMillis(a.lastMessageAt || a.createdAt));

      if (!matches.length) {
        main.innerHTML = `<div class="card"><h2>Chats</h2><div class="empty">No matches yet — like people in Discover.</div></div>`;
        return;
      }

      const otherUids = matches.map((m) => (m.uids || []).find((u) => u !== user.uid)).filter(Boolean);
      const users = await loadUserMap(otherUids);

      const rows = matches.map((m) => {
        const otherUid = (m.uids || []).find((u) => u !== user.uid) || '';
        const other = users[otherUid] || {};
        const preview = esc(m.lastMessageText || 'New match — tap to chat');
        return `<button type="button" class="list-item list-btn" data-mid="${esc(m.id)}">
          <strong>${esc(other.name || 'Match')}</strong>
          <span>${preview}</span>
        </button>`;
      }).join('');

      main.innerHTML = `<div class="card"><h2>Chats</h2>${rows}</div>`;
      main.querySelectorAll('[data-mid]').forEach((btn) => {
        btn.onclick = () => {
          chatMatchId = btn.dataset.mid;
          renderChatThread(user, chatMatchId);
        };
      });
    } catch (e) {
      main.innerHTML = `<div class="card"><h2>Chats</h2><div class="empty">${esc(e.message)}</div></div>`;
    }
  }

  // ─── Clubs ────────────────────────────────────────────────────────────

  async function joinClub(uid, clubId) {
    const cid = String(clubId);
    await runTransaction(db, async (tx) => {
      const clubRef = doc(db, 'clubs', cid);
      const clubSnap = await tx.get(clubRef);
      if (!clubSnap.exists()) throw new Error('Club not found.');
      const memberRef = doc(db, 'clubs', cid, 'members', uid);
      const memberSnap = await tx.get(memberRef);
      if (memberSnap.exists()) return;
      tx.set(memberRef, {
        uid, role: 'member', canSpeak: false, joinedAt: serverTimestamp(),
      });
      tx.set(doc(db, 'users', uid, 'clubMemberships', cid), {
        clubId: cid, role: 'member', joinedAt: serverTimestamp(),
      });
    });
  }

  async function renderClubRoom(user, clubId) {
    clearListeners();
    clubRoomId = clubId;
    const clubSnap = await getDoc(doc(db, 'clubs', clubId));
    if (!clubSnap.exists()) {
      main.innerHTML = `<div class="card"><div class="empty">Club not found.</div></div>`;
      return;
    }
    const club = clubSnap.data();
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
      renderClubs(user);
    };

    const msgsEl = document.getElementById('clubMsgs');
    const qRef = query(
      collection(db, 'clubs', clubId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(80)
    );
    unsubscribers.push(onSnapshot(qRef, (snap) => {
      if (snap.empty) {
        msgsEl.innerHTML = `<div class="empty">No messages yet — say hello.</div>`;
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

    document.getElementById('clubForm').onsubmit = async (ev) => {
      ev.preventDefault();
      const input = document.getElementById('clubInput');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      await addDoc(collection(db, 'clubs', clubId, 'messages'), {
        fromUid: user.uid,
        text: text.slice(0, 2000),
        createdAt: serverTimestamp(),
      });
    };
  }

  async function renderClubs(user) {
    clearListeners();
    chatMatchId = null;
    main.innerHTML = `<div class="card"><h2>Clubs</h2><p class="sub">Loading…</p></div>`;
    try {
      const [pubSnap, memSnap] = await Promise.all([
        getDocs(query(
          collection(db, 'clubs'),
          where('isPublic', '==', true),
          orderBy('createdAt', 'desc'),
          limit(30)
        )),
        getDocs(collection(db, 'users', user.uid, 'clubMemberships')),
      ]);
      const joined = new Set(memSnap.docs.map((d) => d.id));

      if (!pubSnap.docs.length) {
        main.innerHTML = `<div class="card"><h2>Clubs</h2><div class="empty">No public clubs yet.</div></div>`;
        return;
      }

      const rows = pubSnap.docs.map((d) => {
        const c = d.data();
        const isMember = joined.has(d.id);
        return `<div class="list-item club-row">
          <div>
            <strong>${esc(c.name || 'Club')}</strong>
            <span>${esc(c.description || 'Public club')} · ${Number(c.memberCount || 0)} members</span>
          </div>
          ${isMember
            ? `<button type="button" class="mini-btn" data-open="${esc(d.id)}">Open</button>`
            : `<button type="button" class="mini-btn mini-primary" data-join="${esc(d.id)}">Join</button>`}
        </div>`;
      }).join('');

      main.innerHTML = `<div class="card"><h2>Clubs</h2><p class="sub">Public clubs — join and chat here on the web.</p>${rows}</div>`;

      main.querySelectorAll('[data-join]').forEach((btn) => {
        btn.onclick = async () => {
          btn.disabled = true;
          try {
            await joinClub(user.uid, btn.dataset.join);
            clubRoomId = btn.dataset.join;
            await renderClubRoom(user, clubRoomId);
          } catch (e) {
            showErr(e.message);
            btn.disabled = false;
          }
        };
      });
      main.querySelectorAll('[data-open]').forEach((btn) => {
        btn.onclick = () => {
          clubRoomId = btn.dataset.open;
          renderClubRoom(user, clubRoomId);
        };
      });
    } catch (e) {
      main.innerHTML = `<div class="card"><h2>Clubs</h2><div class="empty">${esc(e.message)}</div></div>`;
    }
  }

  // ─── Live ─────────────────────────────────────────────────────────────

  async function enterLivePool(uid) {
    const poolRef = doc(db, 'liveRandomPool', 'current');
    const sessionRef = doc(collection(db, 'liveRandomSessions'));
    const sessionId = sessionRef.id;
    const result = await runTransaction(db, async (tx) => {
      const poolSnap = await tx.get(poolRef);
      const waiting = poolSnap.exists() ? String(poolSnap.data()?.waitingUid || '').trim() : '';
      if (waiting && waiting !== uid) {
        tx.set(poolRef, { waitingUid: null, updatedAt: serverTimestamp() }, { merge: true });
        tx.set(sessionRef, {
          uids: [uid, waiting].sort(),
          status: 'active',
          startedAt: serverTimestamp(),
        });
        return { type: 'matched', partnerUid: waiting, sessionId };
      }
      tx.set(poolRef, { waitingUid: uid, updatedAt: serverTimestamp() }, { merge: true });
      return { type: 'waiting' };
    });
    return result;
  }

  async function renderLiveSession(user, sessionId, partnerUid) {
    clearListeners();
    const users = await loadUserMap([partnerUid]);
    const partner = users[partnerUid] || {};
    main.innerHTML = `
      <div class="card live-session">
        <h2>Live session</h2>
        <p class="sub">You're connected with ${esc(partner.name || 'someone')}. Text chat works on web — video is best in the Android app.</p>
        <div class="thread-msgs live-msgs" id="liveMsgs"></div>
        <form class="thread-compose" id="liveForm">
          <input id="liveInput" type="text" maxlength="500" placeholder="Say hi…" autocomplete="off" />
          <button type="submit">Send</button>
        </form>
        <button type="button" class="btn btn-outline" id="liveEnd">Leave session</button>
      </div>`;

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
      renderLive(user);
    };
  }

  async function renderLive(user) {
    clearListeners();
    chatMatchId = null;
    clubRoomId = null;

    const activeQ = query(
      collection(db, 'liveRandomSessions'),
      where('uids', 'array-contains', user.uid),
      where('status', '==', 'active'),
      limit(1)
    );
    const activeSnap = await getDocs(activeQ);
    if (!activeSnap.empty) {
      const s = activeSnap.docs[0];
      const partner = (s.data().uids || []).find((u) => u !== user.uid) || '';
      await renderLiveSession(user, s.id, partner);
      return;
    }

    main.innerHTML = `
      <div class="card">
        <h2>Live Random</h2>
        <p class="sub">Get matched with another signed-in user for a short session. Text chat works here on the web; camera and mic work best in the Android app.</p>
        <button type="button" class="btn btn-primary" id="liveStart">Find someone live</button>
        <p class="step-hint" id="liveStatus"></p>
      </div>`;

    document.getElementById('liveStart').onclick = async () => {
      const btn = document.getElementById('liveStart');
      const status = document.getElementById('liveStatus');
      btn.disabled = true;
      status.textContent = 'Looking for someone…';
      try {
        const res = await enterLivePool(user.uid);
        if (res.type === 'matched') {
          await renderLiveSession(user, res.sessionId, res.partnerUid);
        } else {
          status.textContent = 'Waiting for a partner… keep this open.';
          const poolUnsub = onSnapshot(doc(db, 'liveRandomPool', 'current'), async (snap) => {
            const w = snap.exists() ? String(snap.data()?.waitingUid || '') : '';
            if (w !== user.uid) {
              poolUnsub();
              const again = await getDocs(activeQ);
              if (!again.empty) {
                const s = again.docs[0];
                const partner = (s.data().uids || []).find((u) => u !== user.uid) || '';
                await renderLiveSession(user, s.id, partner);
              }
            }
          });
          unsubscribers.push(poolUnsub);
        }
      } catch (e) {
        status.textContent = e.message || 'Could not join live.';
        btn.disabled = false;
      }
    };
  }

  // ─── Navigation ───────────────────────────────────────────────────────

  async function showAppScreen(screen, user) {
    currentScreen = screen;
    document.querySelectorAll('.nav-item').forEach((n) => {
      n.classList.toggle('on', n.dataset.screen === screen);
    });
    if (screen === 'discover') await renderDiscover(user);
    else if (screen === 'chats') {
      if (chatMatchId) await renderChatThread(user, chatMatchId);
      else await renderChats(user);
    } else if (screen === 'clubs') {
      if (clubRoomId) await renderClubRoom(user, clubRoomId);
      else await renderClubs(user);
    } else if (screen === 'live') await renderLive(user);
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
