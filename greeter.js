/* GDM 登录（Ubuntu 20.04 账户选择）
 *
 * 还原考场开机流程：
 *   显示器休眠（DPMS off，全黑）→ 考生动鼠标 / 按键唤醒 →
 *   GDM 显示账户选择（csp-j2026 / csp-s2026 / NOIP）→ 输入密码 → 进入桌面。
 *
 * NOIP 是管理员账户：登录后桌面多出「考试管理」入口，
 * 且系统内安装应用、更改网络设置不再需要二次认证。
 */
'use strict';

const Greeter = (() => {
  /* 考点账户：学生两个组别 + 管理员一个 */
  const ACCOUNTS = [
    { id: 'csp-j2026', role: 'student', group: 'j', label: 'CSP-J 2026', pwd: 'csp2026' },
    { id: 'csp-s2026', role: 'student', group: 's', label: 'CSP-S 2026', pwd: 'csp2026' },
    { id: 'NOIP',      role: 'admin',   group: '',  label: '管理员',     pwd: 'noip2026' },
  ];

  /* 真实默认头像：/usr/share/icons/Yaru/scalable/status/avatar-default-symbolic.svg
     的路径原样搬过来（16×16 viewBox），symbolic 图标在 GDM 里按前景色着色 */
  const AVATAR =
    '<svg viewBox="0 0 16 16" fill="#e8e8e8">' +
    '<path d="M8 2a2.84 2.84 0 0 0-1.12.221c-.345.141-.651.348-.906.615v.003l-.001.002c-.248.269-.44.592-.574.96-.137.367-.203.769-.203 1.2 0 .435.065.841.203 1.209.135.361.327.68.574.95l.001.002c.254.267.558.477.901.624v.003c.346.141.723.21 1.12.21.395 0 .77-.069 1.117-.21v-.002c.343-.147.644-.357.892-.625.255-.268.45-.59.586-.952.138-.368.204-.774.204-1.21h.01c0-.43-.065-.831-.203-1.198a2.771 2.771 0 0 0-.585-.963 2.5 2.5 0 0 0-.897-.618A2.835 2.835 0 0 0 7.999 2z"/>' +
    '<path d="M8.024 10.002c-2.317 0-3.561.213-4.486.91-.462.35-.767.825-.939 1.378-.172.553-.226.975-.228 1.71L8 14.002h5.629c-.001-.736-.052-1.159-.225-1.712-.172-.553-.477-1.027-.94-1.376-.923-.697-2.124-.912-4.44-.912z"/>' +
    '</svg>';

  const $gdm = () => $('#gdm');
  const $dpms = () => $('#dpms');
  const $boot = () => $('#boot');

  /* 首页的「管理员」入口带 ?admin=1：跳过开机与休眠，直接把 NOIP 账户摆在密码框前 */
  const ADMIN_DIRECT = /[?&]admin=1(?:&|$)/.test(location.search);

  let picked = null;
  let busy = false;
  let wakeBound = false;
  let fsBound = false;

  /* ---------- 全屏 ----------
   * 浏览器只认「用户手势」里的 requestFullscreen，而唤醒是靠 mousemove（不算手势），
   * 所以这里等第一次真正的点击 / 按键再请求一次；loginAs 里那次是兜底。 */
  function armFullscreen(){
    if (fsBound) return;
    fsBound = true;
    const go = () => {
      tryFullscreen();
      window.removeEventListener('mousedown', go, true);
      window.removeEventListener('keydown', go, true);
    };
    window.addEventListener('mousedown', go, true);
    window.addEventListener('keydown', go, true);
  }
  function tryFullscreen(){
    const elx = document.documentElement;
    if (!document.fullscreenElement && elx.requestFullscreen){
      elx.requestFullscreen().catch(() => {});
    }
  }

  /* ---------- 时钟 ---------- */
  function paintClock(){
    const d = new Date();
    const t = $('#gdmTime'), dt = $('#gdmDate');
    if (t) t.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (dt){
      dt.textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' +
        '日一二三四五六'[d.getDay()];
    }
  }

  /* ---------- 账户列表 ---------- */
  function renderUsers(){
    const box = $('#gdmUsers');
    if (!box) return;
    box.innerHTML = ACCOUNTS.map(a =>
      '<button class="gdm-user" data-account="' + a.id + '">' +
      '<span class="gdm-avatar">' + AVATAR + '</span>' +
      '<span class="gdm-name">' + esc(a.id) + '</span>' +
      (a.role === 'admin' ? '<span class="gdm-role">管理员</span>' : '') +
      '</button>').join('');
    box.querySelectorAll('.gdm-user').forEach(b => {
      b.onclick = () => pick(b.dataset.account);
    });
  }

  /* ---------- 选中账户 → 密码 ---------- */
  function pick(id){
    const acc = ACCOUNTS.find(a => a.id === id);
    if (!acc || busy) return;
    picked = acc;
    $gdm().classList.add('picking');
    $('#gdmAuth').classList.remove('hidden');
    $('#gdmAuthUser').innerHTML =
      '<span class="gdm-avatar">' + AVATAR + '</span>' +
      '<span class="gdm-auth-name">' + esc(acc.id) + '</span>';
    const msg = $('#gdmMsg');
    if (msg) msg.textContent = '';
    const pw = $('#gdmPwd');
    if (pw){ pw.value = ''; pw.placeholder = '密码'; setTimeout(() => pw.focus(), 60); }
  }

  function unpick(){
    if (busy) return;
    picked = null;
    $gdm().classList.remove('picking');
    $('#gdmAuth').classList.add('hidden');
    const pw = $('#gdmPwd');
    if (pw) pw.value = '';
    const msg = $('#gdmMsg');
    if (msg) msg.textContent = '';
  }

  /* ---------- 提交密码 ---------- */
  function submit(){
    if (!picked || busy) return;
    const pwEl = $('#gdmPwd');
    const value = pwEl ? pwEl.value : '';
    const msg = $('#gdmMsg');
    const field = $('#gdmField');

    if (!value){
      if (msg) msg.textContent = '请输入密码';
      shake(field);
      return;
    }
    if (value !== picked.pwd){
      if (msg) msg.textContent = '密码错误，请重试';
      if (pwEl) pwEl.value = '';
      shake(field);
      return;
    }

    busy = true;
    if (msg) msg.textContent = '';
    if (field) field.style.visibility = 'hidden';
    const stage = $gdm().querySelector('.gdm-stage');
    if (stage) stage.insertAdjacentHTML('beforeend', '<div class="gdm-wait" id="gdmWait"><i></i></div>');

    const account = picked;
    setTimeout(() => {
      /* 淡出 GDM，交给 Student 进入桌面 */
      $gdm().classList.add('fading');
      setTimeout(() => {
        $gdm().classList.add('hidden');
        $gdm().classList.remove('fading', 'picking');
        const w = $('#gdmWait');
        if (w) w.remove();
        if (field) field.style.visibility = '';
        busy = false;
        Student.loginAs(account);
      }, 430);
    }, 480);
  }

  function shake(node){
    if (!node) return;
    node.classList.remove('shake');
    void node.offsetWidth;      // 重排以重启动画
    node.classList.add('shake');
    setTimeout(() => node.classList.remove('shake'), 460);
  }

  /* ---------- 显示器休眠 → 唤醒 ---------- */
  function bindWake(){
    if (wakeBound) return;
    wakeBound = true;

    let armedAt = Date.now();
    let origin = null;

    const wake = () => {
      if (!$dpms() || $dpms().classList.contains('awake')) return;
      $dpms().classList.add('awake');
      show();
      tryFullscreen();
      setTimeout(() => { if ($dpms()) $dpms().classList.add('gone'); }, 560);
      detach();
    };
    const onMove = e => {
      /* 鼠标一开始就在动的话，要求真的移动一段距离才算唤醒 */
      if (Date.now() - armedAt < 220) return;
      const x = e.clientX, y = e.clientY;
      if (!origin){ origin = { x, y }; return; }
      if (Math.abs(x - origin.x) + Math.abs(y - origin.y) > 14) wake();
    };
    const onOther = () => wake();

    function detach(){
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onOther);
      window.removeEventListener('keydown', onOther);
      window.removeEventListener('touchstart', onOther);
      window.removeEventListener('wheel', onOther);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onOther);
    window.addEventListener('keydown', onOther);
    window.addEventListener('touchstart', onOther);
    window.addEventListener('wheel', onOther);

    /* 黑屏保持一会儿再给提示，避免一进来就以为页面坏了 */
    setTimeout(() => {
      const h = $('#dpmsHint');
      if (h && $dpms() && !$dpms().classList.contains('awake')) h.classList.add('show');
    }, 2600);
  }

  /* ---------- 对外 ---------- */
  function show(){
    const g = $gdm();
    if (!g) return;
    g.classList.remove('hidden', 'fading', 'picking');
    $('#gdmAuth').classList.add('hidden');
    picked = null;
    busy = false;
    renderUsers();
    paintClock();
    if (!show._timer) show._timer = setInterval(paintClock, 1000);
  }

  /* 注销 / 交卷后回到登录界面（不黑屏，直接给账户列表） */
  function lock(){
    const d = $dpms();
    if (d){ d.classList.add('gone', 'awake'); }
    show();
  }

  /* 关机：回到黑屏，再动鼠标就是重新唤醒 */
  function powerOff(){
    const g = $gdm();
    if (g) g.classList.add('hidden');
    const d = $dpms();
    if (d){
      d.classList.remove('gone', 'awake');
      const h = $('#dpmsHint');
      if (h) h.classList.remove('show');
      setTimeout(() => { if (h) h.classList.add('show'); }, 1600);
      wakeBound = false;
      bindWake();
    }
  }

  /* ---------- 开机画面上的加载状态 ----------
   * 评测数据（problem-tests.js）的下载统一展示在这张 Plymouth 上：
   * logo 与五点照常转，下方一行小字报进度，全部就绪后才淡出进 GDM。
   * Student 侧通过 window.BootScreen 在下载各阶段调用 text()。 */
  function plyText(t){
    const b = $boot();
    if (!b) return;
    let n = b.querySelector('.ply-status');
    if (!n) return;
    if (t){ n.textContent = t; n.classList.remove('hidden'); }
    else n.classList.add('hidden');
  }
  const BootScreen = { text: plyText };
  window.BootScreen = BootScreen;

  /* ---------- 开机：Plymouth 启动画面 → 显示器休眠黑屏 ----------
   * 真机流程：固件 → GRUB 一闪 → Plymouth（Ubuntu logo + 五点）→ GDM。
   * 考场的显示器此时处于 DPMS off，所以 Plymouth 之后屏幕是黑的，动鼠标才亮。
   * 模拟器把评测数据下载也放进这张画面：最短停 BOOT_MS，
   * 同时等 Student 侧的数据闸门（window.__BOOT_GATE）就绪。 */
  const BOOT_MS = 3000;

  function bootThenSleep(){
    const b = $boot();
    if (!b){ bindWake(); armFullscreen(); return; }
    const minWait = new Promise(r => setTimeout(r, BOOT_MS));
    const dataWait = Promise.resolve(window.__BOOT_GATE).catch(() => {});
    Promise.all([minWait, dataWait]).then(() => {
      plyText(null);
      b.classList.add('out');
      setTimeout(() => {
        b.classList.add('gone');
        bindWake();
        armFullscreen();
      }, 460);
    });
  }

  /* ---------- 绑定 ---------- */
  function init(){
    const pw = $('#gdmPwd');
    if (pw){
      pw.addEventListener('keydown', e => {
        if (e.key === 'Enter'){ e.preventDefault(); submit(); }
        else if (e.key === 'Escape'){ e.preventDefault(); unpick(); }
      });
    }
    const go = $('#gdmSubmit');
    if (go) go.onclick = submit;
    const back = $('#gdmBack');
    if (back) back.onclick = unpick;
    const power = $('#gdmPower');
    if (power) power.onclick = powerOff;

    if (ADMIN_DIRECT){
      /* 管理员直达：不演开机，不开黑屏，直接停在 NOIP 的密码框 */
      const b = $boot(); if (b) b.classList.add('gone');
      const d = $dpms(); if (d) d.classList.add('gone');
      lock();
      pick('NOIP');
      armFullscreen();
    } else {
      bootThenSleep();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { show, lock, powerOff, accounts: ACCOUNTS, adminPwd: 'noip2026' };
})();

/* 暴露到 window：desktop.js 的 polkit 认证要核对管理员密码；
   BootScreen 已在上面的闭包里挂到 window，供 student.js 报下载进度 */
window.Greeter = Greeter;
