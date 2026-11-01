/* 用 CDP 驱动真实 Chrome 截图：适合需要登录 / 异步加载 / 交互后的界面
 * 用法: node tools/shot.js <场景名> <输出png>
 * 场景定义在下面的 SCENES 里，每个场景是一段在页面里执行的 async 脚本。
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.resolve(__dirname, '..');
const PORT = 9333 + Math.floor(Math.random() * 200);
const URL = process.env.SHOT_URL || 'http://127.0.0.1:8899/noi/index.html';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 开机（Plymouth 3s）→ 唤醒显示器 → GDM 选账户 → 密码 → 桌面 */
const WAKE = `
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  await sleep(3700);
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: 12, clientY: 12 }));
  await sleep(80);
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: 180, clientY: 130 }));
  await sleep(950);
`;

const GDM = WAKE + `
  await sleep(300);
`;

const GDM_AUTH = WAKE + `
  document.querySelector('.gdm-user[data-account="csp-s2026"]').click();
  await sleep(420);
`;

const LOGIN = GDM + `
  document.querySelector('.gdm-user[data-account="csp-s2026"]').click();
  await sleep(260);
  document.getElementById('gdmPwd').value = 'csp2026';
  document.getElementById('gdmSubmit').click();
  // 等桌面就绪（隐藏测试点下载完、图标渲染出来）
  for (let i = 0; i < 90; i++){
    const ld = document.getElementById('globalLoading');
    if (document.querySelectorAll('.s-icon').length && ld && ld.classList.contains('hidden')) break;
    await sleep(150);
  }
  await sleep(350);
`;

const ADMIN = GDM + `
  document.querySelector('.gdm-user[data-account="NOIP"]').click();
  await sleep(260);
  document.getElementById('gdmPwd').value = 'noip2026';
  document.getElementById('gdmSubmit').click();
  for (let i = 0; i < 90; i++){
    const ld = document.getElementById('globalLoading');
    if (document.querySelectorAll('.s-icon').length && ld && ld.classList.contains('hidden')) break;
    await sleep(150);
  }
  await sleep(300);
  window.__app('admin');
  await sleep(700);
  return JSON.stringify({
    adminHidden: document.getElementById('adminApp').classList.contains('hidden'),
    adminDisplay: getComputedStyle(document.getElementById('adminApp')).display,
    deskDisplay: getComputedStyle(document.getElementById('studentApp')).display,
    topAtCenter: (() => { const e = document.elementFromPoint(innerWidth/2, innerHeight/2);
      return e ? (e.id || e.className || e.tagName) : null; })(),
  }, null, 1);
`;

const STUDY = `
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 150; i++){
    if (document.querySelector('#revHome .rh-card')) break;
    await sleep(150);
  }
  await sleep(400);
`;

const APP = name => `
  // 从「显示应用程序」网格启动（桌面不再摆启动器）
  Desktop.openAppGrid();
  { const gi = document.getElementById('sGridInput');
    gi.value = ${JSON.stringify(name)};
    gi.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#sGridBody .ub-grid-app').click(); }
  await sleep(450);
`;

