package com.flbp.manager.suite

import android.app.Application

class FLBPApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        NativePushRegistry.createNotificationChannel(this)
        NativePushRegistry.refreshRegistration(this)
    }
}
