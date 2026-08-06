# Google Play Console — Huzz setup (copy & paste)

Replace `support@huzz.com` and `https://huzz.com/privacy` with your real email and hosted privacy URL before submitting.

---

## 1. Privacy policy

**URL to paste:** `https://huzz.com/privacy`

Host the content from `docs/PRIVACY_POLICY.md` on your website at that URL (required before publish).

---

## 2. App access — Sign-in details

**Does your app require users to sign in?** Yes

**Instructions for reviewers:**

```
Huzz is a social connection app. All features require a signed-in account.

TEST ACCOUNT (create before submit, or use this if you already made one):
Email: playreview@huzz.com
Password: HuzzReview2026!

Steps to test:
1. Install the app and tap Sign in / Log in
2. Sign in with the test email and password above
3. If onboarding appears, complete profile (name, age 18+, at least one photo, location)
4. Grant Contacts, Photos, Location, Camera, and Microphone when prompted (required for full access)

To test discovery & chat:
- Use a second test account on another device, or browse Home and Like/Message users

To test Live Random video:
- Open Live from the main navigation
- Tap Start / Find match
- Camera + mic permission required
- Video works in the release build (not Expo Go)

Admin features are not available to normal test accounts.
```

**Important:** Create `playreview@huzz.com` in Firebase/your app before submitting.

---

## 3. Ads

**Does your app contain ads?** No

Huzz does not show third-party advertisements.

---

## 4. Content rating (IARC questionnaire — suggested answers)

| Question area | Answer |
|---------------|--------|
| Category | Social networking / Communication |
| User-generated content | **Yes** — profiles, photos, chat, live video |
| Users can interact | **Yes** — messaging, live chat, video |
| Shares user location | **Yes** — city/region for discovery |
| Violence | No |
| Sexual content | **Possible in user content** — moderated; report/block available |
| Language | **Possible** — user-generated; profanity filtered in chat |
| Controlled substance | No |
| Gambling | No |
| Fear | No |

**Expected rating:** Likely **PEGI 18 / Mature 17+** (social connection + live user interaction + UGC)

Complete Google's questionnaire honestly; social apps with live video usually lands 17+/18+.

---

## 5. Target audience

**Target age group:** 18 and over only

**Is your app designed for children?** No

**Appeal to children:** No

Do **not** select age groups under 18.

---

## 6. Data safety (summary for Play form)

### Data collected

| Data type | Collected | Shared | Purpose | Required |
|-----------|-----------|--------|---------|----------|
| Email address | Yes | No (not sold) | Account, auth | Yes |
| Name | Yes | With other users | Profile | Yes |
| User IDs | Yes | Service providers | Account | Yes |
| Photos | Yes | With other users | Profile, chat | Yes |
| Other in-app messages | Yes | With other users | Chat | Yes |
| Voice/audio | Yes | With other users | Voice notes, Live | Optional (Live) |
| Video | Yes | With session partner | Live Random | Optional |
| Contacts | Yes | Admins for safety | Safety/blocking | **Yes — required** |
| Approximate location | Yes | With other users (city) | Matching | Yes |
| Device IDs | Yes | Service providers | Push, security | Yes |
| Crash logs | Yes | Service providers | Stability | Automatic |
| App interactions | Yes | Internal | Analytics, safety | Automatic |

### Practices

- **Data encrypted in transit:** Yes
- **Data deletion:** Users can request deletion via support@huzz.com
- **Committed to Play Families policy:** N/A (18+ only)

Be accurate: contacts are uploaded to Firebase for safety (required permission gate).

---

## 7. Government apps

**Is this an official government app?** No

---

## 8. Financial features

**Does the app provide financial features?** No

No banking, crypto, loans, or in-app purchases in v1.0.0.

---

## 9. Health

**Does the app provide health-related features?** No

---

## 10. App category & contact details

| Field | Value |
|-------|-------|
| **App category** | Social |
| **Tags** | Social, Chat, Connect freely, Meet new people |
| **Email** | support@huzz.com |
| **Website** | https://huzz.com |
| **Phone** | (optional — leave blank or add business number) |

---

## 11. Store listing

### App name
```
Huzz
```

### Short description (max 80 characters)
```
Meet people nearby. Match, chat, and go live for short random video sessions.
```
(79 characters)

### Full description
```
Huzz is a modern social app to connect freely and build real connections.

SWIPE & MATCH
Browse profiles with photos, bios, and interests. Like someone to show interest, or message them directly. When you both like each other, chat unlocks instantly.

CHAT THAT WORKS
Private messaging with text and voice notes. Block and report tools keep you in control. Optional translation helps you talk across languages.

LIVE RANDOM
Feeling spontaneous? Jump into Live Random for short timed sessions with other signed-in users — text chat plus optional video when you are ready. Skip or leave anytime.

BUILT FOR SAFETY
Location and contacts help keep the community safer. Reporting and moderation protect the experience. Huzz is for adults 18+ only.

Download Huzz, set up your profile, and start meeting people today.

Support: support@huzz.com
Privacy: https://huzz.com/privacy
```

### What's new (first release)
```
Initial release of Huzz — profile discovery, instant messaging, mutual matches, and Live Random video chat.
```

### Graphics you still need to upload manually
- **App icon:** 512×512 PNG (use your logo)
- **Feature graphic:** 1024×500 PNG
- **Phone screenshots:** At least 2 (recommended 4–8) — Home, Chat, Live, Profile
- **7-inch / 10-inch tablet:** Optional for v1

---

## Checklist before you hit Publish

- [ ] Privacy policy live at public URL
- [ ] Test account `playreview@huzz.com` works
- [ ] AAB uploaded (`com.huzz.app` package matches Play app)
- [ ] Content rating completed
- [ ] Data safety form completed
- [ ] Store listing + screenshots uploaded
- [ ] Target audience = 18+ only
