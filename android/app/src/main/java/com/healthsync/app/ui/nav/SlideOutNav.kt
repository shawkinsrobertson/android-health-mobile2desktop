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
import androidx.compose.material3.Icon
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.healthsync.app.R

// [iconRes] is the icon set's drawable for this destination; [glyph] is a
// plain-text fallback for destinations the icon set doesn't cover yet.
// Set exactly one. [tinted] controls whether [iconRes] gets recolored to
// match the nav's contentColor (true, the default -- for the monochrome
// line icons) or renders with its own baked-in colors as-is (false --
// for a multi-color asset like the Profile placeholder avatar, which is
// meant to look the same regardless of surrounding theme).
data class NavDestination(
    val label: String,
    val iconRes: Int? = null,
    val tinted: Boolean = true,
    val glyph: String? = null,
    val onClick: () -> Unit,
)

// Bottom-left slide-out nav: a single round button that, tapped, expands
// into a pill row of destination icons (stats/workouts/calendar/inbox/
// profile) -- tapping the same arrow again collapses it, per the mockup.
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
        NavIconButton(
            iconRes = R.drawable.ic_nav_toggle,
            contentDescription = if (open) "Close menu" else "Open menu",
            rotationDegrees = if (open) 180f else 0f,
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
                    if (destination.iconRes != null) {
                        NavIconButton(
                            iconRes = destination.iconRes,
                            contentDescription = destination.label,
                            contentColor = if (destination.tinted) MaterialTheme.colorScheme.onPrimary else Color.Unspecified,
                            onClick = {
                                open = false
                                destination.onClick()
                            },
                        )
                    } else {
                        NavGlyphButton(
                            glyph = destination.glyph.orEmpty(),
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
}

@Composable
private fun NavIconButton(
    iconRes: Int,
    contentDescription: String?,
    contentColor: Color,
    onClick: () -> Unit,
    rotationDegrees: Float = 0f,
) {
    Row(
        modifier = Modifier
            .size(44.dp)
            .clip(CircleShape)
            .clickable(onClick = onClick),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            painter = painterResource(iconRes),
            contentDescription = contentDescription,
            tint = contentColor,
            modifier = Modifier.size(22.dp).rotate(rotationDegrees),
        )
    }
}

@Composable
private fun NavGlyphButton(glyph: String, contentColor: Color, onClick: () -> Unit) {
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
