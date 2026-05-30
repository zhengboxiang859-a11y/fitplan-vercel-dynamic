const adminState = {
  token: localStorage.getItem("fitplan_admin_token"),
  users: [],
  summary: null,
  selectedUserId: null
};

const $ = selector => document.querySelector(selector);

async function adminApi(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(adminState.token ? { Authorization: `Bearer ${adminState.token}` } : {}),
      ...(options.headers || {})
    }
  });
  if (path.endsWith(".csv")) return response;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function showLogin(message = "") {
  $("#adminLogin").classList.remove("hidden");
  $("#adminApp").classList.add("hidden");
  $("#adminLogout").classList.add("hidden");
  $("#adminMessage").textContent = message;
}

function showAdmin() {
  $("#adminLogin").classList.add("hidden");
  $("#adminApp").classList.remove("hidden");
  $("#adminLogout").classList.remove("hidden");
  $("#adminExport").href = `/api/admin/export.csv?token=${Date.now()}`;
}

async function loadAdmin() {
  const [summary, usersData] = await Promise.all([
    adminApi("/api/admin/summary"),
    adminApi("/api/admin/users")
  ]);
  adminState.summary = summary;
  adminState.users = usersData.users;
  adminState.selectedUserId ||= adminState.users[0]?.id || null;
  renderAdmin();
  if (adminState.selectedUserId) await loadUserDetail(adminState.selectedUserId);
}

function renderAdmin() {
  const s = adminState.summary;
  $("#adminStats").innerHTML = [
    ["用户数", s.users],
    ["身体记录", s.records],
    ["食谱方案", s.mealPlans],
    ["训练日", s.trainingDays]
  ].map(([label, value]) => `
    <article class="metric-card admin-stat"><span>${label}</span><strong>${value}</strong><em>FitPlan data</em></article>
  `).join("");

  $("#adminUsers").innerHTML = adminState.users.map(user => `
    <button class="admin-user-row ${user.id === adminState.selectedUserId ? "active" : ""}" data-user-id="${user.id}" type="button">
      <div>
        <strong>${user.name}</strong>
        <span>${user.email}</span>
      </div>
      <div class="admin-user-meta">
        <span>${user.record_count} 记录</span>
        <span>${user.meal_count} 食谱</span>
        <span>${user.training_count} 训练</span>
      </div>
      <small>最近记录 ${user.latest_record_date || "无"} · 最近食谱 ${user.latest_meal_date || "无"}</small>
    </button>
  `).join("") || `<p class="muted">暂无用户。</p>`;
}

async function loadUserDetail(userId) {
  adminState.selectedUserId = Number(userId);
  renderAdmin();
  const detail = await adminApi(`/api/admin/users/${userId}`);
  const user = detail.user;
  $("#adminDetail").innerHTML = `
    <section class="admin-profile">
      <div><span>姓名</span><strong>${user.name}</strong></div>
      <div><span>邮箱</span><strong>${user.email}</strong></div>
      <div><span>基础资料</span><strong>${user.age || "-"}岁 · ${user.height_cm || "-"}cm · ${user.activity_level || "-"}</strong></div>
      <div><span>计划偏好</span><strong>${user.goal || "-"} · ${user.strategy || "-"} · ${user.training_days || 0}天/周</strong></div>
    </section>
    <section class="admin-section">
      <h4>身体记录</h4>
      ${detail.records.map(record => `
        <div class="admin-data-row">
          <strong>${record.record_date}</strong>
          <span>${record.weight_kg} kg</span>
          <span>腰围 ${record.waist_cm || 0} cm</span>
          <span>${record.calories_in || 0} kcal</span>
        </div>
      `).join("") || `<p class="muted">暂无身体记录。</p>`}
    </section>
    <section class="admin-section">
      <h4>食谱方案</h4>
      ${detail.mealPlans.map(plan => `
        <div class="admin-plan-card">
          <strong>${plan.meal_date}</strong>
          <p>${plan.items.map(item => `${item.slot}:${item.name}`).join(" / ") || "无食材"}</p>
          <small>放纵餐 ${plan.cheatMeals.length} 项</small>
        </div>
      `).join("") || `<p class="muted">暂无食谱。</p>`}
    </section>
    <section class="admin-section">
      <h4>训练计划</h4>
      ${detail.trainingDays.map(day => `
        <div class="admin-plan-card">
          <strong>${day.training_date} · ${day.plan.part || ""}</strong>
          <p>${(day.plan.exercises || []).map(ex => ex.name).join(" / ")}</p>
        </div>
      `).join("") || `<p class="muted">暂无训练替换记录。</p>`}
    </section>
  `;
}

$("#adminLoginForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const data = await adminApi("/api/admin/login", { method: "POST", body: JSON.stringify(form) });
    adminState.token = data.token;
    localStorage.setItem("fitplan_admin_token", data.token);
    showAdmin();
    await loadAdmin();
  } catch (error) {
    showLogin(error.message);
  }
});

$("#adminUsers").addEventListener("click", event => {
  const row = event.target.closest("[data-user-id]");
  if (row) loadUserDetail(row.dataset.userId);
});

$("#adminRefresh").addEventListener("click", loadAdmin);
$("#adminLogout").addEventListener("click", () => {
  localStorage.removeItem("fitplan_admin_token");
  adminState.token = null;
  showLogin("已退出后台。");
});

$("#adminExport").addEventListener("click", async event => {
  event.preventDefault();
  const response = await adminApi("/api/admin/export.csv");
  if (!response.ok) return showLogin("导出失败，请重新登录管理员后台。");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "fitplan-admin-export.csv";
  link.click();
  URL.revokeObjectURL(url);
});

(async function bootstrapAdmin() {
  if (!adminState.token) return showLogin();
  try {
    showAdmin();
    await loadAdmin();
  } catch {
    localStorage.removeItem("fitplan_admin_token");
    adminState.token = null;
    showLogin("管理员登录已失效，请重新输入口令。");
  }
})();
