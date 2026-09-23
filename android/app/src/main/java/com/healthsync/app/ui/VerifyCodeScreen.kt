package com.healthsync.app.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VerifyCodeScreen(
    email: String,
    onVerifyCode: suspend (email: String, code: String) -> Unit,
    onResendCode: suspend (email: String) -> Unit,
    onVerified: () -> Unit,
) {
    var code by remember { mutableStateOf("") }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var resent by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Scaffold(topBar = { TopAppBar(title = { Text("Enter code") }) }) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(16.dp)
                .fillMaxSize(),
        ) {
            Text("We sent an 8-digit code to $email.", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(16.dp))
            OutlinedTextField(
                value = code,
                onValueChange = {
                    code = it
                    error = null
                },
                label = { Text("8-digit code") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(12.dp))
            }
            Button(
                onClick = {
                    val trimmed = code.trim()
                    submitting = true
                    scope.launch {
                        try {
                            onVerifyCode(email, trimmed)
                            onVerified()
                        } catch (e: Exception) {
                            error = e.message ?: "That code didn't work. Try again."
                        } finally {
                            submitting = false
                        }
                    }
                },
                enabled = !submitting && code.isNotBlank(),
            ) {
                Text(if (submitting) "Verifying…" else "Verify")
            }
            Spacer(Modifier.height(12.dp))
            TextButton(
                onClick = {
                    scope.launch {
                        try {
                            onResendCode(email)
                            resent = true
                        } catch (e: Exception) {
                            error = e.message ?: "Couldn't resend the code."
                        }
                    }
                },
                enabled = !submitting,
            ) {
                Text(if (resent) "Code resent" else "Resend code")
            }
        }
    }
}
