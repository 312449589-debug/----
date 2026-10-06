/* =========================================================
   Ming 的个人网站 · 小助手（Dify 对话型应用）
   =========================================================

   ⚠️ 关于 API Key 的安全提醒
   Dify 官方要求：密钥只在服务端使用，不要写进前端代码。
   「嵌入前端代码或客户端应用中的密钥可能被提取和滥用。」

   当前是「零后端」模式，Key 就在下面的 CONFIG 里 ——
   任何访问者都能通过「查看源代码」拿到它并消耗你的额度。

   ✅ 上线前建议切到代理模式（网页里不含 Key）：
      搭建步骤见 worker/README.md（Cloudflare 免费，3 分钟）
      搭好后只需把下面 apiBase 改成代理地址、apiKey 清空即可。
   ========================================================= */

(function () {
  'use strict';

  /* ---------------- 配置区：要改就改这里 ---------------- */
  const CONFIG = {
    /* ── 接口地址 ─────────────────────────────────────────
       【线上：保持默认】Key 在 Cloudflare 服务端，网页源码里搜不到
           apiBase: '/api/chat'
           apiKey:  ''

       【本地：想双击 index.html 直接调试对话】
       代理函数只在 Cloudflare 上跑，本地不存在，需要临时改成直连：
           apiBase: 'https://api.dify.ai/v1'
           apiKey:  '你的密钥（app- 开头的那串，别提交到公开仓库）'
       ⚠️ 调试完一定要改回来，否则密钥会跟着网站一起公开
       ──────────────────────────────────────────────────── */
    apiBase: '/api/chat',
    apiKey: '',

    /* ── 角色文案：改这几行就能换皮 ──────────────────────── */
    botName: 'None',                                     // 挂件上显示的名字
    botTagline: '在线 · 有事说事',                        // 名字下方的小字
    greeting: '……我在。\n有事说事，没事也可以随便聊。',    // 打开时的第一句话
    starters: ['你好', '你能做什么？', '随便聊点什么'],     // 快捷提问
  };

  const STORE = {
    uid:  'ming-chat-uid',
    conv: 'ming-chat-conv',
    log:  'ming-chat-log',
    seen: 'ming-chat-seen',
  };

  const $ = (id) => document.getElementById(id);

  // 去掉结尾斜杠，避免拼出 //chat-messages 这种地址
  const API_BASE = CONFIG.apiBase.replace(/\/+$/, '');

  // 是不是直接双击打开的本地文件
  const IS_FILE = location.protocol === 'file:';

  // 请求头：走代理模式时 apiKey 为空，就干脆不发 Authorization
  //（Key 由代理在服务端注入）
  function apiHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (CONFIG.apiKey) h['Authorization'] = 'Bearer ' + CONFIG.apiKey;
    return h;
  }

  /* ---------------- 运行时状态 ---------------- */
  const state = {
    open: false,
    streaming: false,
    conversationId: '',
    userId: '',
    controller: null,
    taskId: '',
    history: [],       // [{ role: 'user' | 'bot', text }]
  };

  const els = {};

  /* ---------------- 小工具 ---------------- */

  // 安全的本地存储（隐私模式 / file:// 下可能抛错）
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} },
  };

  // HTML 转义：所有外部文本都要先过这一层，防止 XSS
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // 极简 Markdown（零依赖）：粗体、行内代码、列表、换行
  function fmt(s) {
    let h = esc(s);
    h = h.replace(/`([^`\n]+)`/g, '<code class="chat-code">$1</code>');
    h = h.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/^\s*[-*+]\s+(.+)$/gm, '<span class="chat-li">• $1</span>');
    h = h.replace(/^\s*(\d+)[.)]\s+(.+)$/gm, '<span class="chat-li"><b>$1.</b> $2</span>');
    h = h.replace(/\n/g, '<br>');
    return h;
  }

  // 有些模型（如 DeepSeek R1 系）会把推理过程一起吐出来，
  // 显示给用户不合适，这里做一层清洗
  function clean(raw) {
    return String(raw)
      .replace(/<!--[\s\S]*?-->/g, '')                 // Dify 的推理标记注释
      .replace(/<think[^>]*>[\s\S]*?<\/think>/gi, '')  // 已闭合的推理块
      .replace(/<think[^>]*>[\s\S]*$/i, '')            // 流式中尚未闭合的推理块
      .replace(/<\/think>/gi, '')
      .replace(/^\s+/, '');
  }

  // 当前是否处于「思考中」（<think> 开了还没闭合）
  function isThinking(raw) {
    const t = String(raw);
    const open = (t.match(/<think[^>]*>/gi) || []).length;
    const close = (t.match(/<\/think>/gi) || []).length;
    return open > close;
  }

  const DOTS = '<span class="dots"><i></i><i></i><i></i></span>';

  function thinkingHTML() {
    return '<span class="thinking">💭 思考中</span>' + DOTS;
  }

  // 把接口报错翻译成可爱的说法
  function friendly(msg, status) {
    const m = String(msg || '');
    if (/missing_api_key/.test(m)) return '代理还没配密钥，去 Cloudflare 加 DIFY_API_KEY 吧 🔑';
    if (/forbidden_origin/.test(m)) return '代理拒绝了当前域名，检查一下白名单 🌐';
    if (status === 401) return '密钥好像不太对，检查一下 API Key 吧 🔑';
    if (status === 429) return '消息有点多，让我喘口气，稍后再试～ 😵';
    if (status === 402) return '额度用完啦 💸 去 Dify 控制台看看吧';
    // 相对路径 + 这类状态码 = 代理没就位（本地预览时很常见）
    if (API_BASE.charAt(0) === '/' &&
        (status === 404 || status === 405 || status === 501)) {
      return '代理还没就位（本地预览时属正常）🚧';
    }
    if (IS_FILE && API_BASE.charAt(0) === '/') {
      return '本地直接打开用不了对话，起个本地服务器吧 🚧';
    }
    if (/conversation/i.test(m) && /not/i.test(m)) return '这段对话过期啦，我开一段新的～ ✨';
    if (/app_unavailable/i.test(m)) return '应用暂时不可用，去 Dify 检查一下配置吧 🛠️';
    if (/timeout|network|Failed to fetch/i.test(m)) return '网络好像打了个瞌睡，再试一次？ 📡';
    return '出了点小状况，稍后再试一下吧 🙈';
  }

  /* ---------------- 渲染 ---------------- */

  function scrollToEnd() {
    requestAnimationFrame(() => {
      els.log.scrollTop = els.log.scrollHeight;
    });
  }

  // 创建一条消息气泡，返回元素
  function addMsg(role, text, isPlaceholder) {
    const wrap = document.createElement('div');
    wrap.className = 'msg msg-' + (role === 'user' ? 'user' : 'bot');

    const body = document.createElement('div');
    body.className = 'msg-body';

    if (role === 'user') {
      body.textContent = text;                 // 纯文本，天然安全
    } else if (isPlaceholder) {
      body.innerHTML = thinkingHTML();
      wrap.classList.add('is-typing');
    } else {
      body.innerHTML = fmt(text);
    }

    wrap.appendChild(body);
    els.log.appendChild(wrap);
    scrollToEnd();
    return wrap;
  }

  function setBotText(wrap, text) {
    wrap.classList.remove('is-typing');
    wrap.querySelector('.msg-body').innerHTML = text ? fmt(text) : '';
    scrollToEnd();
  }

  function addImage(url) {
    if (!/^https?:\/\//i.test(url)) return;
    const img = document.createElement('img');
    img.className = 'msg-img';
    img.src = url;
    img.alt = '图片';
    img.loading = 'lazy';
    els.log.lastElementChild?.appendChild(img);
    scrollToEnd();
  }

  function renderStarters() {
    if (!els.starters) return;
    els.starters.innerHTML = '';
    CONFIG.starters.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chat-chip';
      b.textContent = s;
      b.addEventListener('click', () => send(s));
      els.starters.appendChild(b);
    });
  }

  function hideStarters() {
    if (els.starters) els.starters.classList.add('is-hidden');
  }

  function setStatus(text) {
    if (els.status) els.status.textContent = text || CONFIG.botTagline;
  }

  function setBusy(busy) {
    state.streaming = busy;
    els.panel.classList.toggle('is-busy', busy);
    els.send.setAttribute('aria-label', busy ? '停止生成' : '发送');
    els.send.innerHTML = busy ? '■' : '➤';
    els.input.setAttribute('placeholder', busy ? '对方正在输入…' : '说点什么吧…');
  }

  function persist() {
    store.set(STORE.conv, state.conversationId || '');
    store.set(STORE.log, JSON.stringify(state.history.slice(-40)));
  }

  function renderHistory() {
    els.log.innerHTML = '';
    state.history.forEach((m) => {
      const el = addMsg(m.role, m.text);
      if (m.role === 'bot') setBotText(el, m.text);
    });
    if (state.history.length) hideStarters();
  }

  /* ---------------- 开关面板 ---------------- */

  function openPanel() {
    if (state.open) return;
    state.open = true;
    els.panel.classList.add('is-open');
    els.panel.setAttribute('aria-hidden', 'false');
    els.fab.setAttribute('aria-expanded', 'true');
    hideTeaser();
    store.set(STORE.seen, '1');
    if (!state.history.length) {
      state.history.push({ role: 'bot', text: CONFIG.greeting });
      setBotText(addMsg('bot', CONFIG.greeting), CONFIG.greeting);
      persist();
    }
    scrollToEnd();
    if (window.matchMedia('(pointer: fine)').matches) {
      setTimeout(() => els.input.focus(), 240);
    }
  }

  function closePanel() {
    if (!state.open) return;
    state.open = false;
    els.panel.classList.remove('is-open');
    els.panel.setAttribute('aria-hidden', 'true');
    els.fab.setAttribute('aria-expanded', 'false');
  }

  function togglePanel() { state.open ? closePanel() : openPanel(); }

  function resetChat() {
    if (state.streaming) stop();
    state.conversationId = '';
    state.history = [];
    state.history.push({ role: 'bot', text: CONFIG.greeting });
    els.log.innerHTML = '';
    els.starters.classList.remove('is-hidden');
    setBotText(addMsg('bot', CONFIG.greeting), CONFIG.greeting);
    setStatus(CONFIG.botTagline);
    persist();
    els.input.focus();
  }

  /* ---------------- 发送 & 流式接收 ---------------- */

  async function send(raw) {
    const q = String(raw || '').trim();
    if (!q || state.streaming) return;

    hideStarters();
    addMsg('user', q);
    state.history.push({ role: 'user', text: q });

    const botEl = addMsg('bot', '', true);
    setStatus('对方正在输入…');
    setBusy(true);

    state.controller = new AbortController();
    state.taskId = '';

    let acc = '';                 // 原始文本（含推理块）
    let sawAgentFragment = false;

    // 只渲染清洗后的内容；如果模型还在推理，就显示「思考中」
    const paint = () => {
      const shown = clean(acc);
      if (shown) {
        setBotText(botEl, shown);
      } else {
        botEl.classList.add('is-typing');
        botEl.querySelector('.msg-body').innerHTML = thinkingHTML();
        scrollToEnd();
      }
    };

    try {
      const res = await fetch(API_BASE + '/chat-messages', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          query: q,
          inputs: {},
          response_mode: 'streaming',
          conversation_id: state.conversationId || '',
          user: state.userId,
          auto_generate_name: true,
        }),
        signal: state.controller.signal,
      });

      if (!res.ok) {
        let detail = res.status + ' ' + res.statusText;
        try {
          const j = await res.json();
          // 代理返回 { error, hint }，Dify 返回 { code, message }
          if (j && j.message) detail = j.message;
          else if (j && j.error) detail = j.error + (j.hint ? ' — ' + j.hint : '');
        } catch (_) {}
        throw Object.assign(new Error(detail), { status: res.status });
      }

      const ctype = res.headers.get('content-type') || '';

      // 少数情况下应用会退化成阻塞式返回 JSON
      if (ctype.includes('application/json')) {
        const j = await res.json();
        acc = j.answer || '';
        state.conversationId = j.conversation_id || state.conversationId;
        paint();
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let raf = 0;

        const schedule = () => {
          if (raf) return;
          raf = requestAnimationFrame(() => { raf = 0; paint(); });
        };

        const handle = (data) => {
          if (!data || typeof data !== 'object') return;

          if (data.conversation_id) state.conversationId = data.conversation_id;
          if (data.task_id) state.taskId = data.task_id;

          switch (data.event) {
            case 'message':
              // Agent 应用：agent_message 之后还会有一条携带完整回答的 message
              // → 视为最终答案（替换），而不是继续追加
              acc = sawAgentFragment ? (data.answer || '') : acc + (data.answer || '');
              schedule();
              break;

            case 'agent_message':
              sawAgentFragment = true;
              acc += data.answer || '';
              schedule();
              break;

            case 'message_file':
              if (data.belongs_to === 'assistant' && data.url) addImage(data.url);
              break;

            case 'error':
              throw Object.assign(
                new Error(data.message || 'error'),
                { status: data.status }
              );

            case 'ping':
            case 'agent_thought':
            case 'message_end':
            default:
              break;
          }
        };

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE 事件之间用空行分隔
          const chunks = buffer.split(/\r?\n\r?\n/);
          buffer = chunks.pop() || '';

          for (const chunk of chunks) {
            for (const line of chunk.split(/\r?\n/)) {
              if (!line.startsWith('data:')) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === '[DONE]') continue;
              try { handle(JSON.parse(payload)); } catch (_) {}
            }
          }
        }

        if (raf) cancelAnimationFrame(raf);
      }

      const finalText = clean(acc) || '……我好像词穷了，换个说法再问问我？ 🙈';
      setBotText(botEl, finalText);
      state.history.push({ role: 'bot', text: finalText });
      setStatus(CONFIG.botTagline);
      persist();

    } catch (err) {
      const aborted = err && err.name === 'AbortError';

      if (aborted) {
        const stopped = clean(acc);
        if (stopped) {
          setBotText(botEl, stopped);
          state.history.push({ role: 'bot', text: stopped });
        } else {
          botEl.remove();
          state.history.pop();
        }
        setStatus('已停止');
        setTimeout(() => setStatus(CONFIG.botTagline), 1600);
      } else {
        const msg = friendly(err && err.message, err && err.status);
        botEl.classList.remove('is-typing');
        botEl.classList.add('is-error');
        setBotText(botEl, msg);
        setStatus('有点小故障');
        setTimeout(() => setStatus(CONFIG.botTagline), 2600);

        if (err && err.status === 404) {
          state.conversationId = '';
        }
      }
      persist();
    } finally {
      setBusy(false);
      state.controller = null;
      if (state.open) els.input.focus();
    }
  }

  // 停止生成：先断开本地流，再通知服务端（Dify 提供 stop 接口）
  function stop() {
    if (state.controller) state.controller.abort();
    if (state.taskId) {
      fetch(API_BASE + '/chat-messages/' + state.taskId + '/stop', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ user: state.userId }),
      }).catch(() => {});
    }
  }

  /* ---------------- 提示气泡 ---------------- */

  function showTeaser() {
    if (!els.teaser || state.open || store.get(STORE.seen)) return;
    els.teaser.hidden = false;
    requestAnimationFrame(() => els.teaser.classList.add('is-show'));
    setTimeout(hideTeaser, 9000);
  }

  function hideTeaser() {
    if (!els.teaser) return;
    els.teaser.classList.remove('is-show');
    setTimeout(() => { els.teaser.hidden = true; }, 300);
  }

  /* ---------------- 初始化 ---------------- */

  function boot() {
    els.fab      = $('chatFab');
    els.teaser   = $('chatTeaser');
    els.panel    = $('chatPanel');
    els.log      = $('chatLog');
    els.starters = $('chatStarters');
    els.form     = $('chatForm');
    els.input    = $('chatInput');
    els.send     = $('chatSend');
    els.status   = $('chatStatus');
    els.close    = $('chatClose');
    els.reset    = $('chatReset');
    els.name     = $('chatName');

    if (!els.fab || !els.panel) return;

    /* 配置自检：配错了给个明确提示，别让人对着转圈发呆 */
    let host = '';
    try { host = new URL(API_BASE, location.href).hostname; }
    catch (_) { console.error('[小助手] apiBase 不是合法网址：' + CONFIG.apiBase); }

    if (host) {
      const isDirectDify = /(^|\.)dify\.ai$/.test(host);
      if (!CONFIG.apiKey && isDirectDify) {
        console.error('[小助手] 直连 Dify 但没有 apiKey，请求必然失败。' +
                      '要么填上 Key，要么把 apiBase 改成代理地址。');
      }
      if (CONFIG.apiKey && !isDirectDify) {
        console.warn('[小助手] 你用的是代理地址，却仍带着 apiKey —— ' +
                     'Key 会发给这个代理，建议把它清空。');
      }
    }

    // 本地预览时代理函数不存在，提前说清楚免得困惑
    if (IS_FILE && API_BASE.charAt(0) === '/') {
      console.info('[小助手] 当前是本地 file:// 打开，代理 /api/chat 不存在，' +
                   '对话功能会提示「代理没就位」。想看效果请用本地服务器（见 README），' +
                   '或按 js/chat.js 顶部说明临时切成直连。');
    }

    /* 文案 & 身份 */
    els.name.textContent = CONFIG.botName;
    setStatus(CONFIG.botTagline);

    state.userId = store.get(STORE.uid) ||
      ('web-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36));
    store.set(STORE.uid, state.userId);

    state.conversationId = store.get(STORE.conv) || '';

    try {
      const saved = JSON.parse(store.get(STORE.log) || '[]');
      if (Array.isArray(saved)) {
        state.history = saved.filter((m) => m && m.text)
          .map((m) => ({ role: m.role === 'user' ? 'user' : 'bot', text: String(m.text) }));
      }
    } catch (_) { state.history = []; }

    renderStarters();
    renderHistory();

    /* 事件绑定 */
    els.fab.addEventListener('click', togglePanel);
    els.close.addEventListener('click', closePanel);
    els.reset.addEventListener('click', resetChat);

    els.teaser?.addEventListener('click', openPanel);

    els.form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (state.streaming) { stop(); return; }
      const v = els.input.value;
      els.input.value = '';
      send(v);
    });

    els.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        els.form.requestSubmit();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.open) closePanel();
    });

    // 点击面板外部收起（桌面端）
    document.addEventListener('click', (e) => {
      if (!state.open) return;
      if (els.panel.contains(e.target) || els.fab.contains(e.target)) return;
      if (els.teaser && els.teaser.contains(e.target)) return;
      closePanel();
    });

    // 5 秒后给个轻量提示（只提示一次）
    setTimeout(showTeaser, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
