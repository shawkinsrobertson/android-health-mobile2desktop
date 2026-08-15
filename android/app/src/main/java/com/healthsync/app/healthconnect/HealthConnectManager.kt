package com.healthsync.app.healthconnect

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission

/**
 * Thin wrapper around [HealthConnectClient]: availability checks, the set
 * of read permissions this app needs (derived from [allSyncSpecs] so adding
 * a new record type only requires touching SyncSpec.kt), and a permission
 * check.
 */
class HealthConnectManager(context: Context) {

    private val appContext = context.applicationContext

    /** True if the Health Connect provider app is installed and up to date. */
    val isAvailable: Boolean
        get() = HealthConnectClient.getSdkStatus(appContext) == HealthConnectClient.SDK_AVAILABLE

    val client: HealthConnectClient by lazy { HealthConnectClient.getOrCreate(appContext) }

    /**
     * Read permission strings for every record type we sync, plus the
     * special background-read permission. Without that last one, any
     * Health Connect read attempted while this app isn't the foreground
     * app (i.e. every WorkManager-triggered background sync, and even a
     * foreground manual sync if the app loses foreground mid-run) throws
     * a SecurityException instead of returning data.
     */
    val requiredPermissions: Set<String> by lazy {
        allSyncSpecs.map { spec -> HealthPermission.getReadPermission(spec.recordType) }.toSet() +
            HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND
    }

    fun permissionRequestContract() = PermissionController.createRequestPermissionResultContract()

    suspend fun hasAllPermissions(): Boolean {
        val granted = client.permissionController.getGrantedPermissions()
        return granted.containsAll(requiredPermissions)
    }
}
