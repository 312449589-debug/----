# Ming 的个人网站

纯 HTML / CSS / JS，零依赖、零构建。附加一个接在 Dify 上的角色扮演小助手。

## 文件结构

```
个人网站/
├── index.html                     # 页面（单页，6 个板块）
├── css/style.css                  # 全部样式
├── js/main.js                     # 页面动效
├── js/chat.js                     # 小助手（配置在最上面 CONFIG）
├── functions/
│   └── api/chat/[[path]].js       # Dify 转发代理（Cloudflare Pages Function）
├── worker/                        # 备选方案：独立部署的 Worker 版代理
│   ├── dify-proxy.js
│   ├── wrangler.toml
│   └── README.md
└── .gitignore
```

**注意**：`functions/` 只在 Cloudflare Pages 上生效，本地不起作用。

---

## 本地预览

推荐起个本地服务器（最接近线上环境）： 

```bash
python3 -m http.server 5500
```

然后打开 http://localhost:5500

> 小助手对话功能在本地仍然不可用 —— 代理跑在 Cloudflare 上，本地没有这个运行时。
> 想本地也能聊，见下面「本地调试对话」。

### 本地调试对话

改 `js/chat.js` 顶部的 `CONFIG`，临时切成直连：

```js
apiBase: 'https://api.dify.ai/v1',
apiKey:  'app-你的密钥',
```

⚠️ **调试完务必改回来**（`apiBase: '/api/chat'`、`apiKey: ''`），
否则密钥会跟着网站一起公开。

---

## 关于小助手

```
浏览器  ──POST /api/chat/chat-messages──▶  Cloudflare Function  ──▶  Dify
        （网页里不含密钥）                  ＋在服务端注入密钥
        ◀────────── SSE 流式回复 ──────────                      ◀───
```

密钥存在 Cloudflare 的环境变量 `DIFY_API_KEY` 里，**不在代码里**。
这样任何人查看网页源代码都拿不到它。

改动小助手的名字、开场白、快捷提问：见 `js/chat.js` 顶部的 `CONFIG`。

---

## 部署到 Cloudflare Pages

### 第一次部署

1. 打开 https://dash.cloudflare.com/ ，注册或登录（免费）
2. 左侧 → **Workers & Pages** → **Create** → 切到 **Pages** 标签 → **Upload assets**
3. 项目名填一个好记的，比如 `ming-site` → **Create project**
4. 把项目文件夹拖进去上传

   > 💡 建议只拖这几项：`index.html`、`css`、`js`、`functions`
   > （`worker/`、`README.md`、`.gitignore` 不传更干净，但传了也没影响）

5. 点 **Deploy site**，等一会儿
6. 部署完成后会给你一个网址，形如：

   ```
   https://ming-site.pages.dev
   ```

**这时候网站已经能访问了，但小助手还不会回话** —— 因为还没给它配密钥。

### 配置密钥

1. 进入这个 Pages 项目 → **Settings** → **Variables and secrets**
2. **Add** 一个变量：

   | 字段 | 填什么 |
   |---|---|
   | Type | **Secret** |
   | Name | `DIFY_API_KEY` |
   | Value | 你的 `app-` 开头的密钥 |

3. 保存
4. 回到 **Deployments** 标签，找到最新那次部署，点右边 **⋯** → **Retry deployment**
   （让新变量生效）

等它重新跑完，打开网站试试小助手 —— 应该就能聊天了。

### 以后更新内容

改了文件后，重新走一遍：

**Workers & Pages** → 选中项目 → **Create new deployment** → 重新拖文件上传

也可以在 Deployments 里删掉旧的，保持整洁。

---

## 常见问题

| 现象 | 原因 / 解决 |
|---|---|
| 小助手提示「代理还没就位」 | ① 本地 `file://` 预览属正常；② 线上则是 `functions/` 目录没上传，补传一次 |
| 小助手提示「代理还没配密钥」 | 没加 `DIFY_API_KEY`，或加完没重新部署 |
| 小助手提示「网络打了个瞌睡」 | 密钥不对、Dify 应用被停用、或额度用尽 |
| 样式乱了 / 404 | 上传时漏了 `css/` 或 `js/` 目录，检查目录结构层级 |
| 改了文案没生效 | 浏览器缓存，按 `Cmd + Shift + R` 强制刷新 |
| 想换域名 | Pages 项目 → **Custom domains** → 添加你买的域名，按提示改 DNS |

---

## 想更进一步

- **自动部署**：把项目传到 GitHub，然后 Pages 改成 **Connect to Git** 方式。
  以后只要 `git push`，网站自动更新，不用手动拖文件。
- **多个网站共用一个代理**：改用 `worker/` 里的独立 Worker 版本，见 `worker/README.md`。
