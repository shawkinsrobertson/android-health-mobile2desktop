package com.healthsync.app.healthconnect

import androidx.health.connect.client.records.BloodGlucoseRecord
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
 * record types fan out to more than one row (heart rate has multiple
 * samples per record; a sleep session has stages as sub-rows) -- every spec
 * below writes to the single `metrics` table (see
 * supabase/migrations/0035_metrics.sql), tagging each row with its own
 * `metric_type` rather than a separate table name, so `sleep`'s session and
 * stage rows share one list under the same "metrics" key.
 *
 * Every row must include a `health_connect_id` that is stable and unique
 * per Health Connect record (or sample/stage within it) so pushes are
 * idempotent upserts. [tables] lists every table this spec can write to,
 * used when propagating a Health Connect deletion (we delete any row whose
 * `health_connect_id` starts with the deleted record's id).
 *
 * Type-specific fields (count, bpm, systolic_mmhg, ...) live nested under
 * each row's "value" key rather than as top-level map entries -- that's
 * `metrics.value`, a jsonb column. SupabaseRestClient.upsert hands the row
 * map straight to `org.json.JSONObject(Map)`, which recursively wraps a
 * nested `Map<String, Any?>` into a nested JSON object, so a plain
 * `mapOf(...)` here is all `value` needs; no manual JSON encoding.
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
        tables = listOf("metrics"),
        initialBackfillDays = 30,
    ) { record ->
        mapOf(
            "metrics" to listOf(
                mapOf(
                    "health_connect_id" to record.metadata.id,
                    "metric_type" to "steps",
                    "start_time" to instantIso(record.startTime),
                    "end_time" to instantIso(record.endTime),
                    "value" to mapOf("count" to record.count),
                    "source_package" to record.metadata.dataOrigin.packageName,
                )
            )
        )
    },

    SyncSpec(
        key = "heart_rate",
        recordType = HeartRateRecord::class,
        tables = listOf("metrics"),
        initialBackfillDays = 14,
    ) { record ->
        mapOf(
            "metrics" to record.samples.map { sample ->
                mapOf(
                    "health_connect_id" to "${record.metadata.id}:${sample.time.toEpochMilli()}",
                    "metric_type" to "heart_rate",
                    "start_time" to instantIso(sample.time),
                    "end_time" to null,
                    "value" to mapOf("bpm" to sample.beatsPerMinute),
                    "source_package" to record.metadata.dataOrigin.packageName,
                )
            }
        )
    },

    SyncSpec(
        key = "sleep",
        recordType = SleepSessionRecord::class,
        tables = listOf("metrics"),
        initialBackfillDays = 60,
    ) { record ->
        mapOf(
            "metrics" to listOf(
                mapOf(
                    "health_connect_id" to record.metadata.id,
                    "metric_type" to "sleep_session",
                    "start_time" to instantIso(record.startTime),
                    "end_time" to instantIso(record.endTime),
                    "value" to mapOf("title" to record.title, "notes" to record.notes),
                    "source_package" to record.metadata.dataOrigin.packageName,
                )
            ) + record.stages.mapIndexed { index, stage ->
                mapOf(
                    "health_connect_id" to "${record.metadata.id}_stage_$index",
                    "metric_type" to "sleep_stage",
                    "start_time" to instantIso(stage.startTime),
                    "end_time" to instantIso(stage.endTime),
                    "value" to mapOf(
                        "session_health_connect_id" to record.metadata.id,
                        "stage_type_code" to stage.stage,
                    ),
                    "source_package" to null,
                )
            },
        )
    },

    SyncSpec(
        key = "exercise",
        recordType = ExerciseSessionRecord::class,
        tables = listOf("metrics"),
        initialBackfillDays = 90,
    ) { record ->
        mapOf(
            "metrics" to listOf(
                mapOf(
                    "health_connect_id" to record.metadata.id,
                    "metric_type" to "exercise_session",
                    "start_time" to instantIso(record.startTime),
                    "end_time" to instantIso(record.endTime),
                    "value" to mapOf(
                        "exercise_type_code" to record.exerciseType,
                        "title" to record.title,
                        "notes" to record.notes,
                    ),
                    "source_package" to record.metadata.dataOrigin.packageName,
                )
            )
        )
    },

    SyncSpec(
        key = "blood_oxygen",
        recordType = OxygenSaturationRecord::class,
        tables = listOf("metrics"),
        initialBackfillDays = 14,
    ) { record ->
        mapOf(
            "metrics" to listOf(
                mapOf(
                    "health_connect_id" to record.metadata.id,
                    "metric_type" to "blood_oxygen",
                    "start_time" to instantIso(record.time),
                    "end_time" to null,
                    "value" to mapOf("percentage" to record.percentage.value),
                    "source_package" to record.metadata.dataOrigin.packageName,
                )
            )
        )
    },

    SyncSpec(
        key = "blood_pressure",
        recordType = BloodPressureRecord::class,
        tables = listOf("metrics"),
        initialBackfillDays = 90,
    ) { record ->
        mapOf(
            "metrics" to listOf(
                mapOf(
                    "health_connect_id" to record.metadata.id,
                    "metric_type" to "blood_pressure",
                    "start_time" to instantIso(record.time),
                    "end_time" to null,
                    "value" to mapOf(
                        "systolic_mmhg" to record.systolic.inMillimetersOfMercury,
                        "diastolic_mmhg" to record.diastolic.inMillimetersOfMercury,
                        "body_position_code" to record.bodyPosition,
                        "measurement_location_code" to record.measurementLocation,
                    ),
                    "source_package" to record.metadata.dataOrigin.packageName,
                )
            )
        )
    },

    SyncSpec(
        key = "respiratory_rate",
        recordType = RespiratoryRateRecord::class,
        tables = listOf("metrics"),
        initialBackfillDays = 14,
    ) { record ->
        mapOf(
            "metrics" to listOf(
                mapOf(
                    "health_connect_id" to record.metadata.id,
                    "metric_type" to "respiratory_rate",
                    "start_time" to instantIso(record.time),
                    "end_time" to null,
                    "value" to mapOf("breaths_per_minute" to record.rate),
                    "source_package" to record.metadata.dataOrigin.packageName,
                )
            )
        )
    },

    SyncSpec(
        key = "blood_glucose",
        recordType = BloodGlucoseRecord::class,
        tables = listOf("metrics"),
        initialBackfillDays = 90,
    ) { record ->
        mapOf(
            "metrics" to listOf(
                mapOf(
                    "health_connect_id" to record.metadata.id,
                    "metric_type" to "blood_glucose",
                    "start_time" to instantIso(record.time),
                    "end_time" to null,
                    "value" to mapOf(
                        "level_mg_dl" to record.level.inMilligramsPerDeciliter,
                        "specimen_source_code" to record.specimenSource,
                        "meal_type_code" to record.mealType,
                        "relation_to_meal_code" to record.relationToMeal,
                    ),
                    "source_package" to record.metadata.dataOrigin.packageName,
                )
            )
        )
    },
)
