import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Load SUPABASE_URL / SUPABASE_ANON_KEY / DASHBOARD_URL from
// local.properties (gitignored) and expose them as BuildConfig fields.
// See local.properties.example.
val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) {
        file.inputStream().use { load(it) }
    }
}
val supabaseUrl: String = localProperties.getProperty("SUPABASE_URL") ?: ""
val supabaseAnonKey: String = localProperties.getProperty("SUPABASE_ANON_KEY") ?: ""
// The web dashboard's own URL (SITE_URL in dashboard/.env.local.example)
// -- used only to hand off Google Calendar connect/sync to a browser (see
// ui/CalendarScreen.kt's doc comment for why that's not done natively).
val dashboardUrl: String = localProperties.getProperty("DASHBOARD_URL") ?: "http://localhost:3000"

android {
    namespace = "com.healthsync.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.healthsync.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"$supabaseAnonKey\"")
        buildConfigField("String", "DASHBOARD_URL", "\"$dashboardUrl\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    // Health Connect
    implementation("androidx.health.connect:connect-client:1.1.0")

    // Core / lifecycle
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.4")
    implementation("androidx.activity:activity-compose:1.9.1")

    // Compose
    implementation(platform("androidx.compose:compose-bom:2024.06.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")

    // Background sync
    implementation("androidx.work:work-runtime-ktx:2.9.1")

    // Local key/value store for sync cursors (per-record-type changes tokens)
    // and non-sensitive session mirror state (see auth/SessionStore.kt).
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    // Encrypted at-rest storage for the Supabase session's access/refresh
    // tokens (see auth/SessionStore.kt) -- these are real credentials,
    // unlike the sync_code they replace, which was never encrypted.
    implementation("androidx.security:security-crypto:1.1.0")

    // Login -> VerifyCode -> Home navigation graph (see ui/nav/).
    implementation("androidx.navigation:navigation-compose:2.8.0")

    // Networking (direct PostgREST + Supabase Auth REST calls)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
