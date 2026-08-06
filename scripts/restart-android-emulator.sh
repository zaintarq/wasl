#!/usr/bin/env bash
# Restart the default Android emulator cleanly (fixes "quit before it finished opening").
set -euo pipefail

AVD="${ANDROID_AVD:-Medium_Phone_API_36}"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
EMULATOR="$SDK/emulator/emulator"
ADB="$SDK/platform-tools/adb"

if [[ ! -x "$EMULATOR" ]]; then
  echo "Android emulator not found at: $EMULATOR"
  echo "Install Android Studio → SDK Manager → Android Emulator."
  exit 1
fi

echo "Stopping stale emulator / adb sessions…"
"$ADB" devices 2>/dev/null | awk '/emulator-/{print $1}' | while read -r serial; do
  "$ADB" -s "$serial" emu kill 2>/dev/null || true
done
pkill -f "qemu-system-aarch64 @$AVD" 2>/dev/null || true
sleep 2
"$ADB" kill-server 2>/dev/null || true
"$ADB" start-server

echo "Starting $AVD (cold boot)…"
nohup "$EMULATOR" "@$AVD" -no-snapshot-load -gpu host >/tmp/huzz-android-emulator.log 2>&1 &

echo -n "Waiting for emulator"
for _ in $(seq 1 90); do
  state="$("$ADB" devices 2>/dev/null | awk '/emulator-5554/{print $2}' || true)"
  if [[ "$state" == "device" ]]; then
    echo ""
    echo "Emulator ready. Run: npx expo start --android"
    exit 0
  fi
  echo -n "."
  sleep 2
done

echo ""
echo "Emulator did not come online in time. Log: /tmp/huzz-android-emulator.log"
tail -20 /tmp/huzz-android-emulator.log || true
exit 1
