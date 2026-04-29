(() => {
  const $ = (id) => document.getElementById(id);

  const APK_URL =
    "https://github.com/drexnigg/share-apkWeb/releases/latest/download/share-booster.apk";

  const authScreen = $("auth-screen");
  const appScreen = $("app-screen");
  const userNameEl = $("user-name");
  const rolePillEl = $("user-role-pill");
  const adminToggleBtn = $("admin-toggle-btn");
  const adminCard = $("admin-card");
  const loginForm = $("login-form");
  const registerForm = $("register-form");
  const loginError = $("login-error");
  const registerError = $("register-error");
  const registerInfo = $("register-info");

  $("apk-download").href = APK_URL;
  $("apk-download-top").addEventListener("click", () => {
    window.open(APK_URL, "_blank", "noopener");
  });

  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".auth-form").forEach((f) => {
        f.classList.toggle("active", f.id === `${target}-form`);
      });
    });
  });

  async function api(path, opts = {}) {
    const res = await fetch(`/api${path}`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
      ...opts,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      // ignore
    }
    if (!res.ok) {
      const msg = (data && data.error) || `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showApp(user) {
    authScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
    userNameEl.textContent = user.username;
    if (user.role === "admin") {
      rolePillEl.textContent = "ADMIN";
      rolePillEl.classList.add("admin");
      adminToggleBtn.classList.remove("hidden");
    } else {
      rolePillEl.textContent = "";
      rolePillEl.classList.remove("admin");
      adminToggleBtn.classList.add("hidden");
      adminCard.classList.add("hidden");
    }
    refreshState();
    connectStream();
  }

  function showAuth() {
    appScreen.classList.add("hidden");
    authScreen.classList.remove("hidden");
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.textContent = "";
    const fd = new FormData(loginForm);
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: fd.get("username"),
          password: fd.get("password"),
        }),
      });
      showApp(data.user);
    } catch (err) {
      loginError.textContent = err.message;
    }
  });

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    registerError.textContent = "";
    registerInfo.textContent = "";
    const fd = new FormData(registerForm);
    try {
      const data = await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          username: fd.get("username"),
          password: fd.get("password"),
        }),
      });
      registerInfo.textContent =
        data.message ||
        "Account created. Wait for an administrator to approve it.";
      registerForm.reset();
    } catch (err) {
      registerError.textContent = err.message;
    }
  });

  $("logout-btn").addEventListener("click", async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    showAuth();
  });

  /* ===== Admin panel ===== */
  const usersListEl = $("users-list");

  adminToggleBtn.addEventListener("click", () => {
    adminCard.classList.toggle("hidden");
    if (!adminCard.classList.contains("hidden")) loadUsers();
  });

  $("refresh-users-btn").addEventListener("click", loadUsers);

  async function loadUsers() {
    usersListEl.innerHTML = '<p class="muted small">Loading…</p>';
    try {
      const data = await api("/admin/users");
      renderUsers(data.users || []);
    } catch (err) {
      usersListEl.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    }
  }

  function renderUsers(users) {
    if (users.length === 0) {
      usersListEl.innerHTML = '<p class="muted small">No users yet.</p>';
      return;
    }
    usersListEl.innerHTML = "";
    users.sort((a, b) => {
      const order = { pending: 0, approved: 1, rejected: 2 };
      const sa = order[a.status] ?? 3;
      const sb = order[b.status] ?? 3;
      if (sa !== sb) return sa - sb;
      return b.createdAt - a.createdAt;
    });
    for (const u of users) {
      const row = document.createElement("div");
      row.className = "user-row";
      const created = new Date(u.createdAt).toLocaleString();
      const isAdmin = u.role === "admin";
      const actions = isAdmin
        ? '<span class="muted small">Administrator</span>'
        : `
        ${u.status !== "approved" ? `<button class="primary small" data-approve="${u.id}">Approve</button>` : ""}
        ${u.status !== "rejected" ? `<button class="ghost small" data-reject="${u.id}">Reject</button>` : ""}
        <button class="danger small" data-del="${u.id}">Delete</button>
      `;
      row.innerHTML = `
        <div class="user-info">
          <div class="avatar">${escapeHtml(u.username[0]?.toUpperCase() || "?")}</div>
          <div>
            <div class="account-name">${escapeHtml(u.username)} ${isAdmin ? '<span class="role-pill admin small">ADMIN</span>' : ""}</div>
            <div class="account-meta">Joined ${created}</div>
          </div>
        </div>
        <div class="account-actions">
          <span class="badge ${u.status}">${u.status}</span>
          ${actions}
        </div>
      `;
      usersListEl.appendChild(row);
    }
    usersListEl.querySelectorAll("[data-approve]").forEach((b) =>
      b.addEventListener("click", async () => {
        await api(`/admin/users/${b.dataset.approve}/approve`, { method: "POST" }).catch(() => {});
        loadUsers();
      }),
    );
    usersListEl.querySelectorAll("[data-reject]").forEach((b) =>
      b.addEventListener("click", async () => {
        await api(`/admin/users/${b.dataset.reject}/reject`, { method: "POST" }).catch(() => {});
        loadUsers();
      }),
    );
    usersListEl.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (!confirm("Delete this user permanently?")) return;
        await api(`/admin/users/${b.dataset.del}`, { method: "DELETE" }).catch(() => {});
        loadUsers();
      }),
    );
  }

  /* ===== Change password modal ===== */
  const modal = $("modal");
  $("change-pw-btn").addEventListener("click", () => {
    modal.classList.remove("hidden");
    $("modal-error").textContent = "";
    $("change-pw-form").reset();
  });
  $("modal-cancel").addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
  $("change-pw-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: fd.get("current"),
          newPassword: fd.get("next"),
        }),
      });
      modal.classList.add("hidden");
      addLog({ level: "success", message: "Password updated.", ts: Date.now() });
    } catch (err) {
      $("modal-error").textContent = err.message;
    }
  });

  /* ===== Accounts ===== */
  const accountsList = $("accounts-list");
  const cookiesInput = $("cookies-input");
  const addStatus = $("add-status");

  function initials(name) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join("");
  }

  function renderAccounts(accounts) {
    if (!accounts || accounts.length === 0) {
      accountsList.innerHTML =
        '<p class="muted small">No accounts loaded yet.</p>';
      return;
    }
    accountsList.innerHTML = "";
    for (const a of accounts) {
      const row = document.createElement("div");
      row.className = "account-row";
      row.innerHTML = `
        <div class="account-info">
          <div class="avatar">${initials(a.name || "??")}</div>
          <div>
            <div class="account-name">${escapeHtml(a.name)}</div>
            <div class="account-meta">${a.shares} shares this run</div>
          </div>
        </div>
        <div class="account-actions">
          <span class="badge ${a.status}">${a.status.replace("_", " ")}</span>
          <button class="icon-btn" title="Remove" data-remove="${a.id}">×</button>
        </div>
      `;
      accountsList.appendChild(row);
    }
    accountsList.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-remove");
        await api(`/share/accounts/${encodeURIComponent(id)}`, {
          method: "DELETE",
        }).catch(() => {});
        refreshState();
      });
    });
  }

  $("add-accounts-btn").addEventListener("click", async () => {
    const raw = cookiesInput.value.trim();
    if (!raw) return;
    const cookies = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    addStatus.textContent = "Verifying cookies…";
    try {
      const data = await api("/share/accounts", {
        method: "POST",
        body: JSON.stringify({ cookies }),
      });
      const ok = data.results.filter((r) => r.ok).length;
      const fail = data.results.length - ok;
      addStatus.textContent = `${ok} added, ${fail} failed`;
      renderAccounts(data.accounts);
      cookiesInput.value = "";
      data.results.forEach((r, i) => {
        if (!r.ok) {
          addLog({
            level: "error",
            message: `Cookie ${i + 1} failed: ${r.error}`,
            ts: Date.now(),
          });
        } else {
          addLog({
            level: "success",
            message: `Loaded account: ${r.name}`,
            ts: Date.now(),
          });
        }
      });
    } catch (err) {
      addStatus.textContent = err.message;
    }
  });

  $("clear-accounts-btn").addEventListener("click", async () => {
    await api("/share/accounts", { method: "DELETE" }).catch(() => {});
    refreshState();
  });

  /* ===== Boost ===== */
  const startBtn = $("start-btn");
  const stopBtn = $("stop-btn");
  const statSuccess = $("stat-success");
  const statFailed = $("stat-failed");
  const statTotal = $("stat-total");
  const statElapsed = $("stat-elapsed");
  const progressBar = $("progress-bar");

  let plannedTotal = 0;

  startBtn.addEventListener("click", async () => {
    const link = $("link-input").value.trim();
    const total = Number($("total-input").value);
    if (!link) return;
    try {
      const data = await api("/share/start", {
        method: "POST",
        body: JSON.stringify({ link, total }),
      });
      plannedTotal = data.total;
      startBtn.disabled = true;
      stopBtn.disabled = false;
      statSuccess.textContent = "0";
      statFailed.textContent = "0";
      statTotal.textContent = "0";
      statElapsed.textContent = "0s";
      progressBar.style.width = "0%";
    } catch (err) {
      addLog({ level: "error", message: err.message, ts: Date.now() });
    }
  });

  stopBtn.addEventListener("click", async () => {
    await api("/share/stop", { method: "POST" }).catch(() => {});
    addLog({
      level: "warn",
      message: "Stop requested.",
      ts: Date.now(),
    });
  });

  /* ===== Logs ===== */
  const logsEl = $("logs");
  $("clear-logs-btn").addEventListener("click", () => {
    logsEl.innerHTML =
      '<p class="muted small">Live share results will stream here as they happen.</p>';
  });

  function fmtTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString();
  }

  function addLog(ev) {
    const placeholder = logsEl.querySelector(".muted.small");
    if (placeholder) placeholder.remove();
    const div = document.createElement("div");
    div.className = "log-entry";
    const acct = ev.account
      ? ` <span class="log-account">[${escapeHtml(ev.account)}]</span>`
      : "";
    div.innerHTML = `<span class="log-time">${fmtTime(ev.ts)}</span><span class="log-tag ${ev.level}">${ev.level.toUpperCase()}</span><span class="log-msg">${acct} ${escapeHtml(ev.message)}</span>`;
    logsEl.appendChild(div);
    logsEl.scrollTop = logsEl.scrollHeight;
    while (logsEl.children.length > 500) {
      logsEl.removeChild(logsEl.firstChild);
    }
  }

  function fmtElapsed(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${sec}s`;
  }

  function applyStats(ev) {
    statSuccess.textContent = String(ev.success);
    statFailed.textContent = String(ev.failed);
    statTotal.textContent = String(ev.total);
    statElapsed.textContent = fmtElapsed(ev.elapsedMs);
    if (plannedTotal > 0) {
      const pct = Math.min(100, (ev.total / plannedTotal) * 100);
      progressBar.style.width = pct + "%";
    }
    renderAccounts(
      ev.perAccount.map((a) => ({
        id: a.name,
        name: a.name,
        shares: a.shares,
        status: a.status,
      })),
    );
  }

  /* ===== Live stream ===== */
  let eventSource = null;
  function connectStream() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource("/api/events");
    eventSource.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === "log") addLog(ev);
        else if (ev.type === "stats") applyStats(ev);
        else if (ev.type === "done") {
          startBtn.disabled = false;
          stopBtn.disabled = true;
          addLog({
            level: "success",
            message: `Done — ${ev.success} success, ${ev.failed} failed in ${fmtElapsed(ev.elapsedMs)}`,
            ts: Date.now(),
          });
        }
      } catch {
        // ignore parse errors
      }
    };
    eventSource.onerror = () => {
      // browser auto-reconnects
    };
  }

  async function refreshState() {
    try {
      const data = await api("/share/state");
      renderAccounts(data.accounts);
      statSuccess.textContent = String(data.success || 0);
      statFailed.textContent = String(data.failed || 0);
      const total = (data.success || 0) + (data.failed || 0);
      statTotal.textContent = String(total);
      if (data.running) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        plannedTotal = data.currentTarget || 0;
      } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
      }
    } catch {
      // ignore
    }
  }

  /* ===== Bootstrap ===== */
  (async () => {
    try {
      const data = await api("/auth/me");
      if (data && data.user) showApp(data.user);
      else showAuth();
    } catch {
      showAuth();
    }
  })();
})();
