package com.healthsync.app.auth

import android.content.Context
import android.util.Log
import java.time.Instant

private const val TAG = "AuthRepository"

// Refresh a bit ahead of actual expiry rather than exactly at it, so a
// sync pass that takes a few seconds doesn't start with a token that
// expires mid-request.
private const val REFRESH_MARGIN_SECONDS = 60L

/**
 * The operational layer everything else in the app calls -- the
 * login/verify-code UI and [com.healthsync.app.sync.SyncWorker]
 * ([getValidAccessToken]) alike. Owns the "is my session still good,
 * and if not, refresh it" logic; [SupabaseAuthClient] is just the three
 * raw HTTP calls, [SessionStore] is just storage.
 */
class AuthRepository(
    private val authClient: SupabaseAuthClient,
    private val sessionStore: SessionStore,
) {
    constructor(context: Context) : this(SupabaseAuthClient(), SessionStore(context))

    val isLoggedInFlow get() = sessionStore.isLoggedInFlow
    val emailFlow get() = sessionStore.emailFlow

    suspend fun login(email: String) {
        authClient.requestOtp(email)
    }

    suspend fun verifyCode(email: String, code: String) {
        val session = authClient.verifyOtp(email, code)
        sessionStore.save(session)
    }

    suspend fun logout() {
        sessionStore.clear()
    }

    /**
     * The signed-in user's Supabase id (profiles.id / auth.uid()), or
     * null if there's no session. Unlike [getValidAccessToken] this never
     * refreshes -- the id itself doesn't expire with the token, so a
     * plain stored-session read is enough.
     */
    suspend fun getUserId(): String? = sessionStore.readTokens()?.userId

    /**
     * Returns a currently-valid access token, refreshing first if it's
     * expired or expiring within [REFRESH_MARGIN_SECONDS] -- the
     * refreshed session's rotated refresh_token is persisted on success
     * (see [SupabaseAuthClient.refreshSession]). Returns null if there's
     * no session at all, or if refresh itself fails -- but the stored
     * session is only *cleared* when GoTrue explicitly rejected the
     * refresh token ([SupabaseAuthHttpException] with a 4xx status --
     * expired, revoked, already used). A network-level failure or a 5xx
     * leaves the session in place and just fails this one attempt, so a
     * momentary connectivity blip on app launch can't force a real
     * sign-out -- callers that need to tell "this session is genuinely
     * dead" apart from "that one attempt failed" should check whether
     * [getUserId] still returns a value afterward (see
     * [com.healthsync.app.MainActivity]'s role-fetch for the pattern).
     * [SyncWorker][com.healthsync.app.sync.SyncWorker] just treats null
     * as "not signed in for this run" either way; the next scheduled/
     * manual sync is the retry, same philosophy [SyncRepository][
     * com.healthsync.app.sync.SyncRepository] already uses for
     * per-record-type sync failures.
     */
    suspend fun getValidAccessToken(): String? {
        val tokens = sessionStore.readTokens() ?: return null

        if (Instant.now().isBefore(tokens.expiresAt.minusSeconds(REFRESH_MARGIN_SECONDS))) {
            return tokens.accessToken
        }

        return try {
            val refreshed = authClient.refreshSession(tokens.refreshToken)
            sessionStore.save(refreshed)
            refreshed.accessToken
        } catch (e: SupabaseAuthHttpException) {
            if (e.statusCode in 400..499) {
                Log.w(TAG, "Refresh token rejected (${e.statusCode}), clearing session", e)
                sessionStore.clear()
            } else {
                Log.w(TAG, "Refresh failed with server error ${e.statusCode}, leaving session in place", e)
            }
            null
        } catch (e: Exception) {
            Log.w(TAG, "Refresh failed (network?), leaving session in place", e)
            null
        }
    }
}
