package com.healthsync.app.supabase

import com.healthsync.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Minimal PostgREST client for pushing Health Connect data to Supabase.
 * Talks straight to `/rest/v1/<table>` rather than pulling in the full
 * Supabase SDK — this app only ever upserts/deletes a handful of tables,
 * so a couple of OkHttp calls are simpler than a dependency with its own
 * auth/session machinery (see auth/SupabaseAuthClient.kt for the small
 * hand-rolled equivalent this app does need).
 *
 * [accessToken] is the signed-in client's current Supabase session
 * token (see AuthRepository.getValidAccessToken()) — required, not
 * defaulted, so a caller can't accidentally construct this
 * unauthenticated. `apikey` stays the project's anon key on every
 * request regardless (standard Supabase convention: `apikey` identifies
 * the project, `Authorization` identifies the caller); RLS on the
 * health-data tables now keys off the latter via auth.uid() (see
 * supabase/migrations/0015_health_data_auth.sql), not a `user_id` value
 * stuffed into the row payload.
 *
 * SUPABASE_URL / SUPABASE_ANON_KEY come from local.properties via
 * BuildConfig (see app/build.gradle.kts) and are never committed.
 */
class SupabaseRestClient(
    private val accessToken: String,
    private val baseUrl: String = BuildConfig.SUPABASE_URL,
    private val anonKey: String = BuildConfig.SUPABASE_ANON_KEY,
) {
    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val jsonMediaType = "application/json".toMediaType()

    init {
        check(baseUrl.isNotBlank() && anonKey.isNotBlank()) {
            "Supabase URL/anon key are not configured. Copy " +
                "android/local.properties.example to android/local.properties and fill in " +
                "SUPABASE_URL / SUPABASE_ANON_KEY, then rebuild."
        }
    }

    private fun restUrl(table: String) =
        baseUrl.toHttpUrl().newBuilder()
            .addPathSegment("rest")
            .addPathSegment("v1")
            .addPathSegment(table)

    /**
     * Upsert [rows] into [table], resolving conflicts on the [onConflict]
     * unique column (we always use "health_connect_id"). Safe to call
     * repeatedly with the same rows — that's what makes retryable/periodic
     * sync safe.
     */
    suspend fun upsert(table: String, rows: List<Map<String, Any?>>, onConflict: String) {
        if (rows.isEmpty()) return
        val body = JSONArray().apply { rows.forEach { row -> put(JSONObject(row)) } }
        val url = restUrl(table).addQueryParameter("on_conflict", onConflict).build()
        val request = Request.Builder()
            .url(url)
            .header("apikey", anonKey)
            .header("Authorization", "Bearer $accessToken")
            .header("Content-Type", "application/json")
            .header("Prefer", "resolution=merge-duplicates,return=minimal")
            .post(body.toString().toRequestBody(jsonMediaType))
            .build()
        execute(request)
    }

    /**
     * Delete every row in [table] whose `health_connect_id` starts with
     * [prefix]. Used to propagate Health Connect deletions: a deleted
     * record's own Health Connect id is the prefix of every row it
     * produced (heart-rate samples are "<id>:<epochMs>", sleep stages are
     * "<id>_stage_<n>", everything else uses the id verbatim, and since
     * Health Connect ids are fixed-length UUIDs no id is ever a prefix of
     * a *different* record's id).
     */
    suspend fun deleteByHealthConnectIdPrefix(table: String, prefix: String) {
        val url = restUrl(table).addQueryParameter("health_connect_id", "like.$prefix*").build()
        val request = Request.Builder()
            .url(url)
            .header("apikey", anonKey)
            .header("Authorization", "Bearer $accessToken")
            .header("Prefer", "return=minimal")
            .delete()
            .build()
        execute(request)
    }

    /**
     * Read-only PostgREST select against [table] -- [params] become query
     * parameters verbatim, e.g. `mapOf("select" to "start_time,count",
     * "client_id" to "eq.<uuid>", "order" to "start_time.asc")`. RLS on
     * the target table does the actual per-user/per-coach scoping via
     * this client's [accessToken], same as every write this class makes
     * -- see supabase/migrations/0015_health_data_auth.sql for the
     * coach-can-also-select-their-clients'-rows policies this relies on.
     * No pagination -- only used for small, bounded dashboard summaries
     * (a couple weeks of data), not a general-purpose query layer.
     */
    suspend fun select(table: String, params: Map<String, String>): JSONArray {
        var urlBuilder = restUrl(table)
        params.forEach { (key, value) -> urlBuilder = urlBuilder.addQueryParameter(key, value) }
        val request = Request.Builder()
            .url(urlBuilder.build())
            .header("apikey", anonKey)
            .header("Authorization", "Bearer $accessToken")
            .get()
            .build()
        return JSONArray(executeReturningBody(request))
    }

    // OkHttp's call.execute() is blocking I/O; run it on Dispatchers.IO so
    // callers never have to know or care what thread/dispatcher they were
    // invoked from. Without this, a caller on the main thread (e.g. the
    // Compose "Sync now" button, whose rememberCoroutineScope() runs on the
    // UI dispatcher) crashes with NetworkOnMainThreadException.
    private suspend fun execute(request: Request) {
        executeReturningBody(request)
    }

    // Same as execute() but hands back the response body -- select() needs
    // the JSON payload, the write methods above just need success/failure.
    private suspend fun executeReturningBody(request: Request): String = withContext(Dispatchers.IO) {
        http.newCall(request).execute().use { response ->
            val bodyText = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IOException("Supabase request failed (${response.code} ${request.method} ${request.url}): $bodyText")
            }
            bodyText
        }
    }
}
