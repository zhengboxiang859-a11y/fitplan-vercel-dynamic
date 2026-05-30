import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "fitplan-admin";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const adminTokens = globalThis.__fitplanAdminTokens || new Set();
globalThis.__fitplanAdminTokens = adminTokens;

const pool = globalThis.__fitplanPool || new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.POSTGRES_URL?.includes("sslmode=disable") ? false : { rejectUnauthorized: false }
});
globalThis.__fitplanPool = pool;

let initPromise = null;

const FOOD_OPTIONS = {
  staple: [
    item("糙米饭", 180, 4, 38, 1), item("杂粮饭", 190, 5, 39, 1), item("红薯", 160, 3, 37, 0),
    item("紫薯", 150, 2, 34, 0), item("玉米", 170, 5, 36, 2), item("燕麦", 210, 7, 36, 4),
    item("全麦面包", 150, 6, 26, 2), item("荞麦面", 220, 9, 43, 2), item("全麦意面", 230, 9, 44, 2),
    item("藜麦饭", 210, 8, 39, 4), item("土豆", 130, 3, 30, 0), item("山药", 145, 3, 32, 0),
    item("绿豆粥", 160, 7, 31, 1), item("鹰嘴豆", 190, 10, 31, 3), item("南瓜小米粥", 170, 5, 34, 2)
  ],
  protein: [
    item("鸡胸肉", 180, 34, 0, 4), item("去皮鸡腿", 210, 30, 0, 8), item("瘦牛肉", 230, 31, 0, 10),
    item("猪里脊", 210, 29, 0, 8), item("三文鱼", 260, 28, 0, 15), item("鳕鱼", 160, 31, 0, 2),
    item("金枪鱼", 150, 32, 0, 2), item("虾仁", 150, 30, 1, 2), item("鸡蛋", 140, 12, 1, 10),
    item("蛋清", 70, 15, 1, 0), item("老豆腐", 170, 18, 5, 9), item("嫩豆腐", 110, 10, 4, 6),
    item("豆干", 190, 22, 8, 8), item("无糖希腊酸奶", 130, 18, 8, 3), item("低脂牛奶", 110, 9, 13, 3)
  ],
  vegetable: [
    item("西兰花", 55, 4, 9, 1), item("菠菜", 40, 4, 5, 0), item("生菜沙拉", 35, 2, 6, 0),
    item("彩椒沙拉", 60, 2, 12, 0), item("番茄黄瓜", 45, 2, 9, 0), item("芦笋", 45, 4, 7, 0),
    item("油麦菜", 45, 3, 7, 1), item("上海青", 50, 3, 8, 1), item("娃娃菜", 38, 2, 7, 0),
    item("菌菇青菜", 70, 4, 10, 1), item("冬瓜海带汤", 50, 2, 8, 1), item("紫甘蓝", 55, 2, 12, 0),
    item("胡萝卜", 65, 1, 15, 0), item("秋葵", 50, 2, 10, 0), item("木耳黄瓜", 60, 2, 11, 0)
  ],
  fat: [
    item("橄榄油", 90, 0, 0, 10), item("牛油果", 120, 2, 6, 11), item("坚果少量", 110, 4, 4, 9),
    item("杏仁", 100, 4, 4, 9), item("核桃", 130, 3, 3, 13), item("腰果", 115, 4, 7, 9),
    item("芝麻酱少量", 95, 3, 3, 8), item("亚麻籽", 80, 3, 4, 6), item("奇亚籽", 75, 3, 5, 5),
    item("花生酱少量", 95, 4, 3, 8)
  ],
  snack: [
    item("无糖酸奶", 120, 12, 10, 3), item("乳清蛋白", 120, 24, 3, 2), item("苹果", 95, 0, 25, 0),
    item("香蕉半根", 60, 1, 15, 0), item("蓝莓", 70, 1, 17, 0), item("橙子", 80, 1, 19, 0),
    item("猕猴桃", 65, 1, 15, 0), item("低脂牛奶", 110, 9, 13, 3), item("毛豆小食", 130, 12, 12, 5),
    item("水煮蛋", 70, 6, 1, 5), item("低脂奶酪", 90, 11, 4, 3), item("全麦蛋白棒", 190, 16, 22, 6),
    item("小番茄", 45, 2, 9, 0), item("黄瓜条", 25, 1, 5, 0)
  ],
  cheat: [
    item("汉堡半份", 360, 18, 38, 16), item("披萨两小块", 420, 20, 45, 18), item("奶茶中杯", 380, 6, 58, 12),
    item("炸鸡两块", 460, 28, 28, 26), item("甜品小份", 320, 5, 42, 14), item("火锅放纵餐", 650, 35, 45, 34),
    item("拉面一碗", 520, 24, 72, 16), item("寿司拼盘", 480, 22, 74, 10), item("烤肉小份", 560, 38, 25, 32),
    item("冰淇淋小杯", 260, 5, 34, 12), item("薯条小份", 310, 4, 42, 15), item("蛋糕小块", 340, 6, 46, 14)
  ]
};

