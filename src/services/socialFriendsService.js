import { clubService, matchService, userService } from './firebaseService';

/**
 * Load unique friend profiles from active matches + club memberships.
 */
export async function loadSocialFriends(meUid) {
  const uid = String(meUid || '');
  if (!uid) return { matches: [], clubFriends: [], error: 'Not signed in.' };

  try {
    const matches = await new Promise((resolve) => {
      let settled = false;
      const unsub = matchService.listenMyMatches(uid, ({ data, error }) => {
        if (settled) return;
        settled = true;
        unsub && unsub();
        if (error) resolve([]);
        else resolve(Array.isArray(data) ? data : []);
      });
      setTimeout(() => {
        if (!settled) {
          settled = true;
          unsub && unsub();
          resolve([]);
        }
      }, 8000);
    });

    const activeMatches = matches.filter((m) => m?.status === 'active');
    const matchUids = [
      ...new Set(
        activeMatches
          .map((m) => (m?.uids || []).find((u) => String(u) !== uid))
          .filter(Boolean)
          .map(String)
      ),
    ];

    const memberships = await new Promise((resolve) => {
      let settled = false;
      const unsub = clubService.listenMyMemberships(uid, ({ data, error }) => {
        if (settled) return;
        settled = true;
        unsub && unsub();
        resolve(error ? [] : Array.isArray(data) ? data : []);
      });
      setTimeout(() => {
        if (!settled) {
          settled = true;
          unsub && unsub();
          resolve([]);
        }
      }, 6000);
    });

    const clubIds = memberships.map((m) => m.clubId).filter(Boolean).slice(0, 8);
    const clubMemberUids = new Set();

    await Promise.all(
      clubIds.map(
        (clubId) =>
          new Promise((resolve) => {
            let settled = false;
            const unsub = clubService.listenMembers(clubId, ({ data }) => {
              if (settled) return;
              settled = true;
              unsub && unsub();
              (data || []).forEach((member) => {
                const mUid = String(member?.uid || '');
                if (mUid && mUid !== uid) clubMemberUids.add(mUid);
              });
              resolve();
            });
            setTimeout(() => {
              if (!settled) {
                settled = true;
                unsub && unsub();
                resolve();
              }
            }, 5000);
          })
      )
    );

    matchUids.forEach((id) => clubMemberUids.delete(id));

    const allUids = [...new Set([...matchUids, ...clubMemberUids])];
    const profiles = await Promise.all(
      allUids.map(async (id) => {
        const res = await userService.getUserById(id);
        return res?.data ? { uid: id, ...res.data } : null;
      })
    );

    const byUid = Object.fromEntries(profiles.filter(Boolean).map((p) => [p.uid, p]));

    return {
      matches: matchUids.map((id) => byUid[id]).filter(Boolean),
      clubFriends: [...clubMemberUids].map((id) => byUid[id]).filter(Boolean),
      error: null,
    };
  } catch (error) {
    return { matches: [], clubFriends: [], error: error?.message || String(error) };
  }
}
