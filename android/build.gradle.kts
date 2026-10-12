// Top-level build file. Per-module config lives in app/build.gradle.kts.
//
// Kotlin bumped 1.9.24 -> 2.0.21. Kotlin 2.0 is source-compatible with 1.9
// code (no language-level changes needed here); the Compose Compiler
// Gradle plugin below is required as of Kotlin 2.0 in place of
// app/build.gradle.kts's old composeOptions.kotlinCompilerExtensionVersion.
plugins {
    id("com.android.application") version "8.13.0" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
}
