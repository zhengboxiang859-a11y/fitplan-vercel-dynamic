# FitPlan Daily Vercel 动态版部署说明

这个文件夹是独立的 Vercel 动态版本：

```text
fitplan-vercel-dynamic/
  api/[...path].js
  public/
    index.html
    admin.html
    app.js
    admin.js
    styles.css
  package.json
  vercel.json
```

## 重要区别

原版使用：

```text
Node 长运行 server.js + 本地 SQLite
```

Vercel 版改成：

```text
Vercel 静态页面 + Vercel Serverless API + PostgreSQL 云数据库
```

所以 Vercel 版必须配置数据库环境变量，否则登录、保存、后台都不能用。

## 需要的环境变量

在 Vercel 项目 Settings -> Environment Variables 里添加：

```text
POSTGRES_URL=你的 PostgreSQL 连接字符串
ADMIN_PASSWORD=你的后台管理员口令
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_MODEL=deepseek-v4-flash
```

`DEEPSEEK_API_KEY` 可以先不填，不填时 AI 页面会提示未配置；但 `POSTGRES_URL` 必须填写。

## 数据库怎么选

推荐任选一个：

- Supabase PostgreSQL
- Neon PostgreSQL
- Vercel Marketplace 里的 Neon/Postgres 集成

拿到类似这样的连接字符串：

```text
postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

填到 Vercel 的 `POSTGRES_URL`。

首次访问 API 时，系统会自动创建所需表：

- users
- sessions
- profiles
- body_records
- meal_plans
- meal_items
- cheat_meals
- training_days

## 部署方式一：Vercel 网页导入

1. 把 `fitplan-vercel-dynamic` 文件夹上传到 GitHub 仓库。
2. 打开 Vercel。
3. Import Project。
4. 选择这个仓库。
5. Framework Preset 选 Other。
6. 添加环境变量。
7. Deploy。

## 访问地址

前台：

```text
https://你的-vercel-域名/
```

后台：

```text
https://你的-vercel-域名/admin
```

后台登录只需要输入 `ADMIN_PASSWORD`，不需要账号名。

## 注意

- Vercel 在中国大陆访问可能不稳定或较慢。
- 真正面向国内用户，腾讯云轻量服务器仍然更稳。
- Vercel 免费额度和数据库免费额度以对应平台为准。
