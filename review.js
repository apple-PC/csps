/* 复习端：5 个板块（精讲与练习 / 方法与技巧 / 算法教学 / 考前注意事项 / IDE 指南）
 * 统一「左栏导航 + 右栏内容」布局；精讲与练习为每题精讲（最详细）。
 * 数据：window.REVIEWS（每题精讲） + window.REVIEW_SECTIONS（通用板块）
 */
(function () {
  'use strict';
  var LS_KEY = 'csp_sim:reviewlist';
  var list = new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]'));
  var curSection = 'jiang';
  var filter = 'all';
  var current = null;
  var query = {};

  var SECTIONS = [
    { id: 'jiang',    label: '精讲与练习',     icon: '📖' },
    { id: 'methods',  label: '方法与技巧',     icon: '🛠️' },
    { id: 'algo',     label: '算法教学',       icon: '📚' },
    { id: 'preexam',  label: '考前注意事项',   icon: '⚠️' },
    { id: 'ide',      label: 'IDE 指南',      icon: '🖥️' }
  ];

  function saveList(){ localStorage.setItem(LS_KEY, JSON.stringify([...list])); }
  function el(tag, cls, html){ var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s){ return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function problems(){ return window.BUILTIN_PROBLEMS || []; }
  function findSec(id){ return SECTIONS.find(function (s) { return s.id === id; }); }

  /* ---------- 顶部：返回 + 标题 + 工具 + 板块标签 ---------- */
  function render(){
    buildTabs();
    var sec = findSec(curSection);
    var title = document.getElementById('revTitle');
    if (title) title.textContent = '复习端 · ' + sec.label;
    var tools = document.getElementById('revTools');
    if (tools){
      if (curSection === 'jiang'){
        tools.innerHTML =
          '<button class="rev-filter' + (filter === 'all' ? ' active' : '') + '" data-f="all">全部题目</button>' +
          '<button class="rev-filter' + (filter === 'list' ? ' active' : '') + '" data-f="list">我的复习清单</button>';
        tools.querySelectorAll('.rev-filter').forEach(function (b){
          b.onclick = function (){ filter = b.dataset.f; render(); };
        });
      } else {
        var sec = (window.REVIEW_SECTIONS || {})[curSection] || { nodes: [] };
        if (sec.nodes && sec.nodes.length > 10){
          tools.innerHTML = '<input class="rev-search" id="revSearch" type="text" placeholder="搜索章节 / 关键词（共 ' + sec.nodes.length + ' 章）" value="' +
            esc(query[curSection] || '').replace(/"/g, '&quot;') + '">';
          var inp = document.getElementById('revSearch');
          if (inp) inp.oninput = function (){ query[curSection] = inp.value; renderSectionList(curSection); };
        } else {
          tools.innerHTML = '';
        }
      }
    }
    if (curSection === 'jiang') renderProblems();
    else renderSections(curSection);
  }

  function buildTabs(){
    var bar = document.getElementById('revTabs');
    if (!bar) return;
    bar.innerHTML = '';
    SECTIONS.forEach(function (s){
      var b = el('button', 'rev-tab' + (s.id === curSection ? ' active' : ''), s.icon + ' ' + s.label);
      b.dataset.id = s.id;
      b.onclick = function (){ curSection = s.id; current = null; render(); };
      bar.appendChild(b);
    });
  }

  /* ---------- 精讲与练习（每题精讲，最详细） ---------- */
  function renderProblems(){
    var box = document.getElementById('revList');
    box.innerHTML = '';
    var probs = problems();
    if (!current && probs.length) current = probs[0].id;
    var shown = 0;
    probs.forEach(function (p){
      var inList = list.has(p.id);
      if (filter === 'list' && !inList) return;
      shown++;
      var item = el('div', 'rev-item' + (current === p.id ? ' active' : ''));
      item.dataset.id = p.id;

      var chk = el('label', 'rev-check');
      var cb = el('input'); cb.type = 'checkbox'; cb.checked = inList;
      cb.addEventListener('change', function (e){ e.stopPropagation(); if (cb.checked) list.add(p.id); else list.delete(p.id); saveList(); });
      cb.addEventListener('click', function (e){ e.stopPropagation(); });
      chk.appendChild(cb);

      var main = el('div', 'rev-item-main');
      main.appendChild(el('div', 'rev-item-title', esc(p.title)));
      var meta = 'TL ' + (p.tl || '-') + ' · ' + (p.tests ? p.tests.length : '?') + ' 测试点' + (inList ? ' · ★已加入' : '');
      main.appendChild(el('div', 'rev-item-meta', meta));

      var open = el('button', 'rev-open', '精讲');
      open.onclick = function (e){ e.stopPropagation(); selectProblem(p.id); };

      item.appendChild(chk); item.appendChild(main); item.appendChild(open);
      item.onclick = function (){ selectProblem(p.id); };
      box.appendChild(item);
    });
    if (!shown) box.appendChild(el('div', 'rev-empty', '清单为空，勾选左侧 ☑ 即可加入「我的复习清单」。'));

    if (current) renderProblem(current);
    else document.getElementById('revContent').innerHTML = '<div class="rev-empty">从左侧选择一道题开始复习。</div>';
  }

  function selectProblem(id){
    current = id;
    renderProblems();
  }

  function renderProblem(id){
    var p = problems().find(function (x){ return x.id === id; });
    var r = (window.REVIEWS || {})[id] || {};
    var c = document.getElementById('revContent');
    var h = '';
    h += '<h1 class="rev-h1">' + (p ? esc(p.title) : esc(id)) + '</h1>';
    h += '<div class="rev-tags">' +
      '<span class="rev-tag">TL ' + (p ? p.tl : '-') + '</span>' +
      '<span class="rev-tag">测试点 ' + (p && p.tests ? p.tests.length : '-') + '</span>' +
      (p && p.range ? '<span class="rev-tag rev-tag-limit">数据范围：' + esc(p.range) + '</span>' : '') +
      '</div>';

    if (r.knowledge && r.knowledge.length){
      h += '<section class="rev-block"><h2 class="rev-h2">📌 知识点</h2><ul class="rev-ul">' +
        r.knowledge.map(function (t){ return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></section>';
    }
    if (r.strategy) h += block('📖 思路精讲', r.strategy);
    if (p && p.body) h += block('📄 题目描述', p.body);
    if (r.code){
      h += '<section class="rev-block"><h2 class="rev-h2">💡 参考代码</h2>' +
        '<div class="rev-codebar">' +
        '<button class="btn btn-sm btn-primary" id="revRun">在编辑器中运行</button>' +
        '<button class="btn btn-sm" id="revCopy">复制代码</button>' +
        '</div>' +
        '<pre class="rev-pre"><code>' + esc(r.code) + '</code></pre></section>';
    }
    if (r.complexity) h += block('⏱ 复杂度分析', r.complexity);
    if (r.pitfalls && r.pitfalls.length){
      h += '<section class="rev-block"><h2 class="rev-h2">⚠️ 易错点</h2><ul class="rev-ul">' +
        r.pitfalls.map(function (t){ return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></section>';
    }
    if (r.walk) h += block('🧪 样例演示', r.walk);
    if (r.practice && r.practice.length){
      h += '<section class="rev-block"><h2 class="rev-h2">✏️ 自测练习</h2>';
      r.practice.forEach(function (it, i){
        h += '<div class="rev-prac">' +
          '<div class="rev-prac-q">' + (i + 1) + '. ' + esc(it.q) + '</div>' +
          '<button class="rev-prac-btn" data-i="' + i + '">显示提示</button>' +
          '<div class="rev-prac-hint hidden" id="pracHint' + i + '">' + esc(it.hint) + '</div>' +
          '</div>';
      });
      h += '</section>';
    }
    c.innerHTML = h;

    var runBtn = document.getElementById('revRun');
    if (runBtn) runBtn.onclick = function (){ runInIDE(r.code); };
    var copyBtn = document.getElementById('revCopy');
    if (copyBtn) copyBtn.onclick = function (){
      navigator.clipboard && navigator.clipboard.writeText(r.code);
      copyBtn.textContent = '已复制'; setTimeout(function (){ copyBtn.textContent = '复制代码'; }, 1200);
    };
    c.querySelectorAll('.rev-prac-btn').forEach(function (b){
      b.onclick = function (){
        var hint = document.getElementById('pracHint' + b.dataset.i);
        if (hint.classList.contains('hidden')){ hint.classList.remove('hidden'); b.textContent = '隐藏提示'; }
        else { hint.classList.add('hidden'); b.textContent = '显示提示'; }
      };
    });
    c.scrollTop = 0;
  }

  /* ---------- 通用板块（方法与技巧 / 算法教学 / 考前 / IDE） ---------- */
  function renderSections(id){
    renderSectionList(id);
    renderSectionContent(id);
  }
  function renderSectionList(id){
    var sec = (window.REVIEW_SECTIONS || {})[id] || { nodes: [] };
    var box = document.getElementById('revList');
    box.innerHTML = '';
    if (!current && sec.nodes.length) current = sec.nodes[0].id;
    var kw = (query[id] || '').trim().toLowerCase();
    var lastGroup = null, shown = 0;
    sec.nodes.forEach(function (nd){
      if (kw){
        var hay = (nd.title + ' ' + (nd.meta || '') + ' ' + (nd.group || '')).toLowerCase();
        if (hay.indexOf(kw) < 0) return;
      }
      shown++;
      if (nd.group && nd.group !== lastGroup){
        box.appendChild(el('div', 'rev-group', esc(nd.group)));
        lastGroup = nd.group;
      }
      var item = el('div', 'rev-item' + (current === nd.id ? ' active' : ''));
      item.dataset.id = nd.id;
      var main = el('div', 'rev-item-main');
      main.appendChild(el('div', 'rev-item-title', esc(nd.title)));
      if (nd.meta) main.appendChild(el('div', 'rev-item-meta', esc(nd.meta)));
      item.appendChild(main);
      item.onclick = function (){ current = nd.id; renderSections(id); };
      box.appendChild(item);
    });
    if (!shown) box.appendChild(el('div', 'rev-empty', '没有匹配的章节，换个关键词试试。'));
  }
  function renderSectionContent(id){
    var sec = (window.REVIEW_SECTIONS || {})[id] || { nodes: [] };
    var c = document.getElementById('revContent');
    if (!current){ c.innerHTML = '<div class="rev-empty">从左侧选择一个主题。</div>'; return; }
    var node = sec.nodes.find(function (n){ return n.id === current; });
    if (!node){ c.innerHTML = ''; return; }
    var h = '';
    if (sec.intro) h += '<div class="rev-intro">' + esc(sec.intro) + '</div>';
    h += '<h1 class="rev-h1">' + esc(node.title) + '</h1>';
    if (node.meta) h += '<div class="rev-tags"><span class="rev-tag">' + esc(node.meta) + '</span></div>';
    node.blocks.forEach(function (b){
      h += '<section class="rev-block"><h2 class="rev-h2">' + esc(b.h) + '</h2>';
      if (b.html) h += (b.html.indexOf('<') === 0 ? b.html : '<p class="rev-p">' + b.html + '</p>');
      if (b.list) h += '<ul class="rev-ul">' + b.list.map(function (t){ return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
      if (b.code) h += '<pre class="rev-pre"><code>' + esc(b.code) + '</code></pre>';
      h += '</section>';
    });
    c.innerHTML = h;
    c.scrollTop = 0;
  }

  /* ---------- 工具 ---------- */
  function block(title, html){
    return '<section class="rev-block"><h2 class="rev-h2">' + title + '</h2>' +
      (html.indexOf('<') === 0 ? html : '<p class="rev-p">' + html + '</p>') + '</section>';
  }
  function runInIDE(code){
    var w = window.open('ide.html', '_blank');
    if (!w){ alert('浏览器拦截了新窗口，请允许弹出窗口后重试'); return; }
    var sent = false;
    function post(){ if (sent) return; sent = true; try { w.postMessage({ type: 'ide:setCode', code: code }, '*'); } catch (e) {} }
    var tries = 0;
    var iv = setInterval(function (){
      tries++;
      if (w.closed){ clearInterval(iv); return; }
      try { w.postMessage({ type: 'ping' }, '*'); post(); } catch (e) {}
      if (tries > 30) clearInterval(iv);
    }, 200);
  }

  /* 复习资料（约 170KB）按需加载：不拖慢首屏，进入复习端时再取 */
  function loadScriptOnce(src){
    return new Promise(function (resolve, reject){
      var sc = document.createElement('script');
      sc.src = src;
      sc.onload = function (){ resolve(); };
      sc.onerror = function (){ reject(new Error('加载失败：' + src)); };
      document.head.appendChild(sc);
    });
  }
  function ensureData(){
    if (window.REVIEW_SECTIONS) return Promise.resolve();
    showLoading('正在加载复习资料…', { percent: 8, detail: 'review-data.js · 方法与技巧 / 考前 / IDE' });
    return loadScriptOnce('review-data.js').then(function (){
      showLoading('正在加载算法章节…', { percent: 55, detail: 'review-algo.js · CSP-J/S 全考纲算法' });
      return loadScriptOnce('review-algo.js');
    }).then(function (){
      showLoading('复习资料就绪', { percent: 100, detail: '共 5 个板块' });
      hideLoading();
    }).catch(function (e){
      hideLoading();
      toast('复习资料加载失败，请刷新重试', 'err');
      throw e;
    });
  }

  function show(){
    ensureData().then(function (){
      var start = document.getElementById('startScreen');
      if (start) start.classList.add('hidden');
      document.getElementById('reviewApp').classList.remove('hidden');
      render();
    }).catch(function (){});
  }

  function init(){
    var btn = document.getElementById('btnEnterReview');
    if (btn) btn.onclick = show;
    var exit = document.getElementById('btnReviewExit');
    if (exit) exit.onclick = function (){
      document.getElementById('reviewApp').classList.add('hidden');
      document.getElementById('startScreen').classList.remove('hidden');
    };
    window.Review = { show: show };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
