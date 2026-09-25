package com.healthsync.app.ui.home

import androidx.compose.foundation.background
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.healthsync.app.data.DayCompletion
import com.healthsync.app.data.WeekDay
import java.time.format.TextStyle
import java.util.Locale

// Weekly workout-completion streak, heatmap style: DONE gets full accent
// shading, PARTIAL a lighter tint of the same color, NONE just a faint
// on-surface tint -- matching the mockup's "partially completed day gets
// a lighter color." Lives inside NotificationShade now (StreakPreview
// below is the shade's own collapsed-state summary), so NONE deliberately
// isn't colorScheme.surfaceVariant -- that's the same color as the
// shade's own background in this theme, which would make an empty day
// invisible against it. See HomeSummaryRepository's doc comment for what
// "completion" means here (no per-day scheduling exists yet, so this is
// "did they log a workout that day," not "did they finish what was due").
@Composable
fun StreakHeatmap(weekDays: List<WeekDay>, modifier: Modifier = Modifier) {
    val accent = MaterialTheme.colorScheme.primary
    val emptyColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f)
    val today = java.time.LocalDate.now()

    Row(modifier = modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        weekDays.forEach { day ->
            val cellColor = when (day.completion) {
                DayCompletion.DONE -> accent
                DayCompletion.PARTIAL -> accent.copy(alpha = 0.4f)
                DayCompletion.NONE -> emptyColor
            }
            Column(horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
                Text(
                    day.date.dayOfWeek.getDisplayName(TextStyle.NARROW, Locale.getDefault()),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(4.dp))
                Column(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(cellColor),
                    horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    if (day.date == today) {
                        Text(
                            "•",
                            style = MaterialTheme.typography.bodyLarge,
                            color = if (day.completion == DayCompletion.NONE) {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            } else {
                                MaterialTheme.colorScheme.onPrimary
                            },
                        )
                    }
                }
            }
        }
    }
}

// Compact seven-dot summary for the shade's collapsed state -- same
// completion coloring as the full heatmap, no day labels/today marker,
// small enough to sit inline next to the category icons.
@Composable
fun StreakPreview(weekDays: List<WeekDay>, modifier: Modifier = Modifier) {
    val accent = MaterialTheme.colorScheme.primary
    val emptyColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f)

    Row(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        weekDays.forEach { day ->
            val dotColor = when (day.completion) {
                DayCompletion.DONE -> accent
                DayCompletion.PARTIAL -> accent.copy(alpha = 0.4f)
                DayCompletion.NONE -> emptyColor
            }
            Box(
                modifier = Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(dotColor),
            )
        }
    }
}