const TRAINING_OPTIONS = {
  push: [ex("杠铃卧推", "4 x 6-10", "RPE 7-8"), ex("哑铃卧推", "3 x 8-12", "稳定肩胛"), ex("上斜哑铃推", "3 x 8-12", "胸上束"), ex("坐姿肩推", "3 x 8-10", "核心收紧"), ex("俯卧撑", "4 x 8-15", "保留 1-3 次"), ex("绳索下压", "3 x 10-15", "肘部固定")],
  legs: [ex("深蹲", "4 x 6-10", "动作标准"), ex("腿举", "3 x 10-12", "控制下放"), ex("罗马尼亚硬拉", "3 x 8-10", "髋主导"), ex("保加利亚分腿蹲", "3 x 8-12/侧", "膝盖稳定"), ex("臀推", "3 x 8-12", "顶峰停顿"), ex("平板支撑", "3 x 40-60 秒", "均匀呼吸")],
  pull: [ex("高位下拉", "4 x 8-12", "肩胛下沉"), ex("引体向上", "4 x 5-8", "不耸肩"), ex("坐姿划船", "3 x 8-12", "背部发力"), ex("单臂哑铃划船", "3 x 10/侧", "稳定躯干"), ex("面拉", "3 x 12-15", "后束肩"), ex("哑铃弯举", "3 x 10-12", "控制离心")],
  cardio: [ex("椭圆机", "30-45 分钟", "Zone 2"), ex("单车", "30-45 分钟", "能说话微喘"), ex("快走", "40-60 分钟", "低冲击"), ex("动态拉伸", "10 分钟", "髋/胸椎/踝"), ex("核心循环", "3 轮", "不过度力竭")],
  full: [ex("硬拉", "3 x 5-8", "保留 2 次"), ex("哑铃卧推", "3 x 8-12", "稳定肩胛"), ex("绳索划船", "3 x 10-12", "顶峰收缩"), ex("农夫走", "4 x 30 米", "核心稳定"), ex("壶铃摆动", "4 x 12", "髋主导"), ex("登山跑", "4 x 30 秒", "稳定呼吸")],
  recovery: [ex("轻松步行", "20-40 分钟", "恢复强度"), ex("拉伸放松", "8-12 分钟", "不追求疼痛"), ex("呼吸训练", "5 分钟", "降低压力"), ex("睡眠目标", "7-9 小时", "稳定作息")]
};

function item(name, calories, protein, carbs, fat) {
  return { name, calories, protein, carbs, fat };
}

function ex(name, dose, cue) {
  return { name, dose, cue };
}

