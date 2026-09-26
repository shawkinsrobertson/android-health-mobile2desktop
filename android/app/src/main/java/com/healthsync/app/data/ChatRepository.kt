package com.healthsync.app.data

import com.healthsync.app.supabase.SupabaseRestClient
import java.time.Instant
import java.time.format.DateTimeFormatter

data class ChatThread(
    val id: String,
    val coachId: String,
    val clientId: String,
)

data class ChatMessage(
    val id: String,
    val senderId: String,
    val senderRole: String, // "coach" | "client"
    val body: String?,
    val createdAt: Instant,
)

private val ISO_INSTANT = DateTimeFormatter.ISO_INSTANT

/**
 * First pass at the client's 1:1 coach chat -- text-only (no attachments,
 * reactions, replies, or pinning -- see dashboard/lib/chat.ts for the
 * full web feature this deliberately doesn't port yet), and polling
 * instead of the web's Supabase Realtime subscription
 * (`ThreadView.tsx`'s `.channel(...).on("postgres_changes", ...)`).
 * Polling is a real simplification, not a placeholder for "not built
 * yet": this app has no Realtime/websocket client set up anywhere
 * (SupabaseRestClient is plain PostgREST-over-OkHttp), and a short poll
 * interval while InboxScreen is actually open is a reasonable
 * "first pass" tradeoff against pulling in a whole new client library
 * for one screen.
 */
class ChatRepository(private val supabase: SupabaseRestClient) {

    /** The client's single coach thread, if one exists yet -- chat_threads has a unique (coach_id, client_id), so this is at most one row. */
    suspend fun findThread(clientId: String): ChatThread? {
        val rows = supabase.select(
            "chat_threads",
            mapOf(
                "select" to "id,coach_id,client_id",
                "client_id" to "eq.$clientId",
                "limit" to "1",
            ),
        )
        if (rows.length() == 0) return null
        val row = rows.getJSONObject(0)
        return ChatThread(
            id = row.getString("id"),
            coachId = row.getString("coach_id"),
            clientId = row.getString("client_id"),
        )
    }

    suspend fun getMessages(threadId: String, limit: Int = 100): List<ChatMessage> {
        val rows = supabase.select(
            "chat_messages",
            mapOf(
                "select" to "id,sender_id,sender_role,body,created_at",
                "thread_id" to "eq.$threadId",
                "order" to "created_at.asc",
                "limit" to limit.toString(),
            ),
        )
        return (0 until rows.length()).map { i ->
            val row = rows.getJSONObject(i)
            ChatMessage(
                id = row.getString("id"),
                senderId = row.getString("sender_id"),
                senderRole = row.getString("sender_role"),
                body = row.optString("body").ifBlank { null },
                createdAt = Instant.parse(row.getString("created_at")),
            )
        }
    }

    suspend fun sendMessage(thread: ChatThread, senderId: String, body: String) {
        supabase.insert(
            "chat_messages",
            listOf(
                mapOf(
                    "thread_id" to thread.id,
                    "coach_id" to thread.coachId,
                    "client_id" to thread.clientId,
                    "sender_id" to senderId,
                    "sender_role" to "client",
                    "body" to body,
                ),
            ),
        )
    }

    suspend fun markRead(threadId: String) {
        supabase.patch(
            "chat_threads",
            mapOf("id" to "eq.$threadId"),
            mapOf("client_last_read_at" to ISO_INSTANT.format(Instant.now())),
        )
    }
}
