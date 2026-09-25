package com.healthsync.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
// shading, PARTIAL a lighter tint of the same color, NONE just the plain
// surface -- matching the mockup's "partially completed day gets a
// lighter color." See HomeSummaryRepository's doc comment for what
// "completion" means here (no per-day scheduling exists yet, so this is
// "did they log a workout that day," not "did they finish what was due").
@Composable
fun StreakHeatmap(weekDays: List<WeekDay>, modifier: Modifier = Modifier) {
    val accent = MaterialTheme.colorScheme.primary
    val today = java.time.LocalDate.now()

    Row(modifier = modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        weekDays.forEach { day ->
            val cellColor = when (day.completion) {
                DayCompletion.DONE -> accent
                DayCompletion.PARTIAL -> accent.copy(alpha = 0.4f)
                DayCompletion.NONE -> MaterialTheme.colorScheme.surfaceVariant
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
