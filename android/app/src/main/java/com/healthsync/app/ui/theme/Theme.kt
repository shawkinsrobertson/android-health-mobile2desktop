package com.healthsync.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

// Material3 role mapping for the design-system tokens (see Color.kt):
// primary/onPrimary -> Accent, since Material's "primary" role is the
// prominent-button/active-element color, matching what Accent is used for
// in the mockups. background/surface -> the design system's own Primary/
// Secondary (page background vs. card surface), which is why Material's
// "primary" role is NOT the same color as the design system's "Primary" --
// that's a naming collision between the two systems, not a mistake.
private val LightColors = lightColorScheme(
    primary = LightAccent,
    onPrimary = LightTextTertiary,
    primaryContainer = LightSecondary,
    onPrimaryContainer = LightTextPrimary,
    secondary = LightSecondary,
    onSecondary = LightTextPrimary,
    background = LightPrimary,
    onBackground = LightTextPrimary,
    surface = LightSecondary,
    onSurface = LightTextPrimary,
    surfaceVariant = LightSecondary,
    onSurfaceVariant = LightTextSecondary,
    outline = LightTextSecondary,
)

private val DarkColors = darkColorScheme(
    primary = DarkAccent,
    onPrimary = DarkTextTertiary,
    primaryContainer = DarkSecondary,
    onPrimaryContainer = DarkTextPrimary,
    secondary = DarkSecondary,
    onSecondary = DarkTextPrimary,
    background = DarkPrimary,
    onBackground = DarkTextPrimary,
    surface = DarkSecondary,
    onSurface = DarkTextPrimary,
    surfaceVariant = DarkSecondary,
    onSurfaceVariant = DarkTextSecondary,
    outline = DarkTextSecondary,
)

@Composable
fun HealthSyncTheme(content: @Composable () -> Unit) {
    val colors = if (isSystemInDarkTheme()) DarkColors else LightColors
    MaterialTheme(colorScheme = colors, typography = HealthSyncTypography, content = content)
}
