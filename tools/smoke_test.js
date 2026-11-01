#!/usr/bin/env node
/* 冒烟测试：用 jsdom 加载 index.html，走一遍管理员 → 学生主流程 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('/Users/wangzihan/.workbuddy/binaries/node/workspace/node_modules/jsdom');

const ROOT = path.resolve(__dirname, '..');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => { if (!/Could not load img|not implemented/i.test(String(e))) errors.push('jsdomError: ' + e.message); });
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const html = fs.readFileSync(path.join(ROOT, 'noi/index.html'), 'utf8');
const dom = new JSDOM(html, {
  url: 'https://cspsim.test/noi/index.html', // jsdom 对 file:// 视为 opaque origin，localStorage 不可用
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const { window } = dom;
const { document } = window;

// 手动按 index.html 的顺序执行脚本
// 注意：浏览器中多个 <script> 共享全局词法作用域，这里拼接为一次 eval 等价模拟
{
  const code = ['util.js', 'store.js', 'problems.js', 'reviews.js', 'review-data.js', 'review-algo.js', 'review-algo-deep.js', 'admin.js', 'desktop.js', 'student.js', 'greeter.js']
    .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n') +
    '\n;window.showLoading = showLoading; window.hideLoading = hideLoading;';
  try{ window.eval(code); }
  catch(e){ errors.push('脚本执行失败: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')); }
}
window.confirm = () => true;
// 预载隐藏测试点：jsdom outside-only 不会执行动态插入的 <script>，
// 提前 eval 让 loadHiddenTests() 走“已存在”分支，避免 enterDesktop 的 await 挂起
try { window.eval(fs.readFileSync(path.join(ROOT, 'problem-tests.js'), 'utf8')); } catch (e) {}

const $ = s => document.querySelector(s);
const click = elx => elx.dispatchEvent(new window.Event('click', { bubbles: true }));
const visible = id => !$('#' + id).classList.contains('hidden');
let pass = 0, fail = 0;
function check(name, cond){
  if (cond){ pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* GDM 登录：点账户 → 输密码 → 等淡出动画（430ms）+ 进入桌面 */
async function gdmLogin(account, pwd){
  const u = document.querySelector('.gdm-user[data-account="' + account + '"]');
  if (!u) throw new Error('GDM 里找不到账户：' + account);
  u.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(20);
  $('#gdmPwd').value = pwd;
  $('#gdmSubmit').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(1300);
}

