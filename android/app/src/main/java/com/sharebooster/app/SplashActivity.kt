package com.sharebooster.app

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.appcompat.app.AppCompatActivity

class SplashActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_splash)

        Handler(Looper.getMainLooper()).postDelayed({
            val prefs = getSharedPreferences(SetupActivity.PREFS, MODE_PRIVATE)
            val url = prefs.getString(SetupActivity.KEY_URL, null)
            val intent = if (url.isNullOrBlank()) {
                Intent(this, SetupActivity::class.java)
            } else {
                Intent(this, MainActivity::class.java)
            }
            startActivity(intent)
            finish()
        }, 1400)
    }
}
