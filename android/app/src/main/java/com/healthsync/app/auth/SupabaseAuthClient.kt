package com.healthsync.app.auth

import com.healthsync.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.time.Instant
import java.util.concurrent.TimeUnit

data class Session(
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: Instant,
    val userId: String,
    val email: String,
)

/**
 * Thrown when GoTrue itself responds with a non-2xx status -- as
 * opposed to a network-level failure (no connectivity, timeout, DNS),
 * which throws a plain [IOException] straight from OkHttp before any
 * response is ever received. [statusCode] lets [AuthRepository] tell "the
 * server explicitly rejected this" (4xx -- the refresh token is
 * genuinely invalid, expired, or already used) apart from "the server
 * had a problem" (5xx) or "we couldn't even reach it" (plain
 * [IOException]) -- only the first of those three should ever be treated
 * as "this session is dead, sign out."
 */
class SupabaseAuthHttpException(val statusCode: Int, message: String) : IOException(message)

/**
 * Hand-rolled client for Supabase's Auth (GoTrue) REST API -- same
 * approach as [com.healthsync.app.supabase.SupabaseRestClient] takes for
 * PostgREST, and for the same reason: this app only ever needs three
 * calls (request an email OTP, verify it, refresh a session), so a
 * couple of OkHttp calls are simpler than pulling in the full Supabase
 * SDK and its own Ktor HTTP stack + session machinery -- this app builds
 * a deliberately smaller version of the latter itself (see
 * [AuthRepository]/[SessionStore]).
 *
 * Endpoint paths, header names, and request/response body shapes are
 * confirmed directly against the installed `@supabase/auth-js` package
 * (`dashboard/node_modules/@supabase/auth-js`), not guessed -- GoTrue is
 * otherwise undocumented in this repo, since the dashboard only ever
 * talks to it through the official JS SDK.
 *
 * No `Result<T>` wrapping, matching `SupabaseRestClient`'s convention:
 * failures throw [IOException] -- a [SupabaseAuthHttpException] for a
 * real (non-2xx) GoTrue response, a plain [IOException] straight from
 * OkHttp for a network-level failure -- callers ([AuthRepository])
 * decide how to surface that to the UI.
 */
class SupabaseAuthClient(
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

    private fun authUrl(path: String) =
        baseUrl.toHttpUrl().newBuilder()
            .addPathSegment("auth")
            .addPathSegment("v1")
            .addPathSegment(path)
            .build()

    /**
     * Emails a 6-digit one-time code to [email]. `create_user = false`
     * deliberately -- a returning client's login should never silently
     * create a new account for a stranger's typed-in email; only the
     * dashboard's coach-issued invite flow (`/join/[token]`) creates new
     * client accounts. See `handle_new_user()` in
     * `supabase/migrations/0002_accounts.sql`, which no-ops gracefully
     * for a sign-in carrying no `invite_token` metadata -- this call
     * intentionally sends none.
     */
    suspend fun requestOtp(email: String) {
        withContext(Dispatchers.IO) {
            val body = JSONObject().apply {
                put("email", email)
                put("create_user", false)
                put("data", JSONObject())
            }
            val request = Request.Builder()
                .url(authUrl("otp"))
                .header("apikey", anonKey)
                .header("Content-Type", "application/json")
                .post(body.toString().toRequestBody(jsonMediaType))
                .build()
            execute(request)
        }
    }

    /**
     * Exchanges the 6-digit code the user typed in for a session.
     * `type = "email"` is the discriminator for a typed-code
     * verification specifically -- distinct from `"signup"`/`"magiclink"`,
     * which are `token_hash`-based (what the dashboard's own
     * `/auth/confirm` route uses for the web magic-link flow).
     */
    suspend fun verifyOtp(email: String, token: String): Session = withContext(Dispatchers.IO) {
        val body = JSONObject().apply {
            put("email", email)
            put("token", token)
            put("type", "email")
        }
        val request = Request.Builder()
            .url(authUrl("verify"))
            .header("apikey", anonKey)
            .header("Content-Type", "application/json")
            .post(body.toString().toRequestBody(jsonMediaType))
            .build()
        parseSession(execute(request))
    }

    /**
     * Refreshes an expiring/expired session. Supabase rotates the
     * refresh token on every use -- the caller ([AuthRepository]) must
     * persist the *new* `refresh_token` this returns and never reuse the
     * one that was just spent, or the next refresh attempt fails.
     */
    suspend fun refreshSession(refreshToken: String): Session = withContext(Dispatchers.IO) {
        val body = JSONObject().apply { put("refresh_token", refreshToken) }
        val url = authUrl("token").newBuilder().addQueryParameter("grant_type", "refresh_token").build()
        val request = Request.Builder()
            .url(url)
            .header("apikey", anonKey)
            .header("Content-Type", "application/json")
            .post(body.toString().toRequestBody(jsonMediaType))
            .build()
        parseSession(execute(request))
    }

    private fun parseSession(responseBody: String): Session {
        val json = JSONObject(responseBody)
        val user = json.getJSONObject("user")
        return Session(
            accessToken = json.getString("access_token"),
            refreshToken = json.getString("refresh_token"),
            expiresAt = Instant.now().plusSeconds(json.getLong("expires_in")),
            userId = user.getString("id"),
            email = user.optString("email", ""),
        )
    }

    // Mirrors SupabaseRestClient.execute(): blocking OkHttp call (caller
    // already on Dispatchers.IO here). Non-2xx becomes a
    // SupabaseAuthHttpException carrying both the status code and the
    // response body, so callers see the real GoTrue error message (e.g.
    // "Token has expired or is invalid") and can tell a rejected token
    // apart from a network-level failure -- the latter throws OkHttp's
    // own IOException naturally, before we ever get a Response to check.
    private fun execute(request: Request): String {
        http.newCall(request).execute().use { response ->
            val bodyText = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw SupabaseAuthHttpException(
                    response.code,
                    "Supabase auth request failed (${response.code} ${request.method} ${request.url}): $bodyText",
                )
            }
            return bodyText
        }
    }
}
