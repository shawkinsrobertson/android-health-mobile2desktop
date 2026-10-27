package com.healthsync.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp

// Material3 role mapping for the design-system tokens (see Color.kt):
// primary/onPrimary -> Accent, since Material's "primary" role is the
// prominent-button/active-element color, matching what Accent is used for
// in the mockups. background/surface -> both the design system's own
// Primary color -- cards and the page they sit on are the same fill now,
// separated only by each card's own border + elevation, not by a second
// background tone (the former Secondary tone). secondary/primaryContainer/
// surfaceVariant stay as Material3 roles other composables reach for, but
// all resolve to Primary too, so nothing accidentally reintroduces the old
// two-tone look. A card-ish element that still needs to read as distinct
// from its background (e.g. a chip sitting on a card) needs its own
// border, same as every top-level card -- see NotificationShade.kt's
// PreviewCard/EventPreviewCard and their date chip for the pattern.
//
// surfaceTint matters here specifically: Material3's Surface (which Card/
// OutlinedCard build on) blends this color over a surface's fill at low
// alpha, proportional to tonalElevation, to simulate elevation -- and
// defaults to `primary` when not set explicitly. Every OutlinedCard here
// sets a nonzero elevation (CardDefaults.outlinedCardElevation), so
// leaving surfaceTint at its default would blend the warm accent onto
// every card, visibly different from the (unelevated) page background
// even though both resolve to the same base color above -- exactly the
// "cards look like a different color than the page" symptom this was
// supposed to fix. Pinning surfaceTint to the same Primary color as
// background/surface makes the blend a no-op, so a card's fill really is
// identical to the page, and only its explicit border marks it as a card.
private val LightColors = lightColorScheme(
    primary = LightAccent,
    onPrimary = LightTextTertiary,
    primaryContainer = LightPrimary,
    onPrimaryContainer = LightTextPrimary,
    secondary = LightPrimary,
    onSecondary = LightTextPrimary,
    background = LightPrimary,
    onBackground = LightTextPrimary,
    surface = LightPrimary,
    onSurface = LightTextPrimary,
    surfaceVariant = LightPrimary,
    onSurfaceVariant = LightTextSecondary,
    surfaceTint = LightPrimary,
    outline = LightTextSecondary,
    // Overrides Material3's own default error red, so this and the web
    // app's --danger show the identical color.
    error = LightDanger,
    onError = Color.White,
)

private val DarkColors = darkColorScheme(
    primary = DarkAccent,
    onPrimary = DarkTextTertiary,
    primaryContainer = DarkPrimary,
    onPrimaryContainer = DarkTextPrimary,
    secondary = DarkPrimary,
    onSecondary = DarkTextPrimary,
    background = DarkPrimary,
    onBackground = DarkTextPrimary,
    surface = DarkPrimary,
    onSurface = DarkTextPrimary,
    surfaceVariant = DarkPrimary,
    onSurfaceVariant = DarkTextSecondary,
    surfaceTint = DarkPrimary,
    outline = DarkTextSecondary,
    error = DarkDanger,
    onError = Color.White,
)

@Composable
fun HealthSyncTheme(content: @Composable () -> Unit) {
    val isDark = isSystemInDarkTheme()
    val colors = if (isDark) DarkColors else LightColors
    val extendedColors = if (isDark) DarkExtendedColors else LightExtendedColors
    CompositionLocalProvider(LocalExtendedColors provides extendedColors) {
        MaterialTheme(colorScheme = colors, typography = HealthSyncTypography, content = content)
    }
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