(async () => {
  console.log('— 显示器休眠 → GDM 账户选择 —');
  check('初始是显示器休眠黑屏', !!$('#dpms') && !$('#dpms').classList.contains('awake'));
  check('GDM 登录界面初始隐藏', $('#gdm').classList.contains('hidden'));

  window.Greeter.show();
  check('GDM 登录界面可显示', !$('#gdm').classList.contains('hidden'));
  check('GDM 有时钟（HH:MM）', /^\d{2}:\d{2}$/.test($('#gdmTime').textContent));
  check('GDM 显示日期', /\d+月\d+日 星期[日一二三四五六]/.test($('#gdmDate').textContent));
  const userBtns = [...document.querySelectorAll('.gdm-user')];
  check('GDM 列出三个账户', userBtns.length === 3);
  const names = userBtns.map(b => b.dataset.account);
  check('账户为 csp-j2026 / csp-s2026 / NOIP',
    names.includes('csp-j2026') && names.includes('csp-s2026') && names.includes('NOIP'));
  check('NOIP 标注为管理员', /管理员/.test(document.querySelector('.gdm-user[data-account="NOIP"]').textContent));
  check('底部显示 Ubuntu 20.04.1 LTS', /Ubuntu 20\.04\.1 LTS/.test($('.gdm-ver') ? $('.gdm-ver').textContent : ''));

  // 密码错误必须被拒
  document.querySelector('.gdm-user[data-account="csp-s2026"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(20);
  check('选中账户后出现密码框', !$('#gdmAuth').classList.contains('hidden'));
  $('#gdmPwd').value = 'wrong';
  $('#gdmSubmit').dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(40);
  check('密码错误有提示', /密码错误/.test($('#gdmMsg').textContent));
  check('密码错误不放行', visible('studentApp') === false);
  $('#gdmBack').dispatchEvent(new window.Event('click', { bubbles: true }));

  console.log('— 管理员账户 NOIP —');
  await gdmLogin('NOIP', 'noip2026');
  check('NOIP 登录后进入桌面', visible('studentApp'));
  check('管理员身份生效', window.Student.isAdmin() === true);

  console.log('— 考试管理（管理员控制台） —');
  window.__app('admin');
  await sleep(30);
  check('管理员端打开', visible('adminApp'));
  check('打开控制台时桌面收起（否则桌面会盖住控制台）',
    document.getElementById('studentApp').classList.contains('admin-away'));
  check('修复回归：打开面板即初始化配置落盘', !!window.localStorage.getItem('csp_sim:settings') && !!window.localStorage.getItem('csp_sim:problems'));
  check('设置视图可见', visible('view-settings'));
  $('#setExamName').value = 'CSP-S 2026 模拟';
  $('#setExamName').dispatchEvent(new window.Event('input', { bubbles: true }));
  $('#setDuration').value = '240';
  $('#setDuration').dispatchEvent(new window.Event('input', { bubbles: true }));
  const saved = JSON.parse(window.localStorage.getItem('csp_sim:settings'));
  check('设置实时保存', saved.examName === 'CSP-S 2026 模拟' && saved.durationMin === 240);

  // 题目管理
  click(document.querySelector('.adm-navbtn[data-view="problems"]'));
  check('题库渲染 12 行', document.querySelectorAll('#probList .prob-row').length === 12);
  check('4 套卷按钮', document.querySelectorAll('#setsRow .btn').length === 5); // 4 套 + 全部启用
  // 应用套卷一
  document.querySelectorAll('#setsRow .btn')[0].click();
  check('套卷一应用后启用 4 题', JSON.parse(window.localStorage.getItem('csp_sim:problems')).filter(p => p.enabled).length === 4);

  // 考试控制：正式考试的机器不限时，登录即在「进行中」
  click(document.querySelector('.adm-navbtn[data-view="control"]'));
  check('控制卡显示进行中（机器不限时，登录即开始）', $('#ctrlCard').textContent.includes('进行中'));
  click($('#btnStartExam'));
  const st = JSON.parse(window.localStorage.getItem('csp_sim:state'));
  check('考试状态 running', st.status === 'running' && st.startedAt > 0);

  click($('#btnAdminExit'));
  check('退出管理面板回到桌面', visible('adminApp') === false && visible('studentApp'));
  check('退出后桌面重新显示', !document.getElementById('studentApp').classList.contains('admin-away'));

  // 管理员桌面应当多出「考试管理」入口
  window.Desktop.openAppGrid();
  check('管理员网格里有「考试管理」', /考试管理/.test($('#sGridBody').textContent));
  window.Desktop.closeAppGrid();

  console.log('— 注销 → 学生账户 csp-s2026 —');
  window.__logout();
  await sleep(60);
  check('注销后回到 GDM', visible('studentApp') === false && !$('#gdm').classList.contains('hidden'));

  await gdmLogin('csp-s2026', 'csp2026');
  check('学生登录后进入考试桌面', visible('studentApp'));
  check('学生不是管理员', window.Student.isAdmin() === false);
  check('系统账户为 csp-s2026', window.Student.currentAccount().id === 'csp-s2026');

  // ── Ubuntu 20.04 GNOME：顶栏 + 左侧 Dock（无底部面板） ──
  check('有顶部面板', !!document.getElementById('sTop'));
  check('没有底部面板（GNOME 单面板）', !document.getElementById('sBottom'));
  check('顶栏左侧是「活动」', /活动/.test(document.getElementById('sActLbl').textContent));
  check('顶栏有时钟（GNOME 中文格式）', /\d+月\d+日 星期[日一二三四五六], \d{2}:\d{2}/.test(document.getElementById('sClock').textContent));
  check('顶栏有状态区（输入法/网络/音量/电源）',
    !!document.getElementById('sIme') && !!document.getElementById('sNetIco') &&
    !!document.getElementById('sVolIco') && !!document.getElementById('sSysBtn'));
  check('有左侧 Dock', !!document.getElementById('sDock'));
  check('Dock 常驻 Firefox 与文件', document.querySelectorAll('.ub-dock-item').length >= 2);
  check('Dock 底部有九宫格按钮', !!document.getElementById('sShowApps'));
  check('桌面图标用 SVG 而非 emoji', document.querySelectorAll('.s-icon .ico svg').length > 0);

  const icons = [...document.querySelectorAll('.s-icon')];
  check('桌面只有 teacher 目录与回收站两个图标（照官方演示）', icons.length === 2);
  check('桌面有 teacher 目录', icons.some(i => i.textContent.includes('teacher')));
  check('桌面有回收站', icons.some(i => i.textContent.includes('回收站')));

  /* 桌面上不再摆启动器：应用一律从「显示应用程序」网格启动，与真实 NOI Linux 的操作一致 */
  async function launchApp(name, opts){
    opts = opts || {};
    window.Desktop.openAppGrid();
    const box = document.getElementById('sGridInput');
    box.value = name;
    box.dispatchEvent(new window.Event('input', { bubbles: true }));
    const btn = document.querySelector('#sGridBody .ub-grid-app');
    if (!btn) throw new Error('网格里找不到应用：' + name);
    const winCount = document.querySelectorAll('.s-win').length;
    btn.dispatchEvent(new window.Event('click', { bubbles: true }));
    if (opts.probe){
      // 起进程的几百毫秒里：Dock 上出现启动指示，光标变忙
      await sleep(60);
      opts.probe({
        dockLaunching: document.querySelectorAll('.ub-dock-item.launching').length,
        bodyBusy: document.getElementById('studentApp').classList.contains('launching'),
        wins: document.querySelectorAll('.s-win').length - winCount,
      });
    }
    // 等窗口真的被「映射」出来（真机有进程启动耗时，测试不能只 sleep 一个固定值）
    for (let i = 0; i < 80; i++){
      if (document.querySelectorAll('.s-win').length > winCount) break;
      await sleep(25);
    }
    await sleep(60);
  }

  // ── 壁纸（ISO 内 9 张 NOI 官方图，默认 noi-00） ──
  check('默认壁纸为 noi-00', window.Desktop.wallpaper() === 'noi-00');
  check('壁纸共 9 张官方原图', window.Desktop.WALLS.length === 9);
  const wall0 = window.Desktop.wallpaper();
  window.Desktop.setWallpaper('noi-03');
  check('壁纸可切换', window.Desktop.wallpaper() === 'noi-03' &&
    document.getElementById('studentApp').style.getPropertyValue('--wall').includes('noi-03'));
  window.Desktop.setWallpaper(wall0);

  // ── 应用网格（GNOME：点「活动」或 Dock 九宫格） ──
  document.getElementById('sActBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
  const grid = document.getElementById('sGrid');
  check('应用网格打开', !grid.classList.contains('hidden'));
  const gridTxt = document.getElementById('sGridBody').textContent;
  check('网格含 Code::Blocks IDE / Geany', /Code::Blocks/.test(gridTxt) && /Geany/.test(gridTxt));
  check('网格含 Arbiter_local / Byobu Terminal', /Arbiter_local/.test(gridTxt) && /Byobu/.test(gridTxt));
  check('网格含 Data Display Debugger / Emacs', /Data Display Debugger/.test(gridTxt) && /Emacs/.test(gridTxt));
  check('网格含 Firefox 网络浏览器', /Firefox/.test(gridTxt));
  check('网格含 LibreOffice 四件套', ['Calc','Draw','Impress','Writer'].every(k => new RegExp('LibreOffice ' + k).test(gridTxt)));
  check('网格含系统监视器 / 语言支持 / 字符 / 字体', ['系统监视器','语言支持','字符','字体'].every(k => gridTxt.includes(k)));
  // 按用户指示「补能真做出来的那批」：编辑器 / 计算器 / 归档 / 文档查看器进网格
  check('网格含 VS Code / Sublime Text',
    /Visual Studio Code/.test(gridTxt) && /Sublime Text/.test(gridTxt));
  check('网格含 Vim / Midnight Commander',
    /Vim/.test(gridTxt) && /Midnight Commander/.test(gridTxt));
  check('网格含 计算器 / 文本编辑器 / 归档管理器 / 文档查看器',
    ['计算器','文本编辑器','归档管理器','文档查看器'].every(k => gridTxt.includes(k)));
  check('网格不含系统设置项（Livepatch / 附加驱动 / 软件和更新）',
    !/Livepatch/.test(gridTxt) && !/附加驱动/.test(gridTxt) && !/软件和更新/.test(gridTxt) &&
    !/安装 RELEASE/.test(gridTxt));
  check('网格图标有真图（ISO 抽出的 PNG）',
    document.querySelectorAll('#sGridBody .ub-grid-app img').length >= 10);
  check('网格其余图标仍为 SVG',
    document.querySelectorAll('#sGridBody .ub-grid-app img, #sGridBody .ub-grid-app svg').length ===
    document.querySelectorAll('#sGridBody .ub-grid-app').length);
  check('网格按名称排序', (() => {
    const names = [...document.querySelectorAll('#sGridBody .ub-grid-app span')].map(x => x.textContent.trim());
    return names.length > 1 && names.join('|') === [...names].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')).join('|');
  })());
  const gi = document.getElementById('sGridInput');
  gi.value = 'Kazam';
  gi.dispatchEvent(new window.Event('input', { bubbles: true }));
  check('应用网格可搜索', document.querySelectorAll('#sGridBody .ub-grid-app').length === 1);
  gi.value = '';
  gi.dispatchEvent(new window.Event('input', { bubbles: true }));

  // ── 网格底部「常用 / 全部」分页 + 打开网格时 Dock 收起（真机 GNOME 3.36 行为） ──
  const appRoot = document.getElementById('studentApp');
  check('打开网格时 Dock 收起', appRoot.classList.contains('grid-open'));
  check('网格底部有「常用 / 全部」两个标签',
    document.getElementById('sGridFreq').textContent.trim() === '常用' &&
    document.getElementById('sGridAll').textContent.trim() === '全部');
  check('默认停在「全部」页', document.getElementById('sGridAll').classList.contains('on') &&
    !document.getElementById('sGridFreq').classList.contains('on'));
  const allCount = document.querySelectorAll('#sGridBody .ub-grid-app').length;
  document.getElementById('sGridFreq').dispatchEvent(new window.Event('click', { bubbles: true }));
  check('点「常用」可切换分页', window.Desktop.gridMode() === 'freq' &&
    document.getElementById('sGridFreq').classList.contains('on'));
  const freqTxt = document.getElementById('sGridBody').textContent;
  check('常用页有预置常用应用（终端/文件）', /终端/.test(freqTxt) && /文件/.test(freqTxt));
  check('常用页是筛过的，不是整张网格',
    document.querySelectorAll('#sGridBody .ub-grid-app').length < allCount);
  document.getElementById('sGridAll').dispatchEvent(new window.Event('click', { bubbles: true }));
  check('切回「全部」页', window.Desktop.gridMode() === 'all');
  window.Desktop.closeAppGrid();
  check('应用网格可关闭', grid.classList.contains('hidden'));
  check('关闭网格后 Dock 恢复', !document.getElementById('studentApp').classList.contains('grid-open'));

  // ── 应用启动：有「起进程」过程，不是瞬间出窗口 ──
  let launchProbe = null;
  await launchApp('系统监视器', { probe(p){ launchProbe = p; } });
  check('启动中 Dock 出现启动指示', !!launchProbe && launchProbe.dockLaunching >= 1);
  check('启动中桌面进入忙碌态（光标 progress）', !!launchProbe && launchProbe.bodyBusy);
  check('刚点下时窗口还没被映射', !!launchProbe && launchProbe.wins === 0);
  check('启动耗时过后窗口正常出现', document.querySelectorAll('.s-win').length >= 1);
  check('启动结束后忙碌态已清除', !document.getElementById('studentApp').classList.contains('launching'));

  // ── 窗口手感：拖动跟手 + 八向拖边缩放 ──
  {
    const w0 = document.querySelector('.s-win');
    check('窗口有八向缩放手柄', w0.querySelectorAll('.win-rs').length === 8);
    w0.querySelector('.s-win-head').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, clientX: 300, clientY: 200 }));
    check('拖动时摘掉过渡（跟手）', w0.classList.contains('moving'));
    window.dispatchEvent(new window.MouseEvent('mouseup'));
    check('松手后恢复过渡', !w0.classList.contains('moving'));
    w0.querySelector('.win-rs.se').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, clientX: 300, clientY: 200 }));
    check('拖边时进入 resizing 态', w0.classList.contains('resizing'));
    window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 420, clientY: 320 }));
    window.dispatchEvent(new window.MouseEvent('mouseup'));
    check('松手后退出 resizing 态', !w0.classList.contains('resizing'));
  }
  window.Desktop.closeAllWins();
  await sleep(220);

  // ── 文件管理器：Nautilus 3.36（headerbar + 图标视图 + 先骨架后内容） ──
  icons.find(i => i.textContent.includes('teacher')).dispatchEvent(new window.Event('dblclick', { bubbles: true }));
  await sleep(20);
  check('文件管理器打开（headerbar 外壳）', !!document.querySelector('.nu-view') &&
    !!document.querySelector('.s-win-head.head-bar'));
  check('外壳先出现、视图区在载入（骨架）', !!document.querySelector('.nu-view .skel'));
  check('路径栏已显示 teacher', /teacher/.test(
    [...document.querySelectorAll('.nu-crumb.cur')].map(b => b.textContent).join('')));
  await sleep(460);
  check('载入完成后骨架已移除', !document.querySelector('.nu-view .skel'));
  check('图标视图列出 4 个题目目录',
    document.querySelectorAll('.nu-item[data-kind="folder"]').length === 4);
  check('图标用的是 Yaru 真图', [...document.querySelectorAll('.nu-item .nu-ico img')]
    .every(i => /assets\/icons\/[a-z]+\.png$/.test(i.getAttribute('src'))));
  const nuItems = [...document.querySelectorAll('.nu-item')];
  check('考生目录内有压缩包', nuItems.some(r => r.dataset.name.includes('.zip')));
  check('考生目录内有考试须知', nuItems.some(r => r.dataset.name.includes('考试须知')));

  // ── 压缩包 → 题面（在考生目录里双击，而不是桌面上） ──
  nuItems.find(r => r.dataset.name.includes('.zip')).dispatchEvent(new window.Event('dblclick', { bubbles: true }));
  await sleep(20);
  check('zip 窗口打开', [...document.querySelectorAll('.win-title')].some(t => t.textContent.includes('.zip')));
  document.querySelector('.ar-row').dispatchEvent(new window.Event('dblclick', { bubbles: true }));
  await sleep(20);
  check('题面窗口打开', document.querySelector('.pdf-name') !== null);
  check('题面含标题', document.querySelector('.prob-doc h2') !== null);

  document.querySelector('.nu-item[data-kind="folder"]').dispatchEvent(new window.Event('dblclick', { bubbles: true }));
  await sleep(220);
  const nuIn = [...document.querySelectorAll('.nu-item')];
  check('题目目录含 .cpp 源文件', nuIn.some(r => r.dataset.kind === 'cpp'));
  check('题目目录含样例 .in/.ans', nuIn.some(r => r.dataset.name.endsWith('.in')) && nuIn.some(r => r.dataset.name.endsWith('.ans')));
  check('进入子目录后路径栏多一段', document.querySelectorAll('.nu-crumb').length >= 3);
  window.Desktop.closeAllWins();
  await sleep(200);

  // ── IDE（Code::Blocks 20.03：外壳 + 内嵌编辑区）──
  await launchApp('Code::Blocks');
  check('Code::Blocks 打开（真实标题格式）', [...document.querySelectorAll('.win-title')].some(t => /\.cpp - Code::Blocks 20\.03$/.test(t.textContent)));
  check('IDE 有 Code::Blocks 菜单栏', (() => {
    const mb = document.querySelector('.cbc-shell .s-menubar');
    if (!mb) return false;
    const names = [...mb.querySelectorAll('.mb-item')].map(x => x.textContent);
    return names[0] === 'File' && names.includes('Build') && names.includes('DoxyBlocks') && names[names.length - 1] === 'Help';
  })());
  check('IDE 工具栏用 ISO 里的真图标', (() => {
    const imgs = [...document.querySelectorAll('.cbc-toolbar .cbc-tb img')].map(x => x.getAttribute('src'));
    return imgs.length >= 6 && imgs.some(s => /compilerun\.png$/.test(s)) && imgs.some(s => /rebuild\.png$/.test(s));
  })());
  check('IDE 有 Management 面板（Projects/Symbols/Resources）', (() => {
    const t = [...document.querySelectorAll('.cbc-side-tabs button')].map(b => b.textContent);
    return t.join('/') === 'Projects/Symbols/Resources';
  })());
  check('Management 项目树列出 4 个题目源文件', document.querySelectorAll('.cbc-tree .cbc-node.file').length === 4);
  check('Others 节点挂当前题的样例文件（切题要跟着换）', (() => {
    const sel = document.querySelector('.cbc-tree .cbc-node.file.sel');
    const box = document.querySelector('.cbc-tree .cbc-others');
    return !!sel && !!box && box.textContent.includes(sel.dataset.problem + '1.in');
  })());
  check('IDE 显示源文件真实路径', /teacher\/.*\.cpp/.test(document.querySelector('.cbc-statusbar [data-cbc="path"]').textContent));
  check('启动图用的是 ISO 里 Code::Blocks 的 splash', !!document.querySelector('.cbc-splash img[src*="splash.png"]'));
  check('编辑区以 CBC 内嵌态加载', /ui=cbc/.test(document.querySelector('.cbc-frame').getAttribute('src')));
  const pidNode = [...document.querySelectorAll('.cbc-tree .cbc-node.file')].find(n => n.classList.contains('sel'));
  const pid = pidNode.dataset.problem;
  // 状态栏光标位置由编辑区上报
  window.dispatchEvent(new window.MessageEvent('message', { data: { type: 'ide:caret', line: 7, col: 12 } }));
  await sleep(20);
  check('状态栏显示行列位置', /行 7, 列 12/.test(document.querySelector('.cbc-statusbar [data-cbc="caret"]').textContent));
  window.postMessage({ type: 'ide:code', code: 'int main(){return 0;}' }, '*');
  await sleep(30);
  check('IDE 代码自动保存', (JSON.parse(window.localStorage.getItem('csp_sim:codes'))[pid] || '').includes('main'));

  // 切题：树里的 Others 必须换成新题的样例文件
  {
    const other = [...document.querySelectorAll('.cbc-tree .cbc-node.file')].find(n => n.dataset.problem !== pid);
    other.dispatchEvent(new window.Event('click', { bubbles: true }));
    await sleep(200);
    check('点树里的另一题会切过去', [...document.querySelectorAll('.cbc-tree .cbc-node.file.sel')]
      .some(n => n.dataset.problem === other.dataset.problem));
    check('切题后 Others 换成新题的样例',
      document.querySelector('.cbc-tree .cbc-others').textContent.includes(other.dataset.problem + '1.in'));
    /* 切回去，后面的终端测试还用 pid */
    [...document.querySelectorAll('.cbc-tree .cbc-node.file')]
      .find(n => n.dataset.problem === pid).dispatchEvent(new window.Event('click', { bubbles: true }));
    await sleep(200);
  }

  // ── 终端 ──
  await launchApp('终端');
  await sleep(30);
  const termInput = () => document.querySelector('.term-input-row input');
  const termText = () => document.querySelector('.term').textContent;
  check('终端打开', !!termInput());
  check('终端提示符含当前路径', /csp-s2026@noi:~\/Desktop\/teacher/.test(document.querySelector('.term-input-row .prompt').textContent));
  async function sh(cmd){
    termInput().value = cmd;
    termInput().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(60);
  }
  await sh('ls');
  check('ls 列出题目目录', /poker|queue/.test(termText()));
  await sh('cd ' + pid);
  await sh('pwd');
  check('cd 后 pwd 进入题目目录', new RegExp('/' + pid).test(termText()));
  await sh('tree');
  check('tree 递归列出目录', /directories/.test(termText()));
  await sh('cat ' + pid + '1.in');
  check('cat 能读到样例输入', termText().length > 400);
  await sh('diff ' + pid + '1.in ' + pid + '1.ans');
  check('diff 报告差异', /< |---/.test(termText()));
  await sh('g++ -o game nosuch.cpp');
  check('g++ 对不存在的文件报错', /No such file/.test(termText()));
  await sh('./game');
  check('./game 未编译时报 No such file', /No such file|权限不够/.test(termText()));
  await sh('ulimit -s 102400');
  check('ulimit 可设置栈上限', /100 MB/.test(termText()));
  await sh('sudo ls');
  check('sudo 被拒绝（非管理员）', /sudoers/.test(termText()));

  // ── Arbiter_local ──
  await launchApp('Arbiter_local');
  check('Arbiter 打开', !!document.querySelector('.arb-table'));
  check('Arbiter 左侧列出 4 题', document.querySelectorAll('.arb-item').length === 4);
  check('Arbiter 列出全部测试点', document.querySelectorAll('.arb-table tbody tr').length >= 3);
  check('Arbiter 显示评分栏', !!document.querySelector('.arb-foot .arb-score'));

  // ══════════════════════════════════════════════════════════
  //  办公 / 系统工具 / 编辑器（按 ISO 补的 8 个应用）
  // ══════════════════════════════════════════════════════════
  console.log('— 计算器（GNOME 计算器 3.36） —');
  await launchApp('计算器');
  await sleep(40);
  const calcVal = () => document.querySelector('.calc-val').textContent;
  const calcKey = k => [...document.querySelectorAll('.calc-key')].find(b => b.textContent === k);
  check('计算器打开，6×4 键盘', document.querySelectorAll('.calc-key').length === 24);
  check('计算器初始显示 0', calcVal() === '0');
  ['1','2','+','3','4','='].forEach(k => click(calcKey(k)));
  check('12 + 34 = 46', calcVal() === '46');
  check('表达式行回显「12 + 34 =」', /12 \+ 34 =/.test(document.querySelector('.calc-expr').textContent));
  click(calcKey('C'));
  check('C 清空回 0', calcVal() === '0');
  ['8','1','√x'].forEach(k => click(calcKey(k)));
  check('√81 = 9', calcVal() === '9');
  click(calcKey('C'));
  ['3','x²'].forEach(k => click(calcKey(k)));
  check('3 的平方 = 9', calcVal() === '9');
  click(calcKey('C'));
  ['4','¹⁄x'].forEach(k => click(calcKey(k)));
  check('1/4 = 0.25', calcVal() === '0.25');
  click(calcKey('C'));
  ['5','±'].forEach(k => click(calcKey(k)));
  check('± 取负', calcVal() === '-5');
  click(calcKey('C'));
  document.querySelector('.calc').dispatchEvent(
    new window.KeyboardEvent('keydown', { key: '7', bubbles: true }));
  check('键盘数字键也能输入', calcVal() === '7');

  console.log('— 文本编辑器（gedit 3.36） —');
  await launchApp('文本编辑器');
  await sleep(60);
  const ged = document.querySelector('.ged-area');
  check('文本编辑器打开（标题栏兼任工具栏）',
    !!ged && !!document.querySelector('.s-win-head.head-bar') && !!document.querySelector('.ged-title'));
  check('状态栏初始「行 1，列 1」', document.querySelector('.ged-pos').textContent === '行 1，列 1');
  check('状态栏标明纯文本 / 制表符宽度：8',
    /纯文本/.test(document.querySelector('.ged-status').textContent) &&
    /制表符宽度：8/.test(document.querySelector('.ged-status').textContent));
  ged.value = 'hello\nworld';
  ged.selectionStart = ged.selectionEnd = 8;
  click(ged);
  check('光标位置随编辑器内容更新', document.querySelector('.ged-pos').textContent === '行 2，列 3');
  ged.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
  await sleep(30);
  const gedSaved = (window.Desktop.fs.list('~/Desktop') || [])
    .filter(n => n.type === 'file' && /^未命名文档 \d+\.txt$/.test(n.name));
  check('Ctrl+S 把文档写进 ~/Desktop', gedSaved.some(n => n.content === 'hello\nworld'));

  console.log('— VS Code / Sublime Text —');
  await launchApp('Visual Studio Code');
  await sleep(80);
  check('VS Code 打开：8 个菜单 + 5 个活动栏按钮',
    document.querySelectorAll('.ce-vsc .ce-menu .ce-mi').length === 8 &&
    document.querySelectorAll('.ce-vsc .ce-act-b').length === 5);
  check('资源管理器树列出全部题目',
    document.querySelectorAll('.ce-vsc .ce-node.file').length === document.querySelectorAll('.arb-item').length);
  check('当前文件有标签页', !!document.querySelector('.ce-vsc .ce-tab.on'));
  check('代码区有语法着色与行号',
    document.querySelectorAll('.ce-vsc .ce-hl span').length >= 2 &&
    /^1$/m.test(document.querySelector('.ce-vsc .ce-gut').textContent));
  check('VS Code 状态栏有分支 / 光标 / 编码',
    /⎇ main/.test(document.querySelector('.ce-vsc .ce-status').textContent) &&
    /Lg 1, Col 1/.test(document.querySelector('.ce-vsc .ce-status').textContent) &&
    /UTF-8/.test(document.querySelector('.ce-vsc .ce-status').textContent));
  const ceOther = [...document.querySelectorAll('.ce-vsc .ce-node.file')]
    .find(n => !n.classList.contains('sel'));
  const ceOtherId = ceOther.dataset.problem;
  click(ceOther);
  await sleep(40);
  check('点资源管理器里的另一题就切过去',
    document.querySelector('.ce-vsc .ce-tab.on').textContent.includes(ceOtherId) &&
    document.querySelector('.ce-vsc .ce-node.file.sel').dataset.problem === ceOtherId);
  check('切题后窗口标题跟着换',
    document.querySelector('.ce-vsc').closest('.s-win').querySelector('.win-title')
      .textContent.includes(ceOtherId));

  await launchApp('Sublime Text');
  await sleep(80);
  check('Sublime 打开（无菜单栏 / 无活动栏）',
    !!document.querySelector('.ce-sub') &&
    !document.querySelector('.ce-sub .ce-menu') && !document.querySelector('.ce-sub .ce-act'));
  check('Sublime 状态栏用 Line / Column 写法',
    /Line 1, Column 1/.test(document.querySelector('.ce-sub .ce-status').textContent) &&
    /C\+\+/.test(document.querySelector('.ce-sub .ce-status').textContent));

  console.log('— Vim 8.1 —');
  await launchApp('Vim');
  await sleep(80);
  const vimBox = document.querySelector('.vim');
  const vimKey = k => vimBox.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true }));
  check('Vim 打开（$TERM 黑底 + 空行波浪号）',
    !!vimBox && /~/.test(vimBox.querySelector('.vim-screen').textContent));
  check('Vim 状态行报文件名与 行/列 数',
    /"[\w.-]+\.cpp"\s+\d+L, \d+C/.test(vimBox.querySelector('.vim-l').textContent));
  check('Vim 右下角报光标位置与百分比',
    /^\d+,\d+\s+(\d+%|全部)$/.test(vimBox.querySelector('.vim-r').textContent));
  vimKey('G');
  check('G 跳到文件末尾（100%）', /全部$/.test(vimBox.querySelector('.vim-r').textContent));
  vimKey(':');
  check(': 进入命令行，底部出现冒号', vimBox.querySelector('.vim-cmd').classList.contains('typing'));
  vimKey('w'); vimKey('Enter');
  check(':w 写盘并提示已写入', /已写入/.test(vimBox.querySelector('.vim-cmd').textContent));
  vimKey('i'); vimKey('x'); vimKey('Escape');
  check('i 插入改动后状态行标记「已修改」', /已修改/.test(vimBox.querySelector('.vim-l').textContent));
  vimKey(':'); vimKey('q'); vimKey('Enter');
  check(':q 在未保存时拒绝退出（E37）',
    !!document.querySelector('.vim') && /E37/.test(vimBox.querySelector('.vim-cmd').textContent));
  vimKey(':'); vimKey('q'); vimKey('!'); vimKey('Enter');
  await sleep(340);
  check(':q! 强制退出，窗口关闭', !document.querySelector('.vim'));

  console.log('— Midnight Commander 4.8 —');
  await launchApp('Midnight Commander');
  await sleep(80);
  const mcP = [...document.querySelectorAll('.mc-p')];
  const mcKey = k => document.querySelector('.mc').dispatchEvent(
    new window.KeyboardEvent('keydown', { key: k, bubbles: true }));
  check('MC 打开：双栏方框', mcP.length === 2 && /[┌┐└┘]/.test(mcP[0].textContent));
  check('MC 底部 10 个功能键', document.querySelectorAll('.mc-fk').length === 10);
  check('左栏在 teacher，右栏在 ~/Desktop',
    /~\/Desktop\/teacher/.test(mcP[0].textContent) &&
    !/~\/Desktop\/teacher/.test(mcP[1].textContent));
  check('当前面板的选中行高亮（on）',
    !!mcP[0].querySelector('.mc-row.on') && !mcP[1].querySelector('.mc-row.on'));
  mcKey('Tab');
  check('Tab 把焦点切到右栏',
    !mcP[0].querySelector('.mc-row.on') && !!mcP[1].querySelector('.mc-row.on'));
  for (let i = 0; i < 8 && !/teacher/.test(mcP[1].querySelector('.mc-row.on').textContent); i++) mcKey('ArrowDown');
  mcKey('Enter');
  check('Enter 进入目录', /~\/Desktop\/teacher/.test(mcP[1].textContent));
  mcKey('F10');
  await sleep(340);
  check('F10 退出 MC', !document.querySelector('.mc'));

  console.log('— 归档管理器 / 文档查看器 —');
  await launchApp('归档管理器');
  await sleep(60);
  check('归档管理器打开（file-roller 3.36）',
    !!document.querySelector('.ar-list') && !!document.querySelector('.s-win-head.head-bar'));
  check('标题栏是当前题的 <题号>.zip', /\.zip$/.test(document.querySelector('.ar-title').textContent));
  check('列表四列（名称 / 大小 / 类型 / 修改时间）',
    [...document.querySelectorAll('.ar-head span')].map(s => s.textContent.trim()).join('|') === '名称|大小|类型|修改时间');
  const arRows = [...document.querySelectorAll('.ar-row')];
  check('压缩包里列出 pdf + 题目录 + 样例', arRows.length >= 3);
  check('样例文件缩进挂在题目录下', document.querySelectorAll('.ar-row.ar-indent').length >= 2);
  check('压缩包里能看到 PDF 文档', arRows.some(r => /\.pdf/.test(r.textContent)));

  await launchApp('文档查看器');
  await sleep(60);
  const evWin = document.querySelector('.ev-page').closest('.s-win');
  const evTb = [...evWin.querySelectorAll('.nu-tb')];
  check('文档查看器打开（Evince 3.36）', !!document.querySelector('.ev-body .ev-page'));
  check('标题栏是 <题号>.pdf', /^[\w-]+\.pdf$/.test(document.querySelector('.pdf-name').textContent));
  check('单页文档翻页按钮不可用', evTb[0].disabled && evTb[1].disabled);
  check('页面是白纸 + 阴影（A4 版心）', !!document.querySelector('.ev-page'));
  evTb[3].click();
  check('放大按钮按 0.1 步进', /scale\(1\.1\)/.test(document.querySelector('.ev-page').style.transform));
  evTb[2].click();
  check('缩小回到 100%', document.querySelector('.ev-page').style.transform === '');

  // ── Dock 运行指示（dash-to-dock 橙点） ──
  document.getElementById('sActBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
  const emacsBtn = [...document.querySelectorAll('#sGridBody .ub-grid-app')].find(b => /Emacs \(GUI\)/.test(b.textContent));
  check('网格里找到 Emacs (GUI)', !!emacsBtn);
  if (emacsBtn) emacsBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  // 等 Emacs 真正被映射（前面 Arbiter 还开着，不能只看 .running 的数量）
  for (let i = 0; i < 80; i++){
    if (!/^活动$/.test(document.getElementById('sActLbl').textContent)) break;
    await sleep(25);
  }
  check('Dock 显示运行中应用（橙点）', document.querySelectorAll('.ub-dock-item.running').length >= 1);
  check('顶栏左侧切换为应用名', !/^活动$/.test(document.getElementById('sActLbl').textContent));

  // ── polkit：学生安装应用 / 改网络都要管理员密码 ──
  console.log('— polkit 管理员认证 —');
  window.__app('software');
  await sleep(60);
  check('学生点「软件」先弹认证框', !!document.querySelector('.pk-dlg'));
  check('认证框写明需要安装软件认证', /安装/.test(document.querySelector('.pk-msg').textContent));
  document.querySelectorAll('.pk-field input')[0].value = 'bad';
  click(document.querySelector('[data-k="ok"]'));
  await sleep(60);
  check('认证密码错误有提示', /密码错误/.test(document.querySelector('.pk-err').textContent));
  check('认证未通过不打开软件窗口', !document.querySelector('.sw-title'));
  click(document.querySelector('[data-k="cancel"]'));
  await sleep(220);
  check('取消认证后对话框关闭', !document.querySelector('.pk-dlg'));

  window.__app('network');
  await sleep(60);
  check('改网络设置也要认证', !!document.querySelector('.pk-dlg'));
  check('认证框写明需要改网络认证', /网络/.test(document.querySelector('.pk-msg').textContent));
  document.querySelectorAll('.pk-field input')[0].value = 'noip2026';
  click(document.querySelector('[data-k="ok"]'));
  await sleep(260);
  check('管理员密码通过后打开网络面板', !!document.querySelector('.ctl-page'));

  window.__logout();
  await sleep(40);
  await gdmLogin('NOIP', 'noip2026');
  window.__app('network');
  await sleep(80);
  check('NOIP 登录后免认证（直接出面板）',
    !document.querySelector('.pk-dlg') && !!document.querySelector('.ctl-page'));
  window.__logout();
  await sleep(40);
  await gdmLogin('csp-s2026', 'csp2026');
  check('回到学生账户继续', window.Student.currentAccount().id === 'csp-s2026');

  // ── 程序回收系统（浏览器内提交源代码，官方流程） ──
  window.__app('recovery');
  await sleep(120);
  check('浏览器先出外壳（地址栏 + 工具栏）', !!document.querySelector('.ff-url') &&
    document.querySelectorAll('.ff-bar .ff-tb').length === 4);
  check('连接期间身份位转圈', !!document.querySelector('.ff-ident.busy'));
  check('左下角状态面板报「正在连接」', /正在(连接|等待)/.test(
    (document.querySelector('.ff-status') || {}).textContent || ''));
  check('连接中地址栏还没有页面内容', (document.querySelector('.ff-page') || {}).textContent === '');
  await sleep(900);
  check('程序回收系统登录页打开', !!document.querySelector('#rcLoginBtn'));
  check('登录页有准考证号与密码', !!document.querySelector('#rcId') && !!document.querySelector('#rcPwd'));
  check('载入完成后身份位不再转圈', !document.querySelector('.ff-ident.busy'));
  check('载入完成后状态面板淡出', document.querySelector('.ff-status').classList.contains('out'));
  $('#rcId').value = 'GZ-2026-001';
  document.querySelector('#rcPwd').value = 'demo1234';
  click(document.querySelector('#rcLoginBtn'));
  await sleep(120);
  check('登录后进入考生须知', !!document.querySelector('.rc-notice'));
  check('侧栏四个导航项', document.querySelectorAll('.rc-nav a').length === 4);
  check('侧栏显示准考证号', /GZ-2026-001/.test(document.querySelector('.rc-user').textContent));
  check('侧栏时钟在走（HH:MM:SS）', /^\d{2}:\d{2}:\d{2}$/.test(document.querySelector('#rcClock').textContent));
  click([...document.querySelectorAll('.rc-nav a')].find(a => a.dataset.tab === 'answer'));
  await sleep(120);
  check('答题页显示考试剩余', /考试剩余：/.test(document.querySelector('.rc-hint').textContent));
  check('答题表 4 行 5 列', document.querySelectorAll('.rc-table tbody tr').length === 4 &&
    document.querySelectorAll('.rc-table thead th').length === 5);
  const subBtn = document.querySelector('[data-sub]');
  check('答题表有查看与提交按钮', !!document.querySelector('[data-view]') && !!subBtn);
  const subPid = subBtn.dataset.sub;
  click(subBtn);
  await sleep(120);
  const rcSubs = JSON.parse(window.localStorage.getItem('csp_sim:rcsubmits') || '{}');
  check('提交记录含时间与字节数', !!(rcSubs[subPid] && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rcSubs[subPid].time) && rcSubs[subPid].size > 0));
  check('提交后表格显示内容长度', /B$/.test(document.querySelector('.rc-table tbody tr .rc-size').textContent));
  click([...document.querySelectorAll('.rc-nav a')].find(a => a.dataset.tab === 'download'));
  await sleep(100);
  check('试题下载页列出题目', document.querySelectorAll('.rc-table tbody tr').length === 4);
  click(document.querySelector('[data-dl]'));
  await sleep(60);
  check('下载后按钮变已下载', document.querySelector('[data-dl]').textContent === '已下载');
  click(document.querySelector('#rcLogout'));
  await sleep(100);
  check('退出登录显示离场提示', /有序离场/.test(document.querySelector('.rc-bye').textContent));

  // ── 交卷（顶栏系统菜单）──
  window.__app('finish');
  await sleep(30);
  check('交卷窗口打开', document.querySelector('.submit-table') !== null);
  check('交卷窗口提示提交路径', /teacher/.test(document.querySelector('.submit-path').textContent));
  click([...document.querySelectorAll('.submit-pane .btn')].pop());
  await sleep(120);
  check('交卷后显示结束层', visible('sEndOverlay'));
  check('回执含已交题目', $('#endReceipt').textContent.includes(pid));
  const subs = JSON.parse(window.localStorage.getItem('csp_sim:submissions'));
  check('提交记录落库', subs.length === 1 && subs[0].problemId === pid);
  check('交卷不把全局状态改成已结束（机器不限时）',
    JSON.parse(window.localStorage.getItem('csp_sim:state')).status === 'running');

  click($('#btnEndBack'));
  await sleep(60);
  check('交卷后回到 GDM 登录界面', !$('#gdm').classList.contains('hidden') && visible('studentApp') === false);

  console.log('— 交卷后可以重新进来继续作答 —');
  await gdmLogin('csp-s2026', 'csp2026');
  check('重新登录直接进入桌面', visible('studentApp'));
  check('没有「已交卷」拦截层', $('#sEndOverlay').classList.contains('hidden'));
  check('之前写的代码还在', (window.localStorage.getItem('csp_sim:codes') || '').includes('int main'));

  // 锁定屏幕 → 回 GDM；关机 → 黑屏
  window.__logout();
  await sleep(40);
  check('锁定屏幕回到 GDM', !$('#gdm').classList.contains('hidden'));
  window.Greeter.powerOff();
  await sleep(40);
  check('关机回到黑屏', !$('#dpms').classList.contains('gone') && !$('#dpms').classList.contains('awake'));

  console.log('— 主页与复习中心 —');
  const homeHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check('主页有考试端 / 管理员 / 复习中心三个入口',
    (homeHtml.match(/class="hm-card/g) || []).length === 3);
  check('主页考试端指向 noi/', /id="hmExam"[^>]*href="noi\/"/.test(homeHtml));
  check('主页管理员指向 noi/?admin=1', /id="hmAdmin"[^>]*href="noi\/\?admin=1"/.test(homeHtml));
  check('主页复习中心指向 study/', /id="hmStudy"[^>]*href="study\/"/.test(homeHtml));
  check('入口不再内嵌复习面板', !document.getElementById('reviewApp'));
  await testStudy();
  await testAdminDirect();

  console.log('— 加载进度显示 —');
  const showLoading = window.eval('showLoading');
  const hideLoading = window.eval('hideLoading');
  showLoading('正在进入考试', { total: 3, current: 1, file: 'problem-tests.js' });
  check('加载遮罩显示', !$('#globalLoading').classList.contains('hidden'));
  check('加载文字更新', $('#globalLoadingText').textContent.includes('正在进入考试'));
  check('加载文件名更新', $('#globalLoadingFile').textContent.includes('problem-tests.js'));
  check('进度条有宽度', /\d/.test($('#globalLoadingBar').style.width) && parseFloat($('#globalLoadingBar').style.width) > 0);
  showLoading('下载中', { indeterminate: true });
  check('无限进度模式生效', $('#globalLoadingBar').parentElement.classList.contains('g-bar-indet'));
  showLoading('正在下载评测数据…', { percent: 42, detail: '正在下载：problem-tests.js · 已接收 320 KB' });
  check('百分比模式进度条正确', parseFloat($('#globalLoadingBar').style.width) === 42);
  check('百分比数字显示', $('#globalLoadingPct').textContent.trim() === '42%');
  check('副标题（下载文件+字节）显示', $('#globalLoadingFile').textContent.includes('已接收 320 KB'));
  hideLoading();
  check('加载遮罩可隐藏', $('#globalLoading').classList.contains('hidden'));

  console.log('— 题库拆分验证 —');
  const pjsSize = fs.statSync(path.join(ROOT, 'problems.js')).size;
  check('problems.js 首屏轻量 (<100KB)', pjsSize < 100 * 1024);
  const hiddenReady = !!window.BUILTIN_HIDDEN_TESTS &&
    window.BUILTIN_PROBLEMS.every(p => (window.BUILTIN_HIDDEN_TESTS[p.id] || []).length === 4);
  check('隐藏测试点 48 个齐全（4/题）', hiddenReady);
  // 拆分正确：样例留在 meta（每题 2），隐藏点留在 tests 文件（每题 4），二者可拼成 6
  const mergeOK = window.BUILTIN_PROBLEMS.every(p =>
    p.tests.filter(t => t.sample).length === 2 &&
    (window.BUILTIN_HIDDEN_TESTS[p.id] || []).length === 4);
  check('样例2+隐藏4 可拼成每题 6 测试点', mergeOK);

  console.log('\n结果：', pass, '通过 /', fail, '失败');
  if (errors.length){
    console.log('页面错误：');
    errors.slice(0, 10).forEach(e => console.log('  ', e));
  }
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error('测试崩溃:', e && (e.stack || e.message || e)); process.exit(1); });

/* ─────────────────────────────────────────────
   复习中心独立页（study/index.html）
   单独一个 jsdom 实例，模拟真实打开 /study/ 的场景
   ───────────────────────────────────────────── */
async function testStudy(){
  const html = fs.readFileSync(path.join(ROOT, 'study', 'index.html'), 'utf8');
  const sdom = new JSDOM(html, {
    url: 'https://cspsim.test/study/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const w = sdom.window, d = w.document;
  w.confirm = () => true;
  w.alert = () => {};

  const code = ['util.js', 'store.js', 'problems.js', 'reviews.js', 'review-data.js',
    'review-template.js', 'review-algo.js', 'review-algo-deep.js', 'review.js']
    .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n') +
    '\n;window.showLoading = showLoading;';
  try { w.eval(code); }
  catch (e){ errors.push('复习页脚本失败: ' + e.message); }

  await sleep(150);

  const q = s => d.querySelector(s);
  const qa = s => [...d.querySelectorAll(s)];
  const clk = e => e.dispatchEvent(new w.Event('click', { bubbles: true }));
  const vis = id => { const n = d.getElementById(id); return !!n && !n.classList.contains('hidden'); };
  const KEY = k => d.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));

  check('复习页自动进入（无需再点入口）', vis('reviewApp'));
  check('默认停在课程主页', vis('revHome') && !vis('revBody'));
  check('顶栏有 logo 与站名', !!q('.st-brand') && q('.st-brand').textContent.includes('复习中心'));
  check('主页 6 张课程卡片', qa('#revHome .rh-card').length === 6);
  check('主页有总进度区块', !!q('#revHome .rh-overall'));
  check('主页统计 4 项', qa('#revHome .rh-metric').length === 4);
  check('卡片带完成进度条', qa('#revHome .rh-card-prog').length === 6);
  check('顶栏进度环初始 0%', (d.getElementById('stProgTxt') || {}).textContent === '0%');
  check('主页隐藏板块标签栏', !vis('revTabs') || d.getElementById('revTabs').classList.contains('hidden'));

  // 进入「精讲与练习」
  clk(q('#revHome .rh-card[data-id="jiang"]'));
  await sleep(30);
  check('卡片可进入板块', vis('revBody') && !vis('revHome'));
  check('左栏 12 题', qa('#revList .rev-item').length === 12);
  check('板块标签 6 个', qa('#revTabs .rev-tab').length === 6);
  check('当前标签高亮', (q('#revTabs .rev-tab.active') || {}).textContent.includes('精讲与练习'));

  // 侧栏收起
  clk(d.getElementById('btnRevSide'));
  check('侧栏可收起', d.getElementById('revBody').classList.contains('side-hidden'));
  check('侧栏状态持久化', w.localStorage.getItem('csp_sim:revside') === '1');
  clk(d.getElementById('btnRevSide'));
  check('侧栏可展开', !d.getElementById('revBody').classList.contains('side-hidden'));

  // 精讲内容
  clk(q('#revList .rev-item'));
  await sleep(30);
  const txt = q('#revContent').textContent || '';
  check('精讲含思路', txt.includes('思路精讲'));
  check('精讲含知识点', txt.includes('知识点'));
  check('精讲含参考代码按钮', !!d.getElementById('revRun'));
  check('精讲有上一章/下一章', !!q('#revContent .rev-navbtn'));

  // 标记已学完
  const db = q('#revContent .rev-donebar .btn-done');
  check('章节底部有「标记已学完」', !!db);
  clk(db);
  await sleep(20);
  check('标记写入 localStorage', JSON.parse(w.localStorage.getItem('csp_sim:done') || '[]').length === 1);
  check('按钮切换为已学完', db.classList.contains('on'));
  check('左栏同步完成态', qa('#revList .rev-item.done').length === 1);
  check('顶栏进度随之更新', (d.getElementById('stProgTxt') || {}).textContent !== '0%');

  // 回主页看进度
  clk(d.getElementById('btnRevHome'));
  await sleep(20);
  check('可回到主页', vis('revHome'));
  check('主页总进度显示完成数', /[1-9]/.test((q('#revHome .rh-overall-ring b') || {}).textContent || ''));
  check('主页出现「继续上次」', !!d.getElementById('rhContinue'));

  // 算法板块
  clk(q('#revHome .rh-card[data-id="algo"]'));
  await sleep(30);
  check('算法教学 51 章', qa('#revList .rev-item').length === 51);
  check('算法有分组标题', qa('#revList .rev-group').length >= 8);

  const before = qa('#revList .rev-item').length;
  clk(q('#revList .rev-group'));
  check('分组可折叠', qa('#revList .rev-item').length < before);
  clk(q('#revList .rev-group'));
  check('分组可再展开', qa('#revList .rev-item').length === before);

  const flt = d.getElementById('revSearch');
  flt.value = '最短路';
  flt.dispatchEvent(new w.Event('input', { bubbles: true }));
  await sleep(20);
  const filtered = qa('#revList .rev-item').length;
  check('章节筛选可用', filtered > 0 && filtered < 10);
  flt.value = '';
  flt.dispatchEvent(new w.Event('input', { bubbles: true }));
  await sleep(20);

  const sp = qa('#revList .rev-item').find(x => x.textContent.includes('最短路'));
  clk(sp);
  await sleep(30);
  check('章节渲染多块', qa('#revContent .rev-block').length >= 8);
  check('深度讲解有表格', qa('#revContent .rev-table').length >= 2);
  check('深度讲解有提示卡', qa('#revContent .rev-note').length >= 2);
  check('有面包屑定位', !!q('#revContent .rev-crumb'));
  check('本章目录已生成', qa('#revToc a').length >= 2);
  check('URL hash 可分享', /#\/algo\//.test(w.location.hash || ''));

  // 模板速查板块
  clk(d.getElementById('btnRevHome'));
  await sleep(20);
  clk(q('#revHome .rh-card[data-id="template"]'));
  await sleep(30);
  check('模板速查 23 条（1 自检 + 22 模板）', qa('#revList .rev-item').length === 23);
  check('模板速查按算法分类分组', qa('#revList .rev-group').length >= 5);

  const tplItem = qa('#revList .rev-item').find(x => x.textContent.includes('并查集'));
  check('左栏列出并查集模板', !!tplItem);
  clk(tplItem);
  await sleep(30);
  const tplTxt = q('#revContent').textContent || '';
  check('模板标注用途与复杂度', tplTxt.includes('用途与复杂度'));
  check('模板渲染出代码块', qa('#revContent .rev-pre').length >= 1);
  check('模板代码内容正确', ((q('#revContent .rev-pre') || {}).textContent || '').includes('find'));
  check('模板带易错点列表', qa('#revContent .rev-ul').length >= 1);
  check('模板显示标签徽章', !!q('#revContent .rev-tag'));

  const chkItem = qa('#revList .rev-item').find(x => x.textContent.includes('考前 10 分钟'));
  check('含考前自检章节', !!chkItem);
  clk(chkItem);
  await sleep(20);
  check('自检清单 5 条', qa('#revContent .rev-ol li').length === 5);
  check('自检有警示卡', qa('#revContent .rev-note').length >= 1);

  // 全站搜索
  const si = d.getElementById('stSearch');
  si.value = '最短路';
  si.dispatchEvent(new w.Event('input', { bubbles: true }));
  await sleep(260);
  check('全站搜索有结果', qa('#stSearchPop .st-hit').length > 0);
  check('搜索结果显示板块标签', qa('#stSearchPop .st-hit-sec').length > 0);
  check('搜索命中高亮', qa('#stSearchPop mark').length > 0);
  const hitCount = qa('#stSearchPop .st-hit').length;
  check('搜索结果去掉了 HTML 标签', !(q('#stSearchPop').textContent || '').includes('<p>'));
  clk(q('#stSearchPop .st-hit'));
  await sleep(30);
  check('点搜索结果可跳转', !!q('#revContent .rev-h1'));

  // 字号
  clk(d.getElementById('btnFsUp'));
  check('字号可放大', d.body.getAttribute('data-fs') === 'l');
  clk(d.getElementById('btnFsDown'));
  check('字号可还原', d.body.getAttribute('data-fs') === 'm');

  // 键盘翻章
  const h1a = (q('#revContent .rev-h1') || {}).textContent;
  KEY('ArrowRight');
  await sleep(30);
  const h1b = (q('#revContent .rev-h1') || {}).textContent;
  check('→ 键切到下一章', h1a !== h1b);

  // 进度明细
  clk(d.getElementById('stProgBtn'));
  await sleep(10);
  check('进度明细弹层可打开', !!d.getElementById('stProgPop'));

  // 上次位置
  check('记录了上次阅读位置', !!w.localStorage.getItem('csp_sim:last'));

  sdom.window.close();
}

/* ─────────────────────────────────────────────
   首页「管理员」入口：noi/?admin=1
   只载 util.js + greeter.js，验证跳过开机与休眠、直接停在 NOIP 的密码框
   ───────────────────────────────────────────── */
async function testAdminDirect(){
  console.log('— 首页管理员直达（noi/?admin=1） —');
  const html = fs.readFileSync(path.join(ROOT, 'noi', 'index.html'), 'utf8');
  const adom = new JSDOM(html, {
    url: 'https://cspsim.test/noi/index.html?admin=1',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const w = adom.window, d = w.document;
  try {
    w.eval(['util.js', 'greeter.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n'));
  } catch (e){ errors.push('管理员直达脚本失败: ' + e.message); }
  await sleep(60);

  const gone = id => { const n = d.getElementById(id); return !!n && n.classList.contains('gone'); };
  check('管理员直达：跳过 Plymouth 开机画面', gone('boot'));
  check('管理员直达：跳过显示器休眠黑屏', gone('dpms'));
  check('管理员直达：GDM 已显示', !d.getElementById('gdm').classList.contains('hidden'));
  check('管理员直达：NOIP 账户已选中', d.getElementById('gdm').classList.contains('picking'));
  check('管理员直达：停在密码框', !d.getElementById('gdmAuth').classList.contains('hidden'));
  check('管理员直达：密码框对应 NOIP', /NOIP/.test(d.getElementById('gdmAuthUser').textContent));
  check('管理员直达：没有提前登录', d.getElementById('studentApp').classList.contains('hidden'));

  adom.window.close();
}
