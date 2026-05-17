# Groovy Collector (Android)

Silent, anonymous data collector for the Groovy Spotify project. It uses
Android's `NotificationListenerService` + `MediaSessionManager` to observe
Spotify's playback state and upload skip / seek timing to the backend.
**No Spotify API access is required** — bypasses the Feb-2026 dev-mode
5-user cap entirely.

## What it captures

For every track change in Spotify, it records:
- artist, title, duration
- position at which the previous track ended
- whether that ending was a manual skip, a seek-forward, or a natural transition

Events are buffered in local SQLite. Every ~30 minutes a `WorkManager` job:
1. Classifies which buffered events belong to a "party session" (≥3 of last 4 transitions were mid-song skips).
2. Trims the first 2 and last 2 tracks of each party window (warm-up/cool-down).
3. POSTs the trimmed batch to `${BACKEND_BASE_URL}/api/events/batch` with an anonymous device UUID.
4. Deletes uploaded events from the local buffer.

Non-party events are discarded locally — they never leave the device.

## Build

Open `android/` in Android Studio (Hedgehog or newer) and run on a device
with Spotify installed. Minimum Android 8.0 (API 26).

CLI build (requires Android SDK + Gradle 8.x):

```bash
cd android
gradle wrapper          # one-time: generates gradle/wrapper/* and gradlew
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

Override the backend URL at build time:

```bash
./gradlew assembleDebug -Pbackend=https://your-backend.example.com
```

## First run

1. Open the app.
2. Tap **Grant notification access** → toggle "Groovy Collector" on in the
   system settings page that opens.
3. Return to the app — status should read "Listening to Spotify".
4. Open Spotify and play music as normal.

## Privacy

- Generates a random UUID at first launch; this is the only identifier sent
  to the backend.
- Notification access is used only to subscribe to Spotify's MediaSession
  (we do not read notifications of any other app).
- Audio is never recorded. The app reads only the metadata that Spotify
  publishes alongside its media notification: artist, title, duration,
  position.
- Uploaded data is only the trimmed contents of detected party sessions.
- All local data can be wiped by uninstalling the app.
