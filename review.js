/* 复习端
 * 结构：主页（课程说明 + 板块卡片） → 板块内「左栏目录 + 右栏内容」
 * 数据：window.REVIEWS（每题精讲） + window.REVIEW_SECTIONS（通用板块）
 */
(function () {
  'use strict';
  var LS_KEY = 'csp_sim:reviewlist';
  var LS_SIDE = 'csp_sim:revside';
  var list = new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]'));
  var view = 'home';            // 'home' | 'section'
  var curSection = 'jiang';
  var filter = 'all';
  var current = null;
  var query = {};
  var sideHidden = localStorage.getItem(LS_SIDE) === '1';
  var lastSection = 'jiang';    // 记住上次看的板块，返回主页再进时直接续上

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

  function saveList(){ localStorage.setItem(LS_KEY, JSON.stringify([...list])); }
  function el(tag, cls, html){ var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  var TAG_RE = /<(b|i|em|strong|code|br|span|sub|sup|u|mark|kbd)\b[^>]*>/i;
  function raw(s){ s = String(s == null ? '' : s); return TAG_RE.test(s) ? s : esc(s); }
  function problems(){ return window.BUILTIN_PROBLEMS || []; }
  function findSec(id){ return SECTIONS.find(function (s) { return s.id === id; }); }
  function secData(id){ return (window.REVIEW_SECTIONS || {})[id] || { nodes: [] }; }

  /* ---------- 视图切换 ---------- */
  function render(){
    applySide();
    if (view === 'home') renderHome();
    else renderSection();
  }

  /* ---------- 主页 ---------- */
  function renderHome(){
    var tabs = document.getElementById('revTabs');
    if (tabs){ tabs.classList.add('hidden'); tabs.innerHTML = ''; }
    var body = document.getElementById('revBody');
    if (body) body.classList.add('hidden');
    var home = document.getElementById('revHome');
    if (!home) return;
    home.classList.remove('hidden');
    var tools = document.getElementById('revTools');
    if (tools) tools.innerHTML = '';
    var title = document.getElementById('revTitle');
    if (title) title.textContent = 'CSPS 复习中心';
    // 主页没有侧栏，目录按钮与回主页按钮都隐藏
    ['btnRevSide', 'btnRevHome'].forEach(function (id){
      var b = document.getElementById(id);
      if (b) b.classList.add('hidden');
    });

    var probs = problems();
    var algoN = secData('algo').nodes.length;
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
    var done = list.size;

    var h = '';
    h += '<div class="rh-wrap">';
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

    h += '<div class="rh-metrics">' +
      metric(probs.length || 12, '真题精讲', '#0984e3') +
      metric(totalNodes, '教学章节', '#6c5ce7') +
      metric(totalBlocks, '知识块', '#00a389') +
      metric(kw + ' 万', '讲解字数', '#e17055') +
      '</div>';

    h += '<div class="rh-sec-head"><h2>课程内容</h2>' +
      '<span class="rh-sec-sub">共 ' + SECTIONS.length + ' 个板块 · 建议按顺序走</span></div>';

    h += '<div class="rh-grid">';
    SECTIONS.forEach(function (s, i){
      var n, unit;
      if (s.id === 'jiang'){ n = probs.length; unit = ' 道题'; }
      else { n = secData(s.id).nodes.length; unit = ' 章'; }
      h += '<button class="rh-card" data-id="' + s.id + '" style="--accent:' + s.accent + '">' +
        '<div class="rh-card-top">' +
          '<span class="rh-ico">' + s.icon + '</span>' +
          '<span class="rh-chip">' + esc((i + 1) + '') + '</span>' +
        '</div>' +
        '<div class="rh-card-title">' + esc(s.label) + '</div>' +
        '<div class="rh-card-desc">' + esc(s.desc) + '</div>' +
        '<div class="rh-card-foot"><span class="rh-count">' + n + unit + '</span>' +
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

    if (done) h += '<div class="rh-note">📌 你的复习清单里已有 <b>' + done + '</b> 道题，进入「精讲与练习」可继续。</div>';
    h += '</div>';
    home.innerHTML = h;

    home.querySelectorAll('.rh-card').forEach(function (b){
      b.onclick = function (){ openSection(b.dataset.id); };
    });
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
    return '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">' +
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

  function openSection(id){
    curSection = id;
    lastSection = id;
    current = null;
    view = 'section';
    render();
  }

  /* ---------- 板块视图 ---------- */
  function renderSection(){
    var tabs = document.getElementById('revTabs');
    if (tabs) tabs.classList.remove('hidden');
    var home = document.getElementById('revHome');
    if (home) home.classList.add('hidden');
    var body = document.getElementById('revBody');
    if (body) body.classList.remove('hidden');
    ['btnRevSide', 'btnRevHome'].forEach(function (id){
      var b = document.getElementById(id);
      if (b) b.classList.remove('hidden');
    });

    buildTabs();
    var sec = findSec(curSection);
    var title = document.getElementById('revTitle');
    if (title) title.textContent = '复习中心 / ' + sec.label;
    buildTools();
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
      b.onclick = function (){ openSection(s.id); };
      bar.appendChild(b);
    });
  }

  function buildTools(){
    var tools = document.getElementById('revTools');
    if (!tools) return;
    if (curSection === 'jiang'){
      tools.innerHTML =
        '<button class="rev-filter' + (filter === 'all' ? ' active' : '') + '" data-f="all">全部题目</button>' +
        '<button class="rev-filter' + (filter === 'list' ? ' active' : '') + '" data-f="list">我的复习清单</button>';
      tools.querySelectorAll('.rev-filter').forEach(function (b){
        b.onclick = function (){ filter = b.dataset.f; render(); };
      });
      return;
    }
    var sec = secData(curSection);
    if (sec.nodes && sec.nodes.length > 10){
      tools.innerHTML = '<input class="rev-search" id="revSearch" type="text" placeholder="搜索章节 / 关键词（共 ' + sec.nodes.length + ' 章）" value="' +
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
    var probs = problems();
    var p = probs.find(function (x){ return x.id === id; });
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
    var idx = probs.findIndex(function (x){ return x.id === id; });
    h += navBar(probs, idx, function (i){ return probs[i].title; }, function (i){ selectProblem(probs[i].id); });
    c.innerHTML = h;

    bindProblemExtras(c, r);
    c.scrollTop = 0;
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
    // 让当前项滚进可视区
    var act = box.querySelector('.rev-item.active');
    if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
  }

  function renderSectionContent(id){
    var sec = secData(id);
    var c = document.getElementById('revContent');
    if (!current){ c.innerHTML = '<div class="rev-empty">从左侧选择一个主题。</div>'; return; }
    var idx = sec.nodes.findIndex(function (n){ return n.id === current; });
    var node = sec.nodes[idx];
    if (!node){ c.innerHTML = ''; return; }

    var h = '';
    if (sec.intro && idx === 0) h += '<div class="rev-intro">' + esc(sec.intro) + '</div>';
    h += '<div class="rev-crumb">' + esc(findSec(id).label) + ' · 第 ' + (idx + 1) + ' / ' + sec.nodes.length + ' 章</div>';
    h += '<h1 class="rev-h1">' + esc(node.title) + '</h1>';
    if (node.meta) h += '<div class="rev-tags"><span class="rev-tag">' + esc(node.meta) + '</span></div>';
    h += renderBlocks(node.blocks);
    h += navBar(sec.nodes, idx, function (i){ return sec.nodes[i].title; }, function (i){
      current = sec.nodes[i].id;
      renderSections(id);
    });
    c.innerHTML = h;
    // 上一章 / 下一章
    c.querySelectorAll('.rev-navbtn').forEach(function (b){
      b.onclick = function (){ current = sec.nodes[Number(b.dataset.i)].id; renderSections(id); };
    });
    c.scrollTop = 0;
  }

  /* 正文块渲染：支持 标题 / 段落 / 列表 / 有序列表 / 代码 / 表格 / 提示卡 */
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

  function navBar(arr, idx, titleOf, onGo){
    var h = '<div class="rev-nav">';
    if (idx > 0) h += '<button class="rev-navbtn prev" data-i="' + (idx - 1) + '"><span>← 上一章</span><b>' + esc(titleOf(idx - 1)) + '</b></button>';
    else h += '<div></div>';
    if (idx < arr.length - 1) h += '<button class="rev-navbtn next" data-i="' + (idx + 1) + '"><span>下一章 →</span><b>' + esc(titleOf(idx + 1)) + '</b></button>';
    h += '</div>';
    return h;
  }

  /* ---------- 侧栏折叠 ---------- */
  function applySide(){
    var body = document.getElementById('revBody');
    if (body) body.classList.toggle('side-hidden', sideHidden);
    var ic = document.getElementById('revSideIcon');
    if (ic) ic.textContent = sideHidden ? '›' : '‹';
    var btn = document.getElementById('btnRevSide');
    if (btn) btn.classList.toggle('off', sideHidden);
  }
  function toggleSide(){
    sideHidden = !sideHidden;
    localStorage.setItem(LS_SIDE, sideHidden ? '1' : '0');
    applySide();
  }

  /* ---------- 工具 ---------- */
  function block(title, html){
    return '<section class="rev-block"><h2 class="rev-h2">' + title + '</h2>' +
      '<p class="rev-p">' + raw(html) + '</p></section>';
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

  /* 复习资料按需加载：不拖慢首屏，进入复习端时再取 */
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
      showLoading('正在加载算法章节…', { percent: 45, detail: 'review-algo.js · CSP-J/S 全考纲算法' });
      return loadScriptOnce('review-algo.js');
    }).then(function (){
      showLoading('正在加载深度讲解…', { percent: 75, detail: 'review-algo-deep.js · 推导 / 手算 / 逐行解读' });
      return loadScriptOnce('review-algo-deep.js').catch(function (){});  // 缺文件也不影响主流程
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
    ensureData().then(function (){
      var start = document.getElementById('startScreen');
      if (start) start.classList.add('hidden');
      document.getElementById('reviewApp').classList.remove('hidden');
      view = 'home';
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
    var hm = document.getElementById('btnRevHome');
    if (hm) hm.onclick = function (){ view = 'home'; render(); };
    var sb = document.getElementById('btnRevSide');
    if (sb) sb.onclick = toggleSide;
    document.addEventListener('keydown', function (e){
      if (document.getElementById('reviewApp').classList.contains('hidden')) return;
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === '['){ toggleSide(); }
      if (e.key === 'Escape' && view !== 'home'){ view = 'home'; render(); }
    });
    window.Review = { show: show, openSection: openSection, home: function (){ view = 'home'; render(); } };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
