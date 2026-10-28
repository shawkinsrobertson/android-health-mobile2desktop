package com.healthsync.app.ui.theme

import androidx.compose.ui.graphics.Color

// Design-system tokens, matching dashboard/app/globals.css -- a basic
// light/dark neutral scale plus the same warm accent. There's no separate
// card-surface tone: cards and the page they sit on share Primary, and a
// card reads as distinct via its own border + elevation instead (see
// Theme.kt). TextTertiary is only given for dark mode in the source
// mockups; light mode reuses the same near-black since it's the color for
// text/icons on top of an Accent-colored surface (used via the onPrimary
// ColorScheme role only -- see Theme.kt), and Accent itself is
// theme-invariant.

// Light theme
val LightPrimary = Color(0xFFFFFFFF)
val LightAccent = Color(0xFFC1573B)
val LightTextPrimary = Color(0xFF171717)
val LightTextSecondary = Color(0xFF525252)
val LightTextTertiary = Color(0xFF171717)

// Dark theme
val DarkPrimary = Color(0xFF171717)
val DarkAccent = Color(0xFFC1573B)
val DarkTextPrimary = Color(0xFFFAFAFA)
val DarkTextSecondary = Color(0xFFA3A3A3)
val DarkTextTertiary = Color(0xFF171717)

// Semantic colors (new this pass -- didn't exist before). Follow the same
// 600-light/400-dark convention as the web app's --success/--warning/
// --danger/--info, so both platforms show the identical stoplight colors.
// Danger feeds Theme.kt's error/onError; success/warning/info have no
// Material3 ColorScheme slot, so they're exposed via ExtendedColors.kt.
val LightSuccess = Color(0xFF16A34A)
val LightWarning = Color(0xFFD97706)
val LightDanger = Color(0xFFDC2626)
val LightInfo = Color(0xFF0284C7)

val DarkSuccess = Color(0xFF4ADE80)
val DarkWarning = Color(0xFFFBBF24)
val DarkDanger = Color(0xFFF87171)
val DarkInfo = Color(0xFF38BDF8)
