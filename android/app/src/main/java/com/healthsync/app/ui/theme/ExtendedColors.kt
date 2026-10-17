package com.healthsync.app.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

// Material3's ColorScheme has a slot for error (primary/secondary/tertiary/
// error) but none for success/warning/info -- three semantic colors new
// this pass, matching the web app's --success/--warning/--info. Exposed
// through a small CompositionLocal instead, provided once by
// HealthSyncTheme (see Theme.kt) and read anywhere under it via
// ExtendedColors.current. No screen currently shows a success/warning/info
// state (confirmed by this pass's own audit) -- this only establishes the
// tokens; wiring one into a specific screen is left to whichever later
// change actually needs it.
data class ExtendedColorScheme(
    val success: Color,
    val warning: Color,
    val info: Color,
)

val LightExtendedColors = ExtendedColorScheme(
    success = LightSuccess,
    warning = LightWarning,
    info = LightInfo,
)

val DarkExtendedColors = ExtendedColorScheme(
    success = DarkSuccess,
    warning = DarkWarning,
    info = DarkInfo,
)

val LocalExtendedColors = staticCompositionLocalOf { LightExtendedColors }

object ExtendedColors {
    val current: ExtendedColorScheme
        @Composable
        get() = LocalExtendedColors.current
}
