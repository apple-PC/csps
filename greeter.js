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

  const AVATAR =
    '<svg viewBox="0 0 64 64">' +
    '<circle cx="32" cy="23.5" r="11" fill="#e8e8e8"/>' +
    '<path d="M10.5 62c1.8-13 11-20.5 21.5-20.5S51.7 49 53.5 62z" fill="#e8e8e8"/>' +
    '</svg>';

  const $gdm = () => $('#gdm');
  const $dpms = () => $('#dpms');

  let picked = null;
  let busy = false;
  let wakeBound = false;

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

  /* ---------- 绑定 ---------- */
  function init(){
    bindWake();
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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { show, lock, powerOff, accounts: ACCOUNTS, adminPwd: 'noip2026' };
})();

/* 暴露到 window：desktop.js 的 polkit 认证要核对管理员密码 */
window.Greeter = Greeter;
