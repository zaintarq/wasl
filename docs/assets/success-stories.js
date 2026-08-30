const firebaseConfig = {
  apiKey: 'AIzaSyB_k9w2F0I591-8mUyuHr_5B-TVQea0Tfo',
  authDomain: 'huzz-10264.firebaseapp.com',
  projectId: 'huzz-10264',
  storageBucket: 'huzz-10264.firebasestorage.app',
  messagingSenderId: '19254029866',
  appId: '1:19254029866:web:fe891e5819c8c94c589d53',
};

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(text, max) {
  const t = String(text || '').trim();
  if (t.length <= max) return escapeHtml(t);
  return `${escapeHtml(t.slice(0, max - 1))}…`;
}

function storyArticleHtml(story, { compact = false } = {}) {
  const body = String(story.body || '').trim();
  const first = body.charAt(0);
  const rest = body.slice(1);
  const kicker = escapeHtml(story.metViaLabel || 'We met on Wasl');
  const cityLine = story.city ? `<p class="story-city-line">${escapeHtml(story.city)}</p>` : '';
  if (compact) {
    return `
      <p class="story-kicker">${kicker}</p>
      ${cityLine}
      <p class="story-snippet">“${truncate(body, 200)}”</p>
    `;
  }
  return `
    <p class="story-kicker">${kicker}</p>
    ${cityLine}
    <p class="story-body"><span class="dropcap">${escapeHtml(first)}</span>${escapeHtml(rest)}</p>
  `;
}