async function handler(req, res) {
  try {
    if (!process.env.POSTGRES_URL) return json(res, 500, { error: "POSTGRES_URL 未配置，Vercel 动态版需要连接 PostgreSQL 云数据库。" });
    await initDb();
    const path = "/" + (Array.isArray(req.query.path) ? req.query.path.join("/") : req.query.path || "");

    if (req.method === "POST" && path === "/admin/login") {
      const body = await readBody(req);
      if (String(body.password || "") !== ADMIN_PASSWORD) return json(res, 401, { error: "管理员口令不正确。" });
      const token = crypto.randomBytes(32).toString("hex");
      adminTokens.add(token);
      return json(res, 200, { token });
    }
    if (path.startsWith("/admin/")) return adminApi(req, res, path);

    if (req.method === "POST" && path === "/register") {
      const body = await readBody(req);
      if (!body.name || !body.email || !body.password || body.password.length < 6) return json(res, 400, { error: "请填写姓名、邮箱和至少 6 位密码。" });
      const { salt, hash } = hashPassword(body.password);
      const user = await one("INSERT INTO users (name, email, password_hash, salt) VALUES ($1, $2, $3, $4) RETURNING id", [String(body.name).trim(), String(body.email).toLowerCase().trim(), hash, salt]);
      await upsertProfile(user.id, defaultProfilePatch());
      const token = crypto.randomBytes(32).toString("hex");
      await query("INSERT INTO sessions (token, user_id) VALUES ($1, $2)", [token, user.id]);
      return json(res, 201, { token });
    }
    if (req.method === "POST" && path === "/login") {
      const body = await readBody(req);
      const user = await one("SELECT * FROM users WHERE email = $1", [String(body.email || "").toLowerCase().trim()]);
      if (!user || !verifyPassword(String(body.password || ""), user)) return json(res, 401, { error: "邮箱或密码不正确。" });
      const token = crypto.randomBytes(32).toString("hex");
      await query("INSERT INTO sessions (token, user_id) VALUES ($1, $2)", [token, user.id]);
      return json(res, 200, { token });
    }

    const user = await requireUser(req);
    if (!user) return json(res, 401, { error: "请先登录。" });
    const profile = await getProfile(user.id);

    if (req.method === "GET" && path === "/me") {
      const date = queryDate(req);
      return json(res, 200, { user: publicUser(user), profile, latest: await recordByDate(user.id, date) });
    }
    if (req.method === "POST" && path === "/profile") {
      const body = await readBody(req);
      await upsertProfile(user.id, { ...profile, ...body });
      return json(res, 200, { profile: await getProfile(user.id) });
    }
    if (req.method === "GET" && path === "/records") {
      const date = new URL(req.url, "http://localhost").searchParams.get("date");
      if (date) return json(res, 200, { record: await recordByDate(user.id, date) });
      return json(res, 200, { records: (await all("SELECT * FROM body_records WHERE user_id = $1 ORDER BY record_date ASC LIMIT 45", [user.id])) });
    }
    if (req.method === "POST" && path === "/records") {
      const body = await readBody(req);
      await query(`
        INSERT INTO body_records (user_id, record_date, weight_kg, waist_cm, body_fat_pct, steps, sleep_hours, calories_in, workout_done, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT(user_id, record_date) DO UPDATE SET weight_kg=excluded.weight_kg, waist_cm=excluded.waist_cm, body_fat_pct=excluded.body_fat_pct, steps=excluded.steps, sleep_hours=excluded.sleep_hours, calories_in=excluded.calories_in, workout_done=excluded.workout_done, notes=excluded.notes
      `, [user.id, body.record_date || today(), Number(body.weight_kg || 0), Number(body.waist_cm || 0), Number(body.body_fat_pct || 0), Number(body.steps || 0), Number(body.sleep_hours || 0), Number(body.calories_in || 0), body.workout_done ? 1 : 0, body.notes || ""]);
      return json(res, 200, { records: await all("SELECT * FROM body_records WHERE user_id = $1 ORDER BY record_date ASC LIMIT 45", [user.id]) });
    }
    if (req.method === "GET" && path === "/plan") {
      const record = await recordByDate(user.id, queryDate(req));
      return json(res, 200, { plan: await buildPlan(profile, record, user.id) });
    }
    if (req.method === "GET" && path === "/meal-options") return json(res, 200, { options: FOOD_OPTIONS });
    if (req.method === "GET" && path === "/meals") return json(res, 200, await getMealResponse(user.id, profile, queryDate(req)));
    if (req.method === "POST" && path === "/meals") {
      const body = await readBody(req);
      return json(res, 200, await saveMeals(user.id, profile, body.date || today(), body.items || [], body.cheatMeals || []));
    }
    if (req.method === "GET" && path === "/training-options") return json(res, 200, { options: TRAINING_OPTIONS });
    if (req.method === "POST" && path === "/training-day") {
      const body = await readBody(req);
      if (!body.date || !body.plan) return json(res, 400, { error: "缺少训练日期或训练内容。" });
      await query(`
        INSERT INTO training_days (user_id, training_date, plan_json) VALUES ($1,$2,$3)
        ON CONFLICT(user_id, training_date) DO UPDATE SET plan_json=excluded.plan_json, updated_at=NOW()
      `, [user.id, body.date, JSON.stringify(body.plan)]);
      return json(res, 200, { plan: body.plan });
    }
    if (req.method === "POST" && path === "/ai-chat") {
      const body = await readBody(req);
      const record = await recordByDate(user.id, body.date || today()) || (await all("SELECT * FROM body_records WHERE user_id = $1 ORDER BY record_date DESC LIMIT 1", [user.id]))[0] || null;
      const plan = await buildPlan(profile, record, user.id);
      const meals = await getMealResponse(user.id, profile, body.date || today());
      const answer = await askDeepSeek({ user: publicUser(user), profile, record, records: await all("SELECT * FROM body_records WHERE user_id = $1 ORDER BY record_date DESC LIMIT 8", [user.id]), plan, meals, question: body.question, history: body.history || [] });
      return json(res, 200, { answer, model: DEEPSEEK_MODEL });
    }

    return json(res, 404, { error: "API 不存在。" });
  } catch (error) {
    const duplicate = String(error.message).includes("duplicate key");
    return json(res, duplicate ? 409 : error.status || 500, { error: duplicate ? "这个邮箱已经注册。" : error.message });
  }
}

