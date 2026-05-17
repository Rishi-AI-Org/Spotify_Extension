import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Optional release signing. Create android/keystore.properties locally
// (gitignored) with: storeFile, storePassword, keyAlias, keyPassword.
// See android/RELEASE.md for the one-time keystore setup.
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps: Properties? = if (keystorePropsFile.exists()) {
    Properties().apply { keystorePropsFile.inputStream().use { load(it) } }
} else null

android {
    namespace = "com.groovy.collector"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.groovy.collector"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
        // Default to the Render-hosted backend; override with -Pbackend=... at build time.
        val backend = (project.findProperty("backend") as String?)
            ?: "https://groovy-spotify-backend.onrender.com"
        buildConfigField("String", "BACKEND_BASE_URL", "\"$backend\"")
    }

    if (keystoreProps != null) {
        signingConfigs {
            create("release") {
                storeFile = rootProject.file(keystoreProps["storeFile"] as String)
                storePassword = keystoreProps["storePassword"] as String
                keyAlias = keystoreProps["keyAlias"] as String
                keyPassword = keystoreProps["keyPassword"] as String
            }
        }
    }

    buildTypes {
        getByName("release") {
            // No minify for now — keeps build simple, APK ~7-8 MB.
            isMinifyEnabled = false
            if (keystoreProps != null) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
