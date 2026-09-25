package com.healthsync.app.ui.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.healthsync.app.R
import com.healthsync.app.data.MessagePreview
import com.healthsync.app.data.UpcomingEvent
import com.healthsync.app.data.WeekDay
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class ShadeContent(
    val displayName: String?,
    val hasUnreadMessages: Boolean,
    val latestMessage: MessagePreview?,
    val upcomingEvents: List<UpcomingEvent>,
    val checkInDue: Boolean,
    val weekDays: List<WeekDay>,
    val onOpenInbox: () -> Unit,
    val onOpenCalendar: () -> Unit,
    val onOpenCheckIn: () -> Unit,
)

/**
 * The redesigned "header shade": the greeting/date live *inside* the shade
 * now (previously this was HomeScreen's own body text, below the shade),
 * and the shade's background is meant to extend all the way to the top of
 * the screen -- see HomeScreen's doc comment for how the inset padding is
 * split between this composable's background (none) and its content
 * (`.statusBarsPadding()`, applied *after* the background so the color
 * still paints behind the status bar while the greeting/icons themselves
 * sit below it).
 *
 * Closed state: greeting header, then a compact row (three category
 * glyphs with unread dots on the left, a 3-square MiniStreak glance on
 * the right), then a small centered pull-tab with a chevron. Expanded
 * state swaps that compact row out entirely for "You're on a roll" + the
 * full StreakHeatmap, then Messages/Calendar/Tasks cards, with the same
 * centered tab (now pointing up) at the bottom -- matching the mockup,
 * where the closed row and the expanded content never appear together.
 */
@Composable
fun NotificationShade(content: ShadeContent, modifier: Modifier = Modifier) {
    var expanded by remember { mutableStateOf(false) }
    val today = remember { LocalDate.now() }
    val dateLabel = remember(today) { DateTimeFormatter.ofPattern("MMM d, yyyy").format(today) }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(bottomStart = 24.dp, bottomEnd = 24.dp))
            .background(MaterialTheme.colorScheme.surface)
            .statusBarsPadding(),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                content.displayName?.let { "Hey, $it" } ?: "Hey",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            Text(
                dateLabel,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        if (expanded) {
            Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                Text("You're on a roll", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(12.dp))
                StreakHeatmap(weekDays = content.weekDays, modifier = Modifier.padding(bottom = 8.dp))

                ShadeSection(title = "New Messages") {
                    val message = content.latestMessage
                    if (message != null) {
                        PreviewCard(
                            title = message.senderLabel,
                            subtitle = message.body,
                            onClick = content.onOpenInbox,
                        )
                    } else {
                        ShadeEmptyRow("No new messages")
                    }
                }

                ShadeSection(title = "Calendar") {
                    val nextEvent = content.upcomingEvents.firstOrNull()
                    if (nextEvent != null) {
                        EventPreviewCard(nextEvent, onClick = content.onOpenCalendar)
                    } else {
                        ShadeEmptyRow("Nothing coming up")
                    }
                }

                ShadeSection(title = "Tasks") {
                    if (content.checkInDue) {
                        PreviewCard(
                            title = "Tell me how it was!",
                            subtitle = "Fill out your weekly check-in",
                            trailingGlyph = "↗", // matches the mockup's tap-through arrow
                            onClick = content.onOpenCheckIn,
                        )
                    } else {
                        ShadeEmptyRow("Nothing due")
                    }
                }
                Spacer(Modifier.height(4.dp))
            }
        } else {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    ShadeGlyph(R.drawable.ic_inbox, dotVisible = content.hasUnreadMessages)
                    ShadeGlyph(R.drawable.ic_calendar, dotVisible = content.upcomingEvents.isNotEmpty())
                    ShadeGlyph(R.drawable.ic_tasks, dotVisible = content.checkInDue)
                }
                if (content.weekDays.isNotEmpty()) {
                    MiniStreak(weekDays = content.weekDays)
                }
            }
            Spacer(Modifier.height(4.dp))
        }

        ShadeTab(expanded = expanded, onClick = { expanded = !expanded })
    }
}

// The small centered pull-tab at the bottom of the shade -- a deliberately
// distinct, narrower tap target from the old design's "tap anywhere in
// the row" affordance, matching the mockup's small centered chevron chip.
@Composable
private fun ShadeTab(expanded: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(bottom = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(width = 48.dp, height = 20.dp)
                .clip(RoundedCornerShape(bottomStart = 10.dp, bottomEnd = 10.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                painter = painterResource(R.drawable.ic_chevron_down),
                contentDescription = if (expanded) "Collapse" else "Expand",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(16.dp).rotate(if (expanded) 180f else 0f),
            )
        }
    }
}

@Composable
private fun ShadeGlyph(iconRes: Int, dotVisible: Boolean) {
    Box {
        Icon(
            painter = painterResource(iconRes),
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.size(22.dp),
        )
        if (dotVisible) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary),
            )
        }
    }
}

@Composable
private fun ShadeSection(title: String, content: @Composable () -> Unit) {
    Column(modifier = Modifier.padding(vertical = 6.dp)) {
        Text(title, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(6.dp))
        content()
    }
}

// Title + subtitle card, replacing the old single-line ShadeRow for
// Messages/Tasks -- matches the mockup's richer preview cards (a coach's
// message body, or the check-in prompt's two-line copy) rather than one
// flattened sentence.
@Composable
private fun PreviewCard(title: String, subtitle: String, onClick: () -> Unit, trailingGlyph: String? = null) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.background)
            .clickable(onClick = onClick)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(2.dp))
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (trailingGlyph != null) {
            Text(trailingGlyph, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// Calendar's card additionally gets a small date chip (month + day) on
// the right, matching the mockup's "OCT 13" tile, instead of folding the
// date into the subtitle line like Messages/Tasks do.
@Composable
private fun EventPreviewCard(event: UpcomingEvent, onClick: () -> Unit) {
    val zoned = remember(event.startTime) { event.startTime.atZone(ZoneId.systemDefault()) }
    val month = remember(zoned) { DateTimeFormatter.ofPattern("MMM").format(zoned).uppercase() }
    val day = remember(zoned) { DateTimeFormatter.ofPattern("d").format(zoned) }
    val time = remember(zoned) { DateTimeFormatter.ofPattern("h:mm a").format(zoned) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.background)
            .clickable(onClick = onClick)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(event.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(2.dp))
            Text(time, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Column(
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .padding(horizontal = 10.dp, vertical = 6.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(month, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
            Text(day, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun ShadeEmptyRow(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(vertical = 4.dp),
    )
}