async function adminApi(req, res, path) {
  if (!requireAdmin(req)) return json(res, 401, { error: "请先登录管理员后台。" });
  if (req.method === "GET" && path === "/admin/summary") return json(res, 200, await adminSummary());
  if (req.method === "GET" && path === "/admin/users") return json(res, 200, { users: await adminUsers() });
  const detail = path.match(/^\/admin\/users\/(\d+)$/);
  if (req.method === "GET" && detail) {
    const data = await adminUserDetail(Number(detail[1]));
    return data ? json(res, 200, data) : json(res, 404, { error: "用户不存在。" });
  }
  if (req.method === "GET" && path === "/admin/export.csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"fitplan-admin-export.csv\"");
    return res.status(200).send(`\uFEFF${await adminCsv()}`);
  }
  return json(res, 404, { error: "管理员 API 不存在。" });
}

async function initDb() {
  if (!initPromise) initPromise = query(`
    CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS profiles (user_id INTEGER PRIMARY KEY REFERENCES users(id), sex TEXT NOT NULL DEFAULT 'male', age INTEGER NOT NULL DEFAULT 28, height_cm REAL NOT NULL DEFAULT 175, activity_level TEXT NOT NULL DEFAULT 'moderate', goal TEXT NOT NULL DEFAULT 'fat_loss', strategy TEXT NOT NULL DEFAULT 'training_diet', training_days INTEGER NOT NULL DEFAULT 4, equipment TEXT NOT NULL DEFAULT 'gym', diet_style TEXT NOT NULL DEFAULT 'balanced');
    CREATE TABLE IF NOT EXISTS body_records (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), record_date DATE NOT NULL, weight_kg REAL NOT NULL, waist_cm REAL, body_fat_pct REAL, steps INTEGER, sleep_hours REAL, calories_in INTEGER, workout_done INTEGER NOT NULL DEFAULT 0, notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id, record_date));
    CREATE TABLE IF NOT EXISTS meal_plans (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), meal_date DATE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id, meal_date));
    CREATE TABLE IF NOT EXISTS meal_items (id SERIAL PRIMARY KEY, plan_id INTEGER NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE, slot TEXT NOT NULL, category TEXT NOT NULL, name TEXT NOT NULL, calories INTEGER NOT NULL DEFAULT 0, protein REAL NOT NULL DEFAULT 0, carbs REAL NOT NULL DEFAULT 0, fat REAL NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS cheat_meals (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), meal_date DATE NOT NULL, name TEXT NOT NULL, calories INTEGER NOT NULL DEFAULT 0, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS training_days (user_id INTEGER NOT NULL REFERENCES users(id), training_date DATE NOT NULL, plan_json JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(user_id, training_date));
  `);
  return initPromise;
}

async function query(text, params = []) {
  return pool.query(text, params);
}

async function one(text, params = []) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

async function all(text, params = []) {
  const result = await query(text, params);
  return result.rows;
}

function json(res, status, payload) {
  res.status(status).json(payload);
}

function readBody(req) {
  return typeof req.body === "object" && req.body !== null ? req.body : {};
}

async function requireUser(req) {
  const token = bearer(req);
  if (!token) return null;
  const session = await one("SELECT user_id FROM sessions WHERE token = $1", [token]);
  return session ? one("SELECT id, name, email, created_at FROM users WHERE id = $1", [session.user_id]) : null;
}

