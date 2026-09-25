package com.healthsync.app.ui.theme

import androidx.compose.ui.graphics.Color

// Design-system tokens (2026 UI pass), matching dashboard/app/globals.css.
// --text-tertiary is only given for dark mode in the source mockups; light
// mode reuses the same dark-brown since it's the color for text/icons on
// top of an Accent-colored surface, and Accent itself is theme-invariant.

// Light theme
val LightPrimary = Color(0xFFFFFDFB)
val LightSecondary = Color(0xFFF7F1E8)
val LightAccent = Color(0xFFC1573B)
val LightTextPrimary = Color(0xFF3A2E27)
val LightTextSecondary = Color(0xFF675E59)
val LightTextTertiary = Color(0xFF281E18)

// Dark theme
val DarkPrimary = Color(0xFF281E18)
val DarkSecondary = Color(0xFF675E59)
val DarkAccent = Color(0xFFC1573B)
val DarkTextPrimary = Color(0xFFFFFDFB)
val DarkTextSecondary = Color(0xFFF7F1E8)
val DarkTextTertiary = Color(0xFF281E18)
