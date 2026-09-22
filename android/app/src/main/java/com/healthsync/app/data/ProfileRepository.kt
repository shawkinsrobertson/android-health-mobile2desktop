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
}
