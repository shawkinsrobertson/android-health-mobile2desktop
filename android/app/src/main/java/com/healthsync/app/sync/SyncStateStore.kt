package com.healthsync.app.sync

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.time.Instant

private val Context.syncDataStore by preferencesDataStore(name = "health_sync_state")

/**
 * Tracks, per Health Connect record type ([SyncSpec.key]):
 *  - the Health Connect changes-API token for incremental sync
 *  - the wall-clock time of the last successful sync, for the status UI
 *
 * Backed by Jetpack DataStore so state survives process death and doesn't
 * need its own SQLite table.
 */
class SyncStateStore(context: Context) {

    private val store = context.applicationContext.syncDataStore

    private fun tokenKey(specKey: String) = stringPreferencesKey("changes_token_$specKey")
    private fun lastSyncedKey(specKey: String) = longPreferencesKey("last_synced_epoch_ms_$specKey")

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
