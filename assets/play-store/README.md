# Play Store listing assets

Generated from `assets/images/app-logo.png` via:

```bash
npm run store:assets
```

## Upload these in Google Play Console → Store listing

| Asset | File | Spec |
|-------|------|------|
| **App icon** | `icon-512.png` | 512×512 PNG, under 1 MB |
| **Feature graphic** | `feature-graphic-1024x500.png` | 1024×500 PNG, under 15 MB |

## Phone screenshots (you still need 2+)

Play requires **at least 2 phone screenshots** (9:16 portrait recommended).

Options:
1. Run the app on a phone/emulator and take screenshots of Home, Chat, Live, Profile
2. Save as PNG/JPEG, 1080×1920 or similar (between 320px and 3840px per side)

Drop screenshots in `assets/play-store/screenshots/` if you want to keep them in the repo.

## App build icons (Expo / Android)

- `assets/images/icon-1024.png` — main Expo app icon
- `assets/images/adaptive-icon-1024.png` — Android adaptive icon foreground
- `assets/images/app-logo.png` — original full artwork (keep as source)
