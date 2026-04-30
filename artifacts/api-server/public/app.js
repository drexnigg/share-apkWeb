(() => {
  const I = window.SBIcons;

  /* =====================================================================
   * Configurable API base — bundled APK injects window.SB_API_BASE before
   * this script runs so the same frontend works inside the Android app.
   * ===================================================================== */
  const API_BASE = (window.SB_API_BASE || "").replace(/\/+$/, "");
  const APK_URL =
    "https://github.com/drexnigg/share-apkWeb/releases/latest/download/share-booster.apk";

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (s) =>
    String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  /* ===== HTTP ===== */
  async function api(path, opts = {}) {
    const url = `${API_BASE}/api${path}`;
    const res = await fetch(url, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  }

  /* ===== App state ===== */
  const state = {
    user: null,
    accounts: [],
    runStats: { success: 0, failed: 0, total: 0, elapsedMs: 0 },
    plannedTotal: 0,
    running: false,
    eventSource: null,
    logBuffer: [],
    lastRun: null,
  };

  /* ===== Splash ===== */
  function hideSplash() {
    const s = $("splash");
    if (!s) return;
    s.classList.add("fade");
    setTimeout(() => s.classList.add("hidden"), 500);
  }

  /* ===== Toast ===== */
  function toast(msg, kind = "") {
    const t = $("toast");
    t.textContent = msg;
    t.className = `toast show ${kind}`;
    setTimeout(() => t.classList.remove("show"), 2400);
    setTimeout(() => t.classList.add("hidden"), 2700);
    t.classList.remove("hidden");
  }

  /* ===== Modal ===== */
  function openModal(html) {
    const m = $("modal");
    $("modal-card").innerHTML = html;
    m.classList.remove("hidden");
    I.hydrate(m);
  }
  function closeModal() {
    $("modal").classList.add("hidden");
    $("modal-card").innerHTML = "";
  }
  $("modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") closeModal();
  });

  /* ===== Router ===== */
  const PAGES = {
    dashboard: { title: "Dashboard", icon: "home", render: renderDashboard },
    accounts:  { title: "Accounts",  icon: "users", render: renderAccounts },
    boost:     { title: "Boost",     icon: "zap",   render: renderBoost },
    activity:  { title: "Activity",  icon: "activity", render: renderActivity },
    admin:     { title: "Admin",     icon: "shield", render: renderAdmin, adminOnly: true },
    settings:  { title: "Settings",  icon: "settings", render: renderSettings },
  };

  function navOrder() {
    const order = ["dashboard", "accounts", "boost", "activity"];
    if (state.user?.role === "admin") order.push("admin");
    order.push("settings");
    return order;
  }

  function buildSidebar() {
    const nav = $("nav");
    nav.innerHTML = "";
    for (const key of navOrder()) {
      const p = PAGES[key];
      const btn = document.createElement("button");
      btn.className = "nav-item";
      btn.dataset.route = key;
      btn.innerHTML = `${I.get(p.icon)}<span>${escapeHtml(p.title)}</span>`;
      btn.addEventListener("click", () => navigate(key));
      nav.appendChild(btn);
    }
    const out = document.createElement("button");
    out.className = "nav-item";
    out.style.marginTop = "10px";
    out.innerHTML = `${I.get("logout")}<span>Sign out</span>`;
    out.addEventListener("click", logout);
    nav.appendChild(out);
  }

  function setActive(route) {
    document.querySelectorAll(".nav-item[data-route]").forEach((el) => {
      el.classList.toggle("active", el.dataset.route === route);
    });
  }

  function navigate(route) {
    if (!PAGES[route]) route = "dashboard";
    if (PAGES[route].adminOnly && state.user?.role !== "admin") route = "dashboard";
    location.hash = `#/${route}`;
    closeSidebar();
  }

  function currentRoute() {
    const m = location.hash.match(/^#\/(\w+)/);
    return m ? m[1] : "dashboard";
  }

  function renderRoute() {
    const route = currentRoute();
    const page = PAGES[route] || PAGES.dashboard;
    if (page.adminOnly && state.user?.role !== "admin") {
      navigate("dashboard");
      return;
    }
    $("page-title").textContent = page.title;
    setActive(route);
    page.render();
    I.hydrate($("page-root"));
  }
  window.addEventListener("hashchange", renderRoute);

  /* ===== Sidebar mobile ===== */
  function openSidebar() {
    $("sidebar").classList.add("open");
    let scrim = document.querySelector(".scrim");
    if (!scrim) {
      scrim = document.createElement("div");
      scrim.className = "scrim show";
      scrim.addEventListener("click", closeSidebar);
      document.body.appendChild(scrim);
    } else scrim.classList.add("show");
  }
  function closeSidebar() {
    $("sidebar").classList.remove("open");
    document.querySelector(".scrim")?.classList.remove("show");
  }
  $("menu-btn").addEventListener("click", () => {
    $("sidebar").classList.contains("open") ? closeSidebar() : openSidebar();
  });

  /* ===== Auth screen ===== */
  function authView(tab = "login") {
    const card = $("auth-card");
    card.innerHTML = `
      <div class="brand-head">
        <img src="/assets/icon.png" alt="" />
        <div>
          <h1>Share Booster</h1>
          <p>Fast, accurate, real-time post amplifier</p>
        </div>
      </div>
      <div class="tabs">
        <button class="tab ${tab === "login" ? "active" : ""}" data-tab="login">Sign in</button>
        <button class="tab ${tab === "register" ? "active" : ""}" data-tab="register">Create account</button>
      </div>
      <div id="auth-form"></div>
      <p class="auth-hint">Admin? Default is <strong>admin</strong> / <strong>admin123</strong> — change it in Settings after signing in.</p>
    `;
    card.querySelectorAll(".tab").forEach((t) =>
      t.addEventListener("click", () => authView(t.dataset.tab)),
    );
    if (tab === "login") loginForm();
    else registerForm();
  }

  function loginForm() {
    const wrap = $("auth-form");
    wrap.innerHTML = `
      <form id="lf">
        <label><span>Username</span><input name="username" autocomplete="username" required /></label>
        <label><span>Password</span><input type="password" name="password" autocomplete="current-password" required /></label>
        <button class="primary big" type="submit">Sign in</button>
        <p class="error" id="lf-err"></p>
      </form>
    `;
    $("lf").addEventListener("submit", async (e) => {
      e.preventDefault();
      $("lf-err").textContent = "";
      const fd = new FormData(e.currentTarget);
      try {
        const data = await api("/auth/login", {
          method: "POST",
          body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }),
        });
        state.user = data.user;
        await enterApp();
      } catch (err) {
        $("lf-err").textContent = err.message;
      }
    });
  }

  function registerForm() {
    const wrap = $("auth-form");
    wrap.innerHTML = `
      <form id="rf">
        <label><span>Username</span><input name="username" autocomplete="username" minlength="3" maxlength="32" required /></label>
        <label><span>Password</span><input type="password" name="password" autocomplete="new-password" minlength="6" required /></label>
        <button class="primary big" type="submit">Create account</button>
        <p class="error" id="rf-err"></p>
        <p class="success-text" id="rf-ok"></p>
        <p class="auth-hint">New accounts must be approved by an administrator.</p>
      </form>
    `;
    $("rf").addEventListener("submit", async (e) => {
      e.preventDefault();
      $("rf-err").textContent = ""; $("rf-ok").textContent = "";
      const fd = new FormData(e.currentTarget);
      try {
        const data = await api("/auth/register", {
          method: "POST",
          body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }),
        });
        $("rf-ok").textContent = data.message || "Account created. Wait for admin approval.";
        e.currentTarget.reset();
      } catch (err) {
        $("rf-err").textContent = err.message;
      }
    });
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    state.user = null;
    if (state.eventSource) { state.eventSource.close(); state.eventSource = null; }
    showAuth();
  }

  function showAuth() {
    $("auth-shell").classList.remove("hidden");
    $("app-shell").classList.add("hidden");
    authView("login");
  }

  async function enterApp() {
    $("auth-shell").classList.add("hidden");
    $("app-shell").classList.remove("hidden");
    const u = state.user;
    $("user-name").textContent = u.username;
    $("user-avatar").textContent = (u.username[0] || "?").toUpperCase();
    $("role-pill").textContent = u.role === "admin" ? "ADMIN" : "";
    $("role-pill").className = "role-pill " + (u.role === "admin" ? "admin" : "");
    $("apk-link").href = APK_URL;
    buildSidebar();
    I.hydrate(document);
    await refreshState();
    connectStream();
    if (!location.hash) location.hash = "#/dashboard";
    else renderRoute();
  }

  /* ===== Pages ===== */
  function renderDashboard() {
    const accountsReady = state.accounts.filter((a) => a.status === "ready").length;
    const total = state.accounts.length;
    const last = state.lastRun;
    $("page-root").innerHTML = `
      <div class="grid-4">
        <div class="kpi"><div class="kpi-label">${I.get("users")} Accounts</div><div class="kpi-value">${total}</div><div class="kpi-sub">${accountsReady} ready</div></div>
        <div class="kpi"><div class="kpi-label">${I.get("zap")} Status</div><div class="kpi-value">${state.running ? "Running" : "Idle"}</div><div class="kpi-sub">${state.running ? "Boost in progress" : "Ready to start"}</div></div>
        <div class="kpi"><div class="kpi-label">${I.get("check")} Successes</div><div class="kpi-value">${state.runStats.success || 0}</div><div class="kpi-sub">current run</div></div>
        <div class="kpi"><div class="kpi-label">${I.get("x")} Failures</div><div class="kpi-value">${state.runStats.failed || 0}</div><div class="kpi-sub">current run</div></div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>Quick start</h2>
          <button class="primary" id="qs-btn"><span data-icon="zap"></span>Open boost</button>
        </div>
        <p class="muted">
          Add Facebook accounts on the <strong>Accounts</strong> page, then start a boost on the
          <strong>Boost</strong> page. Live results stream into <strong>Activity</strong>.
        </p>
        <div class="row">
          <button class="ghost" data-go="accounts"><span data-icon="users"></span>Manage accounts</button>
          <button class="ghost" data-go="activity"><span data-icon="activity"></span>View activity</button>
          ${state.user?.role === "admin" ? '<button class="ghost" data-go="admin"><span data-icon="shield"></span>Admin panel</button>' : ""}
        </div>
      </div>

      ${last ? `
      <div class="card">
        <div class="card-head"><h2>Last completed run</h2></div>
        <div class="grid-3">
          <div class="kpi tight"><div class="kpi-label">Successes</div><div class="kpi-value">${last.success}</div></div>
          <div class="kpi tight"><div class="kpi-label">Failures</div><div class="kpi-value">${last.failed}</div></div>
          <div class="kpi tight"><div class="kpi-label">Duration</div><div class="kpi-value">${fmtElapsed(last.elapsedMs)}</div></div>
        </div>
      </div>` : ""}
    `;
    $("qs-btn").addEventListener("click", () => navigate("boost"));
    document.querySelectorAll("[data-go]").forEach((b) =>
      b.addEventListener("click", () => navigate(b.dataset.go)),
    );
  }

  function initials(name) {
    return (name || "??").split(/\s+/).filter(Boolean).slice(0, 2)
      .map((p) => p[0].toUpperCase()).join("");
  }

  function renderAccounts() {
    $("page-root").innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>Add Facebook accounts</h2>
          <span class="muted small">Paste one cookie string per line</span>
        </div>
        <p class="muted">
          Share Booster extracts the access token and resolves the real account name for each
          cookie you add. Cookies stay on your server.
        </p>
        <textarea id="cookies-input" rows="6" placeholder="c_user=...; xs=...; fr=...;
c_user=...; xs=...; fr=...;"></textarea>
        <div class="row">
          <button id="add-btn" class="primary"><span data-icon="plus"></span>Add accounts</button>
          <button id="clear-btn" class="ghost"><span data-icon="trash"></span>Remove all</button>
          <span id="add-status" class="status-text"></span>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>Loaded accounts</h2>
          <span class="muted small">${state.accounts.length} total</span>
        </div>
        <div id="accounts-list" class="list"></div>
      </div>
    `;
    drawAccounts();
    I.hydrate($("page-root"));
    $("add-btn").addEventListener("click", addAccounts);
    $("clear-btn").addEventListener("click", async () => {
      if (!confirm("Remove all loaded accounts?")) return;
      await api("/share/accounts", { method: "DELETE" }).catch(() => {});
      await refreshState();
      drawAccounts();
      toast("Accounts cleared");
    });
  }

  function drawAccounts() {
    const list = $("accounts-list");
    if (!list) return;
    if (!state.accounts.length) {
      list.innerHTML = '<p class="muted small">No accounts loaded yet.</p>';
      return;
    }
    list.innerHTML = "";
    for (const a of state.accounts) {
      const row = document.createElement("div");
      row.className = "list-row";
      row.innerHTML = `
        <div class="list-info">
          <div class="avatar">${escapeHtml(initials(a.name))}</div>
          <div>
            <div class="list-name">${escapeHtml(a.name)}</div>
            <div class="list-meta">${a.shares || 0} shares this run</div>
          </div>
        </div>
        <div class="list-actions">
          <span class="badge ${a.status}">${(a.status || "").replace("_", " ")}</span>
          <button class="icon-btn" title="Remove" data-rm="${escapeHtml(a.id)}"><span data-icon="trash"></span></button>
        </div>
      `;
      list.appendChild(row);
    }
    I.hydrate(list);
    list.querySelectorAll("[data-rm]").forEach((b) =>
      b.addEventListener("click", async () => {
        await api(`/share/accounts/${encodeURIComponent(b.dataset.rm)}`, { method: "DELETE" }).catch(() => {});
        await refreshState();
        drawAccounts();
      }),
    );
  }

  async function addAccounts() {
    const raw = $("cookies-input").value.trim();
    if (!raw) return;
    const cookies = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    $("add-status").textContent = "Verifying cookies…";
    try {
      const data = await api("/share/accounts", {
        method: "POST",
        body: JSON.stringify({ cookies }),
      });
      const ok = data.results.filter((r) => r.ok).length;
      const fail = data.results.length - ok;
      $("add-status").textContent = `${ok} added, ${fail} failed`;
      $("cookies-input").value = "";
      data.results.forEach((r, i) => {
        addLog({
          level: r.ok ? "success" : "error",
          message: r.ok ? `Loaded account: ${r.name}` : `Cookie ${i + 1}: ${r.error}`,
          ts: Date.now(),
        });
      });
      await refreshState();
      drawAccounts();
    } catch (err) {
      $("add-status").textContent = err.message;
    }
  }

  function renderBoost() {
    $("page-root").innerHTML = `
      <div class="card">
        <div class="card-head"><h2>Start a boost</h2></div>
        <label><span>Post link</span>
          <input type="url" id="link-input" placeholder="https://www.facebook.com/..." />
        </label>
        <label><span>Number of shares (max 5000)</span>
          <input type="number" id="total-input" min="1" max="5000" value="100" />
        </label>
        <div class="row">
          <button id="start-btn" class="primary big"><span data-icon="play"></span>Start boosting</button>
          <button id="stop-btn" class="danger" disabled><span data-icon="stop"></span>Stop</button>
        </div>

        <div class="stats">
          <div class="stat"><span class="stat-label">Success</span><span class="stat-value" id="stat-success">${state.runStats.success || 0}</span></div>
          <div class="stat"><span class="stat-label">Failed</span><span class="stat-value" id="stat-failed">${state.runStats.failed || 0}</span></div>
          <div class="stat"><span class="stat-label">Total</span><span class="stat-value" id="stat-total">${state.runStats.total || 0}</span></div>
          <div class="stat"><span class="stat-label">Elapsed</span><span class="stat-value" id="stat-elapsed">${fmtElapsed(state.runStats.elapsedMs || 0)}</span></div>
        </div>
        <div class="progress"><div class="progress-bar" id="progress-bar" style="width:${state.plannedTotal ? Math.min(100, (state.runStats.total / state.plannedTotal) * 100) : 0}%"></div></div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>Accounts in use</h2>
          <button class="ghost small" data-go="accounts"><span data-icon="plus"></span>Add more</button>
        </div>
        <div id="boost-accounts" class="list"></div>
      </div>
    `;
    drawBoostAccounts();
    I.hydrate($("page-root"));
    document.querySelectorAll("[data-go]").forEach((b) =>
      b.addEventListener("click", () => navigate(b.dataset.go)),
    );
    const startBtn = $("start-btn");
    const stopBtn = $("stop-btn");
    if (state.running) { startBtn.disabled = true; stopBtn.disabled = false; }
    startBtn.addEventListener("click", async () => {
      const link = $("link-input").value.trim();
      const total = Number($("total-input").value);
      if (!link) { toast("Paste a post link first", "error"); return; }
      try {
        const data = await api("/share/start", {
          method: "POST",
          body: JSON.stringify({ link, total }),
        });
        state.plannedTotal = data.total;
        state.running = true;
        startBtn.disabled = true; stopBtn.disabled = false;
        ["stat-success","stat-failed","stat-total"].forEach((id) => $(id).textContent = "0");
        $("stat-elapsed").textContent = "0s";
        $("progress-bar").style.width = "0%";
        toast("Boost started");
      } catch (err) {
        addLog({ level: "error", message: err.message, ts: Date.now() });
        toast(err.message, "error");
      }
    });
    stopBtn.addEventListener("click", async () => {
      await api("/share/stop", { method: "POST" }).catch(() => {});
      addLog({ level: "warn", message: "Stop requested.", ts: Date.now() });
    });
  }

  function drawBoostAccounts() {
    const el = $("boost-accounts");
    if (!el) return;
    if (!state.accounts.length) {
      el.innerHTML = '<p class="muted small">No accounts loaded. Add some on the Accounts page.</p>';
      return;
    }
    el.innerHTML = "";
    for (const a of state.accounts) {
      const row = document.createElement("div");
      row.className = "list-row";
      row.innerHTML = `
        <div class="list-info">
          <div class="avatar">${escapeHtml(initials(a.name))}</div>
          <div>
            <div class="list-name">${escapeHtml(a.name)}</div>
            <div class="list-meta">${a.shares || 0} shares</div>
          </div>
        </div>
        <span class="badge ${a.status}">${(a.status || "").replace("_", " ")}</span>
      `;
      el.appendChild(row);
    }
  }

  function renderActivity() {
    $("page-root").innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>Live activity</h2>
          <div class="row">
            <button id="refresh-logs" class="ghost small"><span data-icon="refresh"></span>Reconnect</button>
            <button id="clear-logs" class="ghost small"><span data-icon="trash"></span>Clear</button>
          </div>
        </div>
        <div id="logs" class="logs"></div>
      </div>
    `;
    I.hydrate($("page-root"));
    redrawLogs();
    $("clear-logs").addEventListener("click", () => {
      state.logBuffer = [];
      redrawLogs();
    });
    $("refresh-logs").addEventListener("click", () => {
      connectStream();
      toast("Stream reconnected");
    });
  }

  function redrawLogs() {
    const el = $("logs");
    if (!el) return;
    if (!state.logBuffer.length) {
      el.innerHTML = '<div class="muted small">Live share results stream here as they happen.</div>';
      return;
    }
    el.innerHTML = state.logBuffer
      .slice(-500)
      .map((ev) => {
        const acct = ev.account ? ` <span class="log-account">[${escapeHtml(ev.account)}]</span>` : "";
        return `<div class="log-entry"><span class="log-time">${fmtTime(ev.ts)}</span><span class="log-tag ${ev.level}">${ev.level.toUpperCase()}</span><span class="log-msg">${acct} ${escapeHtml(ev.message)}</span></div>`;
      })
      .join("");
    el.scrollTop = el.scrollHeight;
  }

  function renderAdmin() {
    $("page-root").innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>User management</h2>
          <button class="ghost small" id="reload-users"><span data-icon="refresh"></span>Refresh</button>
        </div>
        <p class="muted">Approve, reject, or remove users. Pending users cannot sign in.</p>
        <div id="users-list" class="list"><p class="muted small">Loading…</p></div>
      </div>
    `;
    I.hydrate($("page-root"));
    loadUsers();
    $("reload-users").addEventListener("click", loadUsers);
  }

  async function loadUsers() {
    try {
      const data = await api("/admin/users");
      const users = (data.users || []).slice().sort((a, b) => {
        const order = { pending: 0, approved: 1, rejected: 2 };
        return (order[a.status] - order[b.status]) || (b.createdAt - a.createdAt);
      });
      const el = $("users-list");
      if (!users.length) {
        el.innerHTML = '<p class="muted small">No users yet.</p>';
        return;
      }
      el.innerHTML = "";
      for (const u of users) {
        const isAdmin = u.role === "admin";
        const created = new Date(u.createdAt).toLocaleString();
        const row = document.createElement("div");
        row.className = "list-row";
        const actions = isAdmin
          ? '<span class="muted small">Cannot modify admin</span>'
          : `
            ${u.status !== "approved" ? `<button class="primary small" data-approve="${u.id}"><span data-icon="check"></span>Approve</button>` : ""}
            ${u.status !== "rejected" ? `<button class="ghost small" data-reject="${u.id}"><span data-icon="x"></span>Reject</button>` : ""}
            <button class="danger small" data-del="${u.id}"><span data-icon="trash"></span>Delete</button>
          `;
        row.innerHTML = `
          <div class="list-info">
            <div class="avatar">${escapeHtml(initials(u.username))}</div>
            <div>
              <div class="list-name">${escapeHtml(u.username)} ${isAdmin ? '<span class="badge admin">ADMIN</span>' : ""}</div>
              <div class="list-meta">Joined ${created}</div>
            </div>
          </div>
          <div class="list-actions">
            <span class="badge ${u.status}">${u.status}</span>
            ${actions}
          </div>
        `;
        el.appendChild(row);
      }
      I.hydrate(el);
      el.querySelectorAll("[data-approve]").forEach((b) => b.addEventListener("click", async () => {
        await api(`/admin/users/${b.dataset.approve}/approve`, { method: "POST" }).catch(() => {});
        toast("User approved", "success"); loadUsers();
      }));
      el.querySelectorAll("[data-reject]").forEach((b) => b.addEventListener("click", async () => {
        await api(`/admin/users/${b.dataset.reject}/reject`, { method: "POST" }).catch(() => {});
        toast("User rejected"); loadUsers();
      }));
      el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
        if (!confirm("Delete this user permanently?")) return;
        await api(`/admin/users/${b.dataset.del}`, { method: "DELETE" }).catch(() => {});
        toast("User deleted"); loadUsers();
      }));
    } catch (err) {
      $("users-list").innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    }
  }

  function renderSettings() {
    $("page-root").innerHTML = `
      <div class="card">
        <div class="card-head"><h2>Account</h2></div>
        <div class="list-row">
          <div class="list-info">
            <div class="avatar">${escapeHtml(initials(state.user.username))}</div>
            <div>
              <div class="list-name">${escapeHtml(state.user.username)}</div>
              <div class="list-meta">${state.user.role === "admin" ? "Administrator" : "User"}</div>
            </div>
          </div>
          <button class="ghost" id="change-pw-btn"><span data-icon="key"></span>Change password</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Android app</h2></div>
        <p class="muted">Install Share Booster on your phone to manage boosts on the go.</p>
        <a class="primary" href="${APK_URL}" target="_blank" rel="noopener" style="display:inline-flex;width:max-content;text-decoration:none;color:white;padding:12px 18px;border-radius:10px;">
          <span data-icon="download"></span><span style="margin-left:8px;">Download latest APK</span>
        </a>
      </div>

      <div class="card">
        <div class="card-head"><h2>Session</h2></div>
        <button class="danger" id="logout-btn-2"><span data-icon="logout"></span>Sign out</button>
      </div>
    `;
    I.hydrate($("page-root"));
    $("change-pw-btn").addEventListener("click", openChangePw);
    $("logout-btn-2").addEventListener("click", logout);
  }

  function openChangePw() {
    openModal(`
      <h3>Change password</h3>
      <form id="cpf">
        <label><span>Current password</span><input type="password" name="cur" required /></label>
        <label><span>New password</span><input type="password" name="nxt" minlength="6" required /></label>
        <p class="error" id="cpf-err"></p>
        <div class="row">
          <button type="submit" class="primary"><span data-icon="check"></span>Update</button>
          <button type="button" class="ghost" id="cpf-cancel">Cancel</button>
        </div>
      </form>
    `);
    $("cpf-cancel").addEventListener("click", closeModal);
    $("cpf").addEventListener("submit", async (e) => {
      e.preventDefault();
      $("cpf-err").textContent = "";
      const fd = new FormData(e.currentTarget);
      try {
        await api("/auth/change-password", {
          method: "POST",
          body: JSON.stringify({
            currentPassword: fd.get("cur"),
            newPassword: fd.get("nxt"),
          }),
        });
        closeModal();
        toast("Password updated", "success");
      } catch (err) {
        $("cpf-err").textContent = err.message;
      }
    });
  }

  /* ===== Helpers ===== */
  function fmtTime(ts) { return new Date(ts).toLocaleTimeString(); }
  function fmtElapsed(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${sec}s`;
  }

  function addLog(ev) {
    state.logBuffer.push(ev);
    if (state.logBuffer.length > 1000) state.logBuffer.splice(0, state.logBuffer.length - 1000);
    if (currentRoute() === "activity") redrawLogs();
  }

  /* ===== Live stream ===== */
  function connectStream() {
    if (state.eventSource) state.eventSource.close();
    const url = `${API_BASE}/api/events`;
    const es = new EventSource(url, { withCredentials: true });
    state.eventSource = es;
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === "log") addLog(ev);
        else if (ev.type === "stats") {
          state.runStats = {
            success: ev.success, failed: ev.failed, total: ev.total, elapsedMs: ev.elapsedMs,
          };
          state.accounts = (ev.perAccount || []).map((a) => ({
            id: a.name, name: a.name, shares: a.shares, status: a.status,
          }));
          updateBoostUi();
          drawBoostAccounts();
          drawAccounts();
          if (currentRoute() === "dashboard") renderDashboard();
        } else if (ev.type === "done") {
          state.running = false;
          state.lastRun = { success: ev.success, failed: ev.failed, elapsedMs: ev.elapsedMs };
          updateBoostUi();
          addLog({ level: "success", message: `Done — ${ev.success} success, ${ev.failed} failed in ${fmtElapsed(ev.elapsedMs)}`, ts: Date.now() });
          toast("Boost finished", "success");
        }
      } catch {}
    };
  }

  function updateBoostUi() {
    if ($("stat-success")) $("stat-success").textContent = String(state.runStats.success);
    if ($("stat-failed")) $("stat-failed").textContent = String(state.runStats.failed);
    if ($("stat-total")) $("stat-total").textContent = String(state.runStats.total);
    if ($("stat-elapsed")) $("stat-elapsed").textContent = fmtElapsed(state.runStats.elapsedMs);
    if ($("progress-bar") && state.plannedTotal > 0) {
      $("progress-bar").style.width = Math.min(100, (state.runStats.total / state.plannedTotal) * 100) + "%";
    }
    if ($("start-btn")) $("start-btn").disabled = state.running;
    if ($("stop-btn")) $("stop-btn").disabled = !state.running;
  }

  async function refreshState() {
    try {
      const data = await api("/share/state");
      state.accounts = data.accounts || [];
      state.runStats = {
        success: data.success || 0,
        failed: data.failed || 0,
        total: (data.success || 0) + (data.failed || 0),
        elapsedMs: data.elapsedMs || 0,
      };
      state.running = !!data.running;
      state.plannedTotal = data.currentTarget || 0;
    } catch {}
  }

  /* ===== Bootstrap ===== */
  (async () => {
    I.hydrate(document);
    setTimeout(hideSplash, 900);
    try {
      const data = await api("/auth/me");
      if (data && data.user && data.user.status === "approved") {
        state.user = data.user;
        await enterApp();
      } else {
        showAuth();
      }
    } catch {
      showAuth();
    }
  })();
})();
