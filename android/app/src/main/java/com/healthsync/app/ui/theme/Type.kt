package com.healthsync.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.healthsync.app.R

// Archivo (Title/Header/Button) + Open Sans (Body/Links/Secondary Text),
// matching dashboard's font-display/font-sans and the design system's
// typography scale (see tailwind.config.ts's fontSize entries for the
// same title/h1/h2/h3/button/body/link/body-sm scale on the web side).
val Archivo = FontFamily(
    Font(R.font.archivo_medium, FontWeight.Medium),
    Font(R.font.archivo_semibold, FontWeight.SemiBold),
    Font(R.font.archivo_extrabold, FontWeight.ExtraBold),
)

val OpenSans = FontFamily(
    Font(R.font.open_sans_regular, FontWeight.Normal),
    Font(R.font.open_sans_semibold, FontWeight.SemiBold),
)

val HealthSyncTypography = Typography(
    displayLarge = TextStyle( // Title
        fontFamily = Archivo,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 60.sp,
        lineHeight = 66.sp,
    ),
    headlineLarge = TextStyle( // Header 1
        fontFamily = Archivo,
        fontWeight = FontWeight.SemiBold,
        fontSize = 40.sp,
        lineHeight = 46.sp,
    ),
    headlineMedium = TextStyle( // Header 2
        fontFamily = Archivo,
        fontWeight = FontWeight.SemiBold,
        fontSize = 32.sp,
        lineHeight = 38.sp,
    ),
    headlineSmall = TextStyle( // Header 3
        fontFamily = Archivo,
        fontWeight = FontWeight.SemiBold,
        fontSize = 28.sp,
        lineHeight = 34.sp,
    ),
    labelLarge = TextStyle( // Button text
        fontFamily = Archivo,
        fontWeight = FontWeight.Medium,
        fontSize = 20.sp,
        lineHeight = 26.sp,
    ),
    bodyLarge = TextStyle( // Body
        fontFamily = OpenSans,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
    ),
    bodyMedium = TextStyle( // Links (same size as Body, Semi-Bold weight)
        fontFamily = OpenSans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 24.sp,
    ),
    bodySmall = TextStyle( // Secondary text
        fontFamily = OpenSans,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
)
