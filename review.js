/* 复习中心（独立页 study/）
 * 结构：课程主页 → 板块（左栏目录 + 正文 + 右侧本章目录）
 * 数据：window.REVIEWS（精讲） + window.REVIEW_SECTIONS（通用板块，按需加载）
 */
(function () {
  'use strict';

  /* ---------- 资源路径：跟随 review.js 所在目录 ---------- */
  var BASE = (function (){
    try {
      var s = document.currentScript;
      if (s && s.src) return s.src.replace(/[^\/]*$/, '');
    } catch (e) {}
    return window.REVIEW_BASE || '';
  })();

  var LS_DONE = 'csp_sim:done';       // 已完成章节 ["algo:a19", ...]
  var LS_LAST = 'csp_sim:last';       // 上次阅读位置 {sec,id}
  var LS_SIDE = 'csp_sim:revside';
  var LS_FS   = 'csp_sim:revfs';      // m | l | xl
  var LS_GRP  = 'csp_sim:revgrp';     // 折叠的分组名

  function lsGet(k, dft){ try { var v = localStorage.getItem(k); return v == null ? dft : v; } catch (e){ return dft; } }
  function lsSet(k, v){ try { localStorage.setItem(k, v); } catch (e){} }

  var done = new Set();
  try { (JSON.parse(lsGet(LS_DONE, '[]')) || []).forEach(function (k){ done.add(k); }); } catch (e){}

  var collapsed = new Set();
  try { (JSON.parse(lsGet(LS_GRP, '[]')) || []).forEach(function (k){ collapsed.add(k); }); } catch (e){}

  var view = 'home';            // 'home' | 'section'
  var curSection = 'jiang';
  var filter = 'all';
  var current = null;
  var query = {};
  var sideHidden = lsGet(LS_SIDE, '0') === '1';
  var fsLevel = lsGet(LS_FS, 'm');
  var FS_ORDER = ['m', 'l', 'xl'];
  var idxCache = null;
  var searchSel = -1, searchHits = [];

  var SECTIONS = [
    { id: 'jiang',   label: '精讲与练习',   icon: '📖', accent: '#0984e3',
      desc: '12 道复赛真题逐题解剖：题意翻译、思路来源、逐步推导、完整代码、复杂度与易错点，附带样例手算。',
      tag: '最详细' },
    { id: 'methods', label: '方法与技巧',   icon: '🛠️', accent: '#00a389',
      desc: '审题套路、暴力到正解的转化、对拍与卡常、时间分配、调试手法——不涉及具体算法，但决定你几分。',
      tag: '出场必备' },
    { id: 'algo',    label: '算法教学',     icon: '📚', accent: '#6c5ce7',
      desc: '按 CSP-J/S 考纲组织的 51 章算法课，从枚举到网络流，每章都有推导、手算演示和可直接提交的模板。',
      tag: '51 章' },
    { id: 'preexam', label: '考前注意事项', icon: '⚠️', accent: '#e17055',
      desc: '考前一周做什么、考场怎么分配时间、文件与目录怎么建、编译参数与常见 CE/RE 原因。',
      tag: '别丢冤枉分' },
    { id: 'ide',     label: 'IDE 指南',     icon: '🖥️', accent: '#0f9b8e',
      desc: '本模拟器内置编辑器的用法：编译运行、自定义输入、评测面板、快捷键与 VM 能力边界。',
      tag: '5 分钟上手' }
  ];

  /* ---------- 小工具 ---------- */
  function el(tag, cls, html){ var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  var TAG_RE = /<(b|i|em|strong|code|br|span|sub|sup|u|mark|kbd)\b[^>]*>/i;
  function raw(s){ s = String(s == null ? '' : s); return TAG_RE.test(s) ? s : esc(s); }
  function problems(){ return window.BUILTIN_PROBLEMS || []; }
  function findSec(id){ return SECTIONS.find(function (s){ return s.id === id; }); }
  function secData(id){ return (window.REVIEW_SECTIONS || {})[id] || { nodes: [] }; }
  function dkey(sec, id){ return sec + ':' + id; }
  function isDone(sec, id){ return done.has(dkey(sec, id)); }

  function totalOf(id){
    if (id === 'jiang') return problems().length;
    return (secData(id).nodes || []).length;
  }
  function doneOf(id){
    var n = 0;
    if (id === 'jiang') problems().forEach(function (p){ if (isDone('jiang', p.id)) n++; });
    else (secData(id).nodes || []).forEach(function (nd){ if (isDone(id, nd.id)) n++; });
    return n;
  }
  function progressOf(id){
    var t = totalOf(id), d = doneOf(id);
    return { total: t, done: d, pct: t ? Math.round(d / t * 100) : 0 };
  }
  function totalProgress(){
    var t = 0, d = 0;
    SECTIONS.forEach(function (s){ t += totalOf(s.id); d += doneOf(s.id); });
    return { total: t, done: d, pct: t ? Math.round(d / t * 100) : 0 };
  }
  function persistDone(){ lsSet(LS_DONE, JSON.stringify([...done])); }
  function toggleDone(sec, id){
    var k = dkey(sec, id);
    if (done.has(k)) done.delete(k); else done.add(k);
    persistDone();
    return done.has(k);
  }
  function remember(sec, id){ lsSet(LS_LAST, JSON.stringify({ sec: sec, id: id, ts: Date.now() })); }
  function lastPos(){
    try { var v = JSON.parse(lsGet(LS_LAST, 'null')); if (v && findSec(v.sec)) return v; } catch (e){}
    return null;
  }

  /* ---------- 视图 ---------- */
  function render(){
    applySide();
    applyFs();
    updateChrome();
    if (view === 'home') renderHome();
    else renderSection();
  }

  function updateChrome(){
    var title = document.getElementById('revTitle');
    if (title){
      if (view === 'home') title.textContent = '课程首页';
      else {
        var s = findSec(curSection);
        title.textContent = s ? s.label : '复习中心';
      }
    }
    updateProgBadge();
    var toc = document.getElementById('revToc');
    if (toc && view === 'home') toc.classList.add('hidden');
  }

  function updateProgBadge(){
    var p = totalProgress();
    var ring = document.getElementById('stProgRing');
    if (ring){
      var C = 2 * Math.PI * 15;
      ring.setAttribute('stroke-dasharray', C.toFixed(1));
      ring.setAttribute('stroke-dashoffset', (C * (1 - p.pct / 100)).toFixed(1));
    }
    var txt = document.getElementById('stProgTxt');
    if (txt) txt.textContent = p.pct + '%';
    var btn = document.getElementById('stProgBtn');
    if (btn) btn.title = '学习进度 ' + p.done + ' / ' + p.total + '（点击查看明细）';
  }

  /* ---------- 主页 ---------- */
  function renderHome(){
    var tabs = document.getElementById('revTabs');
    if (tabs){ tabs.classList.add('hidden'); tabs.innerHTML = ''; }
    var tools = document.getElementById('revTools');
    if (tools) tools.innerHTML = '';
    var body = document.getElementById('revBody');
    if (body) body.classList.add('hidden');
    var home = document.getElementById('revHome');
    if (!home) return;
    home.classList.remove('hidden');

    var probs = problems();
    var totalNodes = 0, totalBlocks = 0, totalChars = 0;
    for (var k in (window.REVIEW_SECTIONS || {})){
      var s = window.REVIEW_SECTIONS[k];
      totalNodes += s.nodes.length;
      s.nodes.forEach(function (n){
        totalBlocks += n.blocks.length;
        n.blocks.forEach(function (b){
          totalChars += ((b.h || '') + (b.html || '') + (b.code || '') + (b.list ? b.list.join('') : '') +
            (b.table ? JSON.stringify(b.table) : '') + (b.note ? ((b.note.title || '') + (b.note.text || '')) : '')).length;
        });
      });
    }
    var kw = (totalChars / 10000).toFixed(1);
    var overall = totalProgress();
    var C = 2 * Math.PI * 26;

    var h = '<div class="rh-wrap">';
    h += '<div class="rh-hero">' +
      '<div class="rh-logo">' + logoSvg() + '</div>' +
      '<div class="rh-brand">' +
        '<h1 class="rh-title">CSPS <span>复习中心</span></h1>' +
        '<p class="rh-sub">CSP-S 2026 第二轮认证 · 从语法到算法的完整复习路径</p>' +
      '</div>' +
      '<div class="rh-hero-badge">NOI Linux 同款题库</div>' +
      '</div>';

    h += '<p class="rh-desc">这里把复赛要考的东西按「先会做题、再补模板」的顺序重新排了一遍：' +
      '先用真题精讲把套路走通，再用方法与技巧补审题和调试，然后是分章节的算法课，最后过一遍考前细节与 IDE 操作。' +
      '所有参考代码都能一键丢进内置 IDE 编译运行，改一个字符就能看到结果。</p>';

    var lp = lastPos();
    if (lp && lp.id){
      var ls = findSec(lp.sec);
      var lt = '';
      if (lp.sec === 'jiang'){
        var pp = probs.find(function (x){ return x.id === lp.id; });
        lt = pp ? pp.title : lp.id;
      } else {
        var nd = (secData(lp.sec).nodes || []).find(function (x){ return x.id === lp.id; });
        lt = nd ? nd.title : lp.id;
      }
      h += '<button class="rh-continue" id="rhContinue">' +
        '<span class="rh-continue-l">' +
          '<span class="rh-continue-k">继续上次的进度</span>' +
          '<span class="rh-continue-t">' + esc(ls.label) + ' · ' + esc(lt) + '</span>' +
        '</span>' +
        '<span class="rh-continue-go">继续学习 →</span>' +
        '</button>';
    }

    h += '<div class="rh-metrics">' +
      metric(probs.length || 12, '真题精讲', '#0984e3') +
      metric(totalNodes, '教学章节', '#6c5ce7') +
      metric(totalBlocks, '知识块', '#00a389') +
      metric(kw + ' 万', '讲解字数', '#e17055') +
      '</div>';

    h += '<div class="rh-overall">' +
      '<div class="rh-overall-ring">' +
        '<svg width="64" height="64" viewBox="0 0 64 64">' +
          '<circle cx="32" cy="32" r="26" fill="none" stroke="#e8f0fa" stroke-width="7"/>' +
          '<circle cx="32" cy="32" r="26" fill="none" stroke="#0984e3" stroke-width="7" stroke-linecap="round" ' +
            'stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - overall.pct / 100)).toFixed(1) + '"/>' +
        '</svg>' +
        '<b>' + overall.pct + '%</b>' +
      '</div>' +
      '<div class="rh-overall-info">' +
        '<div class="rh-overall-t">总学习进度</div>' +
        '<div class="rh-overall-x">已完成 <b>' + overall.done + '</b> / ' + overall.total + ' 个章节与题目。' +
          (overall.pct === 0 ? '每章末尾有「标记为已学完」，点一下就会记在这里。' : '继续保持这个节奏。') + '</div>' +
      '</div>' +
      (overall.done ? '<button class="rh-overall-act" id="rhClear">清空记录</button>' : '') +
      '</div>';

    h += '<div class="rh-sec-head"><h2>课程内容</h2>' +
      '<span class="rh-sec-sub">共 ' + SECTIONS.length + ' 个板块 · 建议按顺序走</span></div>';

    h += '<div class="rh-grid">';
    SECTIONS.forEach(function (s, i){
      var pg = progressOf(s.id);
      var unit = s.id === 'jiang' ? ' 道题' : ' 章';
      h += '<button class="rh-card" data-id="' + s.id + '" style="--accent:' + s.accent + '">' +
        '<div class="rh-card-top">' +
          '<span class="rh-ico">' + s.icon + '</span>' +
          '<span class="rh-chip">' + (i + 1) + '</span>' +
        '</div>' +
        '<div class="rh-card-title">' + esc(s.label) + '</div>' +
        '<div class="rh-card-desc">' + esc(s.desc) + '</div>' +
        '<div class="rh-card-prog">' +
          '<div class="rcp-bar"><div class="rcp-fill" style="width:' + pg.pct + '%"></div></div>' +
          '<div class="rcp-x">已完成 ' + pg.done + ' / ' + pg.total + unit + '</div>' +
        '</div>' +
        '<div class="rh-card-foot"><span class="rh-count">' + totalOf(s.id) + unit + '</span>' +
          '<span class="rh-go">进入 →</span></div>' +
        '</button>';
    });
    h += '</div>';

    h += '<div class="rh-path">' +
      '<div class="rh-path-h">🎯 三种走法，按你现在的位置选</div>' +
      '<div class="rh-path-grid">' +
        pathCard('离考试还有一个月', '算法教学 → 精讲与练习', '每天 1 章算法 + 1 道题精讲，重点补你最虚的那部分（通常是图论和 DP）。', '#0984e3') +
        pathCard('只剩一周', '方法与技巧 → 考前注意事项', '这时候学新算法性价比极低，把审题、对拍、卡常和时间分配练熟，能多拿 30 分。', '#e17055') +
        pathCard('马上要上机', '考前注意事项 → IDE 指南', '确认文件怎么建、编译怎么看、评测面板怎么用，避免低级失误丢掉整道题。', '#00a389') +
      '</div></div>';

    h += '</div>';
    home.innerHTML = h;

    home.querySelectorAll('.rh-card').forEach(function (b){
      b.onclick = function (){ openSection(b.dataset.id); };
    });
    var cont = document.getElementById('rhContinue');
    if (cont) cont.onclick = function (){ var p = lastPos(); if (p) goTo(p.sec, p.id); };
    var clr = document.getElementById('rhClear');
    if (clr) clr.onclick = function (){
      if (!window.confirm('清空全部学习记录（已学完标记与上次位置）？')) return;
      done.clear(); persistDone();
      try { localStorage.removeItem(LS_LAST); } catch (e){}
      render();
    };
    home.scrollTop = 0;
  }

  function metric(v, label, color){
    return '<div class="rh-metric"><b style="color:' + color + '">' + esc(v) + '</b><span>' + esc(label) + '</span></div>';
  }
  function pathCard(title, route, text, color){
    return '<div class="rh-pathcard" style="--accent:' + color + '">' +
      '<div class="rh-pc-t">' + esc(title) + '</div>' +
      '<div class="rh-pc-r">' + esc(route) + '</div>' +
      '<div class="rh-pc-x">' + esc(text) + '</div></div>';
  }
  function logoSvg(){
    return '<svg viewBox="0 0 64 64" width="60" height="60" aria-hidden="true">' +
      '<defs><linearGradient id="rhg" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="#0984e3"/><stop offset="100%" stop-color="#6fe7dd"/></linearGradient></defs>' +
      '<rect x="2" y="2" width="60" height="60" rx="16" fill="url(#rhg)"/>' +
      '<path d="M18 20h11a5 5 0 0 1 3 1.2A5 5 0 0 1 35 20h11v26H35a4 4 0 0 0-3 1.4 4 4 0 0 0-3-1.4H18z" ' +
      'fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/>' +
      '<path d="M32 21.6v25.8" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>' +
      '<circle cx="45" cy="19" r="6.5" fill="#fff" opacity=".92"/>' +
      '<path d="M45 15.6v6.8M41.6 19h6.8" stroke="#0984e3" stroke-width="2" stroke-linecap="round"/>' +
      '</svg>';
  }

  function openSection(id){ goTo(id, null); }

  function goTo(sec, id){
    if (!findSec(sec)) return;
    curSection = sec;
    current = id || null;
    view = 'section';
    render();
    if (id) remember(sec, id);
  }

  /* ---------- 板块 ---------- */
  function renderSection(){
    var tabs = document.getElementById('revTabs');
    if (tabs) tabs.classList.remove('hidden');
    var home = document.getElementById('revHome');
    if (home) home.classList.add('hidden');
    var body = document.getElementById('revBody');
    if (body) body.classList.remove('hidden');

    buildTabs();
    var sec = findSec(curSection);
    buildTools();
    if (curSection === 'jiang') renderProblems();
    else renderSections(curSection);

    var toc = document.getElementById('revToc');
    if (toc && !current) toc.classList.add('hidden');
  }

  function buildTabs(){
    var bar = document.getElementById('revTabs');
    if (!bar) return;
    bar.innerHTML = '';
    SECTIONS.forEach(function (s){
      var b = el('button', 'rev-tab' + (s.id === curSection ? ' active' : ''), s.icon + ' ' + s.label);
      b.dataset.id = s.id;
      b.onclick = function (){ goTo(s.id, null); };
      bar.appendChild(b);
    });
  }

  function buildTools(){
    var tools = document.getElementById('revTools');
    if (!tools) return;
    if (curSection === 'jiang'){
      tools.innerHTML =
        '<button class="rev-filter' + (filter === 'all' ? ' active' : '') + '" data-f="all">全部题目</button>' +
        '<button class="rev-filter' + (filter === 'list' ? ' active' : '') + '" data-f="list">已学完</button>';
      tools.querySelectorAll('.rev-filter').forEach(function (b){
        b.onclick = function (){ filter = b.dataset.f; render(); };
      });
      return;
    }
    var sec = secData(curSection);
    if (sec.nodes && sec.nodes.length > 10){
      tools.innerHTML = '<input class="rev-search" id="revSearch" type="text" placeholder="筛选章节（共 ' + sec.nodes.length + ' 章）" value="' +
        esc(query[curSection] || '').replace(/"/g, '&quot;') + '">';
      var inp = document.getElementById('revSearch');
      if (inp) inp.oninput = function (){ query[curSection] = inp.value; renderSectionList(curSection); };
    } else {
      tools.innerHTML = '';
    }
  }

  /* ---------- 精讲与练习 ---------- */
  function renderProblems(){
    var box = document.getElementById('revList');
    box.innerHTML = '';
    var probs = problems();
    if (!current && probs.length) current = probs[0].id;
    var shown = 0;
    probs.forEach(function (p){
      var dn = isDone('jiang', p.id);
      if (filter === 'list' && !dn) return;
      shown++;
      var item = el('div', 'rev-item' + (current === p.id ? ' active' : '') + (dn ? ' done' : ''));
      item.dataset.id = p.id;

      var chk = el('label', 'rev-check');
      var cb = el('input'); cb.type = 'checkbox'; cb.checked = dn;
      cb.addEventListener('change', function (e){
        e.stopPropagation();
        toggleDone('jiang', p.id);
        updateProgBadge();
        renderProblems();
      });
      cb.addEventListener('click', function (e){ e.stopPropagation(); });
      chk.appendChild(cb);

      var main = el('div', 'rev-item-main');
      main.appendChild(el('div', 'rev-item-title', esc(p.title)));
      var meta = 'TL ' + (p.tl || '-') + ' · ' + (p.tests ? p.tests.length : '?') + ' 测试点';
      main.appendChild(el('div', 'rev-item-meta', meta));

      item.appendChild(chk); item.appendChild(main);
      item.onclick = function (){ selectProblem(p.id); };
      box.appendChild(item);
    });
    if (!shown) box.appendChild(el('div', 'rev-empty', filter === 'list' ? '还没有标记已学完的题目，勾选左侧 ☑ 即可。' : '暂无题目。'));

    if (current) renderProblem(current);
    else document.getElementById('revContent').innerHTML = '<div class="rev-empty">从左侧选择一道题开始复习。</div>';
  }

  function selectProblem(id){
    current = id;
    remember('jiang', id);
    renderProblems();
  }

  function renderProblem(id){
    var probs = problems();
    var p = probs.find(function (x){ return x.id === id; });
    var r = (window.REVIEWS || {})[id] || {};
    var c = document.getElementById('revContent');
    var h = '';
    var pIdx = probs.findIndex(function (x){ return x.id === id; });
    h += '<div class="rev-crumb">精讲与练习 · 第 ' + (pIdx + 1) + ' / ' + probs.length + ' 题 · 约 ' +
      readMins(JSON.stringify(r).length) + ' 分钟</div>';
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
    var idx = probs.findIndex(function (x){ return x.id === id; });
    h += doneBar('jiang', id, '这道题');
    h += navBar(probs, idx, function (i){ return probs[i].title; }, function (i){ selectProblem(probs[i].id); });
    c.innerHTML = h;

    bindProblemExtras(c, r);
    bindDoneBar(c, 'jiang', id);
    c.scrollTop = 0;
    afterRenderContent('jiang', id);
  }

  function bindProblemExtras(c, r){
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
  }

  /* ---------- 通用板块 ---------- */
  /* 粗略阅读时长：中文约 350 字/分钟，代码按 1/3 计 */
  function readMins(chars){
    var m = Math.round(chars / 350);
    return Math.max(1, m);
  }
  function blocksChars(blocks){
    var n = 0;
    (blocks || []).forEach(function (b){
      if (!b) return;
      n += (b.h || '').length + (b.html || '').length + (b.code || '').length;
      if (b.list) n += b.list.join('').length;
      if (b.table) n += JSON.stringify(b.table).length;
      if (b.note) n += ((b.note.title || '') + (b.note.text || '')).length;
    });
    return n;
  }

  function renderSections(id){
    renderSectionList(id);
    renderSectionContent(id);
  }

  function renderSectionList(id){
    var sec = secData(id);
    var box = document.getElementById('revList');
    box.innerHTML = '';
    if (!current && sec.nodes.length) current = sec.nodes[0].id;
    var kw = (query[id] || '').trim().toLowerCase();
    var lastGroup = null, shown = 0;

    function addGroup(name){
      // 统计该分组的章数
      var n = sec.nodes.filter(function (x){ return (x.group || '') === name; }).length;
      var g = el('button', 'rev-group' + (collapsed.has(name) ? ' collapsed' : ''));
      g.innerHTML = '<span class="rg-caret">▾</span><span>' + esc(name) + '</span><span class="rg-n">' + n + '</span>';
      g.onclick = function (){
        if (collapsed.has(name)) collapsed.delete(name); else collapsed.add(name);
        lsSet(LS_GRP, JSON.stringify([...collapsed]));
        renderSectionList(id);
      };
      box.appendChild(g);
    }
    function isCollapsedGroup(name){ return name && collapsed.has(name); }

    sec.nodes.forEach(function (nd){
      var g = nd.group || '其他';
      if (kw){
        var hay = (nd.title + ' ' + (nd.meta || '') + ' ' + (nd.group || '')).toLowerCase();
        if (hay.indexOf(kw) < 0) return;
      }
      if (nd.group && nd.group !== lastGroup && !kw) addGroup(nd.group);
      lastGroup = nd.group;
      if (!kw && isCollapsedGroup(nd.group)) return;
      shown++;
      var dn = isDone(id, nd.id);
      var item = el('div', 'rev-item' + (current === nd.id ? ' active' : '') + (dn ? ' done' : ''));
      item.dataset.id = nd.id;
      var main = el('div', 'rev-item-main');
      main.appendChild(el('div', 'rev-item-title', esc(nd.title)));
      if (nd.meta) main.appendChild(el('div', 'rev-item-meta', esc(nd.meta)));
      item.appendChild(main);
      item.onclick = function (){
        current = nd.id;
        remember(id, nd.id);
        renderSections(id);
      };
      box.appendChild(item);
    });
    if (!shown) box.appendChild(el('div', 'rev-empty', kw ? '没有匹配的章节，换个关键词试试。' : '这个分组下暂时没有内容。'));
    var act = box.querySelector('.rev-item.active');
    if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
  }

  function renderSectionContent(id){
    var sec = secData(id);
    var c = document.getElementById('revContent');
    if (!current){
      c.innerHTML = '<div class="rev-empty">从左侧选择一个主题。</div>';
      document.getElementById('revToc').classList.add('hidden');
      return;
    }
    var idx = sec.nodes.findIndex(function (n){ return n.id === current; });
    var node = sec.nodes[idx];
    if (!node){ c.innerHTML = ''; return; }

    var h = '';
    if (sec.intro && idx === 0) h += '<div class="rev-intro">' + esc(sec.intro) + '</div>';
    h += '<div class="rev-crumb">' + esc(findSec(id).label) + ' · 第 ' + (idx + 1) + ' / ' + sec.nodes.length + ' 章 · 约 ' +
      readMins(blocksChars(node.blocks)) + ' 分钟</div>';
    h += '<h1 class="rev-h1">' + esc(node.title) + '</h1>';
    if (node.meta) h += '<div class="rev-tags"><span class="rev-tag">' + esc(node.meta) + '</span></div>';
    h += renderBlocks(node.blocks);
    h += doneBar(id, node.id, '这一章');
    h += navBar(sec.nodes, idx, function (i){ return sec.nodes[i].title; }, null);
    c.innerHTML = h;

    c.querySelectorAll('.rev-navbtn').forEach(function (b){
      b.onclick = function (){
        current = sec.nodes[Number(b.dataset.i)].id;
        remember(id, current);
        renderSections(id);
      };
    });
    bindDoneBar(c, id, node.id);
    c.scrollTop = 0;
    afterRenderContent(id, node.id);
  }

  /* 章节目录（TOC）+ 阅读进度 + 记住位置 */
  function afterRenderContent(sec, id){
    buildToc();
    updateReadBar();
    var c = document.getElementById('revContent');
    if (c) c.onscroll = onContentScroll;
    setHash(sec, id);
  }

  function buildToc(){
    var c = document.getElementById('revContent');
    var toc = document.getElementById('revToc');
    if (!c || !toc) return;
    var secs = c.querySelectorAll('.rev-block');
    var items = [];
    secs.forEach(function (s, i){
      var h2 = s.querySelector('.rev-h2');
      if (!h2) return;
      if (!s.id) s.id = 'revb-' + i;
      var t = h2.textContent.replace(/^[\p{Emoji_Presentation}\uFE0F\u200D\s]+/u, '').trim();
      if (!t) return;
      items.push({ id: s.id, t: t });
    });
    if (items.length < 2){
      toc.classList.add('hidden');
      toc.innerHTML = '';
      return;
    }
    toc.classList.remove('hidden');
    var h = '<div class="rev-toc-h">本章目录</div>';
    items.forEach(function (it){ h += '<a href="#" data-t="' + it.id + '">' + esc(it.t) + '</a>'; });
    toc.innerHTML = h;
    toc.querySelectorAll('a').forEach(function (a){
      a.onclick = function (e){
        e.preventDefault();
        var t = document.getElementById(a.dataset.t);
        if (!t) return;
        var top = Math.max(0, t.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop - 14);
        try { c.scrollTo({ top: top, behavior: 'smooth' }); } catch (err){ c.scrollTop = top; }
        // 兜底：后台标签页/旧内核里平滑滚动可能不动
        setTimeout(function (){ if (Math.abs(c.scrollTop - top) > 6) c.scrollTop = top; }, 420);
      };
    });
    spyToc();
  }

  function spyToc(){
    var c = document.getElementById('revContent');
    var toc = document.getElementById('revToc');
    if (!c || !toc || toc.classList.contains('hidden')) return;
    var links = toc.querySelectorAll('a');
    if (!links.length) return;
    var ct = c.getBoundingClientRect().top + 90;
    var best = links[0];
    links.forEach(function (a){
      var t = document.getElementById(a.dataset.t);
      if (!t) return;
      if (t.getBoundingClientRect().top <= ct) best = a;
    });
    links.forEach(function (a){ a.classList.toggle('on', a === best); });
  }

  var scrollRaf = 0;
  function onContentScroll(){
    if (scrollRaf) return;
    scrollRaf = 1;
    var run = function (){
      if (!scrollRaf) return;
      scrollRaf = 0;
      updateReadBar();
      spyToc();
    };
    try { requestAnimationFrame(run); } catch (e){}
    // rAF 在后台标签页/无头环境不触发，setTimeout 兜底
    setTimeout(run, 60);
  }

  function updateReadBar(){
    var c = document.getElementById('revContent');
    var bar = document.getElementById('stReadBar');
    if (!c || !bar) return;
    if (view === 'home'){ bar.style.width = '0%'; return; }
    var max = c.scrollHeight - c.clientHeight;
    var p = max > 8 ? Math.min(100, Math.max(0, c.scrollTop / max * 100)) : 100;
    bar.style.width = p.toFixed(1) + '%';
  }

  /* 正文块 */
  function renderBlocks(blocks){
    var h = '';
    blocks.forEach(function (b){
      if (!b) return;
      h += '<section class="rev-block">';
      if (b.h) h += '<h2 class="rev-h2">' + esc(b.h) + '</h2>';
      if (b.note) h += noteHtml(b.note);
      if (b.html) h += '<p class="rev-p">' + raw(b.html) + '</p>';
      if (b.list){
        var tag = b.ordered ? 'ol' : 'ul';
        h += '<' + tag + ' class="rev-ul' + (b.ordered ? ' rev-ol' : '') + '">' +
          b.list.map(function (t){ return '<li>' + raw(t) + '</li>'; }).join('') + '</' + tag + '>';
      }
      if (b.table) h += tableHtml(b.table);
      if (b.code) h += '<pre class="rev-pre"><code>' + esc(b.code) + '</code></pre>';
      h += '</section>';
    });
    return h;
  }

  function noteHtml(n){
    var map = { tip: ['💡', '提示'], warn: ['⚠️', '注意'], key: ['🔑', '要点'], pit: ['🕳️', '坑'], why: ['🧭', '为什么'] };
    var m = map[n.type] || map.tip;
    return '<div class="rev-note rev-note-' + (n.type || 'tip') + '">' +
      '<div class="rev-note-h">' + m[0] + ' ' + esc(n.title || m[1]) + '</div>' +
      '<div class="rev-note-b">' + raw(n.text || '') + '</div></div>';
  }

  function tableHtml(t){
    var h = '<div class="rev-tablewrap"><table class="rev-table">';
    if (t.head && t.head.length){
      h += '<thead><tr>' + t.head.map(function (c){ return '<th>' + raw(c) + '</th>'; }).join('') + '</tr></thead>';
    }
    h += '<tbody>' + (t.rows || []).map(function (r){
      return '<tr>' + r.map(function (c){ return '<td>' + raw(c) + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>';
    if (t.caption) h += '<div class="rev-tcaption">' + esc(t.caption) + '</div>';
    return h;
  }

  function doneBar(sec, id, what){
    var on = isDone(sec, id);
    return '<div class="rev-donebar">' +
      '<button class="btn-done' + (on ? ' on' : '') + '" data-sec="' + sec + '" data-id="' + id + '">' +
      (on ? '✓ 已学完' : '标记' + what + '为已学完') + '</button>' +
      '<span class="rev-donebar-txt">' + (on ? '已记入学习进度，再点一次可取消。' : '标记后会显示在主页进度里，方便知道自己走到哪了。') + '</span>' +
      '</div>';
  }

  function bindDoneBar(c, sec, id){
    var btn = c.querySelector('.rev-donebar .btn-done');
    if (!btn) return;
    btn.onclick = function (){
      var on = toggleDone(sec, id);
      btn.classList.toggle('on', on);
      btn.textContent = on ? '✓ 已学完' : '标记为已学完';
      var txt = c.querySelector('.rev-donebar-txt');
      if (txt) txt.textContent = on ? '已记入学习进度，再点一次可取消。' : '标记后会显示在主页进度里，方便知道自己走到哪了。';
      updateProgBadge();
      // 左栏同步更新
      var item = document.querySelector('#revList .rev-item[data-id="' + id + '"]');
      if (item) item.classList.toggle('done', on);
    };
  }

  function navBar(arr, idx, titleOf, onGo){
    var h = '<div class="rev-nav">';
    if (idx > 0) h += '<button class="rev-navbtn prev" data-i="' + (idx - 1) + '"><span>← 上一章</span><b>' + esc(titleOf(idx - 1)) + '</b></button>';
    else h += '<div></div>';
    if (idx < arr.length - 1) h += '<button class="rev-navbtn next" data-i="' + (idx + 1) + '"><span>下一章 →</span><b>' + esc(titleOf(idx + 1)) + '</b></button>';
    h += '</div>';
    return h;
  }

  /* ---------- 侧栏 / 抽屉 ---------- */
  function applySide(){
    var body = document.getElementById('revBody');
    if (body) body.classList.toggle('side-hidden', sideHidden);
    var ic = document.getElementById('revSideIcon');
    if (ic) ic.textContent = sideHidden ? '›' : '‹';
    var btn = document.getElementById('btnRevSide');
    if (btn) btn.classList.toggle('off', sideHidden);
  }
  function toggleSide(){
    var body = document.getElementById('revBody');
    if (window.innerWidth <= 980 && body){
      var open = body.classList.toggle('drawer-open');
      var mask = document.getElementById('stMask');
      if (mask) mask.classList.toggle('hidden', !open);
      return;
    }
    sideHidden = !sideHidden;
    lsSet(LS_SIDE, sideHidden ? '1' : '0');
    applySide();
  }
  function closeDrawer(){
    var body = document.getElementById('revBody');
    if (body) body.classList.remove('drawer-open');
    var mask = document.getElementById('stMask');
    if (mask) mask.classList.add('hidden');
  }

  /* ---------- 字号 ---------- */
  function applyFs(){
    document.body.setAttribute('data-fs', fsLevel);
  }
  function changeFs(dir){
    var i = FS_ORDER.indexOf(fsLevel);
    if (i < 0) i = 0;
    i = Math.max(0, Math.min(FS_ORDER.length - 1, i + dir));
    fsLevel = FS_ORDER[i];
    lsSet(LS_FS, fsLevel);
    applyFs();
  }

  /* ---------- URL hash ---------- */
  function setHash(sec, id){
    var h = '#/' + sec + (id ? '/' + id : '');
    if (view !== 'section') h = '';
    if (location.hash === h || (!h && !location.hash)) return;
    try { history.replaceState(null, '', location.pathname + location.search + h); }
    catch (e){ location.hash = h; }
  }
  function parseHash(){
    var h = String(location.hash || '').replace(/^#\/?/, '');
    if (!h) return null;
    var parts = h.split('/');
    var sec = parts[0], id = parts[1] ? decodeURIComponent(parts[1]) : null;
    if (!findSec(sec)) return null;
    return { sec: sec, id: id };
  }

  /* ---------- 全站搜索 ---------- */
  function plain(s){ return String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }

  function buildIndex(){
    if (idxCache) return idxCache;
    var arr = [];
    problems().forEach(function (p){
      var r = (window.REVIEWS || {})[p.id] || {};
      var txt = [plain(p.body), plain(r.strategy), (r.knowledge || []).join(' '), (r.pitfalls || []).join(' '),
        plain(r.complexity), plain(r.walk)].join(' ');
      arr.push({ sec: 'jiang', id: p.id, title: p.title, text: txt });
    });
    for (var k in (window.REVIEW_SECTIONS || {})){
      if (k === 'jiang') continue;
      (window.REVIEW_SECTIONS[k].nodes || []).forEach(function (n){
        var txt = (n.meta || '') + ' ';
        (n.blocks || []).forEach(function (b){
          if (!b) return;
          txt += (b.h || '') + ' ' + plain(b.html) + ' ';
          if (b.list) txt += b.list.map(plain).join(' ') + ' ';
          if (b.code) txt += b.code + ' ';
          if (b.table && b.table.rows) b.table.rows.forEach(function (r){ txt += r.map(plain).join(' ') + ' '; });
          if (b.note) txt += (b.note.title || '') + ' ' + plain(b.note.text) + ' ';
        });
        arr.push({ sec: k, id: n.id, title: n.title, text: txt });
      });
    }
    idxCache = arr;
    return arr;
  }

  function hitSnippet(text, kw){
    var i = text.toLowerCase().indexOf(kw.toLowerCase());
    if (i < 0) return '';
    var from = Math.max(0, i - 18), to = Math.min(text.length, i + kw.length + 34);
    var s = text.slice(from, to).replace(/\s+/g, ' ');
    return (from > 0 ? '…' : '') + s + (to < text.length ? '…' : '');
  }

  function markKw(text, kw){
    var e = esc(text);
    if (!kw) return e;
    var ek = esc(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try { return e.replace(new RegExp('(' + ek + ')', 'ig'), '<mark>$1</mark>'); } catch (err){ return e; }
  }

  function runSearch(q){
    var pop = document.getElementById('stSearchPop');
    if (!pop) return;
    q = String(q || '').trim();
    if (!q){
      searchHits = [];
      pop.classList.add('hidden');
      return;
    }
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    var arr = buildIndex();
    var hits = [];
    arr.forEach(function (it){
      var hay = (it.title + ' ' + it.text).toLowerCase();
      var ok = terms.every(function (t){ return hay.indexOf(t) >= 0; });
      if (!ok) return;
      var score = it.title.toLowerCase().indexOf(terms[0]) >= 0 ? 100 : 0;
      if (it.title.toLowerCase().indexOf(q.toLowerCase()) >= 0) score += 50;
      hits.push({ it: it, score: score });
    });
    hits.sort(function (a, b){ return b.score - a.score; });
    searchHits = hits.slice(0, 12);
    searchSel = searchHits.length ? 0 : -1;

    if (!searchHits.length){
      pop.innerHTML = '<div class="st-popempty">没有找到「' + esc(q) + '」，试试「最短路」「二分」「背包」</div>';
      pop.classList.remove('hidden');
      return;
    }
    var h = '<div class="st-pop-h">找到 ' + hits.length + ' 个结果 · ↑↓ 选择 · Enter 打开</div>';
    searchHits.forEach(function (x, i){
      var secLabel = (findSec(x.it.sec) || {}).label || x.it.sec;
      var snip = hitSnippet(x.it.text, terms[0]);
      h += '<button class="st-hit' + (i === 0 ? ' sel' : '') + '" data-i="' + i + '">' +
        '<span class="st-hit-t"><span class="st-hit-sec">' + esc(secLabel) + '</span>' + markKw(x.it.title, terms[0]) + '</span>' +
        (snip ? '<span class="st-hit-x">' + markKw(snip, terms[0]) + '</span>' : '') +
        '</button>';
    });
    pop.innerHTML = h;
    pop.classList.remove('hidden');
    pop.querySelectorAll('.st-hit').forEach(function (b){
      b.onmousedown = function (e){ e.preventDefault(); openHit(Number(b.dataset.i)); };
      b.onmouseenter = function (){
        searchSel = Number(b.dataset.i);
        pop.querySelectorAll('.st-hit').forEach(function (x, j){ x.classList.toggle('sel', j === searchSel); });
      };
    });
  }

  function openHit(i){
    var hit = searchHits[i];
    if (!hit) return;
    closeSearch();
    goTo(hit.it.sec, hit.it.id);
  }

  function closeSearch(){
    var pop = document.getElementById('stSearchPop');
    if (pop) pop.classList.add('hidden');
    var input = document.getElementById('stSearch');
    if (input) input.blur();
  }

  function moveSel(d){
    var pop = document.getElementById('stSearchPop');
    if (!pop || pop.classList.contains('hidden') || !searchHits.length) return;
    searchSel = (searchSel + d + searchHits.length) % searchHits.length;
    pop.querySelectorAll('.st-hit').forEach(function (x, j){
      x.classList.toggle('sel', j === searchSel);
      if (j === searchSel && x.scrollIntoView) x.scrollIntoView({ block: 'nearest' });
    });
  }

  /* ---------- 进度明细弹层 ---------- */
  function toggleProgPop(){
    var old = document.getElementById('stProgPop');
    if (old){ old.remove(); return; }
    var pop = el('div', 'st-progpop');
    pop.id = 'stProgPop';
    var h = '<h4>学习进度 · ' + totalProgress().done + ' / ' + totalProgress().total + '</h4>';
    SECTIONS.forEach(function (s){
      var p = progressOf(s.id);
      h += '<div class="sp-row"><span class="sp-name">' + esc(s.label) + '</span>' +
        '<span class="sp-bar"><i class="sp-fill" style="width:' + p.pct + '%;background:' + s.accent + ';display:block;height:100%"></i></span>' +
        '<span class="sp-n">' + p.done + '/' + p.total + '</span></div>';
    });
    pop.innerHTML = h;
    document.getElementById('reviewApp').appendChild(pop);
    setTimeout(function (){
      document.addEventListener('mousedown', function close(e){
        if (!pop.contains(e.target) && e.target.id !== 'stProgBtn' && !e.target.closest('#stProgBtn')){
          pop.remove();
          document.removeEventListener('mousedown', close);
        }
      });
    }, 0);
  }

  /* ---------- 工具 ---------- */
  function block(title, html){
    return '<section class="rev-block"><h2 class="rev-h2">' + title + '</h2>' +
      '<p class="rev-p">' + raw(html) + '</p></section>';
  }
  function runInIDE(code){
    var w = window.open(BASE + 'ide.html', '_blank');
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

  /* 复习资料按需加载 */
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
    return loadScriptOnce(BASE + 'review-data.js').then(function (){
      showLoading('正在加载算法章节…', { percent: 45, detail: 'review-algo.js · CSP-J/S 全考纲算法' });
      return loadScriptOnce(BASE + 'review-algo.js');
    }).then(function (){
      showLoading('正在加载深度讲解…', { percent: 75, detail: 'review-algo-deep.js · 推导 / 手算 / 逐行解读' });
      return loadScriptOnce(BASE + 'review-algo-deep.js').catch(function (){});
    }).then(function (){
      showLoading('复习资料就绪', { percent: 100, detail: '共 ' + SECTIONS.length + ' 个板块' });
      hideLoading();
    }).catch(function (e){
      hideLoading();
      toast('复习资料加载失败，请刷新重试', 'err');
      throw e;
    });
  }

  function show(){
    return ensureData().then(function (){
      idxCache = null;
      var start = document.getElementById('startScreen');
      if (start) start.classList.add('hidden');
      var app = document.getElementById('reviewApp');
      if (app) app.classList.remove('hidden');
      var hp = parseHash();
      if (hp && hp.id){
        var nodes = secData(hp.sec).nodes || [];
        if (nodes.some(function (n){ return n.id === hp.id; })){ goTo(hp.sec, hp.id); return; }
      }
      if (hp){ goTo(hp.sec, null); return; }
      view = 'home';
      render();
    }).catch(function (){});
  }

  function init(){
    applyFs();

    var btn = document.getElementById('btnEnterReview');
    if (btn) btn.onclick = show;
    var exit = document.getElementById('btnReviewExit');
    if (exit) exit.onclick = function (){
      var app = document.getElementById('reviewApp');
      if (app) app.classList.add('hidden');
      var start = document.getElementById('startScreen');
      if (start) start.classList.remove('hidden');
    };
    var hm = document.getElementById('btnRevHome');
    if (hm) hm.onclick = function (){
      view = 'home';
      setHash('', '');
      closeSearch();
      render();
    };
    var sb = document.getElementById('btnRevSide');
    if (sb) sb.onclick = toggleSide;
    var mask = document.getElementById('stMask');
    if (mask) mask.onclick = closeDrawer;

    var fsUp = document.getElementById('btnFsUp');
    if (fsUp) fsUp.onclick = function (){ changeFs(1); };
    var fsDown = document.getElementById('btnFsDown');
    if (fsDown) fsDown.onclick = function (){ changeFs(-1); };
    var pb = document.getElementById('stProgBtn');
    if (pb) pb.onclick = toggleProgPop;

    var input = document.getElementById('stSearch');
    if (input){
      var timer = 0;
      input.addEventListener('input', function (){
        clearTimeout(timer);
        var v = input.value;
        timer = setTimeout(function (){ runSearch(v); }, 110);
      });
      input.addEventListener('keydown', function (e){
        if (e.key === 'ArrowDown'){ e.preventDefault(); moveSel(1); }
        else if (e.key === 'ArrowUp'){ e.preventDefault(); moveSel(-1); }
        else if (e.key === 'Enter'){
          e.preventDefault();
          if (searchSel >= 0) openHit(searchSel);
        } else if (e.key === 'Escape'){ closeSearch(); }
      });
    }
    document.addEventListener('mousedown', function (e){
      var pop = document.getElementById('stSearchPop');
      var box = document.querySelector('.st-search');
      if (pop && !pop.classList.contains('hidden') && box && !box.contains(e.target)) pop.classList.add('hidden');
    });

    document.addEventListener('keydown', function (e){
      var app = document.getElementById('reviewApp');
      if (!app || app.classList.contains('hidden')) return;
      var tag = (e.target && e.target.tagName) || '';
      var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === '/' && !typing){
        var si = document.getElementById('stSearch');
        if (si){ e.preventDefault(); si.focus(); si.select(); }
        return;
      }
      if (typing) return;

      if (e.key === '['){ toggleSide(); }
      else if (e.key === 'Escape'){
        closeSearch();
        closeDrawer();
        if (view !== 'home'){ view = 'home'; setHash('', ''); render(); }
      }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft'){
        if (view !== 'section') return;
        var nodes = curSection === 'jiang' ? problems() : (secData(curSection).nodes || []);
        if (!nodes.length) return;
        var i = nodes.findIndex(function (n){ return n.id === current; });
        if (i < 0) return;
        var j = e.key === 'ArrowRight' ? i + 1 : i - 1;
        if (j < 0 || j >= nodes.length) return;
        e.preventDefault();
        current = nodes[j].id;
        if (curSection === 'jiang'){ remember('jiang', current); renderProblems(); }
        else { remember(curSection, current); renderSections(curSection); }
      }
    });

    window.addEventListener('resize', function (){ if (window.innerWidth > 980) closeDrawer(); });
    window.addEventListener('hashchange', function (){
      var hp = parseHash();
      if (!hp){ if (view !== 'home'){ view = 'home'; render(); } return; }
      if (hp.sec !== curSection || hp.id !== current){ view = 'section'; curSection = hp.sec; current = hp.id || current; render(); }
    });

    window.Review = {
      show: show,
      openSection: openSection,
      goTo: goTo,
      home: function (){ view = 'home'; setHash('', ''); render(); },
      stats: totalProgress
    };

    // 独立页：打开即进入复习中心（默认停在主页）
    if (document.body.classList.contains('study-body')) show();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
