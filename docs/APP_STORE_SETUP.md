# Huzz — Apple Developer + App Store (step-by-step)

No 14-day closed test like Google Play. You pay **$99/year**, build iOS, fill App Store Connect, submit for review (~1–3 days).

**Your app:** `com.huzz.app` · Expo + EAS · Project ID already in `app.json`

---

## PART 1 — Create Apple Developer account

### What you need
- Apple ID (use a real email you control long-term)
- **Two-factor authentication** ON for that Apple ID
- **$99 USD / year** (credit/debit card)
- Government ID (Apple may verify identity — can take **24–48 hours**)

### Steps
1. Go to **https://developer.apple.com/programs/enroll/**
2. Click **Start Your Enrollment**
3. Sign in with your Apple ID
4. Choose account type:
   - **Individual** — fastest; app shows your name (e.g. Saud Bilal)
   - **Organization** — needs D‑U‑N‑S number; skip unless you have a company
5. Accept agreement → pay **$99**
6. Complete identity verification if asked
7. Wait for **“Welcome to the Apple Developer Program”** email

### After approval
- **Developer portal:** https://developer.apple.com/account
- **App Store Connect:** https://appstoreconnect.apple.com

---

## PART 2 — Register your app ID (bundle ID)

1. **developer.apple.com → Certificates, Identifiers & Profiles → Identifiers**
2. **+** → **App IDs** → **App**
3. Description: `Huzz`
4. Bundle ID: **Explicit** → `com.huzz.app` (must match `app.json`)
5. Capabilities — enable:
   - **Push Notifications** (if you use expo-notifications)
   - **Sign In with Apple** (required if Google sign-in exists on iOS — see Part 8)
6. **Register**

---

## PART 3 — Create the app in App Store Connect

1. **appstoreconnect.apple.com → Apps → + → New App**
2. Platforms: **iOS**
3. Name: **Huzz**
4. Primary language: **English (U.K.)** or **English (U.S.)**
5. Bundle ID: select **com.huzz.app**
6. SKU: `huzz-ios` (any unique string)
7. User access: **Full Access**

---

## PART 4 — Install EAS CLI and log in

On your Mac, in the project folder:

```bash
npm install -g eas-cli
cd /Users/muhammad-zain/Desktop/huzz
eas login
```

Use your Expo account (create one at expo.dev if needed).

Your project already has EAS project ID in `app.json` — good.

---

## PART 5 — Build iOS (.ipa) with EAS

First build (EAS creates certificates for you):

```bash
eas build --platform ios --profile production
```

- Choose **Let EAS manage credentials** when prompted (easiest)
- Wait ~15–30 min on Expo dashboard: https://expo.dev
- Download the `.ipa` when done (optional — submit can use build ID)

**Before building**, ensure env vars are set for production (LiveKit URL etc.) in EAS secrets:

```bash
eas secret:create --scope project --name EXPO_PUBLIC_LIVEKIT_URL --value "wss://YOUR-LIVEKIT-URL"
```

Add any other `EXPO_PUBLIC_*` vars your app needs.

---

## PART 6 — Upload to App Store Connect

### Option A — EAS Submit (recommended)

```bash
eas submit --platform ios --latest
```

Or:

```bash
eas submit --platform ios --path path/to/build.ipa
```

First time: link **App Store Connect API key** or sign in with Apple ID when prompted.

### Option B — Transporter app (Mac App Store)
Download **Transporter**, drag the `.ipa`, upload.

After upload, wait **5–30 min** — build appears under **App Store Connect → Huzz → TestFlight** (and later under the version’s build picker).

---

## PART 7 — App Store listing (copy & paste)

### App Information
| Field | Value |
|-------|--------|
| Name | Huzz |
| Subtitle (30 chars) | Meet, match & chat — 18+ |
| Category | Social Networking |
| Secondary | Lifestyle |
| Age rating | **17+** (complete questionnaire — social connection, UGC, unrestricted web) |
| Privacy Policy URL | https://zaintarq.github.io/huzz/privacy.html |

### Description (use/adapt from PLAY_STORE_LISTING.txt)
Paste the full Huzz description from `docs/PLAY_STORE_LISTING.txt`.

Add line: **Sign in with Apple, email, or Google.**

### Keywords (100 chars max)
```
connect,social,chat,meet,people,live,video,friends,18,connect freely
```

### Support URL
```
mailto:support@huzz.com
```
Or a simple support page if you have one.

### Marketing URL (optional)
Your website or GitHub Pages if any.

### Screenshots (required)
**Real in-app UI only** — same rule as Google Play.