function requireAdmin(req) {
  const token = bearer(req);
  return token && adminTokens.has(token);
}

function bearer(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, created_at: user.created_at };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex") };
}

function verifyPassword(password, user) {
  return hashPassword(password, user.salt).hash === user.password_hash;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function queryDate(req) {
  return new URL(req.url, "http://localhost").searchParams.get("date") || today();
}

function defaultProfilePatch() {
  return { sex: "male", age: 28, height_cm: 175, activity_level: "moderate", goal: "fat_loss", strategy: "training_diet", training_days: 4, equipment: "gym", diet_style: "balanced" };
}

async function getProfile(userId) {
  return one("SELECT * FROM profiles WHERE user_id = $1", [userId]);
}

async function upsertProfile(userId, body) {
  const patch = { ...defaultProfilePatch(), ...body };
  await query(`
    INSERT INTO profiles (user_id, sex, age, height_cm, activity_level, goal, strategy, training_days, equipment, diet_style)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT(user_id) DO UPDATE SET sex=excluded.sex, age=excluded.age, height_cm=excluded.height_cm, activity_level=excluded.activity_level, goal=excluded.goal, strategy=excluded.strategy, training_days=excluded.training_days, equipment=excluded.equipment, diet_style=excluded.diet_style
  `, [userId, patch.sex || "male", Number(patch.age || 28), Number(patch.height_cm || 175), patch.activity_level || "moderate", patch.goal || "fat_loss", patch.strategy || "training_diet", Number(patch.training_days || 4), patch.equipment || "gym", patch.diet_style || "balanced"]);
}

async function recordByDate(userId, date) {
  return one("SELECT * FROM body_records WHERE user_id = $1 AND record_date = $2", [userId, date]);
}

function bmi(weightKg, heightCm) {
  return weightKg && heightCm ? weightKg / ((heightCm / 100) ** 2) : 0;
}

function bmr(profile, weightKg) {
  const base = 10 * weightKg + 6.25 * profile.height_cm - 5 * profile.age;
  return Math.round(profile.sex === "female" ? base - 161 : base + 5);
}

function activityFactor(level) {
  return { sedentary: 1.2, light: 1.4, moderate: 1.55, high: 1.75 }[level] || 1.55;
}

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day + 1);
  return d;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function dayName(index) {
  return ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][index];
}

async function buildTrainingWeek(profile, userId) {
  const split = [
    ["push", "胸 / 肩 / 三头", "上肢推"], ["legs", "腿 / 臀 / 核心", "下肢力量"], ["cardio", "有氧 / 活动度", "心肺恢复"],
    ["pull", "背 / 二头", "上肢拉"], ["full", "全身力量", "综合训练"], ["recovery", "恢复 / 步数", "休息恢复"], ["recovery", "恢复 / 步数", "休息恢复"]
  ];
  const savedRows = await all("SELECT training_date, plan_json FROM training_days WHERE user_id = $1", [userId]);
  const saved = new Map(savedRows.map(row => [isoDate(new Date(row.training_date)), typeof row.plan_json === "string" ? JSON.parse(row.plan_json) : row.plan_json]));
  const start = getWeekStart();
  const trainDays = Math.max(0, Math.min(6, Number(profile.training_days || 4)));
  const activeSlots = profile.strategy === "diet_only" ? [0, 2, 4].slice(0, Math.max(2, Math.min(3, trainDays))) : trainDays <= 3 ? [0, 2, 4].slice(0, trainDays) : trainDays === 4 ? [0, 1, 3, 4] : trainDays === 5 ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5];
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const trainingDate = isoDate(date);
    if (saved.has(trainingDate)) return saved.get(trainingDate);
    const isTraining = activeSlots.includes(index);
    const [type, part, title] = isTraining ? split[index] : ["recovery", "恢复 / 步数", "休息恢复"];
    return { day: dayName(index), date: trainingDate, type, part, title, focus: type === "recovery" ? "睡眠、步数、拉伸" : "动作质量、渐进训练", exercises: TRAINING_OPTIONS[type].slice(0, type === "recovery" ? 3 : 4) };
  });
}