const SCENES = {
  // 开机：Plymouth 启动画面
  ply: `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await sleep(200);
  `,

  // 显示器休眠（开机后、未唤醒）
  dpms: `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await sleep(4200);
  `,

  // GDM 账户选择
  gdm: GDM,

  // GDM 已选中账户、等密码
  gdmAuth: GDM_AUTH,

  // 管理员控制台
  admin: ADMIN,

  // polkit 认证框（学生账户点「软件」）
  polkit: LOGIN + `
    window.__app('software');
    await sleep(500);
  `,

  // 软件中心（认证通过后）
  software: LOGIN + `
    window.__app('software');
    await sleep(400);
    document.querySelectorAll('.pk-field input')[0].value = 'noip2026';
    document.querySelector('[data-k="ok"]').click();
    await sleep(700);
  `,

  // 设置（认证通过后）
  settings: LOGIN + `
    window.__app('settings');
    await sleep(400);
    document.querySelectorAll('.pk-field input')[0].value = 'noip2026';
    document.querySelector('[data-k="ok"]').click();
    await sleep(800);
  `,

  // LibreOffice Calc
  calc: LOGIN + `
    Desktop.launch('low');
    await sleep(600);
  `,

  desk: LOGIN,

  // 复习中心：模板速查板块
  tpl: STUDY + `
    document.querySelector('#revHome .rh-card[data-id="template"]').click();
    await sleep(400);
    const it = [...document.querySelectorAll('#revList .rev-item')].find(x => x.textContent.includes('并查集'));
    if (it) it.click();
    await sleep(350);
  `,

  // 复习中心：课程首页，滚到「模板速查」卡片
  revhome: STUDY + `
    const cards = document.querySelectorAll('#revHome .rh-card');
    const t = [...cards].find(c => c.textContent.includes('模板速查'));
    if (t) t.scrollIntoView({ block: 'center' });
    await sleep(350);
  `,

  // 尺寸探针：不关心截图，只量 DOM
  probe: LOGIN + `
    const r = el => { const b = el.getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height); };
    const out = {};
    out.viewport = window.innerWidth + 'x' + window.innerHeight;
    out.iconBox = r(document.querySelector('.s-icon'));
    out.icoSpan = r(document.querySelector('.s-icon .ico'));
    const svg = document.querySelector('.s-icon .ico svg');
    out.svgBox = r(svg);
    out.svgStyle = getComputedStyle(svg).width + '/' + getComputedStyle(svg).height;
    out.icoStyle = getComputedStyle(document.querySelector('.s-icon .ico')).width;
    out.lblBox = r(document.querySelector('.s-icon .lbl'));
    out.desktop = r(document.querySelector('.s-desktop'));
    out.colWidth = getComputedStyle(document.querySelector('.s-desktop')).columnWidth;
    out.dockItem = r(document.querySelector('.ub-dock-item'));
    out.dockSvg = r(document.querySelector('.ub-dock-item svg'));
    out.top = r(document.querySelector('.ub-top'));
    const ab = document.getElementById('sActBtn');
    const abg = getComputedStyle(ab);
    out.actBtn = r(ab) + ' bg=' + abg.backgroundColor + ' radius=' + abg.borderRadius;
    const tb = document.getElementById('sDock');
    out.dockBg = getComputedStyle(tb).backgroundColor;
    out.iconCount = document.querySelectorAll('.s-icon').length;
    return JSON.stringify(out, null, 1);
  `,

  // 窗口标题栏探针
  winprobe: LOGIN + APP('终端') + `
    const h = document.querySelector('.s-win-head');
    const t = h && h.querySelector('.win-title');
    if (!t) return 'no .win-title; head=' + (h ? h.innerHTML.slice(0, 300) : 'null');
    const cs = getComputedStyle(t), hb = h.getBoundingClientRect(), tb = t.getBoundingClientRect();
    return JSON.stringify({
      headHTML: h.innerHTML.slice(0, 200),
      head: Math.round(hb.left) + '..' + Math.round(hb.right) + ' w=' + Math.round(hb.width),
      title: Math.round(tb.left) + '..' + Math.round(tb.right),
      pos: cs.position, left: cs.left, transform: cs.transform, cls: t.className
    }, null, 1);
  `,

  // 应用网格（GNOME：点「活动」）
  grid: LOGIN + `
    document.getElementById('sActBtn').click();
    await sleep(320);
    const g = document.getElementById('sGrid');
    const inn = document.querySelector('.ub-grid-inner');
    const gb = g.getBoundingClientRect(), ib = inn.getBoundingClientRect();
    return JSON.stringify({
      grid: Math.round(gb.top)+'..'+Math.round(gb.bottom)+' h='+Math.round(gb.height),
      inner: Math.round(ib.top)+'..'+Math.round(ib.bottom)+' h='+Math.round(ib.height),
      gridCenter: Math.round((gb.top+gb.bottom)/2),
      innerCenter: Math.round((ib.top+ib.bottom)/2),
      display: getComputedStyle(g).display + '/' + getComputedStyle(inn).marginTop
    }, null, 1);
  `,

  // 程序回收系统：登录页
  rclogin: LOGIN + `
    Desktop.launch('recovery');
    await sleep(700);
  `,

  // 程序回收系统：登录后切到「答题」
  recovery: LOGIN + `
    Desktop.launch('recovery');
    await sleep(700);
    document.querySelector('#rcPwd').value = 'demo1234';
    document.querySelector('#rcLoginBtn').click();
    await sleep(500);
    [...document.querySelectorAll('.rc-nav a')].find(a => a.dataset.tab === 'answer').click();
    await sleep(400);
  `,

  // 顶栏系统菜单
  menu: LOGIN + `
    document.getElementById('sSysBtn').click();
    await sleep(220);
  `,

  terminal: LOGIN + APP('终端') + `
    const inp = document.querySelector('.term-input-row input');
    async function sh(cmd){
      inp.value = cmd;
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await sleep(320);
    }
    await sh('pwd');
    await sh('ls');
    await sh('cd queue');
    await sh('ls -l');
    await sh('cat queue1.in');
    await sh('tree ..');
    document.querySelector('.term').scrollTop = 0;
    await sleep(200);
  `,

  arbiter: LOGIN + APP('Arbiter_local') + `
    await sleep(300);
  `,

  // 全屏探针：配合 SHOT_CLICK=x,y 用可信点击触发 requestFullscreen
  fscheck: `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await sleep(300);
    return JSON.stringify({
      fullscreen: !!document.fullscreenElement,
      el: document.fullscreenElement ? document.fullscreenElement.tagName : null,
      size: window.innerWidth + 'x' + window.innerHeight,
      bootGone: (() => { const b = document.getElementById('boot'); return !!b && b.classList.contains('gone'); })(),
    }, null, 1);
  `,

  // 拖边缩放探针：真实浏览器里量窗口尺寸变化（jsdom 拿不到 offsetWidth）
  resizeprobe: LOGIN + `
    Desktop.launch('files');
    await sleep(1200);
    const w = document.querySelector('.s-win');
    const before = w.offsetWidth + 'x' + w.offsetHeight;
    const h = w.querySelector('.win-rs.se');
    const r = h.getBoundingClientRect();
    h.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.left + 3, clientY: r.top + 3 }));
    const moving = w.classList.contains('resizing');
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: r.left + 160, clientY: r.top + 120 }));
    await sleep(60);
    const during = w.offsetWidth + 'x' + w.offsetHeight;
    const frameAfterResize = document.querySelector('.nu-view').getBoundingClientRect().height|0;
    window.dispatchEvent(new MouseEvent('mouseup'));
    await sleep(60);
    return JSON.stringify({ before, during, moving, done: !w.classList.contains('resizing'),
      viewH: frameAfterResize, cursor: getComputedStyle(h).cursor }, null, 1);
  `,

  files: LOGIN + `
    const ic = [...document.querySelectorAll('.s-icon')].find(i => i.textContent.includes('teacher'));
    ic.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await sleep(520);
    document.querySelector('.nu-item[data-kind="folder"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await sleep(320);
  `,

  // 文件管理器载入中：外壳已出、视图区还是骨架
  filesLoading: LOGIN + `
    const ic = [...document.querySelectorAll('.s-icon')].find(i => i.textContent.includes('teacher'));
    ic.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await sleep(150);
    return JSON.stringify({
      headBar: !!document.querySelector('.s-win-head.head-bar'),
      crumbs: [...document.querySelectorAll('.nu-crumb')].map(b => b.textContent),
      skelCells: document.querySelectorAll('.nu-view .skel-cell').length,
      items: document.querySelectorAll('.nu-item').length,
      viewBg: getComputedStyle(document.querySelector('.nu-view')).backgroundColor,
    }, null, 1);
  `,

  // 浏览器连接中：身份位转圈 + 左下角状态面板
  firefoxLoading: LOGIN + `
    Desktop.launch('firefox');
    await sleep(1400);
    return JSON.stringify({
      busy: !!document.querySelector('.ff-ident.busy'),
      status: (document.querySelector('.ff-status') || {}).textContent,
      statusOut: (document.querySelector('.ff-status') || {}).className,
      pageText: (document.querySelector('.ff-page') || {}).textContent,
      barBg: getComputedStyle(document.querySelector('.ff-bar')).backgroundColor,
    }, null, 1);
  `,

  ide: LOGIN + APP('Code::Blocks') + `
    await sleep(4200);
    { const d = document.querySelector('.cbc-frame').contentDocument;
      const w = document.querySelector('.cbc-frame').contentWindow;
      const ta = d.getElementById('code');
      ta.value = [
        '#include <iostream>',
        '#include <cstdio>',
        'using namespace std;',
        '',
        'const int N = 200005;',
        'int q[N], head = 0, tail = 0;',
        '',
        'int main() {',
        '    freopen("queue.in", "r", stdin);',
        '    freopen("queue.out", "w", stdout);',
        '    int n, m;',
        '    cin >> n >> m;',
        '    for (int i = 1; i <= n; ++i) {',
        '        int op, x;',
        '        cin >> op;',
        '        if (op == 1) { cin >> x; q[tail++] = x; }',
        '        else if (op == 2) { if (head < tail) ++head; }',
        '        else { cout << (head < tail ? q[head] : -1) << "\\\\n"; }',
        '    }',
        '    return 0;',
        '}',
      ].join('\\n');
      ta.dispatchEvent(new w.Event('input', { bubbles: true }));
      ta.setSelectionRange(ta.value.indexOf('int op, x;') + 4, ta.value.indexOf('int op, x;') + 4);
      ta.dispatchEvent(new w.Event('keyup', { bubbles: true })); }
    await sleep(600);
  `,

  // Code::Blocks 内嵌编辑区探针：量行高/行号/配色，不靠看图猜
  cbcprobe: LOGIN + APP('Code::Blocks') + `
    await sleep(4200);
    const d = document.querySelector('.cbc-frame').contentDocument;
    const w = document.querySelector('.cbc-frame').contentWindow;
    const bg = sel => { const e = d.querySelector(sel); if (!e) return 'none';
      return w.getComputedStyle(e).backgroundColor + ' ' + Math.round(e.getBoundingClientRect().height); };
    const kw = d.querySelector('.c-kw');
    return JSON.stringify({
      stdin: bg('#stdin'), output: bg('#output'), artifact: bg('#artifact'),
      paneCode: bg('#paneCode'), paneIO: bg('#paneIO'), paneArtifact: bg('#paneArtifact'),
      outputSel: bg('.io-output'),
      kwColor: kw ? w.getComputedStyle(kw).color : 'no .c-kw',
      kwCount: d.querySelectorAll('.c-kw').length,
      strCount: d.querySelectorAll('.c-str').length,
      comCount: d.querySelectorAll('.c-com').length,
    }, null, 1);
  `,

  // 启动中：Dock 上的转圈 + 光标忙碌态（窗口还没出来）
  launching: LOGIN + `
    Desktop.openAppGrid();
    { const gi = document.getElementById('sGridInput');
      gi.value = 'Firefox';
      gi.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#sGridBody .ub-grid-app').click(); }
    await sleep(420);
    return JSON.stringify({
      items: [...document.querySelectorAll('.ub-dock-item')].map(b => {
        const r = b.getBoundingClientRect();
        return b.dataset.app + ' y=' + Math.round(r.top) + ' h=' + Math.round(r.height) + ' cls=' + b.className;
      }),
      wins: document.querySelectorAll('.s-win').length,
      bodyLaunching: document.getElementById('studentApp').classList.contains('launching'),
      cursor: getComputedStyle(document.querySelector('.s-desktop')).cursor,
    }, null, 1);
  `,

  emacs: LOGIN + `
    Desktop.launch('emacs');
    await sleep(600);
  `,

  // joe：真机界面（顶部反显状态行 + ^KH 键位表）
  joe: LOGIN + APP("Joe's Own Editor") + `
    await sleep(900);
  `,

  joehelp: LOGIN + APP("Joe's Own Editor") + `
    await sleep(700);
    document.querySelector('.joe-help') || document.querySelector('.joe-ta').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'h', ctrlKey: true, bubbles: true }));
    await sleep(350);
  `,

  gdb: LOGIN + `
    Desktop.launch('gdb');
    await sleep(400);
    const inp = document.querySelector('.term-input-row input');
    async function sh(cmd){
      inp.value = cmd;
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await sleep(300);
    }
    await sh('list');
    await sh('break 8');
    await sh('run');
  `,

  firefox: LOGIN + `
    Desktop.launch('firefox');
    await sleep(2400);
  `,

  // ── 按 ISO 补的 8 个应用 ──
  // GNOME 计算器 3.36（注意：上面那个 calc 是 LibreOffice Calc）
  gnomecalc: LOGIN + `
    Desktop.launch('calculator');
    await sleep(700);
  `,

  // gedit 3.36
  gedit: LOGIN + `
    Desktop.launch('gedit');
    await sleep(900);
    const ta = document.querySelector('.ged-area');
    ta.value = '#include <iostream>\\nusing namespace std;\\n\\nint main() {\\n    int a, b;\\n' +
      '    cin >> a >> b;\\n    cout << a + b << endl;\\n    return 0;\\n}\\n';
    ta.selectionStart = ta.selectionEnd = ta.value.length;
    ta.dispatchEvent(new Event('click', { bubbles: true }));
    await sleep(250);
  `,

  // VS Code 1.44
  vscode: LOGIN + `
    Desktop.launch('vscode');
    await sleep(1900);
    const ta = document.querySelector('.ce-ta');
    ta.value = '#include <iostream>\\n#include <queue>\\nusing namespace std;\\n\\n' +
      'const int N = 1e5 + 5;\\nint main() {\\n    // 滑动窗口最大值\\n    int n, k;\\n    ' +
      'cin >> n >> k;\\n    deque<int> q;\\n    for (int i = 0; i < n; i++) {\\n        int x;\\n' +
      '        cin >> x;\\n        while (!q.empty() && q.back() < x) q.pop_back();\\n' +
      '        q.push_back(x);\\n    }\\n    cout << q.front() << endl;\\n    return 0;\\n}\\n';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(250);
  `,

  // Sublime Text 3.2
  sublime: LOGIN + `
    Desktop.launch('sublime');
    await sleep(1100);
    const ta = document.querySelector('.ce-ta');
    ta.value = '#include <cstdio>\\n\\nint f(int n) {\\n    return n <= 1 ? n : f(n - 1) + f(n - 2);\\n}\\n\\n' +
      'int main() {\\n    int n;\\n    scanf("%d", &n);\\n    printf("%d\\\\n", f(n));\\n    return 0;\\n}\\n';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(250);
  `,

  // Vim 8.1（普通模式，反显状态行 + 空行波浪号）
  vim: LOGIN + `
    Desktop.launch('vim');
    await sleep(1000);
  `,

  // Midnight Commander 4.8
  mc: LOGIN + `
    Desktop.launch('mc');
    await sleep(1000);
  `,

  // MC 尺寸探针：只量 DOM，不截图（面板列数/行数是否真的铺满）
  mcprobe: LOGIN + `
    Desktop.launch('mc');
    await sleep(1000);
    const box = document.querySelector('.mc');
    const ps = [...document.querySelectorAll('.mc-p')];
    const cont = ps[0].parentNode;
    const r = e => { const bb = e.getBoundingClientRect(); return Math.round(bb.left) + '..' + Math.round(bb.right) + ' w=' + Math.round(bb.width); };
    return JSON.stringify({
      boxClientW: box.clientWidth, contH: cont.clientHeight,
      panels: ps.map(r), pStyleW: ps.map(p => p.style.width),
      rows: ps.map(p => p.querySelectorAll('.mc-row[data-r]').length),
      fitH: ps[0].scrollHeight, fitW: cont.scrollWidth,
    }, null, 1);
  `,

  // 归档管理器 file-roller 3.36
  archive: LOGIN + `
    Desktop.launch('archive');
    await sleep(1000);
  `,

  // 文档查看器 Evince 3.36
  evince: LOGIN + `
    Desktop.launch('evince');
    await sleep(1100);
  `,
};

