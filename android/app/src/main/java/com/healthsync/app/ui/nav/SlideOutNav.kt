package com.healthsync.app.ui.nav

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp

data class NavDestination(val label: String, val glyph: String, val onClick: () -> Unit)

// Bottom-left slide-out nav: a single round button that, tapped, expands
// into a pill row of destination glyphs (workouts/calendar/inbox/
// profile) -- tapping the same arrow again collapses it, per the mockup.
// Glyphs are plain emoji Text rather than Material icons, same reasoning
// as NotificationShade (no material-icons-extended dependency here).
@Composable
fun SlideOutNav(destinations: List<NavDestination>, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }

    Row(
        modifier = modifier
            .clip(RoundedCornerShape(28.dp))
            .background(MaterialTheme.colorScheme.primary)
            .padding(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NavGlyphButton(
            glyph = if (open) "←" else "→", // ← / →
            contentColor = MaterialTheme.colorScheme.onPrimary,
            onClick = { open = !open },
        )

        AnimatedVisibility(
            visible = open,
            enter = expandHorizontally() + fadeIn(),
            exit = shrinkHorizontally() + fadeOut(),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                destinations.forEach { destination ->
                    NavGlyphButton(
                        glyph = destination.glyph,
                        contentColor = MaterialTheme.colorScheme.onPrimary,
                        onClick = {
                            open = false
                            destination.onClick()
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun NavGlyphButton(glyph: String, contentColor: androidx.compose.ui.graphics.Color, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .size(44.dp)
            .clip(CircleShape)
            .clickable(onClick = onClick),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(glyph, color = contentColor, style = MaterialTheme.typography.bodyLarge)
    }
}
