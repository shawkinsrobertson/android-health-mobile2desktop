package com.healthsync.app.sync

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.healthsync.app.healthconnect.allSyncSpecs
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.time.Instant

private val Context.syncDataStore by preferencesDataStore(name = "health_sync_state")
private val SYNC_CODE_KEY = stringPreferencesKey("sync_code")

/**
 * Tracks, per Health Connect record type ([SyncSpec.key]):
 *  - the Health Connect changes-API token for incremental sync
 *  - the wall-clock time of the last successful sync, for the status UI
 *
 * Also stores the optional client sync code (see the dashboard's /client
 * page) that tags every pushed row with a specific person's identity
 * instead of the `user_id` column's plain default -- see
 * supabase/migrations/0003_sync_code.sql for why this exists.
 *
 * Backed by Jetpack DataStore so state survives process death and doesn't
 * need its own SQLite table.
 */
class SyncStateStore(context: Context) {

    private val store = context.applicationContext.syncDataStore

    private fun tokenKey(specKey: String) = stringPreferencesKey("changes_token_$specKey")
    private fun lastSyncedKey(specKey: String) = longPreferencesKey("last_synced_epoch_ms_$specKey")

    suspend fun getSyncCode(): String? = store.data.map { prefs -> prefs[SYNC_CODE_KEY] }.first()

    /**
     * Blank input clears the code (reverts to the `user_id` column's
     * default) rather than saving "".
     *
     * When the code actually changes, also clears every record type's
     * changes-API token. Sync after that point only pushes what's changed
     * *since the last sync* -- for anything already synced before you
     * entered a code (which, for anything other than continuously-sampled
     * data like heart rate, is most of it), there may be nothing new to
     * push for a long while, so it would silently sit there tagged under
     * the old identity. Clearing the token forces the next sync to
     * backfill again; since every row upserts on the record's own stable
     * `health_connect_id`, that re-tags the existing rows in place with
     * the new user_id rather than duplicating them.
     */
    suspend fun saveSyncCode(code: String) {
        val trimmed = code.trim().uppercase()
        val previous = getSyncCode()
        store.edit { prefs ->
            if (trimmed.isEmpty()) prefs.remove(SYNC_CODE_KEY) else prefs[SYNC_CODE_KEY] = trimmed
        }
        if (trimmed != (previous ?: "")) {
            for (spec in allSyncSpecs) {
                clearChangesToken(spec.key)
            }
        }
    }

    suspend fun clearSyncCode() {
        store.edit { prefs -> prefs.remove(SYNC_CODE_KEY) }
    }

    val syncCodeFlow: Flow<String?> = store.data.map { prefs -> prefs[SYNC_CODE_KEY] }

    suspend fun getChangesToken(specKey: String): String? =
        store.data.map { prefs -> prefs[tokenKey(specKey)] }.first()

    suspend fun saveChangesToken(specKey: String, token: String) {
        store.edit { prefs ->
            prefs[tokenKey(specKey)] = token
            prefs[lastSyncedKey(specKey)] = Instant.now().toEpochMilli()
        }
    }

    suspend fun clearChangesToken(specKey: String) {
        store.edit { prefs -> prefs.remove(tokenKey(specKey)) }
    }

    suspend fun markSynced(specKey: String) {
        store.edit { prefs -> prefs[lastSyncedKey(specKey)] = Instant.now().toEpochMilli() }
    }

    fun lastSyncedFlow(specKey: String): Flow<Instant?> =
        store.data.map { prefs -> prefs[lastSyncedKey(specKey)]?.let(Instant::ofEpochMilli) }
}
