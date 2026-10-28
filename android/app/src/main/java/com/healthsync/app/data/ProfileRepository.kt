package com.healthsync.app.data

import com.healthsync.app.supabase.SupabaseRestClient

data class ClientSummary(
    val id: String,
    val fullName: String?,
    val email: String,
)

/**
 * Reads this signed-in user's own role, and -- if they're a coach -- the
 * roster of clients assigned to them. The Android app otherwise has no
 * concept of "coach" anywhere in its code (it was built purely for the
 * client/wearer side); this exists solely to drive the basic role-aware
 * dashboard in ui/CoachHomeScreen.kt and ui/DashboardScreen.kt.
 *
 * Relies on RLS policies that already exist for the web dashboard (see
 * supabase/migrations/0002_accounts.sql's profiles_select_as_coach and
 * client_profiles_select_as_coach) -- a coach's own access token is
 * already allowed to read their clients' profiles rows, so this needs no
 * new backend permissions.
 */
class ProfileRepository(private val supabase: SupabaseRestClient) {

    /** First name (or full name if that's all there is) for the home screen's "Hey, {name}" greeting -- falls back to null (caller falls back to email) if unset. */
    suspend fun loadDisplayName(userId: String): String? {
        val rows = supabase.select(
            "profiles",
            mapOf("select" to "full_name", "id" to "eq.$userId"),
        )
        if (rows.length() == 0) return null
        val fullName = rows.getJSONObject(0).optString("full_name").ifBlank { null } ?: return null
        return fullName.substringBefore(" ")
    }

    suspend fun loadRole(userId: String): String {
        val rows = supabase.select(
            "profiles",
            mapOf("select" to "role", "id" to "eq.$userId"),
        )
        if (rows.length() == 0) return "client"
        return rows.getJSONObject(0).optString("role", "client")
    }

    suspend fun loadClients(coachId: String): List<ClientSummary> {
        val clientProfileRows = supabase.select(
            "client_profiles",
            mapOf("select" to "profile_id", "coach_id" to "eq.$coachId"),
        )
        val clientIds = (0 until clientProfileRows.length()).map {
            clientProfileRows.getJSONObject(it).getString("profile_id")
        }
        if (clientIds.isEmpty()) return emptyList()

        val profileRows = supabase.select(
            "profiles",
            mapOf("select" to "id,full_name,email", "id" to "in.(${clientIds.joinToString(",")})"),
        )
        return (0 until profileRows.length()).map { i ->
            val row = profileRows.getJSONObject(i)
            ClientSummary(
                id = row.getString("id"),
                fullName = row.optString("full_name").ifBlank { null },
                email = row.getString("email"),
            )
        }
    }

    /**
     * The up-to-3 data-point keys this client picked for their dashboard's
     * "top 3" cards (dashboard/app/client/actions.ts's updateTopDataPoints
     * writes this same client_profiles.top_data_points array; there's no
     * Android UI to *change* the selection yet, only to display it).
     */
    suspend fun loadTopDataPoints(clientId: String): List<String> {
        val rows = supabase.select(
            "client_profiles",
            mapOf("select" to "top_data_points", "profile_id" to "eq.$clientId"),
        )
        if (rows.length() == 0) return emptyList()
        val array = rows.getJSONObject(0).optJSONArray("top_data_points") ?: return emptyList()
        return (0 until array.length()).map { array.getString(it) }
    }

    // ---------------------------------------------------------------------
    // client_metric_source_preference (supabase/migrations/0038_client_
    // timezone_and_source_preference.sql) -- lets a client pin one Health
    // Connect source (e.g. their Garmin, not their phone's own sensor) per
    // metric type instead of relying on the dashboard's/this app's
    // resolveOverlappingSources dedup heuristic. No row = no preference.
    // ---------------------------------------------------------------------

    /** The distinct `source_package`s actually seen for this client+type, most-recent-first. Not exhaustive by design -- a bounded recent sample is enough to populate a picker, not a full-history scan. */
    suspend fun loadDistinctSources(clientId: String, metricType: String): List<String> {
        val rows = supabase.select(
            "metrics",
            mapOf(
                "select" to "source_package",
                "client_id" to "eq.$clientId",
                "metric_type" to "eq.$metricType",
                "order" to "start_time.desc",
                "limit" to "300",
            ),
        )
        val seen = LinkedHashSet<String>()
        for (i in 0 until rows.length()) {
            rows.getJSONObject(i).optString("source_package").ifBlank { null }?.let { seen.add(it) }
        }
        return seen.toList()
    }

    /** Every preference this client has set, keyed by metric_type -- one query instead of one per data type when populating the whole "Data types" list. */
    suspend fun loadAllSourcePreferences(clientId: String): Map<String, String> {
        val rows = supabase.select(
            "client_metric_source_preference",
            mapOf("select" to "metric_type,source_package", "client_id" to "eq.$clientId"),
        )
        val result = mutableMapOf<String, String>()
        for (i in 0 until rows.length()) {
            val row = rows.getJSONObject(i)
            result[row.getString("metric_type")] = row.getString("source_package")
        }
        return result
    }

    suspend fun setSourcePreference(clientId: String, metricType: String, sourcePackage: String) {
        supabase.upsert(
            "client_metric_source_preference",
            rows = listOf(mapOf("client_id" to clientId, "metric_type" to metricType, "source_package" to sourcePackage)),
            onConflict = "client_id,metric_type",
        )
    }

    suspend fun clearSourcePreference(clientId: String, metricType: String) {
        supabase.delete(
            "client_metric_source_preference",
            filters = mapOf("client_id" to "eq.$clientId", "metric_type" to "eq.$metricType"),
        )
    }
}
