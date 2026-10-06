/* =========================================================
   Ming 的个人网站 · 交互逻辑
   ========================================================= */
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isFinePointer = window.matchMedia('(pointer: fine)').matches;

  /* ---------------------------------------------------
     1. 用代码画一只像素猫猫头像
     --------------------------------------------------- */
  function drawAvatar() {
    const canvas = document.getElementById('pixelAvatar');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const G = 16;                       // 16 x 16 像素网格
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cssSize = canvas.clientWidth || 288;
    // 每个像素占多少物理像素（取整，保证不糊）
    const px = Math.max(4, Math.round((cssSize * dpr) / G));

    canvas.width = px * G;
    canvas.height = px * G;
    ctx.setTransform(px, 0, 0, px, 0, 0);
    ctx.clearRect(0, 0, G, G);

    const INK   = '#4A3F52';
    const FUR   = '#FFE3F0';
    const FUR2  = '#FFF6E5';
    const PINK  = '#FF9EC4';
    const DEEP  = '#FF7FB2';
    const MINT  = '#5FD3B4';
    const WHITE = '#FFFFFF';

    // 便捷画块：颜色, x, y, 宽, 高
    const r = (c, x, y, w, h) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w === undefined ? 1 : w, h === undefined ? 1 : h);
    };

    /* ---------- 耳朵（尖尖的三角形） ---------- */
    // 左耳
    r(INK, 2, 1);
    r(INK, 1, 2, 3, 1);
    r(INK, 1, 3, 4, 1);
    r(INK, 1, 4, 5, 1);
    // 右耳
    r(INK, 13, 1);
    r(INK, 12, 2, 3, 1);
    r(INK, 11, 3, 4, 1);
    r(INK, 10, 4, 5, 1);

    /* ---------- 头部轮廓 ---------- */
    r(INK, 1, 5, 14, 1);        // 头顶
    r(INK, 1, 6, 1, 7);         // 左壁
    r(INK, 14, 6, 1, 7);        // 右壁

    /* ---------- 脸 ---------- */
    r(FUR, 2, 6, 12, 7);

    /* ---------- 圆润的下巴 ---------- */
    r(INK, 2, 13, 12, 1);
    r(INK, 4, 14, 8, 1);

    /* ---------- 耳朵内侧的粉色 ---------- */
    r(PINK, 2, 3, 2, 1);
    r(PINK, 2, 4, 3, 1);
    r(PINK, 12, 3, 2, 1);
    r(PINK, 11, 4, 3, 1);

    /* ---------- 头顶的小芽 🌱 ---------- */
    r(MINT, 6, 3, 2, 1);
    r(MINT, 8, 3, 2, 1);
    r(INK, 7, 4, 2, 1);

    /* ---------- 眼睛 + 高光 ---------- */
    r(INK, 4, 7, 2, 2);
    r(INK, 10, 7, 2, 2);
    r(WHITE, 4, 7);
    r(WHITE, 10, 7);

    /* ---------- 奶油色嘴套 ---------- */
    r(FUR2, 6, 9, 4, 3);

    /* ---------- 腮红 ---------- */
    r(PINK, 2, 10, 2, 1);
    r(PINK, 12, 10, 2, 1);

    /* ---------- 小鼻子 ---------- */
    r(DEEP, 7, 9, 2, 1);

    /* ---------- ω 型小嘴巴 ---------- */
    r(INK, 6, 10);
    r(INK, 9, 10);
    r(INK, 7, 11, 2, 1);
  }

  /* ---------------------------------------------------
     2. 打字机效果
     --------------------------------------------------- */
  function initTyping() {
    const el = document.getElementById('typed');
    if (!el) return;

    const phrases = [
      '正在加载可爱代码…',
      '擅长把想法变成界面 ✨',
      '也会把界面画成插画 🎨',
      '目前：接单中，欢迎找我玩 💌'
    ];

    if (reduceMotion) { el.textContent = phrases[0]; return; }

    let pi = 0, ci = 0, deleting = false;

    (function tick() {
      const full = phrases[pi];
      ci += deleting ? -1 : 1;
      el.textContent = full.slice(0, ci);

      let delay = deleting ? 45 : 95;
      if (!deleting && ci === full.length) { delay = 1700; deleting = true; }
      else if (deleting && ci === 0) { deleting = false; pi = (pi + 1) % phrases.length; delay = 320; }

      setTimeout(tick, delay);
    })();
  }

  /* ---------------------------------------------------
     3. 导航：滚动阴影 / 滚动高亮 / 移动端菜单
     --------------------------------------------------- */
  function initNav() {
    const nav = document.getElementById('nav');
    const links = Array.from(document.querySelectorAll('.nav-link'));
    const toggle = document.getElementById('navToggle');
    const menu = document.getElementById('navLinks');
    const sections = links
      .map(a => document.querySelector(a.getAttribute('href')))
      .filter(Boolean);

    /* 移动端汉堡菜单 */
    function closeMenu() {
      if (!menu) return;
      menu.classList.remove('is-open');
      toggle.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', '打开菜单');
    }

    if (toggle && menu) {
      toggle.addEventListener('click', () => {
        const open = menu.classList.toggle('is-open');
        toggle.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
      });
      links.forEach(a => a.addEventListener('click', closeMenu));
    }

    /* 滚动时：加阴影 + 高亮当前区块 */
    let ticking = false;
    function onScroll() {
      const y = window.scrollY;

      nav.classList.toggle('is-scrolled', y > 8);

      const line = y + (parseInt(getComputedStyle(document.documentElement)
        .getPropertyValue('--nav-h'), 10) || 72) + 30;

      let current = sections[0];
      sections.forEach(sec => { if (sec.offsetTop <= line) current = sec; });

      links.forEach(a => {
        a.classList.toggle('is-active', a.getAttribute('href') === '#' + current.id);
      });

      document.getElementById('toTop').classList.toggle('is-show', y > 500);

      ticking = false;
    }

    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
    }, { passive: true });

    onScroll();
  }

  /* ---------------------------------------------------
     4. 滚动进场动画
     --------------------------------------------------- */
  function initReveal() {
    const items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      items.forEach(el => el.classList.add('is-visible'));
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.16, rootMargin: '0px 0px -40px 0px' });

    items.forEach(el => io.observe(el));
  }

  /* ---------------------------------------------------
     5. 背景气泡
     --------------------------------------------------- */
  function initBubbles() {
    const wrap = document.getElementById('bgDecor');
    if (!wrap || reduceMotion) return;

    const count = window.innerWidth < 720 ? 9 : 17;

    for (let i = 0; i < count; i++) {
      const b = document.createElement('span');
      b.className = 'bubble';
      const size = 12 + Math.random() * 46;
      b.style.width = size + 'px';
      b.style.height = size + 'px';
      b.style.left = Math.random() * 100 + '%';
      b.style.animationDuration = (12 + Math.random() * 14) + 's';
      b.style.animationDelay = (-Math.random() * 22) + 's';
      b.style.opacity = (0.35 + Math.random() * 0.5).toFixed(2);
      wrap.appendChild(b);
    }
  }

  /* ---------------------------------------------------
     6. 点击头像 → 爱心爆开
     --------------------------------------------------- */
  function initHeartBurst() {
    const frame = document.getElementById('avatarFrame');
    if (!frame) return;

    const icons = ['💖', '💗', '💕', '⭐', '✨', '🌸', '🎀'];

    frame.addEventListener('click', () => {
      if (reduceMotion) return;

      for (let i = 0; i < 10; i++) {
        const h = document.createElement('span');
        h.className = 'heart-pop';
        h.textContent = icons[Math.floor(Math.random() * icons.length)];
        h.style.setProperty('--x', ((Math.random() * 2 - 1) * 130).toFixed(0) + 'px');
        h.style.setProperty('--y', (-40 - Math.random() * 130).toFixed(0) + 'px');
        h.style.setProperty('--r', ((Math.random() * 2 - 1) * 60).toFixed(0) + 'deg');
        h.style.animationDelay = (i * 25) + 'ms';
        h.style.fontSize = (1 + Math.random() * 0.6).toFixed(2) + 'rem';
        frame.appendChild(h);
        setTimeout(() => h.remove(), 1400);
      }
    });
  }

  /* ---------------------------------------------------
     7. 回到顶部
     --------------------------------------------------- */
  function initToTop() {
    const btn = document.getElementById('toTop');
    if (!btn) return;
    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  }

  /* ---------------------------------------------------
     8. 光标小星星（轻量，仅桌面端）
     --------------------------------------------------- */
  function initSparkle() {
    if (reduceMotion || !isFinePointer) return;

    let last = 0;
    const glyphs = ['✦', '✧', '·', '✩'];

    document.addEventListener('mousemove', (e) => {
      const now = performance.now();
      if (now - last < 150) return;   // 控制频率，避免太吵
      last = now;

      const s = document.createElement('span');
      s.className = 'sparkle';
      s.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
      s.style.left = e.clientX + 'px';
      s.style.top = e.clientY + 'px';
      s.style.fontSize = (10 + Math.random() * 8).toFixed(0) + 'px';
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 720);
    }, { passive: true });
  }

  /* ---------------------------------------------------
     9. 空链接不跳转
     --------------------------------------------------- */
  function initDeadLinks() {
    document.querySelectorAll('a[href="#"]').forEach(a => {
      a.addEventListener('click', e => e.preventDefault());
    });
  }

  /* ---------------------------------------------------
     启动
     --------------------------------------------------- */
  function boot() {
    drawAvatar();
    initTyping();
    initNav();
    initReveal();
    initBubbles();
    initHeartBurst();
    initToTop();
    initSparkle();
    initDeadLinks();

    // 尺寸变化时重画头像，保持像素锐利
    let t;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(drawAvatar, 180);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  console.log('%c👾 Hi! 欢迎来看我的源代码～', 'color:#FF7FB2;font-size:14px;font-weight:bold;');
})();
