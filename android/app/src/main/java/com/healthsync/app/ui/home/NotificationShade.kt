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
import androidx.compose.ui.unit.dp
import com.healthsync.app.R
import com.healthsync.app.data.UpcomingEvent
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class ShadeContent(
    val hasUnreadMessages: Boolean,
    val upcomingEvents: List<UpcomingEvent>,
    val checkInDue: Boolean,
    val onOpenInbox: () -> Unit,
    val onOpenCalendar: () -> Unit,
    val onOpenCheckIn: () -> Unit,
)

// Closed state: three category icons (messages/calendar/tasks), each
// carrying a dot when there's something in it. Tapping the row expands a
// panel with per-category detail -- the mockup's pull-down gesture is
// simplified here to a tap-to-expand chevron (same end state, an
// expanded panel with these three categories, without a hand-rolled
// drag gesture that can't be verified without a device/emulator to test
// against -- see PLANNING.md).
@Composable
fun NotificationShade(content: ShadeContent, modifier: Modifier = Modifier) {
    var expanded by remember { mutableStateOf(false) }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(bottomStart = 16.dp, bottomEnd = 16.dp))
            .background(MaterialTheme.colorScheme.surface),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded }
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                ShadeGlyph(R.drawable.ic_inbox, dotVisible = content.hasUnreadMessages)
                ShadeGlyph(R.drawable.ic_calendar, dotVisible = content.upcomingEvents.isNotEmpty())
                ShadeGlyph(R.drawable.ic_tasks, dotVisible = content.checkInDue)
            }
            Icon(
                painter = painterResource(R.drawable.ic_chevron_down),
                contentDescription = if (expanded) "Collapse" else "Expand",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .size(20.dp)
                    .rotate(if (expanded) 180f else 0f),
            )
        }

        AnimatedVisibility(visible = expanded) {
            Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                ShadeSection(title = "Messages") {
                    if (content.hasUnreadMessages) {
                        ShadeRow("You have unread messages", onClick = content.onOpenInbox)
                    } else {
                        ShadeEmptyRow("No new messages")
                    }
                }
                ShadeSection(title = "Calendar") {
                    if (content.upcomingEvents.isEmpty()) {
                        ShadeEmptyRow("Nothing coming up")
                    } else {
                        val formatter = DateTimeFormatter.ofPattern("MMM d, h:mm a").withZone(ZoneId.systemDefault())
                        content.upcomingEvents.forEach { event ->
                            ShadeRow("${event.title} · ${formatter.format(event.startTime)}", onClick = content.onOpenCalendar)
                        }
                    }
                }
                ShadeSection(title = "Tasks") {
                    if (content.checkInDue) {
                        ShadeRow("Tell me how it was! Fill out your weekly check-in.", onClick = content.onOpenCheckIn)
                    } else {
                        ShadeEmptyRow("Nothing due")
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
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
        Spacer(Modifier.height(2.dp))
        content()
    }
}

@Composable
private fun ShadeRow(text: String, onClick: () -> Unit) {
    Text(
        text,
        style = MaterialTheme.typography.bodyLarge,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 4.dp),
    )
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
