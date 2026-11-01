/* 编辑器内嵌态（?ui=cbc）的对外上报：光标行列位置
 *
 * ide.html 自己的状态栏在 CBC 模式下是隐藏的，行列信息由父窗口的
 * Code::Blocks 外壳状态栏显示，所以把选区变化报上去。 */
(function(){
  if (!document.body || !document.body.classList.contains('cbc')) return;
  const code = document.getElementById('code');
  if (!code) return;

  let last = '';
  function report(){
    const v = code.value || '';
    const p = code.selectionStart || 0;
    const head = v.slice(0, p);
    const line = head.split('\n').length;
    const col = p - head.lastIndexOf('\n');
    const key = line + ':' + col;
    if (key === last) return;          // 避免每次按键都发一条
    last = key;
    try { parent.postMessage({ type: 'ide:caret', line: line, col: col }, '*'); } catch (e){}
  }

  ['keyup', 'keydown', 'mouseup', 'input', 'select', 'focus'].forEach(ev => {
    code.addEventListener(ev, () => setTimeout(report, 0));
  });
  document.addEventListener('selectionchange', report);
  setTimeout(report, 400);
})();
