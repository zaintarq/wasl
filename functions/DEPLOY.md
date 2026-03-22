# Deploy notes

## `Cannot set CPU on moderateProfileImage because they are GCF gen 1`

That happens when **`moderateProfileImage` already exists as a Gen2 (2nd gen) function** in Google Cloud, but your code deploys **Gen1** (1st gen). The same name can’t be updated across generations this way.

### Fix (one time)

**1. Delete the Gen2 function**, then deploy again.

With [Google Cloud SDK](https://cloud.google.com/sdk/docs/install):

```bash
gcloud config set project huzz-10264
gcloud functions delete moderateProfileImage --region=us-central1 --gen2
```

Confirm when prompted. Wait until the delete finishes (~1–2 minutes).

**Or** in [Google Cloud Console](https://console.cloud.google.com/functions?project=huzz-10264) → region **us-central1** → open **`moderateProfileImage`** → if it shows as **2nd gen**, **Delete** it.

**2. Deploy Gen1 from your machine**

```bash
cd /path/to/huzz
firebase deploy --only functions
```

### Callable returns `permission-denied` on forgot password (logged out)

The app falls back to Firebase **“reset password” link** email if the callable is blocked. To allow the **OTP Cloud Function** for anonymous clients anyway:

**Google Cloud Console** → **Cloud Functions** → `sendPasswordResetEmailOtp` → **Permissions** → ensure **Cloud Functions Invoker** includes **allUsers** (or **allAuthenticatedUsers** if you require sign-in — not ideal for forgot password).

`gcloud` example:

```bash
gcloud functions add-iam-policy-binding sendPasswordResetEmailOtp \
  --region=us-central1 --project=huzz-10264 \
  --member=allUsers --role=roles/cloudfunctions.invoker
```

(Use with care; callables are still protected by Firebase App Check if you enforce it.)

### If something is stuck on `DEPLOY_IN_PROGRESS`

Wait a few minutes or open [Cloud Build](https://console.cloud.google.com/cloud-build/builds?project=huzz-10264) and cancel a stuck build, then retry.
