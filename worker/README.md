# Dify 转发代理（Cloudflare Worker · 备选方案）

> ℹ️ **这个方案是备选。**
> 本项目已经内置了更省事的做法：`functions/api/chat/[[path]].js`（Cloudflare Pages Function）。
> 它和网站同一个域名，不用配 CORS、也不用单独部署 —— 部署方式见项目根目录的 `README.md`。
>
> **什么时候才需要这里这个独立 Worker？**
> - 想让多个网站共用一个代理
> - 想独立于网站更新代理
> - 网站不托管在 Cloudflare Pages 上
>
> 如果以上都不适用，可以忽略这个目录。

把 Dify 的 API Key 藏起来，不再暴露在网页里。

## 为什么需要它

在网页里直接调 Dify，任何人打开「查看源代码」都能拿到你的 Key，可以拿去刷你的额度。
Dify 官方文档写得很明确：

> **只在后端调用 API。** 嵌入前端代码或客户端应用中的密钥可能被提取和滥用。

这个 Worker 就是那个「后端」—— 它只有一百来行，免费额度对个人网站绰绰有余。

---

# 方式一：网页控制台（推荐，不用装任何东西）

## 1. 创建 Worker

1. 打开 https://dash.cloudflare.com/ ，注册 / 登录（免费）
2. 左侧菜单 → **Compute (Workers)** → **Create** → 选 **Start with Hello World!**
3. 给个名字，比如 `dify-proxy` → **Deploy**
4. 部署后点 **Edit code**（编辑代码）
5. 把编辑器里的内容**全部删掉**，粘贴 `dify-proxy.js` 的全部内容
6. 找到这一行，改成你的网站域名：

   ```js
   const ALLOWED_ORIGINS = [
     'https://your-domain.com',      // ← 换成你真实的域名
     'http://localhost:5500',        // ← 本地调试留着
   ];
   ```

7. 右上角 **Deploy**

## 2. 添加 API Key（密钥）

在 Worker 页面 → **Settings** → **Variables and Secrets** → **Add**

| 字段 | 填什么 |
|---|---|
| Type | 选 **Secret** |
| Name | `DIFY_API_KEY` |
| Value | 你的 `app-` 开头的那串密钥 |

保存后 Cloudflare 会**重新部署**一次，等它跑完。

> 选 Secret 而不是 Text，这样值在控制台里是隐藏的、也读不出来。

## 3. 拿到 Worker 网址

在 Worker 首页能看到，形如：

```
https://dify-proxy.你的名字.workers.dev
```

**记下它。**

## 4. 改网站

打开 `js/chat.js`：

```js
// 改前（密钥暴露在网页里）
apiBase: 'https://api.dify.ai/v1',
apiKey: 'app-你的密钥',

// 改后（走代理，网页里不含 Key）
apiBase: 'https://dify-proxy.你的名字.workers.dev',
apiKey: '',
```

改完**务必搜一下** `app-`，确认整个项目里已经搜不到了。

---

# 方式二：命令行（需要先装 Node.js）

```bash
cd worker

npx wrangler login                          # 浏览器授权
npx wrangler secret put DIFY_API_KEY        # 粘贴 Key 后回车
npx wrangler deploy
```

改完 `dify-proxy.js` 里的 `ALLOWED_ORIGINS` 后，再跑一次 `npx wrangler deploy` 即可。
`wrangler.toml` 就是给这种方式用的。

---

# 验证

打开网站，跟小助手说句话：

| 现象 | 原因 |
|---|---|
| ✅ 正常逐字回复 | 成功 |
| ❌ `forbidden_origin` | `ALLOWED_ORIGINS` 和浏览器地址栏不一致。注意 `http`/`https`、有没有 `www`、端口号都要完全一致 |
| ❌ `missing_api_key` | Secret 名字拼错或没保存，重新加一次 `DIFY_API_KEY` |
| ❌ 浏览器报 CORS | 同上，多半是 origin 不匹配 |

### 本地怎么测

直接用 `file://` 双击打开时，浏览器的 `Origin` 是 `null`，会被 Worker 拒绝。
想在本机验证代理，起一个本地服务器：

```bash
cd ..                          # 回到网站根目录
python3 -m http.server 5500
```

然后访问 http://localhost:5500

---

# 其他

| 想做什么 | 怎么做 |
|---|---|
| 换 API Key | Settings → Variables and Secrets 里改 `DIFY_API_KEY` |
| 看实时日志 | 控制台 → Worker → **Logs**（CLI 是 `npx wrangler tail`） |
| 换域名 | 改 `ALLOWED_ORIGINS` 后重新 Deploy |
| 不要了 | Settings 最底下 **Delete** |

# 为什么要有白名单

Worker 的网址本身是公开的。如果没有 `ALLOWED_ORIGINS`，
别人发现这个地址就能免费用你的额度。

所以：**上线前一定把 `'https://your-domain.com'` 换成真实域名，别留着占位符。**
只是想本地玩玩，可以先填 `['*']` 放开，但不要带着 `*` 上线。
