# Cloud Functions (default codebase)

OTP / email / Wali / chat moderation — **no TensorFlow** (lighter deploys).

## SMTP (required for OTP emails)

After deploy, set Gmail app password (not your normal Gmail password):

```bash
firebase functions:config:set smtp.user="your-sender@gmail.com" smtp.password="YOUR_APP_PASSWORD"
```

Or set `SMTP_USER` and `SMTP_PASSWORD` as environment variables on the Cloud Functions service in Google Cloud Console.

Redeploy after changing config:

```bash
firebase deploy --only functions
```

## Image moderation

Profile image NSFW checks live in **`../functions-moderation`** (separate codebase so tfjs/nsfwjs never block email function deploys).

Deploy everything:

```bash
firebase deploy --only functions
```

This deploys both **default** and **moderation** codebases.
