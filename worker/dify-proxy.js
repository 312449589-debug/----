/**
 * =========================================================
 *  Dify 转发代理 · Cloudflare Worker
 * =========================================================
 *
 *  作用：把 API Key 藏在服务端，浏览器拿不到它。
 *
 *  浏览器  ──POST /chat-messages──▶  Worker  ──▶  api.dify.ai/v1/chat-messages
 *          （不含 Key）                ＋注入 Key
 *          ◀──── SSE 流式 ────────────          ◀──── SSE 流式 ────
 *
 *  路径与 Dify 官方保持一致，所以前端只需改 apiBase 一个值。
 *
 *  部署步骤见同目录 README.md。
 * =========================================================
 */

/* ---------------- 配置区 ---------------- */

// Dify API 基础地址（自部署的话改成你自己的）
const DIFY_API = 'https://api.dify.ai/v1';

// 允许调用本代理的网站来源。
// ⚠️ 上线前务必把这里换成你真实的网站域名，否则别人可以白嫖你的额度。
// 想临时放开所有来源，填 ['*']。
const ALLOWED_ORIGINS = [
  'https://your-domain.com',
  'https://www.your-domain.com',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

// 只放行这几个路径，避免代理被当成万能跳板
const ALLOWED_PATHS = /^\/chat-messages(\/[\w-]+\/stop)?$/;

/* ---------------- 主逻辑 ---------------- */

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // 1) 跨域预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    if (request.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405, cors(origin));
    }

    // 2) 来源白名单：挡住别人拿你的代理当免费 API 用
    if (!isOriginAllowed(origin)) {
      return json({ error: 'forbidden_origin', origin }, 403, cors(origin));
    }

    // 3) 环境变量里没有 Key 就直接报错，别让请求白跑
    if (!env.DIFY_API_KEY) {
      return json(
        { error: 'missing_api_key', hint: '运行 wrangler secret put DIFY_API_KEY' },
        500, cors(origin)
      );
    }

    // 4) 路径白名单
    const url = new URL(request.url);
    if (!ALLOWED_PATHS.test(url.pathname)) {
      return json({ error: 'not_found', path: url.pathname }, 404, cors(origin));
    }

    // 5) 转发到 Dify（对话请求体很小，直接读成文本最稳）
    let body;
    try {
      body = await request.text();
    } catch (_) {
      return json({ error: 'invalid_body' }, 400, cors(origin));
    }

    let upstream;
    try {
      upstream = await fetch(DIFY_API + url.pathname + url.search, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + env.DIFY_API_KEY,
          'Content-Type': 'application/json',
          'Accept': request.headers.get('Accept') || 'text/event-stream',
        },
        body,
      });
    } catch (err) {
      return json({ error: 'upstream_unreachable', message: String(err) }, 502, cors(origin));
    }

    // 6) 把响应「原样流回去」—— 关键是别读成文本，否则就不流式了
    //    编码 / 长度相关的头必须丢掉，由 Worker 运行时自己处理
    const headers = new Headers(cors(origin));
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'text/event-stream');
    headers.set('Cache-Control', 'no-cache, no-transform');
    headers.set('X-Accel-Buffering', 'no');   // 防止某些反代把 SSE 缓冲住

    return new Response(upstream.body, { status: upstream.status, headers });
  },
};

/* ---------------- 辅助函数 ---------------- */

function isOriginAllowed(origin) {
  if (ALLOWED_ORIGINS.includes('*')) return true;
  if (!origin) return false;                 // 非浏览器请求（curl 等）一律拒绝
  return ALLOWED_ORIGINS.includes(origin);
}

function cors(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (isOriginAllowed(origin)) {
    h['Access-Control-Allow-Origin'] = ALLOWED_ORIGINS.includes('*') ? '*' : origin;
  }
  return h;
}

function json(obj, status, corsHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
