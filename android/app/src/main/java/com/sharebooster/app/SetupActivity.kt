package com.sharebooster.app

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class SetupActivity : AppCompatActivity() {

    companion object {
        const val PREFS = "share_booster_prefs"
        const val KEY_URL = "server_url"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_setup)

        val input = findViewById<EditText>(R.id.url_input)
        val saveBtn = findViewById<Button>(R.id.save_btn)
        val errorView = findViewById<TextView>(R.id.error_view)

        val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
        prefs.getString(KEY_URL, null)?.let { input.setText(it) }

        saveBtn.setOnClickListener {
            val raw = input.text.toString().trim()
            val normalized = normalize(raw)
            if (normalized == null) {
                errorView.text = getString(R.string.setup_invalid)
                errorView.visibility = View.VISIBLE
                return@setOnClickListener
            }
            prefs.edit().putString(KEY_URL, normalized).apply()
            startActivity(Intent(this, MainActivity::class.java))
            finish()
        }
    }

    private fun normalize(raw: String): String? {
        if (raw.isEmpty()) return null
        var u = raw
        if (!u.startsWith("http://") && !u.startsWith("https://")) {
            u = "https://$u"
        }
        return try {
            val parsed = java.net.URL(u)
            if (parsed.host.isNullOrBlank()) null else u.trimEnd('/')
        } catch (_: Exception) {
            null
        }
    }
}