async function buildPlan(profile, record, userId) {
  const weight = record?.weight_kg || 76;
  const maintenance = Math.round(bmr(profile, weight) * activityFactor(profile.activity_level));
  const strategyShift = profile.strategy === "diet_only" ? -0.04 : profile.strategy === "training_focus" ? 0.02 : 0;
  const goalRatio = profile.goal === "fat_loss" ? 0.82 + strategyShift : profile.goal === "muscle_gain" ? 1.08 : 1;
  const targetCalories = Math.round((maintenance * goalRatio) / 10) * 10;
  const protein = Math.round(weight * (profile.goal === "muscle_gain" ? 1.8 : 2.0));
  const fat = Math.max(Math.round(weight * 0.7), Math.round((targetCalories * 0.22) / 9));
  const carbs = Math.max(80, Math.round((targetCalories - protein * 4 - fat * 9) / 4));
  const todayIntake = record?.calories_in || 0;
  const week = await buildTrainingWeek(profile, userId);
  return { metrics: { bmi: Number(bmi(weight, profile.height_cm).toFixed(1)), bmr: bmr(profile, weight), maintenance, targetCalories, calorieDeficit: Math.max(0, maintenance - targetCalories), intakeProgress: Math.min(100, Math.round((todayIntake / targetCalories) * 100)) }, macros: { protein, carbs, fat }, training: { days: profile.training_days, steps: profile.strategy === "training_focus" ? "8,000-11,000 步/日" : "7,000-10,000 步/日", today: week[(new Date().getDay() + 6) % 7], week } };
}

