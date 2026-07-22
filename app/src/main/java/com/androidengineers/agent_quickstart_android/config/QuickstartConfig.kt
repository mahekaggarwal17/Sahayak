package com.androidengineers.agent_quickstart_android.config

import com.androidengineers.agent_quickstart_android.BuildConfig

object QuickstartConfig {
    val backendBaseUrl: String = BuildConfig.QUICKSTART_SERVER_URL.trim().trimEnd('/')
    val backendAuthToken: String = BuildConfig.QUICKSTART_SERVER_TOKEN.trim()

    fun missingRequiredValues(): List<String> {
        val missing = mutableListOf<String>()
        if (backendBaseUrl.isBlank()) {
            missing += "QUICKSTART_SERVER_URL"
        }
        if (backendAuthToken.isBlank()) {
            missing += "QUICKSTART_SERVER_TOKEN"
        }
        return missing
    }

    val isConfigured: Boolean
        get() = missingRequiredValues().isEmpty()

    fun startupHelpMessage(): String? {
        val missing = missingRequiredValues()
        if (missing.isEmpty()) {
            return null
        }
        return "Add ${missing.joinToString()} to local.properties after starting the Python server and HTTPS tunnel."
    }
}
