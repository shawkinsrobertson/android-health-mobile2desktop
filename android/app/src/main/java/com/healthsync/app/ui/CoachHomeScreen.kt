package com.healthsync.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.healthsync.app.auth.AuthRepository
import com.healthsync.app.data.ClientSummary
import com.healthsync.app.data.ProfileRepository
import com.healthsync.app.supabase.SupabaseRestClient

/**
 * Coach-facing landing content -- a plain roster of their clients;
 * tapping one opens the same basic DashboardScreen a client sees for
 * themselves. Unlike HomeScreen this has no Health Connect permission
 * or sync UI at all -- coaches don't sync their own device's health
 * data through this app, they're only here to look at their clients'.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CoachHomeScreen(
    authRepository: AuthRepository,
    email: String?,
    onOpenClient: (clientId: String) -> Unit,
    onSignOut: () -> Unit,
) {
    var clients by remember { mutableStateOf<List<ClientSummary>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        val token = authRepository.getValidAccessToken()
        val coachId = authRepository.getUserId()
        if (token == null || coachId == null) {
            error = "Not signed in"
            return@LaunchedEffect
        }
        try {
            clients = ProfileRepository(SupabaseRestClient(token)).loadClients(coachId)
        } catch (e: Exception) {
            error = e.message ?: "Couldn't load your clients"
        }
    }

    Scaffold(topBar = { TopAppBar(title = { Text("Your clients") }) }) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(16.dp)
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
        ) {
            val currentError = error
            val currentClients = clients
            when {
                currentError != null -> Text(currentError, color = MaterialTheme.colorScheme.error)
                currentClients == null -> CircularProgressIndicator()
                currentClients.isEmpty() -> Text("No clients yet.")
                else -> currentClients.forEach { client ->
                    ListItem(
                        headlineContent = { Text(client.fullName ?: client.email) },
                        supportingContent = { Text(client.email) },
                        modifier = Modifier.clickable { onOpenClient(client.id) },
                    )
                }
            }

            Spacer(Modifier.height(20.dp))
            Text(
                email?.let { "Signed in as $it" } ?: "Signed in",
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(Modifier.height(4.dp))
            TextButton(onClick = onSignOut) {
                Text("Sign out")
            }
        }
    }
}
