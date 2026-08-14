package com.healthsync.app.healthconnect

import androidx.health.connect.client.records.BloodPressureRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RespiratoryRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import kotlin.reflect.KClass

/**
 * Everything the sync engine needs to know about one Health Connect record
 * type: how to read it, which Supabase table(s) it writes to, and how to
 * turn one Health Connect record into row(s) for those tables.
 *
 * [toTableRows] returns a map of table name -> rows because a couple of
 * record types fan out to more than one table (heart rate has multiple
 * samples per record; a sleep session has stages as sub-rows).
 *
 * Every row must include a `health_connect_id` that is stable and unique
 * per Health Connect record (or sample/stage within it) so pushes are
 * idempotent upserts. [tables] lists every table this spec can write to,
 * used when propagating a Health Connect deletion (we delete any row whose
 * `health_connect_id` starts with the deleted record's id).
 */
data class SyncSpec<T : Record>(
    val key: String,
    val recordType: KClass<T>,
    val tables: List<String>,
    val initialBackfillDays: Long,
    val toTableRows: (T) -> Map<String, List<Map<String, Any?>>>,
)

private fun instantIso(instant: java.time.Instant): String = instant.toString()

/** The full set of Health Connect record types this app syncs. */
val allSyncSpecs: List<SyncSpec<out Record>> = listOf(
    SyncSpec(
        key = "steps",
        recordType = StepsRecord::class,
        tables = listOf("steps"),
        initialBackfillDays = 30,
    ) { record ->
        mapOf(
            "steps" to listOf(
                mapOf(
                    "health_connect_id" to record.metadata.id,
                    "start_time" to instantIso(record.startTime),
                    "end_time" to instantIso(record.endTime),
                    "count" to record.count,
                    "source_package" to record.metadata.dataOrigin.packageName,
                )
            )
        )
    },

    SyncSpec(
        key = "heart_rate",
        recordType = HeartRateRecord::class,
        tables = listOf("heart_rate_samples"),
        initialBackfillDays = 14,
    ) { record ->
        mapOf(
            "heart_rate_samples" to record.samples.map { sample ->
                mapOf(
                    "health_connect_id" to "${record.metadata.id}:${sample.time.toEpochMilli()}",
                    "sample_time" to instantIso(sample.time),
                    "bpm" to sample.beatsPerMinute,
                    "source_package" to record.metadata.dataOrigin.packageName,
                )
            }
        )
    },

    SyncSpec(
        key = "sleep",
        recordType = SleepSessionRecord::class,
        tables = listOf("sleep_sessions", "sleep_stages"),
        initialBackfillDays = 60,
    ) { record ->
        mapOf(
            "sleep_sessions" to listOf(
                mapOf(
                    "health_connect_id" to record.metadata.id,
                    "start_time" to instantIso(record.startTime),
                    "end_time" to instantIso(record.endTime),
                    "title" to record.title,
                    "notes" to record.notes,
                    "source_package" to record.metadata.dataOrigin.packageName,
                )
            ),
            "sleep_stages" to record.stages.mapIndexed { index, stage ->
                mapOf(
                    "health_connect_id" to "${record.metadata.id}_stage_$index",
                    "session_health_connect_id" to record.metadata.id,
                    "start_time" to instantIso(stage.startTime),
                    "end_time" to instantIso(stage.endTime),
                    "stage_type_code" to stage.stage,
                )
            },
        )
    },

    SyncSpec(
        key = "exercise",
        recordType = ExerciseSessionRecord::class,
        tables = listOf("exercise_sessions"),
        initialBackfillDays = 90,
    ) { record ->
        mapOf(
            "exercise_sessions" to listOf(
                mapOf(
                    "health_connect_id" to record.metadata.id,
                    "start_time" to instantIso(record.startTime),
                    "end_time" to instantIso(record.endTime),
                    "exercise_type_code" to record.exerciseType,
                    "title" to record.title,
                    "notes" to record.notes,
                    "source_package" to record.metadata.dataOrigin.packageName,
                )
            )
        )
    },

    SyncSpec(
        key = "blood_oxygen",
        recordType = OxygenSaturationRecord::class,
        tables = listOf("blood_oxygen"),
        initialBackfillDays = 14,
    ) { record ->
        mapOf(
            "blood_oxygen" to listOf(
                mapOf(
                    "health_connect_id" to record.metadata.id,
                    "sample_time" to instantIso(record.time),
                    "percentage" to record.percentage.value,
                    "source_package" to record.metadata.dataOrigin.packageName,
                )
            )
        )
    },

    SyncSpec(
        key = "blood_pressure",
        recordType = BloodPressureRecord::class,
        tables = listOf("blood_pressure"),
        initialBackfillDays = 90,
    ) { record ->
        mapOf(
            "blood_pressure" to listOf(
                mapOf(
                    "health_connect_id" to record.metadata.id,
                    "sample_time" to instantIso(record.time),
                    "systolic_mmhg" to record.systolic.inMillimetersOfMercury,
                    "diastolic_mmhg" to record.diastolic.inMillimetersOfMercury,
                    "body_position_code" to record.bodyPosition,
                    "measurement_location_code" to record.measurementLocation,
                    "source_package" to record.metadata.dataOrigin.packageName,
                )
            )
        )
    },

    SyncSpec(
        key = "respiratory_rate",
        recordType = RespiratoryRateRecord::class,
        tables = listOf("respiratory_rate"),
        initialBackfillDays = 14,
    ) { record ->
        mapOf(
            "respiratory_rate" to listOf(
                mapOf(
                    "health_connect_id" to record.metadata.id,
                    "sample_time" to instantIso(record.time),
                    "breaths_per_minute" to record.rate,
                    "source_package" to record.metadata.dataOrigin.packageName,
                )
            )
        )
    },
)
