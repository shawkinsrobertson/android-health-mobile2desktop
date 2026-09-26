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

private val BUTTON_SIZE = 52.dp
private val ICON_SIZE = 26.dp
private val PILL_RADIUS = 32.dp
private val PILL_PADDING = 6.dp
private val ITEM_SPACING = 6.dp

// Bottom-left slide-out nav: collapsed, it's a single round toggle button;
// tapped, it expands into a pill of destination icons (workouts/calendar/
// inbox/stats/profile) with the same toggle arrow now at the *end* of the
// row, tapping it again collapses back to just the round button -- per
// the mockup, where the collapsed state's lone circular arrow button
// visually IS the expanded pill's trailing arrow icon.
//
// [expanded]/[onToggleExpanded] are hoisted by the caller (MainActivity)
// rather than `remember`ed internally here, so the open/closed state
// survives navigating to a destination and back to Home -- SlideOutNav
// itself gets torn down and recomposed fresh on that round trip (it's
// nested inside HomeScreen, which AuthNavHost's `composable(ROUTE_HOME)`
// recreates every time Home is re-entered), so internal `remember` state
// would have reset to closed on every return.
@Composable
fun SlideOutNav(
    destinations: List<NavDestination>,
    expanded: Boolean,
    onToggleExpanded: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(PILL_RADIUS))
            .background(MaterialTheme.colorScheme.primary)
            .padding(PILL_PADDING),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // The trailing spacer is INSIDE AnimatedVisibility's content, not
        // on the outer Row (an earlier draft put ITEM_SPACING on the
        // outer Row's own Arrangement.spacedBy, which left a spurious gap
        // baked into the collapsed pill -- AnimatedVisibility still
        // counts as a layout child at zero width when invisible, so
        // spacedBy still inserted a gap before the toggle button even
        // with nothing expanded to justify it). Keeping the spacer inside
        // means it collapses to nothing right along with everything else
        // in here.
        AnimatedVisibility(
            visible = expanded,
            enter = expandHorizontally() + fadeIn(),
            exit = shrinkHorizontally() + fadeOut(),
        ) {
            Row(
                modifier = Modifier.padding(end = ITEM_SPACING),
                horizontalArrangement = Arrangement.spacedBy(ITEM_SPACING),
            ) {
                destinations.forEach { destination ->
                    if (destination.iconRes != null) {
                        NavIconButton(
                            iconRes = destination.iconRes,
                            contentDescription = destination.label,
                            contentColor = if (destination.tinted) MaterialTheme.colorScheme.onPrimary else Color.Unspecified,
                            onClick = {
                                onToggleExpanded()
                                destination.onClick()
                            },
                        )
                    } else {
                        NavGlyphButton(
                            glyph = destination.glyph.orEmpty(),
                            contentColor = MaterialTheme.colorScheme.onPrimary,
                            onClick = {
                                onToggleExpanded()
                                destination.onClick()
                            },
                        )
                    }
                }
            }
        }

        NavIconButton(
            iconRes = R.drawable.ic_nav_toggle,
            contentDescription = if (expanded) "Close menu" else "Open menu",
            rotationDegrees = if (expanded) 180f else 0f,
            contentColor = MaterialTheme.colorScheme.onPrimary,
            onClick = onToggleExpanded,
        )
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
            .size(BUTTON_SIZE)
            .clip(CircleShape)
            .clickable(onClick = onClick),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            painter = painterResource(iconRes),
            contentDescription = contentDescription,
            tint = contentColor,
            modifier = Modifier.size(ICON_SIZE).rotate(rotationDegrees),
        )
    }
}

@Composable
private fun NavGlyphButton(glyph: String, contentColor: Color, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .size(BUTTON_SIZE)
            .clip(CircleShape)
            .clickable(onClick = onClick),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(glyph, color = contentColor, style = MaterialTheme.typography.bodyLarge)
    }
}
