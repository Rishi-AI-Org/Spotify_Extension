# Building a release APK

A signed release APK is what you'll share with people you're recruiting.
**This is a one-time setup**, then a 30-second command for every future release.

## One-time: create a keystore

A keystore is a file that Android uses to verify "yes, this update came
from the same developer who shipped the original". **Keep it safe** —
losing it means you cannot ship updates to anyone who has the current
version (they'd have to uninstall + reinstall to switch).

In PowerShell, from anywhere:

```powershell
# Find the keytool that came with your JDK (Android Studio ships one).
# Default Android Studio path:
$keytool = "$env:LOCALAPPDATA\Programs\Android Studio\jbr\bin\keytool.exe"

# Create a 25-year keystore. Pick passwords you'll remember.
& $keytool -genkey -v `
    -keystore C:\Users\$env:USERNAME\groovy-release.jks `
    -keyalg RSA -keysize 2048 -validity 9125 `
    -alias groovy
```

It'll ask for:
- A keystore password (write it down)
- A key password (use the same for simplicity)
- Your name, org, city, etc. (any answers — only stored in the cert)

You now have `C:\Users\<you>\groovy-release.jks`. **Back this file up.**
Copy it to your Google Drive / Dropbox / a USB stick.

## Tell Gradle where the keystore is

In the repo, create `android/keystore.properties` (this file is gitignored):

```properties
storeFile=C:/Users/mba24/groovy-release.jks
storePassword=<the keystore password you set>
keyAlias=groovy
keyPassword=<the key password you set>
```

> Use forward slashes in `storeFile` even on Windows.

## Build the release APK

```powershell
cd C:\Users\mba24\Spotify_Extension\android
.\gradlew assembleRelease
```

(If `.\gradlew` doesn't exist yet, open the project once in Android Studio
to generate the wrapper, then it will.)

The signed APK comes out at:

```
android\app\build\outputs\apk\release\app-release.apk
```

## Distribute it

Three options, in order of "easy → polished":

### Option A — host on your Render backend (simplest)

1. Copy the APK into the backend's `public/` folder:
   ```powershell
   copy android\app\build\outputs\apk\release\app-release.apk `
        public\groovy-collector.apk
   ```
2. Commit and push:
   ```powershell
   git add public\groovy-collector.apk
   git commit -m "Release APK v0.1.0"
   git push
   ```
3. Render auto-redeploys. The APK is now at:
   `https://<your-backend>.onrender.com/groovy-collector.apk`
4. The dashboard footer already links to that path — just share the
   dashboard URL with prospective users.

Downsides: APK lives in git (small repo bloat), every release adds a
commit. Fine for the first dozen releases.

### Option B — GitHub Releases

1. On GitHub, go to the repo → **Releases → Draft a new release**.
2. Tag: `v0.1.0`. Title: same.
3. Drag `app-release.apk` into the binaries area.
4. Publish.
5. Update the dashboard footer link to point at the release URL.

Cleaner versioning, no git bloat, but one more click for users.

### Option C — Google Play Store

Free $25 one-time developer registration, then your app shows up in the
Play Store. Worth doing once you have ~50 users and want to scale.

## What users do on their end

1. Click the download link → APK downloads.
2. Tap the APK → Android asks "Allow installs from this source?"
3. Tap Settings → enable "Allow from this source" → back → Install.
4. Open the app. Grant notification access. Done.

The "unknown source" prompt is normal for any sideloaded app and isn't
something we can avoid without Play Store distribution.
