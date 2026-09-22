package com.healthsync.app.auth

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import java.time.Instant

private val Context.authDataStore by preferencesDataStore(name = "health_sync_auth")
private val EMAIL_KEY = stringPreferencesKey("email")
private val LOGGED_IN_KEY = booleanPreferencesKey("logged_in")

data class StoredTokens(
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: Instant,
    val userId: String,
)

/**
 * Persists the current [Session], split by sensitivity:
 *  - The tokens themselves live in [EncryptedSharedPreferences] -- real
 *    credentials, unlike the `sync_code` they replace, which was never
 *    encrypted at rest.
 *  - A mirror `email`/`logged_in` flag lives in the existing
 *    (unencrypted) Preferences DataStore, matching
 *    [com.healthsync.app.sync.SyncStateStore]'s established pattern, so
 *    the UI can reactively observe login state via a [Flow] without
 *    touching the encrypted store on every recomposition --
 *    `EncryptedSharedPreferences` has no natural `Flow` of its own.
 */
class SessionStore(context: Context) {

    private val appContext = context.applicationContext
    private val dataStore = appContext.authDataStore

    private val encryptedPrefs by lazy {
        val masterKey = MasterKey.Builder(appContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            appContext,
            "health_sync_session",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    val isLoggedInFlow: Flow<Boolean> = dataStore.data.map { prefs -> prefs[LOGGED_IN_KEY] ?: false }
    val emailFlow: Flow<String?> = dataStore.data.map { prefs -> prefs[EMAIL_KEY] }

    suspend fun save(session: Session) {
        withContext(Dispatchers.IO) {
            encryptedPrefs.edit()
                .putString(KEY_ACCESS_TOKEN, session.accessToken)
                .putString(KEY_REFRESH_TOKEN, session.refreshToken)
                .putLong(KEY_EXPIRES_AT, session.expiresAt.epochSecond)
                .putString(KEY_USER_ID, session.userId)
                .apply()
        }
        dataStore.edit { prefs ->
            prefs[LOGGED_IN_KEY] = true
            prefs[EMAIL_KEY] = session.email
        }
    }

    // userId was added alongside the basic login/coach dashboards work --
    // a session saved before this change has no stored userId, so it's
    // treated as "no session" here (same as a missing access token) and
    // the app falls back to Login. A one-time re-login for anyone
    // upgrading mid-session, not an ongoing concern.
    suspend fun readTokens(): StoredTokens? = withContext(Dispatchers.IO) {
        val accessToken = encryptedPrefs.getString(KEY_ACCESS_TOKEN, null)
        val refreshToken = encryptedPrefs.getString(KEY_REFRESH_TOKEN, null)
        val expiresAtEpoch = encryptedPrefs.getLong(KEY_EXPIRES_AT, -1)
        val userId = encryptedPrefs.getString(KEY_USER_ID, null)
        if (accessToken == null || refreshToken == null || expiresAtEpoch < 0 || userId == null) {
            return@withContext null
        }
        StoredTokens(accessToken, refreshToken, Instant.ofEpochSecond(expiresAtEpoch), userId)
    }

    suspend fun clear() {
        withContext(Dispatchers.IO) {
            encryptedPrefs.edit().clear().apply()
        }
        dataStore.edit { prefs -> prefs.clear() }
    }

    private companion object {
        const val KEY_ACCESS_TOKEN = "access_token"
        const val KEY_REFRESH_TOKEN = "refresh_token"
        const val KEY_EXPIRES_AT = "expires_at_epoch_seconds"
        const val KEY_USER_ID = "user_id"
    }
}
