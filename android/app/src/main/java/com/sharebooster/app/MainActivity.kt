package com.sharebooster.app

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var refresh: SwipeRefreshLayout
    private lateinit var progress: ProgressBar
    private lateinit var errorPanel: LinearLayout
    private lateinit var errorText: TextView
    private lateinit var retryBtn: Button
    private lateinit var changeUrlBtn: Button
    private lateinit var serverUrl: String

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val prefs = getSharedPreferences(SetupActivity.PREFS, MODE_PRIVATE)
        serverUrl = prefs.getString(SetupActivity.KEY_URL, null) ?: run {
            startActivity(Intent(this, SetupActivity::class.java))
            finish()
            return
        }

        progress = findViewById(R.id.progress)
        refresh = findViewById(R.id.swipe_refresh)
        webView = findViewById(R.id.web_view)
        errorPanel = findViewById(R.id.error_panel)
        errorText = findViewById(R.id.error_text)
        retryBtn = findViewById(R.id.retry_btn)
        changeUrlBtn = findViewById(R.id.change_url_btn)

        val s: WebSettings = webView.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.databaseEnabled = true
        s.useWideViewPort = true
        s.loadWithOverviewMode = true
        s.cacheMode = WebSettings.LOAD_DEFAULT
        s.userAgentString = s.userAgentString + " ShareBoosterApp/1.0"

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                progress.visibility = View.VISIBLE
                errorPanel.visibility = View.GONE
            }
            override fun onPageFinished(view: WebView?, url: String?) {
                progress.visibility = View.GONE
                refresh.isRefreshing = false
            }
            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (request?.isForMainFrame == true) {
                    progress.visibility = View.GONE
                    refresh.isRefreshing = false
                    val msg = error?.description?.toString() ?: "Could not load the page."
                    showError(getString(R.string.error_could_not_reach, serverUrl) + "\n\n" + msg)
                }
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progress.progress = newProgress
                if (newProgress >= 100) progress.visibility = View.GONE
            }
        }
        webView.setDownloadListener { url, _, _, _, _ ->
            val request = DownloadManager.Request(Uri.parse(url))
            val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            dm.enqueue(request)
        }
        refresh.setOnRefreshListener { webView.reload() }

        retryBtn.setOnClickListener {
            errorPanel.visibility = View.GONE
            webView.loadUrl(serverUrl)
        }
        changeUrlBtn.setOnClickListener {
            startActivity(Intent(this, SetupActivity::class.java))
            finish()
        }

        if (savedInstanceState == null) {
            webView.loadUrl(serverUrl)
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    private fun showError(message: String) {
        errorText.text = message
        errorPanel.visibility = View.VISIBLE
        webView.visibility = View.VISIBLE
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.main_menu, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_reload -> { webView.reload(); true }
            R.id.action_change_server -> {
                startActivity(Intent(this, SetupActivity::class.java))
                finish(); true
            }
            R.id.action_about -> {
                AlertDialog.Builder(this)
                    .setTitle(R.string.app_name)
                    .setMessage(getString(R.string.about_message, serverUrl))
                    .setPositiveButton(android.R.string.ok, null)
                    .show()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }
}
