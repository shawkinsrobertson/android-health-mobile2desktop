package com.healthsync.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp

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

// Applied once, behind the whole app (see MainActivity), rather than
// per-screen -- every screen's own Scaffold/Surface sets its background to
// Color.Transparent so this shows through consistently instead of each one
// painting over it with a flat color. Light theme keeps the flat
// background per the design spec (gradient is dark-only); a barely-lighter
// tone top-left to background color bottom-right keeps it "slight" rather
// than a visible band.
@Composable
fun dashboardBackgroundBrush(): Brush {
    val background = MaterialTheme.colorScheme.background
    if (!isSystemInDarkTheme()) return Brush.linearGradient(listOf(background, background))
    val lighter = lerp(background, Color.White, 0.06f)
    return Brush.linearGradient(
        colors = listOf(lighter, background),
        start = Offset.Zero,
        end = Offset.Infinite,
    )
}
