package com.healthsync.app

import android.app.Application
import com.healthsync.app.sync.SyncScheduler

class HealthSyncApp : Application() {
    override fun onCreate() {
        super.onCreate()
        SyncScheduler.schedulePeriodicSync(this)
    }
}