function summarizeMeals(items, cheatMeals = []) {
  return [...items, ...cheatMeals].reduce((total, item) => ({ calories: total.calories + Number(item.calories || 0), protein: total.protein + Number(item.protein || 0), carbs: total.carbs + Number(item.carbs || 0), fat: total.fat + Number(item.fat || 0) }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

async function getMealResponse(userId, profile, date) {
  const plan = await one("SELECT * FROM meal_plans WHERE user_id = $1 AND meal_date = $2", [userId, date]);
  const items = plan ? await all("SELECT slot, category, name, calories, protein, carbs, fat FROM meal_items WHERE plan_id = $1 ORDER BY id", [plan.id]) : [];
  const cheatMeals = await all("SELECT id, name, calories, note FROM cheat_meals WHERE user_id = $1 AND meal_date = $2 ORDER BY id", [userId, date]);
  return { date, saved: Boolean(plan), items, cheatMeals, totals: summarizeMeals(items, cheatMeals), options: FOOD_OPTIONS };
}

async function saveMeals(userId, profile, date, items, cheatMeals) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO meal_plans (user_id, meal_date) VALUES ($1,$2) ON CONFLICT(user_id, meal_date) DO UPDATE SET updated_at=NOW()", [userId, date]);
    const plan = (await client.query("SELECT * FROM meal_plans WHERE user_id=$1 AND meal_date=$2", [userId, date])).rows[0];
    await client.query("DELETE FROM meal_items WHERE plan_id=$1", [plan.id]);
    for (const meal of items) await client.query("INSERT INTO meal_items (plan_id, slot, category, name, calories, protein, carbs, fat) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [plan.id, meal.slot || "自定义餐", meal.category || "custom", meal.name || "未命名", Number(meal.calories || 0), Number(meal.protein || 0), Number(meal.carbs || 0), Number(meal.fat || 0)]);
    await client.query("DELETE FROM cheat_meals WHERE user_id=$1 AND meal_date=$2", [userId, date]);
    for (const cheat of cheatMeals) await client.query("INSERT INTO cheat_meals (user_id, meal_date, name, calories, note) VALUES ($1,$2,$3,$4,$5)", [userId, date, cheat.name || "放纵餐", Number(cheat.calories || 0), cheat.note || ""]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return getMealResponse(userId, profile, date);
}

async function askDeepSeek({ user, profile, record, records, plan, meals, question, history }) {
  if (!DEEPSEEK_API_KEY) {
    const error = new Error("DeepSeek API Key 未配置。请在 Vercel 环境变量里设置 DEEPSEEK_API_KEY。");
    error.status = 503;
    throw error;
  }
  const response = await fetch("https://api.deepseek.com/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEEPSEEK_API_KEY}` }, body: JSON.stringify({ model: DEEPSEEK_MODEL, temperature: 0.4, max_tokens: 900, messages: [{ role: "system", content: "你是 FitPlan Daily 的健身减脂问答教练。回答要简洁、具体、可执行，不诊断疾病，不替代医生或注册营养师。" }, { role: "system", content: `当前用户数据 JSON：${JSON.stringify({ user, profile, record, records, plan, meals })}` }, ...(history || []).slice(-6).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 1200) })), { role: "user", content: String(question || "").slice(0, 2000) }] }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || `DeepSeek 请求失败：${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data.choices?.[0]?.message?.content?.trim() || "我暂时没有生成有效回答，请换个问法再试。";
}

async function adminSummary() {
  const [users, records, mealPlans, trainingDays, latestUsers] = await Promise.all([
    one("SELECT COUNT(*)::int AS count FROM users"),
    one("SELECT COUNT(*)::int AS count FROM body_records"),
    one("SELECT COUNT(*)::int AS count FROM meal_plans"),
    one("SELECT COUNT(*)::int AS count FROM training_days"),
    all("SELECT id, name, email, created_at FROM users ORDER BY created_at DESC LIMIT 6")
  ]);
  return { users: users.count, records: records.count, mealPlans: mealPlans.count, trainingDays: trainingDays.count, latestUsers };
}

async function adminUsers() {
  return all(`
    SELECT u.id, u.name, u.email, u.created_at, p.sex, p.age, p.height_cm, p.activity_level, p.goal, p.strategy, p.training_days, p.equipment, p.diet_style,
      (SELECT record_date FROM body_records WHERE user_id=u.id ORDER BY record_date DESC LIMIT 1) AS latest_record_date,
      (SELECT weight_kg FROM body_records WHERE user_id=u.id ORDER BY record_date DESC LIMIT 1) AS latest_weight_kg,
      (SELECT meal_date FROM meal_plans WHERE user_id=u.id ORDER BY meal_date DESC LIMIT 1) AS latest_meal_date,
      (SELECT COUNT(*)::int FROM body_records WHERE user_id=u.id) AS record_count,
      (SELECT COUNT(*)::int FROM meal_plans WHERE user_id=u.id) AS meal_count,
      (SELECT COUNT(*)::int FROM training_days WHERE user_id=u.id) AS training_count
    FROM users u LEFT JOIN profiles p ON p.user_id=u.id ORDER BY u.created_at DESC
  `);
}

async function adminUserDetail(userId) {
  const user = await one("SELECT u.id, u.name, u.email, u.created_at, p.* FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id=$1", [userId]);
  if (!user) return null;
  const mealPlans = await all("SELECT * FROM meal_plans WHERE user_id=$1 ORDER BY meal_date DESC LIMIT 30", [userId]);
  for (const plan of mealPlans) {
    plan.items = await all("SELECT slot, category, name, calories, protein, carbs, fat FROM meal_items WHERE plan_id=$1 ORDER BY id", [plan.id]);
    plan.cheatMeals = await all("SELECT id, name, calories, note FROM cheat_meals WHERE user_id=$1 AND meal_date=$2 ORDER BY id", [userId, plan.meal_date]);
  }
  const trainingDays = (await all("SELECT training_date, plan_json FROM training_days WHERE user_id=$1 ORDER BY training_date DESC", [userId])).map(row => ({ training_date: row.training_date, plan: typeof row.plan_json === "string" ? JSON.parse(row.plan_json) : row.plan_json }));
  return { user, records: await all("SELECT * FROM body_records WHERE user_id=$1 ORDER BY record_date DESC LIMIT 60", [userId]), mealPlans, trainingDays };
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvLine(values) {
  return values.map(csvCell).join(",");
}

async function adminCsv() {
  const rows = [csvLine(["section", "user_id", "name", "email", "date", "field", "value", "extra"])];
  for (const user of await adminUsers()) rows.push(csvLine(["user", user.id, user.name, user.email, user.created_at, "profile", `${user.age || ""}岁/${user.height_cm || ""}cm`, `${user.goal || ""}/${user.strategy || ""}`]));
  for (const record of await all("SELECT u.name, u.email, br.* FROM body_records br JOIN users u ON u.id=br.user_id ORDER BY br.record_date DESC")) rows.push(csvLine(["record", record.user_id, record.name, record.email, record.record_date, "body", `${record.weight_kg}kg/${record.waist_cm}cm/${record.body_fat_pct}%`, `${record.calories_in}kcal/${record.steps}steps`]));
  return rows.join("\n");
}

export default handler;