export async function fetchPublishedStories(db, deps, limitCount = 40) {
  const { collection, query, where, orderBy, limit, getDocs } = deps;
  const qRef = query(
    collection(db, 'successStories'),
    where('status', '==', 'published'),
    orderBy('publishedAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(qRef);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Homepage preview — admin-approved stories only. */
export async function initHomeStoriesPreview(deps) {
  const {
    initializeApp,
    getFirestore,
    collection,
    query,
    where,
    orderBy,
    limit,
    getDocs,
  } = deps;

  const wrap = document.getElementById('homeStoriesPreview');
  const grid = document.getElementById('homeStoriesGrid');
  const empty = document.getElementById('homeStoriesEmpty');
  if (!wrap || !grid) return;

  const app = initializeApp(firebaseConfig, 'wasl-home-stories');
  const db = getFirestore(app);

  try {
    const stories = await fetchPublishedStories(
      db,
      { collection, query, where, orderBy, limit, getDocs },
      3
    );
    if (!stories.length) {
      empty?.classList.remove('hidden');
      wrap.classList.remove('hidden');
      return;
    }
    empty?.classList.add('hidden');
    grid.innerHTML = '';
    stories.forEach((story) => {
      const card = document.createElement('article');
      card.className = 'love-story-compact';
      card.innerHTML = storyArticleHtml(story, { compact: true });
      grid.appendChild(card);
    });
    wrap.classList.remove('hidden');
  } catch (e) {
    console.warn('[homeStories]', e);
  }
}

function formatTs(value) {
  if (!value) return '—';
  const ms = value?.toMillis?.() || (value?.seconds ? value.seconds * 1000 : 0);
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function statusClass(status) {
  const s = String(status || 'pending');
  if (s === 'published') return 'published';
  if (s === 'rejected') return 'rejected';
  return 'pending';
}

function statusLabel(status) {
  const s = String(status || 'pending');
  if (s === 'published') return 'Approved';
  if (s === 'rejected') return 'Not approved';
  return 'Pending review';
}

export async function initSuccessStoriesPage({
  initializeApp,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  doc,
  getDoc,
  getFunctions,
  httpsCallable,
}) {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, 'us-central1');

  const grid = document.getElementById('storyGrid');
  const loading = document.getElementById('storiesLoading');
  const empty = document.getElementById('storiesEmpty');
  const adminPanel = document.getElementById('adminPanel');
  const adminList = document.getElementById('adminList');
  const adminLogin = document.getElementById('adminLogin');
  const adminEmail = document.getElementById('adminEmail');
  const adminPass = document.getElementById('adminPass');
  const adminSignIn = document.getElementById('adminSignIn');

  function renderPublicStories(stories) {
    if (loading) loading.classList.add('hidden');
    if (!grid) return;
    grid.innerHTML = '';
    if (!stories.length) {
      empty?.classList.remove('hidden');
      return;
    }
    empty?.classList.add('hidden');
    stories.forEach((story) => {
      const card = document.createElement('article');
      card.className = 'love-story';
      card.innerHTML = storyArticleHtml(story);
      grid.appendChild(card);
    });
  }

  async function loadPublic() {
    const list = await fetchPublishedStories(db, { collection, query, where, orderBy, limit, getDocs }, 40);
    renderPublicStories(list);
  }

  async function isAdminUser(uid) {
    if (!uid) return false;
    const snap = await getDoc(doc(db, 'admin', uid));
    return snap.exists() && String(snap.data()?.role || '').toLowerCase() === 'admin';
  }

  function renderAdminStories(stories) {
    if (!adminList) return;
    adminList.innerHTML = '';
    if (!stories.length) {
      adminList.innerHTML = '<p class="stories-empty">No submissions yet.</p>';
      return;
    }
    stories.forEach((story) => {
      const row = document.createElement('div');
      row.className = 'admin-story';
      row.innerHTML = `
        <div class="admin-story-head">
          <span class="admin-badge ${statusClass(story.status)}">${statusLabel(story.status)}</span>
          <span style="font-size:12px;color:#6B4C57">${formatTs(story.createdAt)}</span>
        </div>
        <p class="story-kicker">${escapeHtml(story.metViaLabel || 'Wasl')}</p>
        ${story.city ? `<p class="story-city-line">${escapeHtml(story.city)}</p>` : ''}
        <p class="story-body" style="margin-top:8px">${escapeHtml(story.body)}</p>
        <div class="admin-actions" data-id="${escapeHtml(story.id)}"></div>
      `;
      const actions = row.querySelector('.admin-actions');
      if (story.status !== 'published') {
        const approve = document.createElement('button');
        approve.className = 'btn-approve';
        approve.textContent = 'Approve (app + web)';
        approve.onclick = () => callAdmin('publishSuccessStory', story.id);
        actions.appendChild(approve);
      } else {
        const unpublish = document.createElement('button');
        unpublish.className = 'btn-unpublish';
        unpublish.textContent = 'Unpublish';
        unpublish.onclick = () => callAdmin('unpublishSuccessStory', story.id);
        actions.appendChild(unpublish);
      }
      if (story.status !== 'rejected') {
        const reject = document.createElement('button');
        reject.className = 'btn-reject';
        reject.textContent = 'Reject';
        reject.onclick = () => callAdmin('rejectSuccessStory', story.id);
        actions.appendChild(reject);
      }
      adminList.appendChild(row);
    });
  }

  async function callAdmin(fnName, storyId) {
    try {
      const callable = httpsCallable(functions, fnName);
      await callable({ storyId });
      await loadPublic();
    } catch (e) {
      alert(e?.message || 'Action failed');
    }
  }

  let adminUnsub = null;

  function startAdminListener() {
    if (adminUnsub) adminUnsub();
    const qRef = query(collection(db, 'successStories'), orderBy('createdAt', 'desc'), limit(80));
    adminUnsub = onSnapshot(qRef, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAdminStories(list);
    });
  }

  adminSignIn?.addEventListener('click', async () => {
    try {
      await signInWithEmailAndPassword(auth, adminEmail?.value || '', adminPass?.value || '');
    } catch (e) {
      alert(e?.message || 'Sign in failed');
    }
  });

  onAuthStateChanged(auth, async (user) => {
    if (user && (await isAdminUser(user.uid))) {
      adminPanel?.classList.remove('hidden');
      adminLogin?.classList.add('hidden');
      document.getElementById('showAdminLogin')?.closest('p')?.classList.add('hidden');
      startAdminListener();
    } else {
      adminPanel?.classList.add('hidden');
      if (adminUnsub) adminUnsub();
    }
  });

  try {
    await loadPublic();
  } catch (e) {
    if (loading) loading.textContent = 'Could not load stories. Try again later.';
    console.error(e);
  }
}
