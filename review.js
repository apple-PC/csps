/* 复习端：左侧题目清单（可勾选复习 / 可筛选）+ 右侧精讲面板
 * 数据来源：window.BUILTIN_PROBLEMS（题面/基本信息）、window.REVIEWS（精讲）
 */
(function () {
  'use strict';
  var LS_KEY = 'csp_sim:reviewlist';
  var list = new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]'));
  var filter = 'all';
  var current = null;

  function saveList() { localStorage.setItem(LS_KEY, JSON.stringify([...list])); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function problems() { return window.BUILTIN_PROBLEMS || []; }

  function buildList() {
    var box = document.getElementById('revList');
    box.innerHTML = '';
    var probs = problems();
    var shown = 0;
    probs.forEach(function (p) {
      var inList = list.has(p.id);
      if (filter === 'list' && !inList) return;
      shown++;
      var item = el('div', 'rev-item' + (current === p.id ? ' active' : ''));
      item.dataset.id = p.id;

      var chk = el('label', 'rev-check');
      var cb = el('input'); cb.type = 'checkbox'; cb.checked = inList;
      cb.addEventListener('change', function (e) {
        e.stopPropagation();
        if (cb.checked) list.add(p.id); else list.delete(p.id);
        saveList();
      });
      chk.appendChild(cb);

      var main = el('div', 'rev-item-main');
      main.appendChild(el('div', 'rev-item-title', p.title));
      main.appendChild(el('div', 'rev-item-meta', 'TL ' + p.tl + ' · ' + (p.tests ? p.tests.length : '?') + ' 测试点' + (inList ? ' · ★已加入' : '')));

      var open = el('button', 'rev-open', '精讲');
      open.addEventListener('click', function (e) { e.stopPropagation(); select(p.id); });

      item.appendChild(chk); item.appendChild(main); item.appendChild(open);
      item.addEventListener('click', function () { select(p.id); });
      box.appendChild(item);
    });
    if (!shown) box.appendChild(el('div', 'rev-empty', '清单为空，勾选左侧 ☑ 即可加入「我的复习清单」。'));
  }

  function select(id) {
    current = id;
    buildList();
    var p = problems().find(function (x) { return x.id === id; });
    var r = (window.REVIEWS || {})[id] || {};
    var c = document.getElementById('revContent');

    var sec = '';
    sec += '<h1 class="rev-h1">' + (p ? p.title : id) + '</h1>';
    sec += '<div class="rev-tags">' +
      '<span class="rev-tag">TL ' + (p ? p.tl : '-') + '</span>' +
      '<span class="rev-tag">测试点 ' + (p && p.tests ? p.tests.length : '-') + '</span>' +
      (p && p.range ? '<span class="rev-tag rev-tag-limit">数据范围：' + p.range + '</span>' : '') +
      '</div>';

    if (r.strategy) sec += block('📌 思路精讲', r.strategy);
    if (p && p.body) sec += block('📄 题目描述', p.body);

    if (r.code) {
      sec += '<section class="rev-block"><h2 class="rev-h2">💡 参考代码</h2>' +
        '<div class="rev-codebar">' +
        '<button class="btn btn-sm btn-primary" id="revRun">在编辑器中运行</button>' +
        '<button class="btn btn-sm" id="revCopy">复制代码</button>' +
        '</div>' +
        '<pre class="rev-pre"><code>' + esc(r.code) + '</code></pre></section>';
    }
    if (r.complexity) sec += block('⏱ 复杂度分析', r.complexity);
    if (r.pitfalls && r.pitfalls.length) {
      var li = r.pitfalls.map(function (t) { return '<li>' + t + '</li>'; }).join('');
      sec += '<section class="rev-block"><h2 class="rev-h2">⚠️ 易错点</h2><ul class="rev-ul">' + li + '</ul></section>';
    }
    if (r.walk) sec += block('🧪 样例演示', r.walk);

    c.innerHTML = sec;

    var runBtn = document.getElementById('revRun');
    if (runBtn) runBtn.addEventListener('click', function () { runInIDE(r.code); });
    var copyBtn = document.getElementById('revCopy');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      navigator.clipboard && navigator.clipboard.writeText(r.code);
      copyBtn.textContent = '已复制';
      setTimeout(function () { copyBtn.textContent = '复制代码'; }, 1200);
    });
    c.scrollTop = 0;
  }

  function block(title, html) {
    return '<section class="rev-block"><h2 class="rev-h2">' + title + '</h2>' + (html.indexOf('<') === 0 ? html : '<p class="rev-p">' + html + '</p>') + '</section>';
  }
  function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function runInIDE(code) {
    var w = window.open('ide.html', '_blank');
    if (!w) { alert('浏览器拦截了新窗口，请允许弹出窗口后重试'); return; }
    var sent = false;
    function post() {
      if (sent) return; sent = true;
      try { w.postMessage({ type: 'ide:setCode', code: code }, '*'); } catch (e) {}
    }
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (w.closed) { clearInterval(iv); return; }
      try { w.postMessage({ type: 'ping' }, '*'); post(); } catch (e) {}
      if (tries > 30) clearInterval(iv);
    }, 200);
  }

  function show() {
    var start = document.getElementById('startScreen');
    if (start) start.classList.add('hidden');
    document.getElementById('reviewApp').classList.remove('hidden');
    if (!current && problems().length) current = problems()[0].id;
    buildList();
    if (current) select(current);
  }

  function init() {
    var btn = document.getElementById('btnEnterReview');
    if (btn) btn.addEventListener('click', show);
    var exit = document.getElementById('btnReviewExit');
    if (exit) exit.addEventListener('click', function () {
      document.getElementById('reviewApp').classList.add('hidden');
      document.getElementById('startScreen').classList.remove('hidden');
    });
    document.querySelectorAll('.rev-filter').forEach(function (b) {
      b.addEventListener('click', function () {
        filter = b.dataset.f;
        document.querySelectorAll('.rev-filter').forEach(function (x) { x.classList.toggle('active', x === b); });
        buildList();
      });
    });
    window.Review = { show: show };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