| Device | Size (portrait) |
|--------|------------------|
| iPhone 6.7" | 1290 × 2796 (iPhone 15 Pro Max) |
| iPhone 6.5" | 1284 × 2778 (older large) |

Minimum **3–10 screenshots** per size. Capture on iOS Simulator or iPhone:
- Home / discover
- Chat
- Profile
- Live Random (optional)

```bash
# Run iOS simulator locally (after first eas build or expo prebuild)
npx expo run:ios
```

### App icon
1024×1024 PNG, no transparency — use `assets/images/icon-1024.png`

---

## PART 8 — App Privacy (Nutrition Labels)

**App Store Connect → App Privacy → Get Started**

Declare what you collect (be honest — matches your privacy policy):

| Data | Purpose |
|------|---------|
| Email, name | Account |
| Photos / videos | Profile, chat |
| Location (coarse) | Matching |
| Contacts | Safety (if you collect on iOS) |
| User content | Chat, profiles |
| Device ID | Analytics / push (if used) |

Mark if linked to user, used for tracking, etc.

---

## PART 9 — App Review information

**App Store Connect → your version → App Review Information**

```
Huzz is an 18+ social connection app. Connect freely. Sign-in required.

TEST ACCOUNT:
Email: playreview@huzz.com
Password: HuzzReview2026!

Steps:
1. Open app → Sign in with email/password above
2. Complete onboarding (18+, photo, location if prompted)
3. Home feed: browse profiles, like, message
4. Chat: send text / voice note
5. Live Random: optional video (camera/mic when enabled)

Sign in with Apple and Google also available.

Note: Create playreview@huzz.com in Firebase before submit.
```

Add your phone number for Apple to call if needed.

---

## PART 10 — Export compliance & content rights

When submitting the version:

- **Encryption:** Usually “Yes” → exempt (standard HTTPS only) — same as most apps
- **Content rights:** You own or have rights to all content
- **Advertising identifier:** No (unless you added ads)

---

## PART 11 — Submit for review

1. **App Store Connect → Huzz → iOS App → + Version** (e.g. **1.0.0**)
2. Select the **build** you uploaded
3. Fill **What’s New:** `Initial release`
4. Complete all red warnings on the left sidebar
5. **Add for Review** → **Submit to App Review**

Review: typically **24–72 hours**. Check email for approve/reject.

---

## PART 12 — After approval

- Choose **Manually release** or **Automatic release**
- App goes live on App Store
- Updates: bump version in `app.json` → `eas build --platform ios --profile production` → `eas submit` → new version in Connect → submit again (**no 14-day wait**)

---

## Optional — TestFlight (beta before App Store)

1. After first iOS build uploads, go to **TestFlight** tab
2. Add **Internal testers** (your Apple ID team — instant)
3. Or **External testers** (needs brief Beta App Review first)
4. Share TestFlight link — mates install without App Store public listing

---

## Important warnings for Huzz

### 1. Sign in with Apple (likely required)
You offer **Google sign-in**. Apple **requires Sign in with Apple** on iOS too.

- Package installed: `expo-apple-authentication`
- `usesAppleSignIn: true` in `app.json`
- **You still need to implement the button in login UI** and enable capability on App ID

Until that works on iOS, review may reject.

### 2. Contacts + bulk photo upload
Apple is strict. Mandatory contacts/photo sync may get **rejected**. Be ready to explain in Review Notes or make optional on iOS.

### 3. Social connection + live video
Expect **17+** rating and possible extra questions. Have block/report and moderation documented.

### 4. No `ios/` folder yet
Normal for Expo. **EAS Build** generates native project in the cloud — you don’t need Xcode locally unless debugging.

---

## Quick command checklist

```bash
# One-time
npm install -g eas-cli
eas login

# Secrets (if needed)
eas secret:create --scope project --name EXPO_PUBLIC_LIVEKIT_URL --value "wss://..."

# Build + submit
eas build --platform ios --profile production
eas submit --platform ios --latest
```

---

## Timeline estimate

| Step | Time |
|------|------|
| Apple Developer enrollment | 1–48 hours |
| First EAS iOS build | ~30 min |
| App Store Connect setup | 2–4 hours |
| App Review | 1–3 days |
| **Total to live** | ~3–7 days (no 14-day tester wait) |

---

## Links

- Enroll: https://developer.apple.com/programs/enroll/
- App Store Connect: https://appstoreconnect.apple.com
- EAS docs: https://docs.expo.dev/submit/ios/
- Expo Apple Auth: https://docs.expo.dev/versions/latest/sdk/apple-authentication/
