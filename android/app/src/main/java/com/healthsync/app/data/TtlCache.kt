package com.healthsync.app.data

import java.time.Duration
import java.time.Instant

/**
 * Minimal in-memory, per-process cache keyed by clientId, short TTL.
 *
 * Neither DashboardScreen nor HomeScreen survive Compose Navigation's
 * teardown-and-recreate when the user navigates away and back (see
 * MainActivity's own comment on why navExpanded had to be hoisted out of
 * that same lifecycle) -- so every return visit re-ran every query from
 * scratch, which was the other half of the "dashboard is slow" complaint
 * beyond the queries themselves being sequential. This app has no
 * ViewModel/cache layer anywhere else (a deliberate simplicity choice so
 * far), so this is a plain singleton object rather than introducing a new
 * architecture layer just for this one fix.
 */
class TtlCache<T>(private val ttl: Duration) {
    private data class Entry<T>(val value: T, val loadedAt: Instant)

    private val entries = mutableMapOf<String, Entry<T>>()

    fun get(key: String): T? {
        val entry = entries[key] ?: return null
        if (Duration.between(entry.loadedAt, Instant.now()) > ttl) {
            entries.remove(key)
            return null
        }
        return entry.value
    }

    fun put(key: String, value: T) {
        entries[key] = Entry(value, Instant.now())
    }
}
