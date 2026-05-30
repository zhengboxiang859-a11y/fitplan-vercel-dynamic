const state = {
  token: localStorage.getItem("fitplan_token"),
  user: null,
  profile: null,
  record: null,
  records: [],
  plan: null,
  meals: null,
  trainingOptions: null,
  aiMessages: [
    { role: "assistant", content: "你好，我是 DeepSeek AI 问答教练。你可以问训练、饮食、热量缺口、食谱搭配和进度调整相关问题。" }
  ],
  page: location.hash.replace("#", "") || "dashboard",
  activeRecordDate: new Date().toISOString().slice(0, 10),
  activeMealDate: new Date().toISOString().slice(0, 10),
  activeMealSlot: "早餐"
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const MEAL_SLOTS = ["早餐", "中餐", "晚餐", "加餐", "自定义餐"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function showAuth(message = "") {
  $("#authView").classList.remove("hidden");
  $("#appView").classList.add("hidden");
  $("#authMessage").textContent = message;
}

function showApp() {
  $("#authView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
  setPage(state.page, { replaceHash: true });
}

async function bootstrap() {
  state.activeRecordDate = today();
  state.activeMealDate = today();
  $("#todayLabel").textContent = new Intl.DateTimeFormat("zh-CN", { dateStyle: "full" }).format(new Date());
  $("#recordForm").record_date.value = state.activeRecordDate;
  $("#mealDate").value = state.activeMealDate;
  if (!state.token) return showAuth();
  try {
    await loadApp();
  } catch {
    localStorage.removeItem("fitplan_token");
    state.token = null;
    showAuth("登录已过期，请重新登录。");
  }
}

async function loadApp() {
  const currentPage = state.page;
  const [me, recordData, planData, mealData, trainingData] = await Promise.all([
    api(`/api/me?date=${state.activeRecordDate}`),
    api("/api/records"),
    api(`/api/plan?date=${state.activeRecordDate}`),
    api(`/api/meals?date=${state.activeMealDate}`),
    api("/api/training-options")
  ]);
  state.user = me.user;
  state.profile = me.profile;
  state.record = me.latest;
  state.records = recordData.records;
  state.plan = planData.plan;
  state.meals = mealData;
  state.trainingOptions = trainingData.options;
  state.page = currentPage;
  syncForms();
  render();
  showApp();
}

async function loadRecordByDate(date) {
  state.activeRecordDate = date;
  const [recordData, planData] = await Promise.all([
    api(`/api/records?date=${date}`),
    api(`/api/plan?date=${date}`)
  ]);
  state.record = recordData.record;
  state.plan = planData.plan;
  syncRecordForm();
  render();
}

async function loadMealsByDate(date) {
  state.activeMealDate = date;
  state.meals = await api(`/api/meals?date=${date}`);
  if (!MEAL_SLOTS.includes(state.activeMealSlot)) state.activeMealSlot = "早餐";
  $("#mealDate").value = date;
  renderMealsPage();
  renderDashboardSummaries();
}

function syncForms() {
  $("#userName").textContent = state.user.name;
  $("#userEmail").textContent = state.user.email;
  $("#userInitial").textContent = state.user.name.slice(0, 1).toUpperCase();
  $("#dietStyle")?.remove;
  $("#equipment").value = state.profile.equipment;
  $("#mealDate").value = state.activeMealDate;
  updateSegment("goal", state.profile.goal);
  updateSegment("strategy", state.profile.strategy);

  const profileForm = $("#profileForm");
  Object.entries(state.profile).forEach(([key, value]) => {
    if (profileForm.elements[key]) profileForm.elements[key].value = value;
  });
  syncRecordForm();
}

function syncRecordForm() {
  const form = $("#recordForm");
  const record = state.record;
  form.record_date.value = state.activeRecordDate;
  form.weight_kg.value = record?.weight_kg ?? 0;
  form.waist_cm.value = record?.waist_cm ?? 0;
  form.body_fat_pct.value = record?.body_fat_pct ?? 0;
  form.steps.value = record?.steps ?? 0;
  form.sleep_hours.value = record?.sleep_hours ?? 0;
  form.calories_in.value = record?.calories_in ?? 0;
  form.workout_done.checked = Boolean(record?.workout_done);
  form.notes.value = record?.notes || "";
}

function setPage(page, options = {}) {
  const valid = ["dashboard", "body", "meals", "training", "progress", "ai", "settings"];
  state.page = valid.includes(page) ? page : "dashboard";

  $$(".page").forEach(el => {
    const active = el.dataset.page === state.page;
    el.classList.toggle("active-page", active);
    el.setAttribute("aria-hidden", active ? "false" : "true");
  });
  $$("#sideNav a").forEach(link => link.classList.toggle("active", link.dataset.page === state.page));
  $("#pageTitle").textContent = {
    dashboard: "每日规划工作台",
    body: "身体数据",
    meals: "饮食计划",
    training: "训练安排",
    progress: "进度趋势",
    settings: "资料设置"
  }[state.page];
  if (state.page === "ai") $("#pageTitle").textContent = "AI 问答教练";
  $("#goalControls").classList.toggle("hidden", state.page !== "dashboard");
  if (location.hash !== `#${state.page}`) {
    history[options.replaceHash ? "replaceState" : "pushState"](null, "", `#${state.page}`);
  }
}

function updateSegment(field, value) {
  $$(`.segmented[data-field="${field}"] button`).forEach(button => {
    button.classList.toggle("active", button.dataset.value === value);
  });
}

function render() {
  renderMetrics();
  renderEnergy();
  renderDashboardSummaries();
  renderBodyPage();
  renderMealsPage();
  renderTrainingPage();
  renderCharts();
  renderAiPage();
}

function renderMetrics() {
  const r = state.record || {};
  const metrics = [
    ["体重", `${r.weight_kg ?? 0} kg`, "所选日期"],
    ["腰围", `${r.waist_cm ?? 0} cm`, "围度趋势"],
    ["体脂", `${r.body_fat_pct ?? 0}%`, "趋势参考"],
    ["BMI", state.plan.metrics.bmi, "综合筛查"]
  ];
  $("#metricCards").innerHTML = metrics.map(([label, value, note]) => `
    <div class="metric-card"><span>${label}</span><strong>${value}</strong><em>${note}</em></div>
  `).join("");
}

function renderEnergy() {
  const m = state.plan.metrics;
  $("#deficitBadge").textContent = state.profile.goal === "muscle_gain"
    ? `${Math.max(0, m.targetCalories - m.maintenance)} kcal surplus`
    : `${m.calorieDeficit} kcal deficit`;
  $("#intakeProgress").textContent = `${m.intakeProgress}%`;
  $(".ring").style.setProperty("--progress", m.intakeProgress);
  $("#energyStats").innerHTML = [
    ["维持热量", `${m.maintenance} kcal`],
    ["目标热量", `${m.targetCalories} kcal`],
    ["基础代谢", `${m.bmr} kcal`],
    ["当日摄入", `${state.record?.calories_in ?? 0} kcal`]
  ].map(([label, value]) => `<div class="stat-row"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function macroHtml(totals = state.meals?.totals) {
  const t = totals || { protein: 0, carbs: 0, fat: 0 };
  return [
    ["蛋白质", `${t.protein}g`],
    ["碳水", `${t.carbs}g`],
    ["脂肪", `${t.fat}g`]
  ].map(([label, value]) => `<div class="macro-chip"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function renderDashboardSummaries() {
  const training = state.plan.training.today;
  $("#trainingSummary").innerHTML = `
    <div class="summary-line"><span>${training.day}</span><strong>${training.part}</strong></div>
    <p class="summary-copy">${training.title} · ${training.focus}</p>
    <div class="mini-exercises">${training.exercises.slice(0, 3).map(ex => `<span>${ex.name} · ${ex.dose}</span>`).join("")}</div>
  `;
  $("#mealSummary").innerHTML = `
    <div class="macro-bar compact-macros">${macroHtml()}</div>
    <div class="tip">当前食谱合计 ${state.meals?.totals?.calories ?? 0} kcal</div>
    <div class="tip">放纵餐 ${state.meals?.cheatMeals?.length ?? 0} 项</div>
  `;
}

function renderBodyPage() {
  $("#bodyRecordList").innerHTML = state.records.slice().reverse().map(record => `
    <div class="record-row">
      <strong>${record.record_date}</strong>
      <span>${record.weight_kg ?? 0} kg</span>
      <span>腰围 ${record.waist_cm ?? 0} cm</span>
      <span>体脂 ${record.body_fat_pct ?? 0}%</span>
      <span>${record.steps ?? 0} 步</span>
      <span>${record.calories_in ?? 0} kcal</span>
    </div>
  `).join("") || `<p class="muted">还没有保存过身体记录。</p>`;

  const m = state.plan.metrics;
  $("#bodyAnalysis").innerHTML = [
    ["BMI", m.bmi, "BMI 是筛查指标，不等于诊断。"],
    ["BMR", `${m.bmr} kcal`, "基础代谢估算值。"],
    ["TDEE", `${m.maintenance} kcal`, "按活动水平估算的维持热量。"],
    ["目标热量", `${m.targetCalories} kcal`, "会随目标阶段和执行策略变化。"]
  ].map(([label, value, note]) => `
    <div class="analysis-item"><span>${label}</span><strong>${value}</strong><p>${note}</p></div>
  `).join("");
}

function renderMealsPage() {
  state.meals.totals = calculateMealTotals(state.meals.items || [], state.meals.cheatMeals || []);
  const items = state.meals?.items || [];
  const bySlot = groupBy(items, "slot");
  const extraSlots = Object.keys(bySlot).filter(slot => !MEAL_SLOTS.includes(slot));
  const slots = [...MEAL_SLOTS, ...extraSlots];
  $("#mealPageList").innerHTML = slots.map(slot => {
    const foods = bySlot[slot] || [];
    return `
      <div class="slot-card ${slot === state.activeMealSlot ? "active-slot-card" : ""}">
        <div class="slot-card-head">
          <button class="meal-slot-btn" data-slot="${slot}" type="button">
            <strong>${slot}</strong>
            <span>${foods.length} 项 · ${sum(foods, "calories")} kcal</span>
          </button>
          <button class="clear-slot" data-slot="${slot}" type="button" ${foods.length ? "" : "disabled"}>清空</button>
        </div>
        <div class="slot-food-list">
          ${foods.map((food, index) => `
            <div class="slot-food">
              <div><strong>${food.name}</strong><span>${categoryLabel(food.category)} · ${food.calories} kcal · P${food.protein} C${food.carbs} F${food.fat}</span></div>
              <button class="remove-food" data-slot="${slot}" data-index="${index}" type="button">删除</button>
            </div>
          `).join("") || `<p class="muted">选择左侧食材加入${slot}</p>`}
        </div>
      </div>
    `;
  }).join("");
  $("#macroPageBar").innerHTML = `
    <div class="macro-chip total-chip"><span>总热量</span><strong>${state.meals?.totals?.calories ?? 0} kcal</strong></div>
    ${macroHtml(state.meals?.totals)}
  `;
  $("#mealSelection").innerHTML = `
    <div class="meal-slot-picker">
      <span>当前加入餐次</span>
      <div>
        ${MEAL_SLOTS.map(slot => `<button class="meal-slot-btn ${slot === state.activeMealSlot ? "active" : ""}" data-slot="${slot}" type="button">${slot}</button>`).join("")}
      </div>
    </div>
  ` + Object.entries(state.meals?.options || {}).map(([category, foods]) => `
    <div class="option-group">
      <h4>${categoryLabel(category)} <span class="option-target">加入：${state.activeMealSlot}</span></h4>
      <div class="option-grid">
        ${foods.map(food => `
          <button class="food-option" data-food='${escapeAttr(JSON.stringify({ ...food, category }))}'>
            <strong>${food.name}</strong><span>${food.calories} kcal · P${food.protein} C${food.carbs} F${food.fat}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `).join("");
  $("#cheatList").innerHTML = (state.meals?.cheatMeals || []).map(cheat => `
    <div class="tip"><strong>${cheat.name}</strong> · ${cheat.calories} kcal ${cheat.note ? `· ${cheat.note}` : ""}</div>
  `).join("") || `<div class="tip">今天还没有添加放纵餐。</div>`;
}

function calculateMealTotals(items, cheatMeals) {
  return [...items, ...cheatMeals].reduce((totals, item) => {
    totals.calories += Number(item.calories || 0);
    totals.protein += Number(item.protein || 0);
    totals.carbs += Number(item.carbs || 0);
    totals.fat += Number(item.fat || 0);
    return totals;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

function renderTrainingPage() {
  $("#weekTraining").innerHTML = state.plan.training.week.map(day => `
    <div class="week-card ${day.date === today() ? "today-card" : ""}">
      <div class="week-head"><strong>${day.day}</strong><span>${day.date.slice(5)}</span></div>
      <h4>${day.part}</h4>
      <p>${day.title} · ${day.focus}</p>
      <div class="mini-exercises">
        ${day.exercises.map((exercise, index) => `
          <span>
            ${exercise.name} · ${exercise.dose}
            <button class="swap-btn" data-date="${day.date}" data-index="${index}" data-type="${day.type}">替换</button>
          </span>
        `).join("")}
      </div>
      <div class="swap-options" id="swap-${day.date}"></div>
    </div>
  `).join("");
}

function renderCharts() {
  const records = state.records.length ? state.records : [];
  $("#progressCharts").innerHTML = `
    <div class="chart-card"><h4>体重趋势</h4>${lineChart(records)}</div>
    <div class="chart-card"><h4>摄入热量 vs 目标</h4>${barChart(records)}<p class="chart-note">只显示真实保存过的记录。</p></div>
  `;
}

function renderAiPage() {
  const box = $("#aiMessages");
  if (!box) return;
  box.innerHTML = state.aiMessages.map(message => `
    <div class="ai-message ${message.role}">
      <span>${message.role === "user" ? "你" : "AI"}</span>
      <p>${escapeHtml(message.content).replaceAll("\n", "<br>")}</p>
    </div>
  `).join("");
  box.scrollTop = box.scrollHeight;
}

async function askDeepSeek(question) {
  $("#aiStatus").textContent = "DeepSeek 正在思考...";
  $("#aiForm button").disabled = true;
  state.aiMessages.push({ role: "user", content: question });
  renderAiPage();
  try {
    const data = await api("/api/ai-chat", {
      method: "POST",
      body: JSON.stringify({ question, history: state.aiMessages.slice(-8) })
    });
    state.aiMessages.push({ role: "assistant", content: data.answer });
    $("#aiStatus").textContent = `模型：${data.model}`;
  } catch (error) {
    state.aiMessages.push({ role: "assistant", content: error.message });
    $("#aiStatus").textContent = "AI 问答暂时不可用。";
  } finally {
    $("#aiForm button").disabled = false;
    renderAiPage();
  }
}

function lineChart(records) {
  const width = 620, height = 210, pad = 34;
  const values = records.map(r => Number(r.weight_kg ?? 0));
  if (!values.length) return `<p class="muted">暂无记录。</p>`;
  const pts = chartPoints(values, width, height, pad);
  return `<svg viewBox="0 0 ${width} ${height}">
    <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#dfe7e2" />
    <polyline fill="none" stroke="#20a66a" stroke-width="4" points="${pts.map(p => p.join(",")).join(" ")}" />
    ${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="#20a66a" />`).join("")}
  </svg>`;
}

function barChart(records) {
  const width = 620, height = 170;
  if (!records.length) return `<p class="muted">暂无记录。</p>`;
  const target = state.plan.metrics.targetCalories;
  const max = Math.max(target, ...records.map(r => Number(r.calories_in ?? 0)), 1);
  const bars = records.slice(-10).map((record, index, list) => {
    const w = 38;
    const gap = (width - 60 - list.length * w) / Math.max(1, list.length - 1);
    const h = Math.round((Number(record.calories_in ?? 0) / max) * 110);
    const x = 30 + index * (w + gap);
    const y = height - 30 - h;
    const color = Number(record.calories_in ?? 0) > target ? "#ef6b5b" : "#3478f6";
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${color}" />
      <text x="${x + w / 2}" y="${height - 10}" text-anchor="middle" class="axis-label">${record.record_date.slice(5)}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}">${bars}</svg>`;
}

function chartPoints(values, width, height, pad) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((value, index) => [
    pad + index * ((width - pad * 2) / Math.max(1, values.length - 1)),
    height - pad - ((value - min) / span) * (height - pad * 2)
  ]);
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "其他";
    acc[value] ||= [];
    acc[value].push(item);
    return acc;
  }, {});
}

function sum(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function categoryLabel(category) {
  return { staple: "主食", protein: "蛋白质", vegetable: "蔬菜", fat: "脂肪", snack: "加餐", cheat: "放纵餐参考" }[category] || category;
}

function defaultSlot(category) {
  return category === "snack" ? "加餐" : category === "cheat" ? "放纵餐" : "自定义餐";
}

function escapeAttr(value) {
  return value.replaceAll("&", "&amp;").replaceAll("'", "&#39;").replaceAll("<", "&lt;");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function saveProfile(patch) {
  state.profile = { ...state.profile, ...patch };
  const data = await api("/api/profile", { method: "POST", body: JSON.stringify(state.profile) });
  state.profile = data.profile;
  await loadApp();
}

async function saveMeals() {
  state.meals = await api("/api/meals", {
    method: "POST",
    body: JSON.stringify({ date: state.activeMealDate, items: state.meals.items, cheatMeals: state.meals.cheatMeals })
  });
  renderMealsPage();
  renderDashboardSummaries();
}

async function saveTrainingDay(day) {
  await api("/api/training-day", { method: "POST", body: JSON.stringify({ date: day.date, plan: day }) });
  const planData = await api(`/api/plan?date=${state.activeRecordDate}`);
  state.plan = planData.plan;
  renderTrainingPage();
  renderDashboardSummaries();
}

$("#authForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const data = await api("/api/register", { method: "POST", body: JSON.stringify(form) });
    state.token = data.token;
    localStorage.setItem("fitplan_token", state.token);
    await loadApp();
  } catch (error) {
    $("#authMessage").textContent = error.message;
  }
});

$("#loginBtn").addEventListener("click", async () => {
  const form = Object.fromEntries(new FormData($("#authForm")));
  try {
    const data = await api("/api/login", { method: "POST", body: JSON.stringify(form) });
    state.token = data.token;
    localStorage.setItem("fitplan_token", state.token);
    await loadApp();
  } catch (error) {
    $("#authMessage").textContent = error.message;
  }
});

$("#logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("fitplan_token");
  state.token = null;
  showAuth("已退出。");
});

$("#sideNav").addEventListener("click", event => {
  const link = event.target.closest("a[data-page]");
  if (!link) return;
  event.preventDefault();
  setPage(link.dataset.page);
});

document.addEventListener("click", async event => {
  const navButton = event.target.closest("[data-go-page]");
  if (navButton) return setPage(navButton.dataset.goPage);

  const slotButton = event.target.closest(".meal-slot-btn");
  if (slotButton) {
    state.activeMealSlot = slotButton.dataset.slot;
    renderMealsPage();
    return;
  }

  const removeFoodButton = event.target.closest(".remove-food");
  if (removeFoodButton) {
    const slotItems = state.meals.items.filter(item => (item.slot || "自定义餐") === removeFoodButton.dataset.slot);
    const target = slotItems[Number(removeFoodButton.dataset.index)];
    const absoluteIndex = state.meals.items.indexOf(target);
    if (absoluteIndex >= 0) state.meals.items.splice(absoluteIndex, 1);
    renderMealsPage();
    return;
  }

  const clearSlotButton = event.target.closest(".clear-slot");
  if (clearSlotButton) {
    state.meals.items = state.meals.items.filter(item => (item.slot || "自定义餐") !== clearSlotButton.dataset.slot);
    renderMealsPage();
    return;
  }

  const foodButton = event.target.closest(".food-option");
  if (foodButton) {
    const food = JSON.parse(foodButton.dataset.food);
    if (food.category === "cheat") {
      state.meals.cheatMeals.push({ name: food.name, calories: food.calories, note: "从推荐中选择" });
    } else {
      state.meals.items.push({ ...food, slot: state.activeMealSlot });
    }
    renderMealsPage();
    return;
  }

  const swapButton = event.target.closest(".swap-btn");
  if (swapButton) {
    const day = state.plan.training.week.find(item => item.date === swapButton.dataset.date);
    const options = state.trainingOptions[swapButton.dataset.type] || [];
    const target = $(`#swap-${day.date}`);
    target.innerHTML = options.map(option => `
      <button class="swap-option" data-date="${day.date}" data-index="${swapButton.dataset.index}" data-ex='${escapeAttr(JSON.stringify(option))}'>
        ${option.name} · ${option.dose}
      </button>
    `).join("");
    return;
  }

  const optionButton = event.target.closest(".swap-option");
  if (optionButton) {
    const day = state.plan.training.week.find(item => item.date === optionButton.dataset.date);
    day.exercises[Number(optionButton.dataset.index)] = JSON.parse(optionButton.dataset.ex);
    await saveTrainingDay(day);
  }
});

window.addEventListener("hashchange", () => setPage(location.hash.replace("#", "") || "dashboard", { replaceHash: true }));

$$(".segmented button").forEach(button => {
  button.addEventListener("click", event => {
    const group = event.currentTarget.closest(".segmented");
    saveProfile({ [group.dataset.field]: event.currentTarget.dataset.value });
  });
});

$("#recordForm").record_date.addEventListener("change", event => loadRecordByDate(event.target.value));
$("#mealDate").addEventListener("change", event => loadMealsByDate(event.target.value));
$("#equipment").addEventListener("change", event => saveProfile({ equipment: event.target.value }));
$("#refreshBtn").addEventListener("click", loadApp);
$("#saveMealsBtn").addEventListener("click", saveMeals);
$("#addCheatBtn").addEventListener("click", () => $("#cheatEditor").classList.toggle("hidden"));
$("#confirmCheatBtn").addEventListener("click", () => {
  const name = $("#cheatName").value.trim() || "放纵餐";
  const calories = Number($("#cheatCalories").value || 0);
  const note = $("#cheatNote").value.trim();
  state.meals.cheatMeals.push({ name, calories, note });
  $("#cheatName").value = "";
  $("#cheatCalories").value = "";
  $("#cheatNote").value = "";
  $("#cheatEditor").classList.add("hidden");
  renderMealsPage();
});

$("#profileForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.currentTarget));
  form.age = Number(form.age);
  form.height_cm = Number(form.height_cm);
  form.training_days = Number(form.training_days);
  await saveProfile(form);
  setPage("settings");
});

$("#recordForm").addEventListener("submit", async event => {
  event.preventDefault();
  const raw = Object.fromEntries(new FormData(event.currentTarget));
  raw.workout_done = event.currentTarget.workout_done.checked;
  await api("/api/records", { method: "POST", body: JSON.stringify(raw) });
  await loadApp();
});

$("#aiForm").addEventListener("submit", async event => {
  event.preventDefault();
  const question = $("#aiQuestion").value.trim();
  if (!question) return;
  $("#aiQuestion").value = "";
  await askDeepSeek(question);
});

$("#clearAiBtn").addEventListener("click", () => {
  state.aiMessages = [
    { role: "assistant", content: "对话已清空。你可以继续问训练、饮食、热量缺口或食谱搭配问题。" }
  ];
  $("#aiStatus").textContent = "";
  renderAiPage();
});

$$(".ai-prompt").forEach(button => {
  button.addEventListener("click", () => {
    $("#aiQuestion").value = button.textContent.trim();
    $("#aiQuestion").focus();
  });
});

bootstrap();
