# Chat translation

## App (native)

- **Android:** On-device translation with **Google ML Kit** (`@react-native-ml-kit/translate-text` + `@react-native-ml-kit/identify-languages`). Models download on first use; works offline after that. The npm translate package is **alpha** — monitor for updates.
- **iOS:** The same ML Kit translate package currently ships a **stub iOS native module**, so the app uses the **cloud fallback** below (same as web).
- **Rebuild required:** After `npm install`, run **`npx expo prebuild`** (or EAS Build) and **`npx pod-install`** on iOS so native modules link — **not** Expo Go–only.

## Cloud fallback (web, iOS, Android errors)

The callable **`translateChatMessage`** uses **MyMemory** (`api.mymemory.translated.net`) — **no Google Cloud Translation API** billing, no Translation API key.

### How the callable works

- MyMemory **no longer accepts** `auto` as a source language in `langpair`. The function picks an explicit **source** using Unicode script ranges (Arabic, Cyrillic, CJK, etc.); **Latin script defaults to English** so short messages like “yo” use `en|…`. Same-language source/target returns the original text without calling the API.
- Fair-use limits apply (see [their docs](https://mymemory.translated.net/doc/spec.php)): anonymous use is meant for **personal / low volume**. If you hit the daily cap, users see a clear error until the next day.

## Optional: higher free quota

Register a contact email with MyMemory and set it for Cloud Functions:

```bash
firebase functions:config:set mymemory.contact_email="you@example.com"
```

The function uses **`firebase functions:config`** (`mymemory.contact_email`) or **`MYMEMORY_CONTACT_EMAIL`** if your host injects env vars.

## Deploy

1. Open a terminal and **`cd` into your project folder** — the one that contains **`firebase.json`** (e.g. on your Mac: `cd ~/Desktop/huzz`).  
   **Do not** use a fake path like `/path/to/huzz`; that was only a placeholder meaning “your repo root”.

2. From that folder, run:

```bash
cd functions && npm install && cd .. && firebase deploy --only functions:translateChatMessage
```

No GCP “Translation API” enablement required.

### Error: `already in progress` / `FAILED_PRECONDITION` (HTTP 400)

If **`--debug`** shows:

`An operation on function translateChatMessage ... is already in progress`

then Google Cloud is still **finishing a previous** deploy or **Cloud Build** is running. You **cannot** start another update until that finishes.

**Do this:**

1. **Stop spamming deploy** — only one update at a time.
2. Open **[Cloud Build → History](https://console.cloud.google.com/cloud-build/builds?project=huzz-10264)** (project `huzz-10264`). Wait until the build for `translateChatMessage` is **Success** or **Failed**. If one is **Working** for a long time, wait or **cancel** it (only if stuck 30+ min).
3. Wait **10–20 minutes** after the last attempt, then run deploy **once** again.
4. If it **never** clears after an hour: delete the function and recreate (short downtime for this function only):
   ```bash
   firebase functions:delete translateChatMessage --region us-central1 --force
   firebase deploy --only functions:translateChatMessage
   ```

### Other deploy failures

1. **Run with debug** and search for `"message"` in the JSON:
   ```bash
   firebase deploy --only functions:translateChatMessage --debug 2>&1 | tee firebase-deploy-debug.log
   ```
2. **Cloud Build** logs for the real build error.
3. Update CLI: `npm install -g firebase-tools@latest`
4. If builds keep failing on **Node 22**, try **`"engines": { "node": "20" }`** in `functions/package.json`, then redeploy.

## Quality note

Free crowd/API quality is **good enough for chat**, but not identical to DeepL or Google. If you outgrow limits, you can switch the function body to another provider later while keeping the same app API.
