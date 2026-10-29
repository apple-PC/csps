/* 管理员端 */
'use strict';

const Admin = (() => {
  const app = $('#adminApp');

  /* ---------- 内置题库 ---------- */
  function builtinDefaults(){
    return (window.BUILTIN_PROBLEMS || []).map(p => ({
      id: p.id, title: p.title, source: 'builtin', builtin: true, tl: p.tl, enabled: true,
      statement: { type: 'html', data: p.statement },
      tests: p.tests,
    }));
  }
  function getProblems(){
    let saved = Store.getProblems();
    if (!saved){ saved = builtinDefaults(); Store.saveProblems(saved); }
    return Store.resolveProblems(saved);
  }

  /* ---------- 视图切换 ---------- */
  function show(){
    app.classList.remove('hidden');
    $('#startScreen').classList.add('hidden');
    // 初始化默认配置并立即落盘：保证学生端任何时候都能读到考试数据
    Store.saveSettings(Store.getSettings());
    getProblems();
    switchView('settings');
    if (!show._bound){ bindSettings(); show._bound = true; }
    else bindSettings._refresh && bindSettings._refresh();
    renderFolderStatus();
    refreshFolderRestore();
  }
  function hide(){
    app.classList.add('hidden');
    $('#startScreen').classList.remove('hidden');
    if (Admin._timer){ clearInterval(Admin._timer); Admin._timer = null; }
  }
  function switchView(name){
    $$('.adm-navbtn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    $$('.adm-view').forEach(v => v.classList.toggle('hidden', v.id !== 'view-' + name));
    if (name === 'problems') renderProblems();
    if (name === 'control'){ renderControl(); startCtrlTimer(); }
    else if (Admin._timer){ clearInterval(Admin._timer); Admin._timer = null; }
    if (name === 'subs') renderSubs();
  }
  $$('.adm-navbtn').forEach(b => b.onclick = () => switchView(b.dataset.view));
  $('#btnAdminExit').onclick = hide;

  /* ---------- 考试设置（实时保存） ---------- */
  function bindSettings(){
    const fill = () => {
      const s = Store.getSettings();
      $('#setExamName').value = s.examName;
      $('#setDuration').value = s.durationMin;
      $('#setStartMode').value = s.startMode;
      $('#setScheduledAt').value = s.scheduledAt || '';
      $('#rowScheduled').classList.toggle('hidden', s.startMode !== 'scheduled');
      $('#setAllowJudge').checked = !!s.allowJudge;
      $('#setAllowCopy').checked = !!s.allowCopy;
      $('#setWatermark').checked = !!s.watermark;
      $('#setNotice').value = s.notice || '';
    };
    bindSettings._refresh = fill;
    fill();

    const collect = () => {
      const st = {
        examName: $('#setExamName').value.trim() || 'CSP-S 复赛模拟考试',
        durationMin: Math.max(10, Math.min(600, Number($('#setDuration').value) || 230)),
        startMode: $('#setStartMode').value,
        scheduledAt: $('#setScheduledAt').value,
        allowJudge: $('#setAllowJudge').checked,
        allowCopy: $('#setAllowCopy').checked,
        watermark: $('#setWatermark').checked,
        notice: $('#setNotice').value,
      };
      Store.saveSettings(st);
      const ind = $('#saveIndicator');
      ind.textContent = '● 已实时保存 · ' + fmtTime(Date.now());
      if (Store.fs.granted) ind.textContent += '（文件夹 + 浏览器）';
    };
    ['setExamName','setDuration','setStartMode','setScheduledAt','setAllowJudge','setAllowCopy','setWatermark','setNotice']
      .forEach(id => {
        const n = $('#' + id);
        n.addEventListener('input', collect);
        n.addEventListener('change', collect);
      });
    $('#setStartMode').addEventListener('change', () => {
      $('#rowScheduled').classList.toggle('hidden', $('#setStartMode').value !== 'scheduled');
    });

    // 仓库发布 / 拉取
    const token = Store.getGhToken ? Store.getGhToken() : (localStorage.getItem('csp_sim:ghtoken') || '');
    if (token) $('#setGhToken').value = token;
    $('#btnPublish').onclick = publishToRepo;
    $('#btnPull').onclick = pullFromRepo;
  }

  function setPublishStatus(msg, ok){
    const el = $('#publishStatus');
    if (el) el.textContent = msg;
  }
  function b64encodeUnicode(str){
    return btoa(unescape(encodeURIComponent(str)));
  }
  async function publishToRepo(){
    const token = $('#setGhToken').value.trim() || (localStorage.getItem('csp_sim:ghtoken') || '');
    if (!token){ setPublishStatus('请先填写 GitHub Token'); return; }
    localStorage.setItem('csp_sim:ghtoken', token);
    const data = { settings: Store.getSettings(), problems: Store.getProblems(), publishedAt: new Date().toISOString() };
    const content = b64encodeUnicode(JSON.stringify(data, null, 2));
    const R = Store.REMOTE;
    const api = `https://api.github.com/repos/${R.repo}/contents/${R.path}`;
    const headers = { Authorization: 'token ' + token, Accept: 'application/vnd.github+json' };
    setPublishStatus('正在发布…');
    try {
      const metaRes = await fetch(api + '?ref=' + R.branch, { headers });
      const meta = metaRes.ok ? await metaRes.json() : null;
      const payload = { message: '更新考试数据（管理员发布）', content, branch: R.branch };
      if (meta && meta.sha) payload.sha = meta.sha;
      const res = await fetch(api, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify(payload) });
      const j = await res.json();
      if (res.ok && j.content) setPublishStatus('✓ 已发布到仓库（' + (j.commit && j.commit.html_url ? '提交已创建' : '成功') + '）');
      else setPublishStatus('✗ 发布失败：' + (j.message || res.status));
    } catch (e) { setPublishStatus('✗ 出错：' + e.message); }
  }
  async function pullFromRepo(){
    setPublishStatus('正在从仓库拉取…');
    const data = await Store.fetchRemote();
    if (!data || !data.settings){ setPublishStatus('✗ 仓库中暂无 exam/data.json'); return; }
    await Store.applyRemoteIfEmpty(data) || (function(){
      // 即使本机已有，也允许用户手动覆盖为仓库版本
      localStorage.setItem(Store.K.settings, JSON.stringify(data.settings));
      if (data.problems) localStorage.setItem(Store.K.problems, JSON.stringify(data.problems));
      return true;
    })();
    setPublishStatus('✓ 已从仓库载入配置');
    if (show._bound) bindSettings._refresh && bindSettings._refresh();
    renderProblems();
  }

  /* ---------- 数据文件夹 ---------- */
  async function refreshFolderRestore(){
    if (!Store.fs.supported){
      renderFolderStatus('unsupported');
      return;
    }
    const r = await Store.fs.restore();
    if (r === 'granted'){ renderFolderStatus(); Store.fs.mirrorAll(); }
    else if (r === 'need-permission'){
      const st = $('#folderStatus');
      st.textContent = '「' + Store.fs.name + '」待重新授权';
      st.classList.add('off');
      $('#btnConnectFolder').textContent = '重新连接…';
    } else renderFolderStatus();
  }
  function renderFolderStatus(mode){
    const st = $('#folderStatus');
    if (mode === 'unsupported'){
      st.textContent = '浏览器不支持（建议 Chrome / Edge）';
      st.classList.add('off');
      $('#btnConnectFolder').disabled = true;
      return;
    }
    if (Store.fs.granted){
      st.textContent = '✓ ' + Store.fs.name;
      st.classList.remove('off');
      $('#btnConnectFolder').textContent = '更换文件夹…';
    } else {
      st.textContent = '未连接（仅浏览器保存）';
      st.classList.add('off');
    }
  }
  $('#btnConnectFolder').onclick = async () => {
    try{
      if (!Store.fs.granted && Store.fs.handle){
        const ok = await Store.fs.requestPermission();
        if (ok){ renderFolderStatus(); Store.fs.mirrorAll(); toast('考试文件夹已重新连接', 'ok'); }
        return;
      }
      await Store.fs.connect();
      renderFolderStatus();
      toast('设置已实时保存到「' + Store.fs.name + '」', 'ok');
    }catch(e){
      if (e && e.name === 'AbortError') return;
      toast('连接文件夹失败：' + (e.message || e), 'err');
    }
  };

  /* ---------- 题目管理 ---------- */
  function renderSets(){
    const row = $('#setsRow');
    row.innerHTML = '';
    (window.BUILTIN_SETS || []).forEach(set => {
      const b = el('button', 'btn btn-sm', '应用 · ' + esc(set.name) + '（' + set.ids.length + ' 题）');
      b.onclick = () => {
        const list = getProblems().map(p => Object.assign({}, p, { enabled: set.ids.includes(p.id) }));
        Store.saveProblems(list);
        renderProblems();
        toast('已应用' + set.name + '：' + set.ids.join('、'), 'ok');
      };
      row.appendChild(b);
    });
    const all = el('button', 'btn btn-sm', '全部启用');
    all.onclick = () => { Store.saveProblems(getProblems().map(p => Object.assign({}, p, { enabled: true }))); renderProblems(); };
    row.appendChild(all);
  }
  function renderProblems(){
    renderSets();
    const list = getProblems();
    const box = $('#probList');
    box.innerHTML = '';
    list.forEach((p, idx) => {
      const row = el('div', 'prob-row' + (p.enabled ? '' : ' off'));
      const chk = el('input');
      chk.type = 'checkbox'; chk.checked = !!p.enabled; chk.title = '启用 / 停用本题';
      chk.onchange = () => { p.enabled = chk.checked; Store.saveProblems(list); renderProblems(); };
      row.appendChild(chk);
      row.appendChild(el('span', 'prob-name', esc(p.id)));
      row.appendChild(el('span', 'prob-title', esc(p.title)));
      row.appendChild(el('span', 'badge' + (p.source === 'builtin' ? ' builtin' : ''), p.source === 'builtin' ? '内置' : '导入'));
      row.appendChild(el('span', 'dim', p.tests.length + ' 测试点'));
      const tlLabel = el('span', 'dim', '时限');
      row.appendChild(tlLabel);
      const tl = el('input');
      tl.type = 'number'; tl.value = p.tl || 1000; tl.min = 100; tl.step = 100; tl.title = '每测试点时限（毫秒）';
      tl.onchange = () => { p.tl = Math.max(100, Number(tl.value) || 1000); Store.saveProblems(list); };
      row.appendChild(tl);
      const prev = el('button', 'link', '预览题面');
      prev.onclick = () => previewProblem(p);
      row.appendChild(prev);
      if (p.source === 'imported'){
        const del = el('button', 'link del', '删除');
        del.onclick = () => {
          if (!confirm('确定删除题目「' + p.title + '」？')) return;
          list.splice(idx, 1); Store.saveProblems(list); renderProblems();
        };
        row.appendChild(del);
      }
      box.appendChild(row);
    });
    const on = list.filter(p => p.enabled).length;
    $('#probSummary').textContent = '已启用 ' + on + ' / 共 ' + list.length + ' 题';
  }

  function previewProblem(p){
    const body = el('div', 'prob-doc');
    if (p.statement && p.statement.type === 'pdf'){
      const f = el('iframe');
      f.src = p.statement.data;
      body.appendChild(f);
    } else if (p.statement && p.statement.type === 'text'){
      body.innerHTML = '<h2>' + esc(p.title) + '</h2><pre style="white-space:pre-wrap;font:13px/1.7 Consolas,monospace">' + esc(p.statement.data) + '</pre>';
    } else {
      body.innerHTML = (p.statement && p.statement.data) || '<p>（无题面）</p>';
    }
    const m = modal(p.title + ' — 题面预览', body, { wide: true });
    m.body.parentElement.style.padding = '0';
    m.body.style.padding = '0';
  }

  /* ---------- 导入 / 导出 ---------- */
  function sanitizeId(s){
    return String(s).trim().toLowerCase().replace(/\s+/g, '_').replace(/[^\w\u4e00-\u9fa5-]/g, '') || ('p' + uid());
  }
  $('#importFiles').addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    try{
      let added = 0, packed = false;
      const list = getProblems();

      // 1) json：可能是题目文件或考试包
      for (const f of files.filter(f => /\.json$/i.test(f.name))){
        const text = await f.text();
        let data;
        try{ data = JSON.parse(text); }catch(_){ continue; }
        if (data && Array.isArray(data.problems)){ // 考试包
          if (!confirm('检测到考试包（含考试设置与 ' + data.problems.length + ' 道题）。导入将覆盖当前题库与设置，是否继续？')) continue;
          if (data.settings) Store.saveSettings(Object.assign(Store.getSettings(), data.settings));
          if (data.state) Store.saveState(data.state);
          Store.saveProblems(data.problems.map(normImported));
          packed = true;
        } else if (data && data.id && Array.isArray(data.tests)){
          list.push(normImported(data)); added++;
        }
      }
      if (packed){ renderProblems(); toast('考试包导入完成', 'ok'); return; }

      // 2) 其余按文件名归组
      const stmts = new Map();   // id -> {type, data}
      const tests = new Map();   // id -> Map(no -> {input, expected})
      for (const f of files){
        const base = f.name.replace(/\.[^.]+$/, '');
        const ext = (f.name.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();
        if (['pdf', 'html', 'htm', 'txt', 'md'].includes(ext)){
          let type = 'text';
          if (ext === 'pdf') type = 'pdf';
          if (ext === 'html' || ext === 'htm') type = 'html';
          let data;
          if (type === 'pdf') data = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
          else data = await f.text();
          if (type === 'html' && /<html/i.test(data)){
            const mm = data.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            if (mm) data = mm[1];
          }
          stmts.set(sanitizeId(base), { type, data });
        } else {
          const mm = base.match(/^(.*?)(\d+)$/);
          const pid = sanitizeId(mm ? mm[1] : base);
          const no = mm ? Number(mm[2]) : 1;
          if (!tests.has(pid)) tests.set(pid, new Map());
          const m = tests.get(pid);
          if (!m.has(no)) m.set(no, {});
          const slot = m.get(no);
          const content = await f.text();
          if (ext === 'in') slot.input = content;
          else if (ext === 'out' || ext === 'ans' || ext === 'aout') slot.expected = content;
        }
      }
      const ids = new Set([...stmts.keys(), ...tests.keys()]);
      for (const id of ids){
        if (list.some(p => p.id === id)){
          if (!confirm('题目「' + id + '」已存在，重新导入将覆盖它。继续？')) continue;
          const i = list.findIndex(p => p.id === id);
          list.splice(i, 1);
        }
        const tm = tests.get(id) || new Map();
        const arr = [...tm.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => ({ input: v.input || '', expected: v.expected || '', sample: false }));
        const st = stmts.get(id);
        if (arr.length && arr.some(t => !t.expected)) toast('注意：题目「' + id + '」存在缺少答案文件的测试点', 'err');
        list.push({
          id, title: id + '（导入）', source: 'imported', tl: 1000, enabled: true,
          statement: st || { type: 'text', data: '（未提供题面文件）' },
          tests: arr.length ? arr : [{ input: '', expected: '', sample: false }],
        });
        added++;
      }
      Store.saveProblems(list);
      renderProblems();
      toast(added ? '成功导入 ' + added + ' 道题目' : '未识别到可导入的题目文件', added ? 'ok' : 'err');
    }catch(err){
      toast('导入失败：' + (err.message || err), 'err');
    }
  });
  function normImported(p){
    const pid = sanitizeId(p.id);
    // 内置题 id 一律走精简引用（数据始终可从本机 problems.js 解析，不必存大 JSON）
    if ((window.BUILTIN_PROBLEMS || []).some(b => b.id === pid)){
      return { id: pid, title: p.title || p.id, source: 'builtin', builtin: true,
        tl: Number(p.tl) || 1000, enabled: p.enabled !== false };
    }
    return {
      id: pid, title: p.title || p.id, source: 'imported', builtin: false,
      tl: Number(p.tl) || 1000, enabled: p.enabled !== false,
      statement: p.statement || { type: 'text', data: '' },
      tests: (p.tests || []).map(t => ({ input: t.input || '', expected: t.expected || '', sample: !!t.sample })),
    };
  }
  $('#btnExportPack').onclick = () => {
    const pack = {
      version: 1, exportedAt: fmtTime(Date.now()),
      settings: Store.getSettings(),
      state: Store.getState(),
      problems: getProblems(),
    };
    download('csp_exam_pack.json', JSON.stringify(pack));
    toast('考试包已导出（包含设置、题库与考试状态）', 'ok');
  };
  $('#btnResetBank').onclick = () => {
    if (!confirm('恢复内置题库为默认状态（内置题全部启用、时限复位），导入的题目保留。继续？')) return;
    const imported = getProblems().filter(p => p.source === 'imported');
    Store.saveProblems(builtinDefaults().concat(imported));
    renderProblems();
    toast('内置题库已恢复', 'ok');
  };

  /* ---------- 考试控制 ---------- */
  function examStatus(){
    return Store.getState();
  }
  function remainingSec(){
    const st = examStatus();
    if (st.status !== 'running') return null;
    const dur = Store.getSettings().durationMin * 60;
    return Math.max(0, dur - (Date.now() - st.startedAt) / 1000);
  }
  function renderControl(){
    const st = examStatus();
    const card = $('#ctrlCard');
    const names = { notstarted: '未开始', running: '进行中', ended: '已结束' };
    let html = '<div class="ctrl-status st-' + st.status + '">' + names[st.status] + '</div>';
    if (st.startedAt) html += '<div><b>开始时间</b>　' + fmtTime(st.startedAt) + '</div>';
    if (st.status === 'running' && remainingSec() != null)
      html += '<div><b>剩余时间</b>　' + fmtClock(remainingSec()) + '</div>';
    if (st.endedAt) html += '<div><b>结束时间</b>　' + fmtTime(st.endedAt) + '</div>';
    if (st.status === 'notstarted'){
      const s = Store.getSettings();
      if (s.startMode === 'auto') html += '<div class="dim" style="margin-top:8px">计时方式：学生进入考试环境即自动开始</div>';
      if (s.startMode === 'scheduled' && s.scheduledAt) html += '<div class="dim" style="margin-top:8px">定时开始：' + esc(s.scheduledAt.replace('T', ' ')) + '</div>';
    }
    card.innerHTML = html;
    const list = getProblems();
    $('#ctrlSummary').innerHTML =
      '<div><b>考试名称</b>' + esc(Store.getSettings().examName) + '</div>' +
      '<div><b>考试时长</b>' + Store.getSettings().durationMin + ' 分钟</div>' +
      '<div><b>启用题目</b>' + list.filter(p => p.enabled).map(p => p.id).join('、') + '</div>';
  }
  function startCtrlTimer(){
    if (Admin._timer) clearInterval(Admin._timer);
    Admin._timer = setInterval(() => {
      if ($('#view-control').classList.contains('hidden')) return;
      renderControl();
    }, 1000);
  }
  $('#btnStartExam').onclick = () => {
    const st = examStatus();
    if (st.status === 'running'){ toast('考试已在进行中'); return; }
    if (!confirm('现在开始考试并计时？')) return;
    Store.saveState({ status: 'running', startedAt: Date.now() });
    renderControl();
    toast('考试已开始', 'ok');
  };
  $('#btnEndExam').onclick = () => {
    const st = examStatus();
    if (st.status !== 'running'){ toast('考试尚未开始'); return; }
    if (!confirm('提前结束考试？学生端将立即锁定并自动交卷。')) return;
    Store.saveState(Object.assign(st, { status: 'ended', endedAt: Date.now() }));
    renderControl();
    toast('考试已结束', 'ok');
  };
  $('#btnResetExam').onclick = () => {
    if (!confirm('重置考试数据？\n\n将清除：考试状态、学生作答代码、提交记录、学生登录信息。\n（考试设置与题库保留）')) return;
    Store.resetExamData();
    renderControl();
    toast('考试数据已重置', 'ok');
  };

  /* ---------- 提交记录 ---------- */
  function renderSubs(){
    const subs = Store.getSubmissions();
    const box = $('#subList');
    $('#subSummary').textContent = subs.length ? '共 ' + subs.length + ' 条' : '';
    if (!subs.length){ box.innerHTML = '<p class="dim">暂无提交记录</p>'; return; }
    const t = el('table', 'sub-table');
    t.innerHTML = '<thead><tr><th>时间</th><th>考生</th><th>准考证号</th><th>题目</th><th>大小</th><th></th></tr></thead>';
    const tb = el('tbody');
    subs.slice().reverse().forEach(s => {
      const tr = el('tr');
      tr.innerHTML = '<td>' + esc(fmtTime(s.time)) + '</td><td>' + esc(s.name || '-') + '</td><td>' +
        esc(s.sid || '-') + '</td><td>' + esc(s.problemId) + '</td><td>' + fmtSize((s.code || '').length) + '</td>';
      const td = el('td');
      const b = el('button', 'link', '查看代码');
      b.className = 'prob-row-link';
      b.style.cssText = 'background:none;border:0;color:#2f6fed;cursor:pointer';
      b.onclick = () => {
        const pre = el('pre');
        pre.style.cssText = 'font:12.5px/1.55 Consolas,monospace;white-space:pre-wrap;word-break:break-all';
        pre.textContent = s.code || '';
        modal(s.name + ' · ' + s.problemId + ' · 源代码', pre, { wide: true });
      };
      td.appendChild(b);
      tr.appendChild(td);
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    box.innerHTML = '';
    box.appendChild(t);
  }
  $('#btnClearSubs').onclick = () => {
    if (!confirm('清空全部提交记录？（写盘的代码文件不会被删除）')) return;
    localStorage.removeItem(Store.K.submissions);
    renderSubs();
  };

  return { show, getProblems, builtinDefaults, sanitizeId };
})();
