/**
 * =========================================================
 *  Dify 转发代理 · Cloudflare Pages Function
 * =========================================================
 *
 *  网站和代理在同一个域名下，所以：
 *    · 不需要配 CORS（同源）
 *    · 不需要单独部署 Worker
 *
 *  浏览器  ──POST /api/chat/chat-messages──▶  本函数  ──▶  api.dify.ai/v1/chat-messages
 *          （网页里不含 Key）                  ＋注入 Key
 *          ◀──────── SSE 流式 ────────────────          ◀──── SSE 流式 ────
 *
 *  ⚠️ 路径必须和 Cloudflare 的目录结构对应：
 *     文件  functions/api/chat/[[path]].js
 *     ↓
 *     路由  /api/chat/任意路径
 *
 *  API Key 不在这里，它放在 Cloudflare Pages 的环境变量里：
 *     项目 → Settings → Variables and secrets → DIFY_API_KEY
 * =========================================================
 */

const DIFY_API = 'https://api.dify.ai/v1';

// 只放行这两个路径，避免代理被当成万能跳板
const ALLOWED_PATHS = /^\/chat-messages(\/[\w-]+\/stop)?$/;

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  // 还原被代理的路径。
  // Cloudflare 对 [[path]] 这种多段通配符返回数组：['chat-messages', 'abc', 'stop']
  // 这里同时兼容字符串，免得平台行为变动时踩坑。
  const raw = params.path;
  const path = '/' + (Array.isArray(raw) ? raw.join('/') : String(raw || ''));

  if (!ALLOWED_PATHS.test(path)) {
    return json({ error: 'not_found', path }, 404);
  }

  // 没配环境变量就直接报错，省得请求白跑一趟
  if (!env.DIFY_API_KEY) {
    return json({
      error: 'missing_api_key',
      hint: '去 Cloudflare Pages → Settings → Variables and secrets 添加 DIFY_API_KEY',
    }, 500);
  }

  // 读请求体（对话请求很小，读成文本最省事，也避免各种流式解析问题）
  let body;
  try {
    body = await request.text();
  } catch (_) {
    return json({ error: 'invalid_body' }, 400);
  }

  let upstream;
  try {
    upstream = await fetch(DIFY_API + path, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.DIFY_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body,
    });
  } catch (err) {
    return json({ error: 'upstream_unreachable', message: String(err) }, 502);
  }

  // 把响应「原样流回去」—— 关键是别读成 text，否则就不流式了
  const headers = new Headers();
  headers.set('Content-Type', upstream.headers.get('Content-Type') || 'text/event-stream');
  headers.set('Cache-Control', 'no-cache, no-transform');
  headers.set('X-Accel-Buffering', 'no');   // 防止中间层把 SSE 缓冲住

  return new Response(upstream.body, { status: upstream.status, headers });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