function connect(wsUrl){
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let seq = 0;
    ws.onopen = () => resolve({
      send(method, params){
        return new Promise((res, rej) => {
          const id = ++seq;
          pending.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method, params: params || {} }));
        });
      },
      close(){ try { ws.close(); } catch (e) {} },
    });
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (!msg.id) return;
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.rej(new Error(msg.error.message));
      else p.res(msg.result);
    };
    ws.onerror = e => reject(new Error('ws error'));
  });
}

(async function main(){
  const scene = process.argv[2] || 'desk';
  const out = process.argv[3] || ('/tmp/shot-' + scene + '.png');
  const script = SCENES[scene];
  if (!script){ console.error('未知场景:', scene, '可用:', Object.keys(SCENES).join(', ')); process.exit(1); }

  const profile = '/tmp/cdp-prof-' + process.pid;
  const proc = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-crash-reporter', '--hide-scrollbars', '--mute-audio',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
    '--window-size=1440,900', 'about:blank',
  ], { stdio: 'ignore' });

  try{
    let list = null;
    for (let i = 0; i < 40; i++){
      await sleep(250);
      try {
        const r = await fetch('http://127.0.0.1:' + PORT + '/json/list');
        list = await r.json();
        if (list && list.find(t => t.type === 'page')) break;
      } catch (e) {}
    }
    if (!list) throw new Error('无法连接 Chrome');
    const page = list.find(t => t.type === 'page');
    const cdp = await connect(page.webSocketDebuggerUrl);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    await cdp.send('Page.navigate', { url: URL });
    await sleep(2000);

    /* 全屏只能靠「真正的用户手势」触发，Runtime.evaluate 里的合成点击不算，
       所以这里用 Input.dispatchMouseEvent 发可信事件（SHOT_CLICK=x,y） */
    if (process.env.SHOT_CLICK){
      await sleep(Number(process.env.SHOT_CLICK_WAIT || 2400));
      const [cx, cy] = process.env.SHOT_CLICK.split(',').map(Number);
      for (const type of ['mousePressed', 'mouseReleased']){
        await cdp.send('Input.dispatchMouseEvent', { type, x: cx, y: cy, button: 'left', clickCount: 1 });
      }
      await sleep(700);
    }

    const r = await cdp.send('Runtime.evaluate', {
      expression: '(async () => {' + script + '})()',
      awaitPromise: true,
      returnByValue: true,
      timeout: 90000,
    });
    if (r.exceptionDetails){
      console.error('页面脚本异常:', JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    }
    // SHOT_LOG=1 时打印场景脚本的返回值（用于量尺寸 / 取文本，不必看图猜）
    if (process.env.SHOT_LOG && r.result && r.result.value !== undefined){
      console.log(typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value, null, 1));
    }
    // SHOT_SETTLE=0 时立刻截图（看「载入中」这类瞬时状态必须关掉这段等待）
    const settle = process.env.SHOT_SETTLE == null ? 400 : Number(process.env.SHOT_SETTLE);
    if (settle) await sleep(settle);

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.log(out, fs.statSync(out).size, 'bytes');
    cdp.close();
  } finally {
    try { proc.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }
})();
