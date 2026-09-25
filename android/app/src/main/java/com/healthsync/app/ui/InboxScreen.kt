package com.healthsync.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.healthsync.app.auth.AuthRepository
import com.healthsync.app.data.ChatMessage
import com.healthsync.app.data.ChatRepository
import com.healthsync.app.data.ChatThread
import com.healthsync.app.supabase.SupabaseRestClient
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private const val POLL_INTERVAL_MS = 5000L

/**
 * First-pass coach chat -- see ChatRepository's doc comment for why this
 * is text-only and polling-based rather than the web's Realtime-backed,
 * richer (attachments/reactions/replies) thread view.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InboxScreen(clientId: String, authRepository: AuthRepository, onBack: () -> Unit) {
    var repository by remember { mutableStateOf<ChatRepository?>(null) }
    var thread by remember { mutableStateOf<ChatThread?>(null) }
    var messages by remember { mutableStateOf<List<ChatMessage>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var draft by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val scrollState = rememberScrollState()

    LaunchedEffect(clientId) {
        val token = authRepository.getValidAccessToken()
        if (token == null) {
            error = "Not signed in"
            loading = false
            return@LaunchedEffect
        }
        val repo = ChatRepository(SupabaseRestClient(token))
        repository = repo
        try {
            val found = repo.findThread(clientId)
            thread = found
            if (found != null) {
                repo.markRead(found.id)
            }
        } catch (e: Exception) {
            error = e.message ?: "Couldn't load your messages"
        }
        loading = false
    }

    // Polls only while a thread exists and this screen is on screen --
    // cancelled automatically when InboxScreen leaves composition.
    LaunchedEffect(thread) {
        val currentThread = thread ?: return@LaunchedEffect
        val repo = repository ?: return@LaunchedEffect
        while (true) {
            try {
                val fetched = repo.getMessages(currentThread.id)
                if (fetched.size != messages.size) {
                    messages = fetched
                    repo.markRead(currentThread.id)
                }
            } catch (e: Exception) {
                // A transient poll failure isn't worth surfacing as a
                // screen-level error -- just try again next interval.
            }
            delay(POLL_INTERVAL_MS)
        }
    }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) scrollState.animateScrollTo(scrollState.maxValue)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Inbox") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Text("←", style = MaterialTheme.typography.headlineSmall)
                    }
                },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.padding(padding).fillMaxSize()) {
            val currentError = error
            when {
                loading -> Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                currentError != null -> Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text(currentError, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(24.dp))
                }
                thread == null -> Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text(
                        "No conversation yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                else -> {
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth()
                            .padding(16.dp)
                            .verticalScroll(scrollState),
                    ) {
                        if (messages.isEmpty()) {
                            Text(
                                "Say hello!",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        messages.forEach { message -> MessageBubble(message, clientId) }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth().padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        OutlinedTextField(
                            value = draft,
                            onValueChange = { draft = it },
                            modifier = Modifier.weight(1f),
                            placeholder = { Text("Message…") },
                        )
                        Spacer(Modifier.width(8.dp))
                        Button(
                            enabled = draft.isNotBlank() && !sending,
                            onClick = {
                                val repo = repository ?: return@Button
                                val currentThread = thread ?: return@Button
                                val body = draft.trim()
                                sending = true
                                scope.launch {
                                    repo.sendMessage(currentThread, clientId, body)
                                    draft = ""
                                    messages = repo.getMessages(currentThread.id)
                                    sending = false
                                }
                            },
                        ) { Text("Send") }
                    }
                }
            }
        }
    }
}

@Composable
private fun MessageBubble(message: ChatMessage, clientId: String) {
    val isMine = message.senderId == clientId
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = if (isMine) Arrangement.End else Arrangement.Start,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 280.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(
                    if (isMine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                )
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            Text(
                message.body ?: "",
                color = if (isMine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                DateTimeFormatter.ofPattern("h:mm a").withZone(ZoneId.systemDefault()).format(message.createdAt),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Light,
                color = if (isMine) {
                    MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.7f)
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                },
            )
        }
    }
}
