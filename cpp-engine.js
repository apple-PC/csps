/* ============================================================
   cpp-engine.js —— CSP-S 可用的 C++ 子集解释引擎
   ------------------------------------------------------------
   设计目标：不是"玩具解释器"，而是"能把一道真正的复赛题跑对"。
     · 真预处理：#include / #define（对象宏）/ #pragma / 条件编译
     · 真类型：int 32 位环绕、long long 53 位安全整数、char、double、bool、string
     · 真语义：引用参数、数组指针退化、迭代器、运算符重载、构造/析构
     · 真 STL：vector / pair / map / set / multiset / queue / stack /
               deque / priority_queue / string / sort / stable_sort /
               lower_bound / upper_bound / unique / reverse / accumulate
   对外 API：
     CppEngine.compile(src)  -> program（失败抛 CompileError，带行号）
     CppEngine.run(program, input, opts) -> { output, error, verdict, ms }
     CppEngine.judge(program, cases, opts) -> [{ verdict, ms, output, error }]
   ============================================================ */
(function (global) {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     0. 错误类型
     ══════════════════════════════════════════════════════════ */
  function CppError(msg, line, kind) {
    const e = new Error(msg);
    e.cppLine = line || 0;
    e.kind = kind || 'CE';
    return e;
  }
  function rt(msg, line) {
    const e = new Error(msg);
    e.kind = 'RE';
    e.cppLine = line || 0;
    return e;
  }

  /* ══════════════════════════════════════════════════════════
     1. 注释剥离（保留换行与行号，字符串原样保留）
     ══════════════════════════════════════════════════════════ */
  function stripComments(src) {
    const out = [];
    let i = 0, n = src.length;
    while (i < n) {
      const c = src[i];
      if (c === '"' || c === "'") {
        const q = c;
        out.push(c); i++;
        while (i < n) {
          if (src[i] === '\\') { out.push(src[i], src[i + 1] || ''); i += 2; continue; }
          out.push(src[i]);
          if (src[i] === q) { i++; break; }
          i++;
        }
        continue;
      }
      if (c === '/' && src[i + 1] === '/') {
        while (i < n && src[i] !== '\n') { out.push(' '); i++; }
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
          out.push(src[i] === '\n' ? '\n' : ' ');
          i++;
        }
        i += 2;
        out.push('  ');
        continue;
      }
      out.push(c);
      i++;
    }
    return out.join('');
  }

  /* ══════════════════════════════════════════════════════════
     2. 预处理
     ══════════════════════════════════════════════════════════ */
  const PREDEFINED = {
    __cplusplus: '201402L',
    __NOI_LINUX__: '1',
    ONLINE_JUDGE: '1',
  };

  function preprocess(rawSrc) {
    const src = stripComments(rawSrc);
    const macros = Object.create(null);
    for (const k in PREDEFINED) macros[k] = PREDEFINED[k];

    const lines = src.split('\n');
    const kept = [];
    // 条件编译栈：{active:boolean, taken:boolean, parentActive:boolean}
    const cond = [];

    const active = () => cond.every(c => c.active);

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const m = line.match(/^\s*#\s*([a-zA-Z_]+)\s*(.*)$/);
      if (!m) { if (active()) kept.push(line); else kept.push(''); continue; }

      const dir = m[1];
      const rest = m[2].trim();

      if (dir === 'ifdef' || dir === 'ifndef' || dir === 'if') {
        let v = false;
        if (dir === 'ifdef') v = rest in macros;
        else if (dir === 'ifndef') v = !(rest in macros);
        else v = evalIfExpr(rest.replace(/defined\s*\(\s*(\w+)\s*\)/g, (_, k) => (k in macros ? '1' : '0')), macros);
        cond.push({ active: v, taken: v, parentActive: active() });
        kept.push('');
        continue;
      }
      if (dir === 'elif' || dir === 'else') {
        const top = cond[cond.length - 1];
        if (top && !top.taken) {
          const v = dir === 'else' ? true : evalIfExpr(rest, macros);
          top.active = v; top.taken = top.taken || v;
        } else if (top) top.active = false;
        kept.push('');
        continue;
      }
      if (dir === 'endif') { cond.pop(); kept.push(''); continue; }

      if (!active()) { kept.push(''); continue; }

      if (dir === 'define') {
        const dm = rest.match(/^([A-Za-z_]\w*)(\()?([\s\S]*)$/);
        if (dm && !dm[2]) {
          macros[dm[1]] = (dm[3] || '').trim();
        } else if (dm && dm[2]) {
          // 函数式宏：保守处理，% 宏名登记为空以免被当成变量名
          const p = rest.match(/^([A-Za-z_]\w*)\s*\(([^)]*)\)\s*([\s\S]*)$/);
          if (p) macros['__fnmacro__' + p[1]] = p[3].trim();
        }
        kept.push('');
        continue;
      }
      // include / pragma / undef / line / error …… 一律丢弃
      kept.push('');
    }

    return { src: kept.join('\n'), macros };
  }

  function evalIfExpr(expr, macros) {
    let s = String(expr).replace(/[A-Za-z_]\w*/g, k => (k in macros && /^-?\d+$/.test(macros[k]) ? macros[k] : '0'));
    s = s.replace(/&&/g, '&&').replace(/\|\|/g, '||').replace(/!(?!=)/g, '!');
    if (!/^[\s\d+\-*/%()<>=!&|]*$/.test(s)) return false;
    try { return !!Function('"use strict";return (' + s + ')')(); } catch (e) { return false; }
  }

  /* ══════════════════════════════════════════════════════════
     3. 词法
     ══════════════════════════════════════════════════════════ */
  const OPS3 = ['<<=', '>>=', '...', '->*'];
  const OPS2 = ['<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '++', '--',
    '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '::', '->', '##'];

  function lex(src) {
    const toks = [];
    let i = 0, line = 1, n = src.length;
    const push = (t, v) => toks.push({ t, v, line });

    while (i < n) {
      const c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }

      // 数字
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        const start = i;
        let isFloat = false;
        if (c === '0' && /[xX]/.test(src[i + 1] || '')) {
          i += 2;
          while (i < n && /[0-9a-fA-F]/.test(src[i])) i++;
          while (i < n && /[uUlL]/.test(src[i])) i++;
          const raw = src.slice(start, i).replace(/[uUlL]+$/, '');
          push('num', parseInt(raw, 16));
          continue;
        }
        if (c === '0' && /[bB]/.test(src[i + 1] || '')) {
          i += 2;
          while (i < n && /[01]/.test(src[i])) i++;
          while (i < n && /[uUlL]/.test(src[i])) i++;
          const raw = src.slice(start, i).replace(/[uUlL]+$/, '');
          push('num', parseInt(raw.slice(2), 2));
          continue;
        }
        while (i < n && /[0-9]/.test(src[i])) i++;
        if (src[i] === '.') { isFloat = true; i++; while (i < n && /[0-9]/.test(src[i])) i++; }
        if (/[eE]/.test(src[i] || '')) {
          isFloat = true; i++;
          if (/[+-]/.test(src[i] || '')) i++;
          while (i < n && /[0-9]/.test(src[i])) i++;
        }
        const raw = src.slice(start, i);
        let suf = '';
        while (i < n && /[uUlLfF]/.test(src[i])) { suf += src[i]; i++; }
        const isHex = /^0[xX]/.test(raw);
        let val = isFloat ? parseFloat(raw) : (/^0[0-7]+$/.test(raw) ? parseInt(raw, 8) : parseInt(raw, 10));
        push('num', val);
        const last = toks[toks.length - 1];
        last.suffix = suf;
        last.isFloat = isFloat || /[fF]$/.test(suf);
        void isHex;
        continue;
      }

      // 字符串
      if (c === '"') {
        i++;
        let s = '';
        while (i < n && src[i] !== '"') {
          if (src[i] === '\\') { s += unescapeChar(src, i); i += (src[i + 1] === 'x' ? 4 : (src[i + 1] === 'u' ? 6 : 2)); continue; }
          s += src[i++];
        }
        i++;
        push('str', s);
        continue;
      }
      // 字符
      if (c === "'") {
        i++;
        let s = '';
        if (src[i] === '\\') { s = unescapeChar(src, i); i += (src[i + 1] === 'x' ? 4 : (src[i + 1] === 'u' ? 6 : 2)); }
        else { s = src[i]; i++; }
        if (src[i] === "'") i++;
        push('chr', s.charCodeAt(0) | 0);
        continue;
      }
      // 标识符 / 关键字
      if (/[A-Za-z_$]/.test(c)) {
        const start = i;
        while (i < n && /[A-Za-z0-9_$]/.test(src[i])) i++;
        push('id', src.slice(start, i));
        continue;
      }
      // 运算符
      const three = src.substr(i, 3);
      if (OPS3.indexOf(three) >= 0) { push('op', three); i += 3; continue; }
      const two = src.substr(i, 2);
      if (OPS2.indexOf(two) >= 0) { push('op', two); i += 2; continue; }
      push('op', c);
      i++;
    }
    push('eof', '<eof>');
    return toks;
  }

  function unescapeChar(src, i) {
    const e = src[i + 1];
    switch (e) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case '0': return '\0';
      case 'a': return '\x07';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'v': return '\v';
      case '\\': return '\\';
      case "'": return "'";
      case '"': return '"';
      case '?': return '?';
      case 'x': {
        const h = src.substr(i + 2, 2).replace(/[^0-9a-fA-F]/g, '');
        return h ? String.fromCharCode(parseInt(h, 16)) : '';
      }
      case 'u': {
        const h = src.substr(i + 2, 4).replace(/[^0-9a-fA-F]/g, '');
        return h ? String.fromCharCode(parseInt(h, 16)) : '';
      }
      default: return e || '';
    }
  }

  /* 宏展开：对 token 流做一遍对象宏替换 */
  function expandMacros(toks, macros, depth) {
    if (depth > 24) return toks;
    const out = [];
    let changed = false;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.t === 'id' && Object.prototype.hasOwnProperty.call(macros, t.v)) {
        const rep = String(macros[t.v]);
        if (!rep) continue;
        const sub = lex(rep);
        sub.pop(); // eof
        sub.forEach(x => { x.line = t.line; });
        out.push.apply(out, sub);
        changed = true;
      } else out.push(t);
    }
    return changed ? expandMacros(out, macros, depth + 1) : out;
  }

  /* ══════════════════════════════════════════════════════════
     4. 类型工具
     ══════════════════════════════════════════════════════════ */
  const INT_TYPES = { int: 1, unsigned: 1, 'unsigned int': 1, short: 1, 'short int': 1, long: 1, 'long int': 1, size_t: 1, ptrdiff_t: 1 };
  const LONG_TYPES = { 'long long': 1, 'long long int': 1, 'unsigned long long': 1, 'unsigned long long int': 1, ll: 1 };
  const FLOAT_TYPES = { double: 1, float: 1, 'long double': 1 };

  function isIntType(t) { return !!INT_TYPES[t] || t === 'char' || t === 'bool' || t === 'signed char' || t === 'unsigned char'; }
  function isLongType(t) { return !!LONG_TYPES[t]; }
  function isFloatType(t) { return !!FLOAT_TYPES[t]; }
  function isStringType(t) { return t === 'string' || t === 'std::string'; }

  function normType(t) {
    if (!t) return 'int';
    t = String(t).replace(/\bstd\s*::\s*/g, '').trim();
    t = t.replace(/::\s*(const_)?iterator\s*$/, '');
    t = t.replace(/::\s*(const_)?reverse_iterator\s*$/, '');
    t = t.replace(/\s+/g, ' ');
    const map = {
      'long long int': 'long long', 'long int': 'long', 'short int': 'short',
      'unsigned int': 'unsigned', 'unsigned long long int': 'unsigned long long',
      'signed': 'int', 'signed int': 'int', 'signed long': 'long',
      'unsigned short int': 'unsigned short', 'long long unsigned': 'unsigned long long',
      'int64_t': 'long long', 'uint64_t': 'unsigned long long',
      'int32_t': 'int', 'uint32_t': 'unsigned',
    };
    return map[t] || t;
  }

  /* 取模板参数：vector< pair<int,int> > → { base:'vector', args:['pair<int,int>'] } */
  function splitTemplate(t) {
    const i = t.indexOf('<');
    if (i < 0) return { base: t, args: [] };
    if (!t.endsWith('>')) return { base: t, args: [] };
    const base = t.slice(0, i).trim();
    const inner = t.slice(i + 1, -1);
    const args = [];
    let depth = 0, cur = '';
    for (let k = 0; k < inner.length; k++) {
      const c = inner[k];
      if (c === '<') depth++;
      if (c === '>') depth--;
      if (c === ',' && depth === 0) { args.push(normType(cur.trim())); cur = ''; continue; }
      cur += c;
    }
    if (cur.trim()) args.push(normType(cur.trim()));
    return { base, args };
  }

  const CONTAINER_BASES = ['vector', 'deque', 'list', 'map', 'multimap', 'set', 'multiset',
    'unordered_map', 'unordered_set', 'unordered_multimap', 'unordered_multiset',
    'queue', 'priority_queue', 'stack', 'pair'];

  function containerKind(t) {
    const { base } = splitTemplate(normType(t));
    return CONTAINER_BASES.indexOf(base) >= 0 ? base : null;
  }

  /* ══════════════════════════════════════════════════════════
     5. 语法分析
     ══════════════════════════════════════════════════════════ */
  const TYPE_KW = new Set(['int', 'long', 'short', 'char', 'float', 'double', 'bool', 'void',
    'unsigned', 'signed', 'string', 'auto', 'size_t', 'const', 'static', 'volatile', 'extern',
    'register', 'mutable', 'constexpr', 'inline', 'struct', 'class', 'typename',
    'vector', 'pair', 'map', 'set', 'multiset', 'multimap', 'queue', 'priority_queue',
    'stack', 'deque', 'list', 'unordered_map', 'unordered_set', 'wchar_t', 'long long', 'll',
    'int64_t', 'uint64_t', 'int32_t', 'uint32_t', 'ptrdiff_t']);

  const MODIFIERS = new Set(['const', 'static', 'volatile', 'extern', 'register', 'mutable', 'constexpr', 'inline', 'typename']);

  const BIN_PREC = {
    '||': 4, '&&': 5, '|': 6, '^': 7, '&': 8,
    '==': 9, '!=': 9, '<': 10, '>': 10, '<=': 10, '>=': 10,
    '<<': 11, '>>': 11, '+': 12, '-': 12, '*': 13, '/': 13, '%': 13,
  };
  const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);

  class Parser {
    constructor(toks, macros) {
      this.t = toks;
      this.p = 0;
      this.structNames = new Set();
      this.typedefs = Object.create(null);
      this.templates = new Set();   // 模板函数名，调用时忽略模板实参
      void macros;
    }

    peek(k) { return this.t[this.p + (k || 0)] || { t: 'eof', v: '<eof>', line: 0 }; }
    next() { return this.t[this.p++]; }
    is(v) { const x = this.peek(); return (x.t === 'id' || x.t === 'op') && x.v === v; }
    isId() { return this.peek().t === 'id'; }
    accept(v) { if (this.is(v)) { this.p++; return true; } return false; }
    expect(v) {
      if (this.is(v)) { this.p++; return true; }
      const x = this.peek();
      throw CppError(`第 ${x.line} 行：期望 "${v}"，实际是 "${x.v}"`, x.line);
    }
    line() { return this.peek().line; }

    isTypeStart() {
      const x = this.peek();
      if (x.t !== 'id') return false;
      if (TYPE_KW.has(x.v)) return true;
      if (this.typedefs[x.v]) return true;
      if (this.structNames.has(x.v)) return true;
      const n = this.peek(1);
      if (n && n.t === 'id' && (n.v !== 'operator')) return true;
      return false;
    }

    /* ---------- 类型 ---------- */
    parseTypeSpec() {
      const mods = [];
      for (;;) {
        const x = this.peek();
        if (x.t === 'id' && MODIFIERS.has(x.v)) { this.next(); continue; }
        if (x.t === 'id' && (x.v === 'unsigned' || x.v === 'signed' || x.v === 'long' || x.v === 'short')) {
          this.next(); mods.push(x.v); continue;
        }
        break;
      }
      // 基础类型修饰符（unsigned/long/...）之后若跟的不是类型关键字，则它是变量名
      const primMods = mods.filter(m => m === 'unsigned' || m === 'signed' || m === 'long' || m === 'short');
      let base = '';
      const x = this.peek();
      if (x.t === 'id' && (x.v === 'struct' || x.v === 'class')) {
        this.next();
        base = this.next().v;
        this.structNames.add(base);
      } else if (x.t === 'id' && (primMods.length === 0 || TYPE_KW.has(x.v))) {
        let name = x.v;
        this.next();
        while (this.is('::')) { this.next(); name += '::' + this.next().v; }
        base = name;
        if (this.typedefs[base]) base = this.typedefs[base];
        if (this.is('<')) base += this.parseTemplateArgs();
        // map<K,V>::iterator / vector<int>::const_iterator
        while (this.is('::')) { this.next(); base += '::' + this.next().v; }
      } else if (primMods.length === 0) {
        throw CppError(`第 ${x.line} 行：期望类型名，实际是 "${x.v}"`, x.line);
      }
      const type = normType((primMods.length ? primMods.join(' ') + ' ' : '') + base);
      return { type, mods };
    }

    parseTemplateArgs() {
      let s = '';
      this.expect('<');
      let depth = 1;
      s += '<';
      while (depth > 0) {
        const x = this.next();
        if (x.t === 'eof') throw CppError('模板参数未闭合', x.line);
        if (x.v === '<') depth++;
        if (x.v === '>') { depth--; if (depth === 0) { s += '>'; break; } }
        if (x.v === '>>') { depth -= 2; s += '>>'; if (depth <= 0) break; continue; }
        s += (x.t === 'str' ? '"' + x.v + '"' : String(x.v));
      }
      return s;
    }

    /* ---------- 顶层 ---------- */
    parseProgram() {
      const funcs = [], globals = [], structs = [], aliases = [];
      while (this.peek().t !== 'eof') {
        if (this.accept(';')) continue;
        if (this.is('using')) {
          this.next();
          if (this.accept('namespace')) { while (!this.is(';') && this.peek().t !== 'eof') this.next(); this.accept(';'); continue; }
          // using ll = long long;
          const name = this.next().v;
          if (this.accept('=')) {
            const { type } = this.parseTypeSpec();
            this.typedefs[name] = type;
            this.expect(';');
            continue;
          }
          this.accept(';');
          continue;
        }
        if (this.is('typedef')) {
          this.next();
          const { type } = this.parseTypeSpec();
          while (this.is('*')) { this.next(); }
          const name = this.next().v;
          this.typedefs[name] = type;
          this.accept(';');
          continue;
        }
        if (this.is('template')) {
          this.next();
          if (this.is('<')) {
            let d = 0;
            do {
              const x = this.next();
              if (x.v === '<') d++;
              else if (x.v === '>') d--;
              else if (x.v === '>>') d -= 2;
            } while (d > 0 && this.peek().t !== 'eof');
          }
          const nm = this.peek(1).v;
          if (nm) this.templates.add(nm);
          continue;   // 模板声明本身不登记（调用时按普通函数名解析）
        }
        if (this.is('struct') || this.is('class')) {
          const save = this.p;
          this.next();
          const nm = this.next().v;
          if (this.is('{')) {
            structs.push(this.parseStructBody(nm));
            continue;
          }
          this.p = save;   // struct X x; 这类声明
        }

        const { type } = this.parseTypeSpec();
        if (this.is(';')) { this.next(); continue; }

        // 单个 declarator（含函数）
        const d = this.parseDeclarator(type, { topLevel: true });
        if (d.isFunc) {
          funcs.push(d.func);
          if (d.func.body == null) this.accept(';');
        } else {
          globals.push(d.decl);
          while (this.accept(',')) {
            const extra = this.parseDeclarator(type, { topLevel: true, nameOnly: true });
            if (extra.decl) globals.push(extra.decl);
          }
          this.expect(';');
        }
        void aliases;
      }
      return { funcs, globals, structs };
    }

    parseStructBody(name) {
      this.expect('{');
      const fields = [], methods = [], ops = Object.create(null), ctors = [];
      this.structNames.add(name);
      while (!this.is('}') && this.peek().t !== 'eof') {
        if (this.accept(';')) continue;
        if (this.accept('public') || this.accept('private') || this.accept('protected')) { this.accept(':'); continue; }
        if (this.is('friend')) { while (!this.is(';') && this.peek().t !== 'eof') this.next(); this.accept(';'); continue; }
        if (this.is('template')) { while (!this.is(';') && !this.is('{') && this.peek().t !== 'eof') this.next(); if (this.is('{')) this.skipBlock(); continue; }

        const { type } = this.parseTypeSpec();
        if (this.is(';')) { this.next(); continue; }

        // 构造函数：StructName(...)
        if (this.peek().v === name && this.peek(1).v === '(') {
          this.next();
          const params = this.parseParams();
          let body = null;
          if (this.is(':')) { // 初始化列表
            this.next();
            while (!this.is('{') && this.peek().t !== 'eof') this.next();
          }
          if (this.is('{')) body = this.parseBlock();
          else { this.accept(';'); }
          ctors.push({ name, params, body, type: 'void', retType: 'void' });
          continue;
        }
        // 运算符重载： operator< ( ... )
        if (this.is('operator')) {
          this.next();
          let op = this.next().v;
          if (op === '(' && this.is(')')) { this.next(); op = '()'; }     // operator()
          else if (this.is('(')) { this.next(); }
          const params = this.parseParamsTail();
          this.accept('const');
          let body = null;
          if (this.is('{')) body = this.parseBlock(); else this.accept(';');
          ops[op] = { name: 'operator' + op, op, params, body, retType: type, type };
          continue;
        }

        // 普通成员：可能是方法，也可能是字段（可多个）
        const nm = this.next().v;
        if (this.is('(')) {
          const params = this.parseParamsTail();
          const isConst = this.accept('const');
          void isConst;
          let body = null;
          if (this.is(':')) { this.next(); while (!this.is('{') && this.peek().t !== 'eof') this.next(); }
          if (this.is('{')) body = this.parseBlock(); else this.accept(';');
          methods.push({ name: nm, params, body, retType: type, type });
        } else {
          let ftype = type;
          while (this.is('[')) { this.next(); while (!this.is(']')) this.next(); this.next(); ftype += '[]'; }
          fields.push({ name: nm, type: ftype });
          while (this.accept(',')) {
            const n2 = this.next().v;
            let t2 = type;
            while (this.is('[')) { this.next(); while (!this.is(']')) this.next(); this.next(); t2 += '[]'; }
            fields.push({ name: n2, type: t2 });
          }
          this.expect(';');
        }
      }
      this.expect('}');
      this.accept(';');
      return { name, fields, methods, ops, ctors };
    }

    skipBlock() {
      let d = 0;
      do {
        const x = this.next();
        if (x.v === '{') d++;
        else if (x.v === '}') d--;
        if (x.t === 'eof') break;
      } while (d > 0);
    }

    parseParams() {
      this.expect('(');
      return this.parseParamsInner();
    }
    parseParamsTail() { return this.parseParamsInner(); }

    parseParamsInner() {
      const params = [];
      if (this.accept(')')) return params;
      if (this.is('void') && this.peek(1).v === ')') { this.next(); this.next(); return params; }
      for (;;) {
        if (this.accept('...')) { this.accept(')'); return params; }
        const { type } = this.parseTypeSpec();
        let byPtr = false, byRef = false, isArray = false;
        let name = '';
        while (this.is('*') || this.is('&')) {
          if (this.next().v === '*') byPtr = true; else byRef = true;
        }
        if (this.peek().t === 'id' && this.peek().v !== '=') name = this.next().v;
        if (this.is('[')) {
          isArray = true;
          while (this.is('[')) { this.next(); while (!this.is(']') && this.peek().t !== 'eof') this.next(); this.next(); }
        }
        let defVal = null;
        if (this.accept('=')) defVal = this.parseAssign();
        params.push({ name, type, byPtr, byRef, isArray, defVal });
        if (this.accept(',')) continue;
        this.expect(')');
        break;
      }
      return params;
    }

    /* 解析一个 declarator（变量或函数） */
    parseDeclarator(baseType, opts) {
      let type = baseType;
      while (this.is('*')) { this.next(); type += '*'; }
      let dims = [];
      let name = '';
      if (this.peek().t === 'id') name = this.next().v;
      else if (!opts.nameOnly) throw CppError(`第 ${this.line()} 行：期望标识符`, this.line());

      while (this.is('[')) {
        this.next();
        let size = null;
        if (!this.is(']')) size = this.parseExpr();
        this.expect(']');
        dims.push(size);
      }

      if (this.is('(') && dims.length === 0 && opts.allowFunc !== false) {
        const params = this.parseParams();
        const isConst = this.accept('const');
        void isConst;
        let body = null;
        if (this.is(':')) { this.next(); while (!this.is('{') && this.peek().t !== 'eof') this.next(); }
        if (this.is('{')) body = this.parseBlock();
        return {
          isFunc: true,
          func: { name, params, body, retType: type, type, line: this.line() },
        };
      }

      let init = null;
      if (this.accept('=')) {
        init = this.is('{') ? this.parseInitList() : this.parseAssign();
      } else if (this.is('(')) { // 直接初始化 int a(3) / vector<int> v(10)
        this.next();
        const args = [];
        if (!this.is(')')) {
          for (;;) { args.push(this.parseAssign()); if (!this.accept(',')) break; }
        }
        this.expect(')');
        init = { kind: 'Call', callee: { kind: 'TypeCtor', type }, args, line: this.line() };
      } else if (this.is('{')) { // 列表初始化
        init = this.parseInitList();
      }
      return { isFunc: false, decl: { name, type, dims, init, line: this.line() } };
    }

    parseInitList() {
      this.expect('{');
      const items = [];
      if (!this.is('}')) {
        for (;;) {
          if (this.is('{')) {
            const d = this.peek(1);
            // {1,2} 作为元素（pair / struct 初始化）还是嵌套列表区分不了，这里一律当列表
            items.push(this.parseInitList());
            void d;
          } else items.push(this.parseAssign());
          if (!this.accept(',')) break;
          if (this.is('}')) break;
        }
      }
      this.expect('}');
      return { kind: 'InitList', items, line: this.line() };
    }

    /* ---------- 语句 ---------- */
    parseBlock() {
      const line = this.line();
      this.expect('{');
      const stmts = [];
      while (!this.is('}') && this.peek().t !== 'eof') {
        if (this.is(';')) { this.next(); continue; }
        stmts.push(this.parseStmt());
      }
      this.expect('}');
      return { kind: 'Block', stmts, line };
    }

    parseStmt() {
      const line = this.line();
      const x = this.peek();

      if (x.t === 'op' && x.v === '{') return this.parseBlock();
      if (x.t === 'id') {
        switch (x.v) {
          case 'if': {
            this.next(); this.expect('(');
            const cond = this.parseExpr();
            this.expect(')');
            const then = this.parseStmt();
            let els = null;
            if (this.accept('else')) els = this.parseStmt();
            return { kind: 'If', cond, then, else: els, line };
          }
          case 'while': {
            this.next(); this.expect('(');
            const cond = this.parseExpr();
            this.expect(')');
            const body = this.parseStmt();
            return { kind: 'While', cond, body, line };
          }
          case 'do': {
            this.next();
            const body = this.parseStmt();
            this.expect('while'); this.expect('(');
            const cond = this.parseExpr();
            this.expect(')'); this.accept(';');
            return { kind: 'DoWhile', cond, body, line };
          }
          case 'for': return this.parseFor();
          case 'switch': {
            this.next(); this.expect('(');
            const expr = this.parseExpr();
            this.expect(')');
            const body = this.parseBlock();
            return { kind: 'Switch', expr, body, line };
          }
          case 'return': {
            this.next();
            let expr = null;
            if (!this.is(';')) expr = this.parseExpr();
            this.accept(';');
            return { kind: 'Return', expr, line };
          }
          case 'break': this.next(); this.accept(';'); return { kind: 'Break', line };
          case 'continue': this.next(); this.accept(';'); return { kind: 'Continue', line };
          case 'case': {
            this.next();
            const test = this.parseExpr();
            this.expect(':');
            return { kind: 'Case', test, line };
          }
          case 'default':
            this.next(); this.expect(':');
            return { kind: 'Default', line };
          case 'using': {
            this.next();
            const nm = this.next().v;
            if (this.accept('=')) {
              const { type } = this.parseTypeSpec();
              this.typedefs[nm] = type;
            }
            this.expect(';');
            return { kind: 'Empty', line };
          }
          case 'typedef': {
            this.next();
            const { type } = this.parseTypeSpec();
            while (this.is('*')) this.next();
            this.typedefs[this.next().v] = type;
            this.expect(';');
            return { kind: 'Empty', line };
          }
          case 'struct': case 'class': {
            const save = this.p;
            this.next();
            const nm = this.next();
            if (nm && nm.t === 'id' && this.is('{')) {
              const def = this.parseStructBody(nm.v);
              return { kind: 'StructDecl', def, line };
            }
            this.p = save;
            break;
          }
          default: break;
        }
      }

      if (this.isTypeStart()) {
        const { type } = this.parseTypeSpec();
        const out = [];
        for (;;) {
          const d = this.parseDeclarator(type, { topLevel: false, allowFunc: false });
          if (d.decl) out.push(d.decl);
          if (!this.accept(',')) break;
        }
        this.expect(';');
        return { kind: 'DeclStmt', decls: out, line };
      }

      const expr = this.parseExpr();
      this.expect(';');
      return { kind: 'ExprStmt', expr, line };
    }

    parseFor() {
      const line = this.line();
      this.next();
      this.expect('(');
      // range-for: for (T x : expr) / for (auto &x : expr)
      const save = this.p;
      if (this.isTypeStart()) {
        const { type } = this.parseTypeSpec();
        let byRef = false;
        while (this.is('&') || this.is('*')) { if (this.next().v === '&') byRef = true; }
        const name = this.peek().t === 'id' ? this.next().v : null;
        if (name && this.is(':')) {
          this.next();
          const expr = this.parseExpr();
          this.expect(')');
          const body = this.parseStmt();
          return { kind: 'RangeFor', type, name, byRef, expr, body, line };
        }
      }
      this.p = save;

      let init = null;
      if (!this.is(';')) {
        if (this.isTypeStart()) {
          const { type } = this.parseTypeSpec();
          const decls = [];
          for (;;) {
            const d = this.parseDeclarator(type, { topLevel: false, allowFunc: false });
            if (d.decl) decls.push(d.decl);
            if (!this.accept(',')) break;
          }
          init = { kind: 'DeclStmt', decls, line };
        } else {
          init = { kind: 'ExprStmt', expr: this.parseExpr(), line };
        }
      }
      this.expect(';');
      const cond = this.is(';') ? null : this.parseExpr();
      this.expect(';');
      const inc = this.is(')') ? null : this.parseExpr();
      this.expect(')');
      const body = this.parseStmt();
      return { kind: 'For', init, cond, inc, body, line };
    }

    /* ---------- 表达式 ---------- */
    parseExpr() {
      let e = this.parseAssign();
      while (this.is(',')) {
        this.next();
        const r = this.parseAssign();
        e = { kind: 'Comma', l: e, r, line: this.line() };
      }
      return e;
    }

    parseAssign() {
      const left = this.parseCond();
      const x = this.peek();
      if (x.t === 'op' && ASSIGN_OPS.has(x.v)) {
        this.next();
        const right = this.parseAssign();
        return { kind: 'Assign', op: x.v, target: left, value: right, line: x.line };
      }
      return left;
    }

    parseCond() {
      const c = this.parseBin(4);
      if (this.is('?')) {
        this.next();
        const a = this.parseAssign();
        this.expect(':');
        const b = this.parseAssign();
        return { kind: 'Cond', c, a, b, line: this.line() };
      }
      return c;
    }

    parseBin(minPrec) {
      let left = this.parseUnary();
      for (;;) {
        const x = this.peek();
        const prec = (x.t === 'op') ? BIN_PREC[x.v] : undefined;
        if (prec === undefined || prec < minPrec) break;
        this.next();
        const right = this.parseBin(prec + 1);
        left = { kind: 'Bin', op: x.v, l: left, r: right, line: x.line };
      }
      return left;
    }

    parseUnary() {
      const x = this.peek();
      if (x.t === 'op') {
        if (x.v === '-' || x.v === '+' || x.v === '!' || x.v === '~' || x.v === '*' || x.v === '&') {
          this.next();
          const e = this.parseUnary();
          return { kind: 'Un', op: x.v, e, line: x.line };
        }
        if (x.v === '++' || x.v === '--') {
          this.next();
          const e = this.parseUnary();
          return { kind: 'PreInc', op: x.v, e, line: x.line };
        }
        if (x.v === '(') {
          // cast: (type) expr
          const save = this.p;
          this.next();
          if (this.isTypeStart()) {
            try {
              const { type } = this.parseTypeSpec();
              while (this.is('*')) { this.next(); }
              if (this.is(')')) {
                this.next();
                const e = this.parseUnary();
                return { kind: 'Cast', type, e, line: x.line };
              }
            } catch (err) { void err; }
          }
          this.p = save;
        }
      }
      if (x.t === 'id' && x.v === 'sizeof') {
        this.next();
        if (this.is('(') && this.isTypeStartAt(1)) {
          this.next();
          const { type } = this.parseTypeSpec();
          while (this.is('*')) this.next();
          this.expect(')');
          return { kind: 'Sizeof', type, line: x.line };
        }
        const e = this.parseUnary();
        return { kind: 'Sizeof', e, line: x.line };
      }
      if (x.t === 'id' && x.v === 'new') return this.parseNew();
      if (x.t === 'id' && x.v === 'delete') {
        this.next();
        const e = this.parseUnary();
        return { kind: 'Delete', e, line: x.line };
      }
      return this.parsePostfix();
    }

    isTypeStartAt(k) {
      const x = this.peek(k);
      if (!x || x.t !== 'id') return false;
      if (TYPE_KW.has(x.v) || this.typedefs[x.v] || this.structNames.has(x.v)) return true;
      const n = this.peek(k + 1);
      return !!(n && n.t === 'id');
    }

    parseNew() {
      const line = this.line();
      this.next();
      const { type } = this.parseTypeSpec();
      let dims = [];
      while (this.is('[')) {
        this.next();
        let size = null;
        if (!this.is(']')) size = this.parseExpr();
        this.expect(']');
        dims.push(size);
      }
      let args = [];
      if (this.accept('(')) {
        if (!this.is(')')) { for (;;) { args.push(this.parseAssign()); if (!this.accept(',')) break; } }
        this.expect(')');
      }
      return { kind: 'New', type, dims, args, line };
    }

    parsePostfix() {
      let e = this.parsePrimary();
      for (;;) {
        const x = this.peek();
        if (x.t !== 'op') break;
        if (x.v === '[') {
          this.next();
          const idx = this.parseExpr();
          this.expect(']');
          e = { kind: 'Index', obj: e, idx, line: x.line };
          continue;
        }
        if (x.v === '(') {
          this.next();
          const args = [];
          if (!this.is(')')) {
            for (;;) {
              args.push(this.parseAssign());
              if (!this.accept(',')) break;
            }
          }
          this.expect(')');
          e = { kind: 'Call', callee: e, args, line: x.line };
          continue;
        }
        if (x.v === '.') {
          this.next();
          const name = this.next().v;
          e = { kind: 'Member', obj: e, name, arrow: false, line: x.line };
          continue;
        }
        if (x.v === '->') {
          this.next();
          const name = this.next().v;
          e = { kind: 'Member', obj: e, name, arrow: true, line: x.line };
          continue;
        }
        if (x.v === '++' || x.v === '--') {
          this.next();
          e = { kind: 'PostInc', op: x.v, e, line: x.line };
          continue;
        }
        break;
      }
      return e;
    }

    parsePrimary() {
      const x = this.peek();
      const line = x.line;
      if (x.t === 'num') { this.next(); return { kind: 'Num', v: x.v, isFloat: !!x.isFloat, suffix: x.suffix || '', line }; }
      if (x.t === 'str') {
        this.next();
        let s = x.v;
        while (this.peek().t === 'str') s += this.next().v;   // 相邻字符串拼接
        return { kind: 'Str', v: s, line };
      }
      if (x.t === 'chr') { this.next(); return { kind: 'Chr', v: x.v, line }; }
      if (x.t === 'op' && x.v === '(') {
        this.next();
        const e = this.parseExpr();
        this.expect(')');
        return e;
      }
      if (x.t === 'op' && x.v === '[') return this.parseLambda();
      if (x.t === 'id') {
        if (x.v === 'true') { this.next(); return { kind: 'Num', v: 1, line }; }
        if (x.v === 'false') { this.next(); return { kind: 'Num', v: 0, line }; }
        if (x.v === 'nullptr' || x.v === 'NULL') { this.next(); return { kind: 'Num', v: 0, line }; }
        let name = x.v;
        this.next();
        // 模板实参：sort<int>(...) / max<int>(a,b)
        if (this.is('<') && this.peek(1).t === 'id' && (this.peek(2).v === '>' || this.peek(2).v === ',')) {
          const save = this.p;
          try { name += this.parseTemplateArgs(); } catch (err) { this.p = save; void err; }
        }
        while (this.is('::')) { this.next(); name += '::' + this.next().v; }
        return { kind: 'Id', name, line };
      }
      throw CppError(`第 ${line} 行：无法解析的表达式 "${x.v}"`, line);
    }

    parseLambda() {
      const line = this.line();
      this.expect('[');
      const cap = [];
      while (!this.is(']') && this.peek().t !== 'eof') {
        if (this.is('&') || this.is(',')) { this.next(); continue; }
        cap.push(this.next().v);
      }
      this.expect(']');
      const params = this.is('(') ? this.parseParams() : [];
      if (this.is('mutable')) this.next();
      if (this.is('->')) { this.next(); this.parseTypeSpec(); }
      const body = this.parseBlock();
      return { kind: 'Lambda', params, body, cap, line };
    }
  }

  function parse(src, macros) {
    const toks = expandMacros(lex(src), macros || Object.create(null), 0);
    const p = new Parser(toks, macros);
    const prog = p.parseProgram();
    prog.typedefs = p.typedefs;
    return prog;
  }

  /* ══════════════════════════════════════════════════════════
     6. 运行时值
     ══════════════════════════════════════════════════════════ */
  const CIN_MARK = { __stream: 'cin' };
  const COUT_MARK = { __stream: 'cout' };
  const CERR_MARK = { __stream: 'cerr' };
  const ENDL_MARK = { __endl: true };

  const i32 = x => (x | 0);
  const i8 = x => ((x << 24) >> 24);
  const u8 = x => (x & 0xFF);

  /* ---- 64 位精确整数：超出 2^53 时用 BigInt 中转，避免模运算失真 ---- */
  const BIG_SAFE = 9007199254740991n;

  function needBig(op, a, b) {
    if (typeof a !== 'number' || typeof b !== 'number') return false;
    if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
    if (op === '*') return Math.abs(a) > 94906265 && Math.abs(b) > 94906265;
    if (op === '+' || op === '-') return Math.abs(a) > 4503599627370496 || Math.abs(b) > 4503599627370496;
    return false;
  }

  function normNum(x) {
    if (typeof x !== 'bigint') return x;
    return (x <= BIG_SAFE && x >= -BIG_SAFE) ? Number(x) : x;
  }

  function bigOp(op, a, b) {
    const A = typeof a === 'bigint' ? a : BigInt(Math.trunc(Number(a) || 0));
    const B = typeof b === 'bigint' ? b : BigInt(Math.trunc(Number(b) || 0));
    switch (op) {
      case '+': return A + B;
      case '-': return A - B;
      case '*': return A * B;
      case '/': if (B === 0n) throw rt('除以零'); return A / B;
      case '%': if (B === 0n) throw rt('模零'); return A % B;
      case '<<': return A << B;
      case '>>': return A >> B;
      case '&': return A & B;
      case '|': return A | B;
      case '^': return A ^ B;
      case '==': return A === B ? 1 : 0;
      case '!=': return A !== B ? 1 : 0;
      case '<': return A < B ? 1 : 0;
      case '>': return A > B ? 1 : 0;
      case '<=': return A <= B ? 1 : 0;
      case '>=': return A >= B ? 1 : 0;
      default: return Number(A);
    }
  }

  function mkVec(et, a) { return { __k: 'vec', et: et || 'int', a: a || [] }; }
  function mkArr(et, a) { return { __k: 'arr', et: et || 'int', a: a || [] }; }
  function mkPair(ft, st, f, s) { return { __k: 'pair', ft: ft || 'int', st: st || 'int', f, s }; }
  function mkMap(kt, vt, ordered, multi) { return { __k: 'map', kt, vt, ordered: ordered !== false, multi: !!multi, keys: [], m: new Map() }; }
  function mkSet(et, ordered, multi) { return { __k: 'set', et, ordered: ordered !== false, multi: !!multi, keys: [], m: new Map() }; }
  function mkQueue(et) { return { __k: 'queue', et, a: [], h: 0 }; }
  function mkStack(et) { return { __k: 'stack', et, a: [] }; }
  function mkPQ(et, cmp, cmpFn) { return { __k: 'pq', et, cmp: cmp || 'less', cmpFn: cmpFn || null, a: [] }; }
  function mkStruct(def, fields) { return { __k: 'struct', t: def.name, def, f: fields }; }
  function mkIt(c, i) { return { __k: 'it', c, i }; }
  function mkPtr(arr, i) { return { __k: 'ptr', arr, i }; }

  function isContainer(v) {
    return v && typeof v === 'object' && v.__k && v.__k !== 'it' && v.__k !== 'ptr';
  }

  function cloneVal(v) {
    if (v == null || typeof v !== 'object') return v;
    switch (v.__k) {
      case 'vec': return mkVec(v.et, v.a.map(cloneVal));
      case 'arr': return mkArr(v.et, v.a.map(cloneVal));
      case 'pair': return mkPair(v.ft, v.st, cloneVal(v.f), cloneVal(v.s));
      case 'map': {
        const o = mkMap(v.kt, v.vt, v.ordered, v.multi);
        o.keys = v.keys.slice();
        v.keys.forEach(k => o.m.set(k, cloneVal(v.m.get(k))));
        return o;
      }
      case 'set': {
        const o = mkSet(v.et, v.ordered, v.multi);
        o.keys = v.keys.slice();
        v.keys.forEach(k => o.m.set(k, v.m.get(k)));
        return o;
      }
      case 'queue': { const o = mkQueue(v.et); o.a = v.a.map(cloneVal); o.h = v.h; return o; }
      case 'stack': { const o = mkStack(v.et); o.a = v.a.map(cloneVal); return o; }
      case 'pq': { const o = mkPQ(v.et, v.cmp, v.cmpFn); o.a = v.a.map(cloneVal); return o; }
      case 'struct': {
        const f = {};
        for (const k in v.f) f[k] = cloneVal(v.f[k]);
        return mkStruct(v.def, f);
      }
      case 'lambda': return v;
      default: return v;
    }
  }

  function defaultValue(type) {
    const t = normType(type || 'int');
    if (isFloatType(t)) return 0;
    if (isStringType(t)) return '';
    if (t.endsWith('*')) return 0;
    if (t.endsWith('&')) return defaultValue(t.slice(0, -1));
    const { base, args } = splitTemplate(t);
    switch (base) {
      case 'vector': return mkVec(args[0] || 'int', []);
      case 'deque': case 'list': return mkVec(args[0] || 'int', []);
      case 'pair': return mkPair(args[0], args[1], defaultValue(args[0]), defaultValue(args[1]));
      case 'map': case 'multimap': return mkMap(args[0] || 'int', args[1] || 'int', true, base === 'multimap');
      case 'unordered_map': case 'unordered_multimap': return mkMap(args[0] || 'int', args[1] || 'int', false, base === 'unordered_multimap');
      case 'set': case 'multiset': return mkSet(args[0] || 'int', true, base === 'multiset');
      case 'unordered_set': case 'unordered_multiset': return mkSet(args[0] || 'int', false, base === 'unordered_multiset');
      case 'queue': case 'deque ': return mkQueue(args[0] || 'int');
      case 'priority_queue': return mkPQ(args[0] || 'int', args[2] || 'less');
      case 'stack': return mkStack(args[0] || 'int');
      default: break;
    }
    return 0;
  }

  function coerce(v, type) {
    const t = normType(type || 'int');
    if (v == null) return defaultValue(t);
    if (isStringType(t)) return typeof v === 'string' ? v : String(v);
    if (isFloatType(t)) return Number(v) || 0;
    if (isIntType(t)) {
      if (typeof v !== 'number') v = Number(v) || 0;
      if (t === 'bool') return v ? 1 : 0;
      if (t === 'char' || t === 'signed char') return i8(v);
      if (t === 'unsigned char') return u8(v);
      return i32(v);
    }
    if (isLongType(t)) {
      if (typeof v === 'bigint') return normNum(v);
      return typeof v === 'number' ? Math.trunc(v) : Number(v) || 0;
    }
    return v;
  }

  /* 排序比较：用于 sort / set / map / priority_queue */
  function cmpVals(a, b, interp, cmpFn) {
    if (cmpFn) {
      const r = interp.invokeCallable(cmpFn, [a, b]);
      return r ? -1 : (interp.invokeCallable(cmpFn, [b, a]) ? 1 : 0);
    }
    if (a && a.__k === 'struct' && a.def.ops && a.def.ops['<']) {
      const r = interp.invokeMethod(a, '<', [b]);
      return r ? -1 : (interp.invokeMethod(b, '<', [a]) ? 1 : 0);
    }
    if (a && a.__k === 'pair') {
      const c = cmpVals(a.f, b.f, interp, null);
      return c !== 0 ? c : cmpVals(a.s, b.s, interp, null);
    }
    if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : (a > b ? 1 : 0);
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }

  /* ══════════════════════════════════════════════════════════
     7. 作用域
     ══════════════════════════════════════════════════════════ */
  class Scope {
    constructor(parent) { this.m = new Map(); this.parent = parent || null; }
    def(name, type, v) { this.m.set(name, { type, v }); }
    cell(name) {
      let s = this;
      while (s) { if (s.m.has(name)) return s.m.get(name); s = s.parent; }
      return null;
    }
    has(name) {
      let s = this;
      while (s) { if (s.m.has(name)) return true; s = s.parent; }
      return false;
    }
  }

  /* 引用参数用的单元格：读写转发到实参 lvalue */
  function makeRefCell(ref, type) {
    const cell = { type: type || ref.type || 'int', ref: true, __ref: ref };
    Object.defineProperty(cell, 'v', {
      get() { return ref.get(); },
      set(x) { ref.set(x); },
      enumerable: true,
      configurable: true,
    });
    return cell;
  }

  /* ══════════════════════════════════════════════════════════
     8. 解释器
     ══════════════════════════════════════════════════════════ */
  function ReturnSignal(v) { this.value = v; }
  const BreakSig = { sig: 'break' };
  const ContinueSig = { sig: 'continue' };

  class Interp {
    constructor(prog, input) {
      this.prog = prog;
      this.out = '';
      this.err = '';
      this.input = String(input == null ? '' : input);
      this.pos = 0;
      this.steps = 0;
      this.maxSteps = 8e7;
      this.t0 = Date.now();
      this.timeLimitMs = 4000;

      this.funcs = new Map();
      for (const f of prog.funcs) {
        const key = f.name;
        if (!this.funcs.has(key)) this.funcs.set(key, []);
        this.funcs.get(key).push(f);
      }
      this.structs = new Map();
      for (const s of prog.structs) this.structs.set(s.name, s);
      this.globals = new Scope(null);
      this.statics = new Map();
      this.retType = 'int';
    }

    tick() {
      if ((++this.steps & 0x3FF) === 0) {
        if (this.steps > this.maxSteps) throw rt('运行步数超出限制（可能存在死循环）');
        if (Date.now() - this.t0 > this.timeLimitMs) {
          const e = new Error('运行超时（超过 ' + (this.timeLimitMs / 1000).toFixed(1) + ' 秒）');
          e.kind = 'TLE';
          throw e;
        }
      }
    }

    /* ---------- 入口 ---------- */
    run() {
      // 全局声明先执行（含 const / 结构体定义）
      for (const s of this.prog.structs) this.structs.set(s.name, s);
      for (const d of this.prog.globals) this.declareOne(d, this.globals);
      const mains = this.funcs.get('main');
      if (!mains || !mains.length) throw rt('未找到 main 函数');
      try {
        this.callFunction(mains[0], [], null);
      } catch (e) {
        if (!(e instanceof ReturnSignal)) throw e;
      }
      return this.out;
    }

    /* ---------- 声明 ---------- */
    /* 类型的默认值：结构体要真正构造出实例，容器要建空容器 */
    defaultFor(type, sc) {
      const t = normType(type || 'int');
      const def = this.structs.get(t);
      if (def) return this.constructStruct(def, [], sc || this.globals);
      return defaultValue(t);
    }

    declareOne(d, sc) {
      const baseType = normType(d.type);
      if (d.dims && d.dims.length) {
        const v = this.makeArray(d.dims.map(x => this.evalExpr(x, sc)), baseType);
        if (d.init && d.init.kind === 'InitList') this.fillList(v, d.init, sc);
        else if (d.init) {
          const src = this.evalExpr(d.init, sc);
          if (src && src.__k === 'arr') v.a = cloneVal(src).a;
        }
        sc.def(d.name, baseType, v);
        return v;
      }
      let val;
      if (d.init) {
        if (d.init.kind === 'InitList') {
          val = this.fromInitList(baseType, d.init, sc);
        } else {
          val = this.evalExpr(d.init, sc);
          val = this.castTo(val, baseType);
        }
      } else {
        val = this.defaultFor(baseType, sc);
      }
      if (isContainer(val)) val = cloneVal(val);
      sc.def(d.name, baseType, val);
      return val;
    }

    makeArray(dims, et) {
      const build = (level) => {
        const n = Math.max(0, Math.floor(dims[level] || 0));
        const arr = new Array(n);
        for (let i = 0; i < n; i++) {
          arr[i] = (level + 1 < dims.length) ? build(level + 1) : this.defaultFor(et);
        }
        return arr;
      };
      const a = build(0);
      return mkArr(et, a);
    }

    fillList(arrObj, listNode, sc) {
      const vals = listNode.items.map(x => this.evalExpr(x, sc));
      const put = (dst, vs) => {
        for (let i = 0; i < vs.length && i < dst.length; i++) {
          if (Array.isArray(dst[i]) && vs[i] && vs[i].__k === 'arr') put(dst[i], vs[i].a);
          else dst[i] = this.castTo(vs[i], arrObj.et);
        }
      };
      put(arrObj.a, vals);
    }

    fromInitList(type, listNode, sc) {
      const t = normType(type);
      const { base, args } = splitTemplate(t);
      const vals = listNode.items.map(x => this.evalExpr(x, sc));
      if (base === 'vector' || base === 'deque' || base === 'list') return mkVec(args[0] || 'int', vals);
      if (base === 'pair') return mkPair(args[0], args[1], vals[0], vals[1]);
      if (base === 'set' || base === 'multiset') {
        const s = mkSet(args[0] || 'int', true, base === 'multiset');
        vals.forEach(v => this.setInsert(s, v));
        return s;
      }
      if (base === 'map') {
        const m = mkMap(args[0] || 'int', args[1] || 'int', true, false);
        vals.forEach(v => { if (v && v.__k === 'pair') this.mapSet(m, v.f, v.s); });
        return m;
      }
      const def = this.structs.get(t);
      if (def) return this.constructStruct(def, vals, sc);
      return vals[0];
    }

    constructStruct(def, args, sc) {
      const inst = mkStruct(def, {});
      for (const f of def.fields) inst.f[f.name] = this.defaultFor(f.type, sc);
      if (def.ctors && def.ctors.length) {
        const ctor = def.ctors.find(c => c.params.length === args.length) || def.ctors[0];
        if (ctor && ctor.body) {
          const s = new Scope(this.globals);
          s.def('this', def.name, inst);
          ctor.params.forEach((p, i) => s.def(p.name, p.type, this.castTo(args[i], p.type)));
          try { this.execStmt(ctor.body, s); } catch (e) { if (!(e instanceof ReturnSignal)) throw e; }
        }
      } else if (args.length) {
        // 聚合初始化：按字段顺序赋值
        let k = 0;
        for (const f of def.fields) {
          if (k >= args.length) break;
          inst.f[f.name] = this.castTo(args[k++], f.type);
        }
      }
      return inst;
    }

    castTo(v, type) {
      const t = normType(type || 'int');
      const { base, args } = splitTemplate(t);
      if (CONTAINER_BASES.indexOf(base) >= 0) {
        if (v && v.__k) return coerceContainer(v, t, this);
        return defaultValue(t);
      }
      if (this.structs.has(t)) {
        if (v && v.__k === 'struct') return v;
        return this.constructStruct(this.structs.get(t), [], this.globals);
      }
      return coerce(v, t);
    }

    /* ---------- 语句 ---------- */
    execStmt(n, sc) {
      this.tick();
      switch (n.kind) {
        case 'Block': {
          const s = new Scope(sc);
          for (const st of n.stmts) {
            if (st.kind === 'StructDecl') { this.structs.set(st.def.name, st.def); continue; }
            this.execStmt(st, s);
          }
          return;
        }
        case 'DeclStmt':
          for (const d of n.decls) this.declareOne(d, sc);
          return;
        case 'ExprStmt': this.evalExpr(n.expr, sc); return;
        case 'If':
          if (this.truthy(this.evalExpr(n.cond, sc))) this.execStmt(n.then, sc);
          else if (n.else) this.execStmt(n.else, sc);
          return;
        case 'While':
          while (this.truthy(this.evalExpr(n.cond, sc))) {
            this.tick();
            try { this.execStmt(n.body, sc); }
            catch (e) { if (e === BreakSig) break; if (e === ContinueSig) continue; throw e; }
          }
          return;
        case 'DoWhile':
          do {
            this.tick();
            try { this.execStmt(n.body, sc); }
            catch (e) { if (e === BreakSig) break; if (e === ContinueSig) continue; throw e; }
            if (!this.truthy(this.evalExpr(n.cond, sc))) break;
          } while (true);
          return;
        case 'For': {
          const s = new Scope(sc);
          if (n.init) this.execStmt(n.init, s);
          for (;;) {
            this.tick();
            if (n.cond && !this.truthy(this.evalExpr(n.cond, s))) break;
            try { this.execStmt(n.body, s); }
            catch (e) { if (e === BreakSig) break; if (e === ContinueSig) { /* fallthrough */ } else throw e; }
            if (n.inc) this.evalExpr(n.inc, s);
          }
          return;
        }
        case 'RangeFor': {
          const coll = this.evalExpr(n.expr, sc);
          const s = new Scope(sc);
          const each = (val) => {
            this.tick();
            if (n.byRef) {
              s.m.set(n.name, { type: n.type, v: val, ref: true });
            } else {
              s.def(n.name, n.type, isContainer(val) ? cloneVal(val) : this.castTo(val, n.type));
            }
            try { this.execStmt(n.body, s); }
            catch (e) { if (e === BreakSig) return false; if (e === ContinueSig) return true; throw e; }
            return true;
          };
          if (coll && coll.__k === 'vec') {
            for (let i = 0; i < coll.a.length; i++) if (!each(coll.a[i])) break;
          } else if (coll && (coll.__k === 'set' || coll.__k === 'map')) {
            const ks = coll.keys.slice();
            for (const k of ks) {
              const item = coll.__k === 'map' ? mkPair(coll.kt, coll.vt, k, coll.m.get(k)) : k;
              if (!each(item)) break;
            }
          } else if (coll && coll.__k === 'arr') {
            const walk = (arr) => {
              for (let i = 0; i < arr.length; i++) {
                if (Array.isArray(arr[i])) { if (!walk(arr[i])) return false; }
                else if (!each(arr[i])) return false;
              }
              return true;
            };
            walk(coll.a);
          } else if (coll && coll.__k === 'queue') {
            while (coll.h < coll.a.length) { if (!each(coll.a[coll.h++])) break; }
          } else if (coll && coll.__k === 'stack') {
            const s2 = coll.a.slice();
            for (const v of s2) if (!each(v)) break;
          } else if (typeof coll === 'string') {
            for (const ch of coll) if (!each(ch.charCodeAt(0))) break;
          }
          return;
        }
        case 'Switch': {
          const v = this.evalExpr(n.expr, sc);
          const stmts = n.body.stmts;
          let hit = -1, def = -1;
          for (let i = 0; i < stmts.length; i++) {
            if (stmts[i].kind === 'Case' && hit < 0) {
              if (this.evalExpr(stmts[i].test, sc) === v) hit = i;
            } else if (stmts[i].kind === 'Default' && def < 0) def = i;
          }
          if (hit < 0) hit = def;
          if (hit < 0) return;
          const s = new Scope(sc);
          try {
            for (let i = hit; i < stmts.length; i++) this.execStmt(stmts[i], s);
          } catch (e) { if (e !== BreakSig) throw e; }
          return;
        }
        case 'Case': case 'Default': return;
        case 'Return': throw new ReturnSignal(n.expr ? this.evalExpr(n.expr, sc) : 0);
        case 'Break': throw BreakSig;
        case 'Continue': throw ContinueSig;
        case 'StructDecl': this.structs.set(n.def.name, n.def); return;
        case 'Empty': return;
        default: throw rt('未知语句：' + n.kind);
      }
    }

    truthy(v) {
      if (typeof v === 'string') return v.length > 0;
      return !!v;
    }

    /* ---------- 左值 ---------- */
    refOf(n, sc) {
      switch (n.kind) {
        case 'Id': {
          const cell = sc.cell(n.name);
          if (!cell) {
            const th = sc.cell('this');
            if (th && th.v && th.v.__k === 'struct') {
              const f = th.v.def.fields.find(x => x.name === n.name);
              if (f) {
                const obj = th.v;
                return {
                  type: f.type,
                  get: () => obj.f[n.name],
                  set: v => { obj.f[n.name] = isContainer(v) ? cloneVal(v) : this.castTo(v, f.type); },
                };
              }
            }
            throw rt(`未定义的标识符 "${n.name}"`);
          }
          return {
            type: cell.type,
            get: () => cell.v,
            set: (v) => { cell.v = this.castTo(v, cell.type); },
          };
        }
        case 'Index': {
          const base = this.refOf(n.obj, sc);
          const obj = base.get();
          const idx = this.evalExpr(n.idx, sc);
          if (Array.isArray(obj)) {
            return { type: 'int', get: () => obj[idx], set: v => { obj[idx] = v; } };
          }
          if (obj && obj.__k === 'arr') {
            const et = obj.et;
            if (Array.isArray(obj.a[idx])) {
              return { type: et, get: () => obj.a[idx], set: v => { obj.a[idx] = v; } };
            }
            return {
              type: et,
              get: () => obj.a[idx],
              set: (v) => { obj.a[idx] = this.castTo(v, et); },
            };
          }
          if (obj && obj.__k === 'vec') {
            return {
              type: obj.et,
              get: () => obj.a[idx],
              set: (v) => { obj.a[idx] = isContainer(v) ? cloneVal(v) : this.castTo(v, obj.et); },
            };
          }
          if (obj && obj.__k === 'map') {
            const key0 = idx;
            let pos = this.keyIndexOf(obj, key0);
            if (pos < 0) {
              this.mapSet(obj, key0, this.defaultFor(obj.vt));
              pos = this.keyIndexOf(obj, key0);
            }
            const key = obj.keys[pos];
            return {
              type: obj.vt,
              get: () => obj.m.get(key),
              set: (v) => { this.mapSet(obj, key, v); },
            };
          }
          if (typeof obj === 'string') {
            return {
              type: 'char',
              get: () => obj.charCodeAt(idx) | 0,
              set: (v) => {
                const s = obj.slice(0, idx) + String.fromCharCode(v) + obj.slice(idx + 1);
                base.set(s);
              },
            };
          }
          if (obj && obj.__k === 'stack') {
            return { type: obj.et, get: () => obj.a[idx], set: v => { obj.a[idx] = v; } };
          }
          throw rt('不支持的下标访问');
        }
        case 'Member': {
          const base = this.refOf(n.obj, sc);
          const obj = base.get();
          if (obj && obj.__k === 'pair') {
            if (n.name === 'first') return { type: obj.ft, get: () => obj.f, set: v => { obj.f = this.castTo(v, obj.ft); } };
            if (n.name === 'second') return { type: obj.st, get: () => obj.s, set: v => { obj.s = this.castTo(v, obj.st); } };
          }
          if (obj && obj.__k === 'struct') {
            const fdef = obj.def.fields.find(f => f.name === n.name);
            if (!fdef) throw rt(`结构体 ${obj.def.name} 没有成员 ${n.name}`);
            return {
              type: fdef.type,
              get: () => obj.f[n.name],
              set: v => { obj.f[n.name] = isContainer(v) ? cloneVal(v) : this.castTo(v, fdef.type); },
            };
          }
          throw rt(`成员访问失败：${n.name}`);
        }
        case 'Un': {
          if (n.op === '*') {
            const p = this.evalExpr(n.e, sc);
            if (p && p.__k === 'ptr') {              const arr = p.arr;
              return {
                type: arr.et,
                get: () => arr.a[p.i],
                set: v => { arr.a[p.i] = this.castTo(v, arr.et); },
              };
            }
            if (p && p.__k === 'it') {
              const c = p.c;
              if (c.__k === 'vec') return { type: c.et, get: () => c.a[p.i], set: v => { c.a[p.i] = v; } };
              if (c.__k === 'arr') return { type: c.et, get: () => c.a[p.i], set: v => { c.a[p.i] = v; } };
            }
            if (p && p.__k === 'miter') {
              const c = p.c;
              const key = c.keys[p.i];
              if (c.__k === 'set') {
                return { type: c.et, get: () => key, set: () => {} };
              }
              const pair = mkPair(c.kt, c.vt, key, c.m.get(key));
              return {
                type: 'pair',
                get: () => pair,
                set: (v) => { if (v && v.__k === 'pair') this.mapSet(c, v.f, v.s); },
              };
            }
            throw rt('解引用失败');
          }
          if (n.op === '&') return this.refOf(n.e, sc);
          break;
        }
        default: break;
      }
      throw rt('不可赋值的表达式');
    }

    /* ---------- 表达式 ---------- */
    evalExpr(n, sc) {
      if (!n) return 0;
      this.tick();
      switch (n.kind) {
        case 'Num': return n.v;
        case 'Str': return n.v;
        case 'Chr': return n.v;
        case 'Id': return this.evalId(n, sc);
        case 'Bin': return this.evalBin(n, sc);
        case 'Un': return this.evalUn(n, sc);
        case 'Assign': {
          const ref = this.refOf(n.target, sc);
          let val;
          if (n.op === '=') {
            val = this.evalExpr(n.value, sc);
            if (isContainer(val)) val = cloneVal(val);
          } else {
            const cur = ref.get();
            const rhs = this.evalExpr(n.value, sc);
            const binOp = n.op.slice(0, -1);
            val = this.binOp(binOp, cur, rhs, ref.type, this.typeOf(n.value, sc));
          }
          ref.set(val);
          return ref.get();
        }
        case 'PreInc': case 'PostInc': {
          const ref = this.refOf(n.e, sc);
          const cur = ref.get();
          if (cur && (cur.__k === 'miter' || cur.__k === 'it' || cur.__k === 'ptr')) {
            const delta = (n.op === '++' ? 1 : -1);
            if (cur.__k === 'miter') { cur.i += delta; return cur; }
            cur.i += delta;
            return cur;
          }
          const nv = this.castTo(cur + (n.op === '++' ? 1 : -1), ref.type);
          ref.set(nv);
          return n.kind === 'PreInc' ? ref.get() : cur;
        }
        case 'Cond': return this.truthy(this.evalExpr(n.c, sc)) ? this.evalExpr(n.a, sc) : this.evalExpr(n.b, sc);
        case 'Comma': { this.evalExpr(n.l, sc); return this.evalExpr(n.r, sc); }
        case 'Cast': return this.castTo(this.evalExpr(n.e, sc), n.type);
        case 'Sizeof': {
          if (n.type) return sizeOfType(n.type, this);
          const v = this.evalExpr(n.e, sc);
          return sizeOfValue(v, this);
        }
        case 'Index': return this.refOf(n, sc).get();
        case 'Member': return this.memberAccess(n, sc);
        case 'Call': return this.evalCall(n, sc);
        case 'InitList': {
          const vals = n.items.map(x => this.evalExpr(x, sc));
          return mkVec('int', vals);
        }
        case 'Lambda': return { __k: 'lambda', node: n, scope: sc };
        case 'New': {
          if (n.dims && n.dims.length) {
            const dims = n.dims.map(d => this.evalExpr(d, sc));
            return this.makeArray(dims, normType(n.type));
          }
          const def = this.structs.get(normType(n.type));
          if (def) return this.constructStruct(def, n.args.map(a => this.evalExpr(a, sc)), sc);
          return this.castTo(n.args.length ? this.evalExpr(n.args[0], sc) : 0, n.type);
        }
        case 'Delete': this.evalExpr(n.e, sc); return undefined;
        default: throw rt('未知表达式：' + n.kind);
      }
    }

    evalId(n, sc) {
      const nm = n.name;
      const short = nm.replace(/^std::/, '').replace(/^std::/, '');
      if (short === 'cin') return CIN_MARK;
      if (short === 'cout') return COUT_MARK;
      if (short === 'cerr') return CERR_MARK;
      if (short === 'endl' || short === 'flush') return ENDL_MARK;
      if (short === 'fixed' || short === 'setprecision' || short === 'scientific' || short === 'boolalpha') return 0;
      const cell = sc.cell(nm) || sc.cell(short);
      if (cell) return cell.v;
      // 结构体成员函数里直接写字段名
      const th = sc.cell('this');
      if (th && th.v && th.v.__k === 'struct') {
        const f = th.v.def.fields.find(x => x.name === nm);
        if (f) return th.v.f[nm];
      }
      if (nm === 'INT_MAX') return 2147483647;
      if (nm === 'INT_MIN') return -2147483648;
      if (nm === 'LLONG_MAX') return Number.MAX_SAFE_INTEGER;
      if (nm === 'LLONG_MIN') return -Number.MAX_SAFE_INTEGER;
      if (nm === 'UINT_MAX') return 4294967295;
      if (nm === 'M_PI') return Math.PI;
      if (nm === 'EOF') return -1;
      if (nm === 'true') return 1;
      if (nm === 'false') return 0;
      throw rt(`未定义的标识符 "${nm}"`);
    }

    /* 对任意值取成员（只读） */
    memberOf(obj, name) {
      if (obj && obj.__k === 'pair') {
        if (name === 'first') return obj.f;
        if (name === 'second') return obj.s;
      }
      if (obj && obj.__k === 'struct') {
        const f = obj.def.fields.find(x => x.name === name);
        if (f) return obj.f[name];
        if (obj.def.methods.some(m => m.name === name)) return { __k: 'bound', obj, name };
      }
      throw rt(`成员访问失败：${name}`);
    }

    memberAccess(n, sc) {
      const obj = this.evalExpr(n.obj, sc);
      if (obj && obj.__k === 'miter') {
        const c = obj.c;
        const key = c.keys[obj.i];
        const elem = (c.__k === 'map') ? mkPair(c.kt, c.vt, key, c.m.get(key)) : key;
        return this.memberOf(elem, n.name);
      }
      if (obj && obj.__k === 'struct') {
        const fdef = obj.def.fields.find(f => f.name === n.name);
        if (fdef) return obj.f[n.name];
        if (obj.def.methods.some(m => m.name === n.name)) return { __k: 'bound', obj, name: n.name };
        throw rt(`结构体 ${obj.def.name} 没有成员 ${n.name}`);
      }
      if (obj && obj.__k === 'pair') {
        if (n.name === 'first') return obj.f;
        if (n.name === 'second') return obj.s;
      }
      if (obj && obj.__k === 'bound') return obj;
      throw rt(`成员访问失败：${n.name}`);
    }

    evalBin(n, sc) {
      const op = n.op;
      if (op === '&&') {
        return this.truthy(this.evalExpr(n.l, sc)) && this.truthy(this.evalExpr(n.r, sc)) ? 1 : 0;
      }
      if (op === '||') {
        return this.truthy(this.evalExpr(n.l, sc)) || this.truthy(this.evalExpr(n.r, sc)) ? 1 : 0;
      }
      const l = this.evalExpr(n.l, sc);
      // cout << x / cerr << x
      if (l === COUT_MARK || l === CERR_MARK) {
        if (op === '<<') { this.writeOut(this.evalExpr(n.r, sc)); return l; }
        throw rt('ostream 只支持 <<');
      }
      // cin >> x
      if (l === CIN_MARK) {
        if (op === '>>') { this.readInto(n.r, sc); return l; }
        throw rt('istream 只支持 >>');
      }
      const r = this.evalExpr(n.r, sc);
      return this.binOp(op, l, r, this.typeOf(n.l, sc), this.typeOf(n.r, sc));
    }

    binOp(op, a, b, lt, rt2) {
      const l = lt || 'int', r = rt2 || 'int';
      const strOp = isStringType(l) || isStringType(r) || typeof a === 'string' || typeof b === 'string';

      const iterLike = v => v && (v.__k === 'miter' || v.__k === 'it' || v.__k === 'ptr');

      // 64 位精确算术
      if (typeof a === 'bigint' || typeof b === 'bigint' || needBig(op, a, b)) {
        return normNum(bigOp(op, a, b));
      }
      // 数组退化为指针：a + n / n + a / a - n
      if (a && a.__k === 'arr' && typeof b === 'number' && (op === '+' || op === '-')) {
        return mkPtr(a, op === '+' ? b : -b);
      }
      if (iterLike(a) && b && b.__k === 'arr' && op === '-') return a.i;
      // 迭代器 / 指针 比较
      if (iterLike(a) && iterLike(b)) {
        const sameC = (a.c && a.c === b.c) || (a.arr && a.arr === b.arr);
        const eq = sameC && a.i === b.i;
        switch (op) {
          case '==': return eq ? 1 : 0;
          case '!=': return eq ? 0 : 1;
          case '<': return (sameC && a.i < b.i) ? 1 : 0;
          case '>': return (sameC && a.i > b.i) ? 1 : 0;
          case '<=': return (sameC && a.i <= b.i) ? 1 : 0;
          case '>=': return (sameC && a.i >= b.i) ? 1 : 0;
          case '-': return a.i - b.i;
          default: break;
        }
      }
      // 指针加减：it + n / n + it
      if (iterLike(a) && typeof b === 'number' && (op === '+' || op === '-')) {
        const delta = op === '+' ? b : -b;
        return a.__k === 'miter' ? { __k: 'miter', c: a.c, i: a.i + delta } : mkIt(a.c || a.arr, a.i + delta);
      }
      if (typeof a === 'number' && iterLike(b) && op === '+') {
        return b.__k === 'miter' ? { __k: 'miter', c: b.c, i: b.i + a } : mkIt(b.c || b.arr, b.i + a);
      }

      if (strOp) {
        if (op === '+' && (typeof a === 'string' || typeof b === 'string')) {
          const sa = typeof a === 'string' ? a : this.charish(a, l);
          const sb = typeof b === 'string' ? b : this.charish(b, r);
          return sa + sb;
        }
        if (op === '==' || op === '!=' || op === '<' || op === '>' || op === '<=' || op === '>=') {
          const sa = String(a), sb = String(b);
          switch (op) {
            case '==': return sa === sb ? 1 : 0;
            case '!=': return sa !== sb ? 1 : 0;
            case '<': return sa < sb ? 1 : 0;
            case '>': return sa > sb ? 1 : 0;
            case '<=': return sa <= sb ? 1 : 0;
            case '>=': return sa >= sb ? 1 : 0;
          }
        }
      }

      // 结构体运算符重载
      if (a && a.__k === 'struct') {
        const r2 = this.tryOpOverload(a, op, b);
        if (r2 !== undefined) return r2;
      }
      if (b && b.__k === 'struct') {
        const r3 = this.tryOpOverload(b, op, a, true);
        if (r3 !== undefined) return r3;
      }
      if (a && a.__k === 'pair' && b && b.__k === 'pair') {
        const c = cmpVals(a, b, this, null);
        switch (op) {
          case '==': return c === 0 ? 1 : 0;
          case '!=': return c !== 0 ? 1 : 0;
          case '<': return c < 0 ? 1 : 0;
          case '>': return c > 0 ? 1 : 0;
          case '<=': return c <= 0 ? 1 : 0;
          case '>=': return c >= 0 ? 1 : 0;
        }
      }

      const isFloat = isFloatType(l) || isFloatType(r) || !Number.isInteger(a) || !Number.isInteger(b);
      const isLong = isLongType(l) || isLongType(r);
      const A = typeof a === 'number' ? a : (a | 0);
      const B = typeof b === 'number' ? b : (b | 0);

      let res;
      switch (op) {
        case '+': res = A + B; break;
        case '-': res = A - B; break;
        case '*': res = A * B; break;
        case '/':
          if (B === 0) { if (isFloat) return Infinity; throw rt('除以零'); }
          res = isFloat ? A / B : Math.trunc(A / B);
          break;
        case '%':
          if (B === 0) throw rt('模零');
          res = A % B;
          break;
        case '&': res = A & B; break;
        case '|': res = A | B; break;
        case '^': res = A ^ B; break;
        case '<<': res = isLong ? A * Math.pow(2, B) : (A << B); break;
        case '>>': res = isLong ? Math.floor(A / Math.pow(2, B)) : (A >> B); break;
        case '==': return A === B ? 1 : 0;
        case '!=': return A !== B ? 1 : 0;
        case '<': return A < B ? 1 : 0;
        case '>': return A > B ? 1 : 0;
        case '<=': return A <= B ? 1 : 0;
        case '>=': return A >= B ? 1 : 0;
        default: throw rt('未知运算符 ' + op);
      }
      if (isFloat) return res;
      if (isLong) return Math.trunc(res);
      return i32(res);
    }

    charish(v, t) {
      if (typeof v === 'string') return v;
      if (t === 'char' || t === 'signed char') return String.fromCharCode(v & 0xFF);
      return String(v);
    }

    tryOpOverload(a, op, b, swapped) {
      const f = a.def.ops && a.def.ops[op];
      if (!f) return undefined;
      return this.invokeMethod(a, op, [b], swapped);
    }

    evalUn(n, sc) {
      switch (n.op) {
        case '-': {
          const v = this.evalExpr(n.e, sc);
          if (typeof v === 'string') throw rt('字符串不能取负');
          const t = this.typeOf(n.e, sc);
          return isLongType(t) || isFloatType(t) ? -v : i32(-v);
        }
        case '+': return this.evalExpr(n.e, sc);
        case '!': return this.truthy(this.evalExpr(n.e, sc)) ? 0 : 1;
        case '~': return i32(~this.evalExpr(n.e, sc));
        case '*': return this.refOf(n, sc).get();
        case '&': {
          // 取地址：数组名或变量 → 指针
          const v = this.evalExpr(n.e, sc);
          if (v && v.__k === 'arr') return v;
          if (v && v.__k === 'vec') return mkPtr(mkArr(v.et, v.a), 0);
          if (v && v.__k === 'struct') return v;
          return { __k: 'ptr', arr: mkArr('int', [v]), i: 0 };
        }
        default: throw rt('未知一元运算符 ' + n.op);
      }
    }

    /* ---------- 类型推断 ---------- */
    typeOf(n, sc) {
      if (!n) return 'int';
      if (n.__ty) return n.__ty;
      const t = this.typeOfInner(n, sc);
      n.__ty = t;
      return t;
    }

    typeOfInner(n, sc) {
      if (!n) return 'int';
      switch (n.kind) {
        case 'Num': return n.isFloat ? 'double' : (/[lL]/.test(n.suffix || '') ? 'long long' : 'int');
        case 'Str': return 'string';
        case 'Chr': return 'char';
        case 'Id': {
          const nm = n.name.replace(/^std::/, '');
          if (nm === 'cin' || nm === 'cout' || nm === 'cerr') return 'int';
          if (nm === 'endl') return 'int';
          const cell = sc.cell(n.name) || sc.cell(nm);
          return cell ? cell.type : 'int';
        }
        case 'Cast': return normType(n.type);
        case 'Sizeof': return 'long long';
        case 'Index': {
          const bt = this.typeOf(n.obj, sc);
          const { base, args } = splitTemplate(bt);
          if (base === 'vector' || base === 'deque' || base === 'list') return args[0] || 'int';
          if (base === 'map' || base === 'unordered_map') return args[1] || 'int';
          if (isStringType(bt)) return 'char';
          if (bt.endsWith('[]')) return bt.slice(0, -2);
          if (bt.endsWith('*')) return bt.slice(0, -1);
          return 'int';
        }
        case 'Member': {
          const bt = this.typeOf(n.obj, sc);
          const { base, args } = splitTemplate(bt);
          if (base === 'pair') return n.name === 'first' ? (args[0] || 'int') : (args[1] || 'int');
          const def = this.structs.get(bt);
          if (def) {
            const f = def.fields.find(x => x.name === n.name);
            if (f) return f.type;
            const m = def.methods.find(x => x.name === n.name);
            if (m) return m.retType;
          }
          return 'int';
        }
        case 'Bin': {
          if (n.op === '&&' || n.op === '||') return 'bool';
          if (['==', '!=', '<', '>', '<=', '>='].indexOf(n.op) >= 0) return 'bool';
          const l = this.typeOf(n.l, sc), r = this.typeOf(n.r, sc);
          if (n.op === '+' && (isStringType(l) || isStringType(r))) return 'string';
          if (isFloatType(l) || isFloatType(r)) return 'double';
          if (isLongType(l) || isLongType(r)) return 'long long';
          return 'int';
        }
        case 'Assign': return this.typeOf(n.target, sc);
        case 'Cond': return this.typeOf(n.a, sc);
        case 'Comma': return this.typeOf(n.r, sc);
        case 'PreInc': case 'PostInc': return this.typeOf(n.e, sc);
        case 'Un': return n.op === '!' ? 'bool' : this.typeOf(n.e, sc);
        case 'Call': {
          if (n.callee.kind === 'Id') {
            const fs2 = this.funcs.get(n.callee.name);
            if (fs2 && fs2.length) {
              const f = fs2.find(x => x.params.length === n.args.length) || fs2[0];
              return f.retType || 'int';
            }
            return 'int';
          }
          if (n.callee.kind === 'Member') return this.typeOf(n.callee, sc);
          return 'int';
        }
        case 'Lambda': return 'auto';
        default: return 'int';
      }
    }

    /* ---------- 调用 ---------- */
    evalCall(n, sc) {
      const callee = n.callee;
      if (callee.kind === 'TypeCtor') {
        const t = normType(callee.type);
        const vals = n.args.map(a => this.evalExpr(a, sc));
        const { base } = splitTemplate(t);
        if (base === 'vector' || base === 'deque' || base === 'list') {
          const et = splitTemplate(t).args[0] || 'int';
          const v = mkVec(et, []);
          if (vals.length === 1 && typeof vals[0] === 'number') {
            for (let i = 0; i < vals[0]; i++) v.a.push(this.defaultFor(et));
          } else v.a = vals;
          return v;
        }
        if (base === 'pair') return mkPair(null, null, vals[0], vals[1]);
        if (base === 'stack') return mkStack(splitTemplate(t).args[0] || 'int');
        if (base === 'queue') return mkQueue(splitTemplate(t).args[0] || 'int');
        const def = this.structs.get(t);
        if (def) return this.constructStruct(def, vals, sc);
        return this.castTo(vals.length ? vals[0] : 0, t);
      }
      if (callee.kind === 'Id') {
        const name = callee.name.replace(/^std::/, '');
        const args = n.args;
        const userFns = this.funcs.get(name);
        if (userFns && userFns.length) return this.callByName(name, args, sc);
        return this.callBuiltin(name, args, sc);
      }
      if (callee.kind === 'Member') {
        const obj = this.evalExpr(callee.obj, sc);
        const args = n.args.map(a => this.evalExpr(a, sc));
        if (obj && obj.__k === 'bound') return this.invokeStructMethod(obj.obj, obj.name, args, sc);
        const r = this.callMethod(obj, callee.name, args, n.args, sc);
        if (r && typeof r === 'object' && '__setSelf' in r) {
          const ref = this.refOf(callee.obj, sc);
          ref.set(r.__setSelf);
          return r.__setSelf;
        }
        return r;
      }
      const fn = this.evalExpr(callee, sc);
      if (fn && fn.__k === 'lambda') {
        return this.invokeCallable(fn, n.args.map(a => this.evalExpr(a, sc)));
      }
      throw rt('无法调用该表达式');
    }

    callByName(name, argNodes, sc) {
      const overloads = this.funcs.get(name);
      let fn = overloads.find(f => f.params.length === argNodes.length);
      if (!fn) fn = overloads.find(f => f.params.filter(p => p.defVal).length + argNodes.length >= f.params.length);
      if (!fn) fn = overloads[0];
      const args = [];
      fn.params.forEach((p, i) => {
        if (p.byRef) {
          args.push({ __ref: this.refOf(argNodes[i], sc) });
        } else {
          args.push(this.evalExpr(argNodes[i], sc));
        }
      });
      return this.callFunction(fn, args, sc);
    }

    callFunction(fn, args, callerScope) {
      this.tick();
      const local = new Scope(this.globals);
      if (fn.params) {
        fn.params.forEach((p, i) => {
          const a = args[i];
          if (p.byRef) {
            if (a && a.__ref) {
              local.m.set(p.name, makeRefCell(a.__ref, p.type));
              return;
            }
            if (isContainer(a)) {
              const holder = { v: a };
              local.m.set(p.name, makeRefCell({
                get: () => holder.v,
                set: (x) => { holder.v = x; },
                type: p.type,
              }, p.type));
              return;
            }
            local.def(p.name, p.type, a);
            return;
          }
          let v = a;
          if (v === undefined && p.defVal) v = this.evalExpr(p.defVal, callerScope || this.globals);
          if (v === undefined) v = defaultValue(p.type);
          v = this.castTo(v, p.type);
          if (isContainer(v) && !p.byRef) v = cloneVal(v);
          local.def(p.name, p.type, v);
        });
      }
      const prevRet = this.retType;
      this.retType = fn.retType || 'int';
      try {
        if (!fn.body) return 0;
        this.execStmt(fn.body, local);
        return fn.retType === 'void' ? undefined : defaultValue(fn.retType);
      } catch (e) {
        if (e instanceof ReturnSignal) {
          let v = e.value;
          const rt2 = fn.retType || 'int';
          if (isContainer(v)) v = cloneVal(v);
          else if (rt2 && rt2 !== 'void') v = this.castTo(v, rt2);
          return v;
        }
        throw e;
      } finally {
        this.retType = prevRet;
      }
    }

    invokeCallable(fnVal, args) {
      if (fnVal && fnVal.__k === 'fnref') return this.invokeFnRef(fnVal, args);
      if (fnVal && fnVal.__k === 'lambda') {
        const n = fnVal.node;
        const local = new Scope(fnVal.scope);
        n.params.forEach((p, i) => local.def(p.name, p.type, this.castTo(args[i], p.type)));
        try { this.execStmt(n.body, local); } catch (e) {
          if (e instanceof ReturnSignal) return e.value;
          throw e;
        }
        return 0;
      }
      if (typeof fnVal === 'function') return fnVal.apply(null, args);
      throw rt('比较器不可调用');
    }

    /* 调用结构体上声明的普通成员函数 */
    invokeStructMethod(obj, name, args, sc) {
      const m = obj.def.methods.find(x => x.name === name);
      if (!m) throw rt(`结构体 ${obj.def.name} 没有方法 ${name}()`);
      const local = new Scope(this.globals);
      local.def('this', obj.def.name, obj);
      m.params.forEach((p, i) => local.def(p.name, p.type, this.castTo(args[i], p.type)));
      void sc;
      try { this.execStmt(m.body, local); } catch (e) {
        if (e instanceof ReturnSignal) return e.value;
        throw e;
      }
      return m.retType === 'void' ? undefined : defaultValue(m.retType);
    }

    invokeMethod(obj, op, args, swapped, argNodes, sc) {      const f = obj.def.ops && obj.def.ops[op];
      if (!f) throw rt(`结构体 ${obj.def.name} 未重载运算符 ${op}`);
      const local = new Scope(this.globals);
      local.def('this', obj.def.name, obj);
      f.params.forEach((p, i) => local.def(p.name, p.type, this.castTo(args[i], p.type)));
      void swapped; void argNodes; void sc;
      try { this.execStmt(f.body, local); } catch (e) {
        if (e instanceof ReturnSignal) return e.value;
        throw e;
      }
      return 0;
    }

    /* ---------- 容器操作 ---------- */
    keyIndexOf(c, k) {
      if (k === null || typeof k !== 'object') {
        return c.keys.indexOf(k);
      }
      for (let i = 0; i < c.keys.length; i++) {
        if (cmpVals(c.keys[i], k, this, null) === 0) return i;
      }
      return -1;
    }

    mapSet(m, key, val) {
      const idx = this.keyIndexOf(m, key);
      if (idx < 0) {
        m.keys.push(key);
        if (m.ordered) m.keys.sort((a, b) => cmpVals(a, b, this, null));
        m.m.set(key, val);
      } else {
        m.m.set(m.keys[idx], val);
      }
    }

    setInsert(s, v) {
      const idx = this.keyIndexOf(s, v);
      if (idx >= 0) {
        if (!s.multi) return 0;
        s.m.set(s.keys[idx], (s.m.get(s.keys[idx]) || 0) + 1);
        return 0;
      }
      s.m.set(v, 1);
      s.keys.push(v);
      if (s.ordered) s.keys.sort((a, b) => cmpVals(a, b, this, null));
      return 1;
    }

    readInto(node, sc) {
      const ref = this.refOf(node, sc);
      const t = ref.type;
      if (isStringType(t)) { ref.set(this.readToken()); return; }
      if (isFloatType(t)) { ref.set(this.readNumber(true)); return; }
      ref.set(this.readNumber(false));
    }

    writeOut(v) {
      if (v === ENDL_MARK) { this.out += '\n'; return; }
      if (typeof v === 'string') { this.out += v; return; }
      if (v && v.__k === 'struct') { this.out += '[struct ' + v.t + ']'; return; }
      this.out += String(v);
    }

    /* ---------- 输入 ---------- */
    readToken() {
      while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) this.pos++;
      let s = '';
      while (this.pos < this.input.length && !/\s/.test(this.input[this.pos])) s += this.input[this.pos++];
      return s;
    }
    readNumber(isFloat) {
      const tok = this.readToken();
      if (!tok) return 0;
      return isFloat ? parseFloat(tok) : parseInt(tok, 10);
    }
    readLine() {
      let s = '';
      while (this.pos < this.input.length && this.input[this.pos] !== '\n') s += this.input[this.pos++];
      if (this.input[this.pos] === '\n') this.pos++;
      return s;
    }
    readChar() {
      if (this.pos >= this.input.length) return 0;
      return this.input.charCodeAt(this.pos++) | 0;
    }
  }

  /* ══════════════════════════════════════════════════════════
     9. 容器方法
     ══════════════════════════════════════════════════════════ */
  const P = Interp.prototype;

  P.callMethod = function (obj, name, args, argNodes, sc) {
    if (obj == null) throw rt(`对空值调用 ${name}()`);

    if (obj.__k === 'vec' || obj.__k === 'arr') {
      const a = obj.a;
      switch (name) {
        case 'push_back': case 'emplace_back': a.push(isContainer(args[0]) ? cloneVal(args[0]) : args[0]); return undefined;
        case 'pop_back': if (!a.length) throw rt('对空容器 pop_back'); a.pop(); return undefined;
        case 'size': case 'length': return a.length;
        case 'empty': return a.length ? 0 : 1;
        case 'clear': a.length = 0; return undefined;
        case 'front': if (!a.length) throw rt('对空容器取 front'); return a[0];
        case 'back': if (!a.length) throw rt('对空容器取 back'); return a[a.length - 1];
        case 'at': {
          const i = args[0] | 0;
          if (i < 0 || i >= a.length) throw rt(`at 越界（${i} / ${a.length}）`);
          return a[i];
        }
        case 'begin': return mkIt(obj, 0);
        case 'end': return mkIt(obj, a.length);
        case 'resize': {
          const n = args[0] | 0;
          const fillv = args.length > 1 ? args[1] : defaultValue(obj.et);
          if (a.length > n) a.length = n;
          else while (a.length < n) a.push(cloneVal(fillv));
          return undefined;
        }
        case 'assign': {
          a.length = 0;
          if (typeof args[0] === 'number' && args.length > 1) {
            for (let i = 0; i < args[0]; i++) a.push(cloneVal(args[1]));
          } else if (args[0] && args[0].__k) {
            const src = this.rangeOf(args[0], args[1]);
            if (src) src.arr.a.slice(src.from, src.to).forEach(x => a.push(x));
          }
          return undefined;
        }
        case 'insert': {
          const itp = args[0];
          if (itp && itp.__k === 'it') {
            const pos = itp.i;
            for (let i = 1; i < args.length; i++) a.splice(pos + i - 1, 0, args[i]);
            return mkIt(obj, pos);
          }
          const pos = itp | 0;
          for (let i = 1; i < args.length; i++) a.splice(pos + i - 1, 0, args[i]);
          return undefined;
        }
        case 'erase': {
          const itp = args[0];
          if (itp && itp.__k === 'it') { a.splice(itp.i, 1); return mkIt(obj, itp.i); }
          a.splice(itp | 0, 1);
          return undefined;
        }
        case 'swap': {
          const t = a.slice();
          a.length = 0;
          (args[0].a || []).forEach(x => a.push(x));
          args[0].a = t;
          return undefined;
        }
        case 'capacity': return a.length;
        case 'max_size': return 1e9;
        default: throw rt(`vector 不支持的方法 ${name}()`);
      }
    }

    if (obj.__k === 'set' || obj.__k === 'map') {
      switch (name) {
        case 'size': return obj.keys.length;
        case 'empty': return obj.keys.length ? 0 : 1;
        case 'clear': obj.keys.length = 0; obj.m.clear(); return undefined;
        case 'begin': return { __k: 'miter', c: obj, i: 0 };
        case 'end': return { __k: 'miter', c: obj, i: obj.keys.length };
        case 'insert': {
          if (obj.__k === 'set') {
            if (args.length === 2 && args[0].__k === 'it') return this.setInsert(obj, args[1]);
            return this.setInsert(obj, args[0]);
          }
          if (args[0] && args[0].__k === 'pair') { this.mapSet(obj, args[0].f, args[0].s); return undefined; }
          return undefined;
        }
        case 'erase': {
          const k = args[0];
          if (k && (k.__k === 'miter')) { return this.containerEraseAt(obj, k.i); }
          const idx = this.keyIndexOf(obj, k);
          if (idx >= 0) {
            obj.m.delete(obj.keys[idx]);
            obj.keys.splice(idx, 1);
            return 1;
          }
          return 0;
        }
        case 'count': {
          const idx = this.keyIndexOf(obj, args[0]);
          if (idx < 0) return 0;
          return obj.m.get(obj.keys[idx]) || 1;
        }
        case 'find': {
          const idx = this.keyIndexOf(obj, args[0]);
          if (idx < 0) return { __k: 'miter', c: obj, i: obj.keys.length, miss: true };
          return { __k: 'miter', c: obj, i: idx };
        }
        case 'lower_bound': case 'upper_bound': {
          const k = args[0];
          const ks = obj.keys;
          let lo = 0, hi = ks.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            const c = cmpVals(ks[mid], k, this, null);
            if (name === 'lower_bound' ? (c < 0) : (c <= 0)) lo = mid + 1; else hi = mid;
          }
          return { __k: 'miter', c: obj, i: lo };
        }
        case 'at': {
          const pos = this.keyIndexOf(obj, args[0]);
          if (pos < 0) throw rt('map::at 键不存在');
          return obj.m.get(obj.keys[pos]);
        }
        case 'max_size': return 1e9;
        default: throw rt(`${obj.__k} 不支持的方法 ${name}()`);
      }
    }

    if (obj.__k === 'queue') {
      switch (name) {
        case 'push': case 'emplace': obj.a.push(args[0]); return undefined;
        case 'pop': if (obj.h >= obj.a.length) throw rt('对空 queue pop'); obj.a[obj.h++] = undefined; if (obj.h > 4096) { obj.a = obj.a.slice(obj.h); obj.h = 0; } return undefined;
        case 'front': if (obj.h >= obj.a.length) throw rt('对空 queue 取 front'); return obj.a[obj.h];
        case 'back': if (obj.h >= obj.a.length) throw rt('对空 queue 取 back'); return obj.a[obj.a.length - 1];
        case 'size': return obj.a.length - obj.h;
        case 'empty': return obj.a.length - obj.h ? 0 : 1;
        default: throw rt(`queue 不支持的方法 ${name}()`);
      }
    }

    if (obj.__k === 'stack') {
      switch (name) {
        case 'push': case 'emplace': obj.a.push(args[0]); return undefined;
        case 'pop': if (!obj.a.length) throw rt('对空 stack pop'); obj.a.pop(); return undefined;
        case 'top': if (!obj.a.length) throw rt('对空 stack 取 top'); return obj.a[obj.a.length - 1];
        case 'size': return obj.a.length;
        case 'empty': return obj.a.length ? 0 : 1;
        default: throw rt(`stack 不支持的方法 ${name}()`);
      }
    }

    if (obj.__k === 'pq') {
      const less = obj.cmpFn ? null : !/^greater/.test(String(obj.cmp));
      const better = (a, b) => {
        if (obj.cmpFn) return this.invokeCallable(obj.cmpFn, [a, b]) ? 1 : 0;
        const c = cmpVals(a, b, this, null);
        // 默认 less：大的在上（max-heap）；greater：小的在上（min-heap）
        return less ? (c > 0 ? 1 : 0) : (c < 0 ? 1 : 0);
      };
      const up = (i) => {
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (better(obj.a[i], obj.a[p])) { const t = obj.a[i]; obj.a[i] = obj.a[p]; obj.a[p] = t; i = p; }
          else break;
        }
      };
      const down = (i) => {
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let b = i;
          if (l < obj.a.length && better(obj.a[l], obj.a[b])) b = l;
          if (r < obj.a.length && better(obj.a[r], obj.a[b])) b = r;
          if (b === i) break;
          const t = obj.a[i]; obj.a[i] = obj.a[b]; obj.a[b] = t;
          i = b;
        }
      };
      switch (name) {
        case 'push': case 'emplace': obj.a.push(args[0]); up(obj.a.length - 1); return undefined;
        case 'pop': {
          if (!obj.a.length) throw rt('对空 priority_queue pop');
          const last = obj.a.pop();
          if (obj.a.length) { obj.a[0] = last; down(0); }
          return undefined;
        }
        case 'top': if (!obj.a.length) throw rt('对空 priority_queue 取 top'); return obj.a[0];
        case 'size': return obj.a.length;
        case 'empty': return obj.a.length ? 0 : 1;
        default: throw rt(`priority_queue 不支持的方法 ${name}()`);
      }
    }

    if (obj.__k === 'miter') {
      throw rt(`迭代器不支持的方法 ${name}()`);
    }

    if (typeof obj === 'string') {
      switch (name) {
        case 'size': case 'length': return obj.length;
        case 'empty': return obj.length ? 0 : 1;
        case 'substr': {
          const p = args[0] | 0;
          if (p > obj.length) throw rt('substr 起始位置越界');
          const l = args.length > 1 ? (args[1] | 0) : obj.length - p;
          return obj.substr(p, l);
        }
        case 'find': {
          const i = obj.indexOf(args[0], args[1] | 0);
          return i < 0 ? 4294967295 : i;
        }
        case 'rfind': {
          const i = obj.lastIndexOf(args[0]);
          return i < 0 ? 4294967295 : i;
        }
        case 'find_first_of': {
          for (let i = 0; i < obj.length; i++) if (String(args[0]).indexOf(obj[i]) >= 0) return i;
          return 4294967295;
        }
        case 'at': {
          const i = args[0] | 0;
          if (i < 0 || i >= obj.length) throw rt('string::at 越界');
          return obj.charCodeAt(i) | 0;
        }
        case 'push_back': return { __setSelf: obj + this.charish(args[0], 'char') };
        case 'append': return { __setSelf: obj + String(args[0]) };
        case 'insert': {
          if (typeof args[0] === 'number' && args.length === 2) {
            const p = args[0] | 0;
            return { __setSelf: obj.slice(0, p) + String(args[1]) + obj.slice(p) };
          }
          return { __setSelf: obj };
        }
        case 'erase': {
          const p = args[0] | 0;
          const n = args.length > 1 ? (args[1] | 0) : obj.length - p;
          return { __setSelf: obj.slice(0, p) + obj.slice(p + n) };
        }
        case 'replace': {
          const p = args[0] | 0;
          const n = args[1] | 0;
          return { __setSelf: obj.slice(0, p) + String(args[2]) + obj.slice(p + n) };
        }
        case 'pop_back': return { __setSelf: obj.slice(0, -1) };
        case 'clear': return { __setSelf: '' };
        case 'c_str': case 'data': return obj;
        case 'compare': return obj < String(args[0]) ? -1 : (obj > String(args[0]) ? 1 : 0);
        case 'begin': return mkIt(mkVec('char', obj.split('').map(c => c.charCodeAt(0))), 0);
        case 'end': return mkIt(mkVec('char', obj.split('').map(c => c.charCodeAt(0))), obj.length);
        default: throw rt(`string 不支持的方法 ${name}()`);
      }
    }

    throw rt(`该类型不支持 ${name}()`);
  };

  P.containerEraseAt = function (c, i) {
    const k = c.keys[i];
    if (k === undefined) return 0;
    c.m.delete(k);
    c.keys.splice(i, 1);
    return 1;
  };

  /* 取区间：sort(a, b) 里的 a / b */
  P.rangeOf = function (a, b) {
    if (a && a.__k === 'arr') {
      const to = (b && (b.__k === 'ptr' || b.__k === 'it')) ? b.i : a.a.length;
      return { arr: a, from: 0, to };
    }
    if (a && (a.__k === 'it' || a.__k === 'ptr')) {
      const arr = a.__k === 'it' ? a.c : a.arr;
      const from = a.i;
      let to;
      if (b && b.__k === 'it') to = b.i;
      else if (b && b.__k === 'ptr') to = b.i;
      else if (typeof b === 'number') to = b;
      else to = arr.a.length;
      return { arr, from, to };
    }
    return null;
  };

  /* ══════════════════════════════════════════════════════════
     10. 内置函数
     ══════════════════════════════════════════════════════════ */
  P.resolveCallable = function (node, sc) {
    if (!node) return null;
    if (node.kind === 'Id' && this.funcs.has(node.name)) return { __k: 'fnref', name: node.name };
    const v = this.evalExpr(node, sc);
    if (typeof v === 'function' || (v && v.__k === 'lambda')) return v;
    return null;
  };

  P.invokeFnRef = function (ref, args) {
    const local = new Scope(this.globals);
    const fns = this.funcs.get(ref.name);
    const fn = fns.find(f => f.params.length === args.length) || fns[0];
    fn.params.forEach((p, i) => local.def(p.name, p.type, this.castTo(args[i], p.type)));
    try { this.execStmt(fn.body, local); } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    }
    return 0;
  };

  P.callBuiltin = function (name, argNodes, sc) {
    const ev = i => this.evalExpr(argNodes[i], sc);
    const n = argNodes.length;

    switch (name) {
      /* ---- 排序与查找 ---- */
      case 'sort': case 'stable_sort': {
        const a = ev(0);
        let b = n > 1 ? ev(1) : null;
        let cmpNode = null;
        if (n > 2 && !(b && b.__k)) { /* 不可能 */ }
        if (n > 2) cmpNode = argNodes[2];
        if (!b) { b = a && a.__k === 'it' ? mkIt(a.c, a.c.a.length) : null; }
        const r = this.rangeOf(a, b);
        if (!r) throw rt('sort 的参数不是有效区间');
        const cmpFn = cmpNode ? this.resolveCallable(cmpNode, sc) : null;
        const seg = r.arr.a.slice(r.from, r.to);
        const self = this;
        seg.sort((x, y) => cmpVals(x, y, self, cmpFn));
        for (let i = 0; i < seg.length; i++) r.arr.a[r.from + i] = seg[i];
        return undefined;
      }
      case 'reverse': {
        const r = this.rangeOf(ev(0), ev(1));
        if (!r) throw rt('reverse 的参数不是有效区间');
        const seg = r.arr.a.slice(r.from, r.to).reverse();
        for (let i = 0; i < seg.length; i++) r.arr.a[r.from + i] = seg[i];
        return undefined;
      }
      case 'unique': {
        const r = this.rangeOf(ev(0), ev(1));
        if (!r) throw rt('unique 的参数不是有效区间');
        let w = r.from;
        for (let i = r.from; i < r.to; i++) {
          if (i === r.from || r.arr.a[i] !== r.arr.a[w - 1]) r.arr.a[w++] = r.arr.a[i];
        }
        return mkIt(r.arr, w);
      }
      case 'lower_bound': case 'upper_bound': {
        const a = ev(0), b = ev(1);
        const val = ev(2);
        const cmpFn = n > 3 ? this.resolveCallable(argNodes[3], sc) : null;
        const r = this.rangeOf(a, b);
        if (!r) throw rt(name + ' 的参数不是有效区间');
        const arr = r.arr.a;
        let lo = r.from, hi = r.to;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          const c = cmpVals(arr[mid], val, this, cmpFn);
          if (name === 'lower_bound' ? (c < 0) : (c <= 0)) lo = mid + 1; else hi = mid;
        }
        return mkIt(r.arr, lo);
      }
      case 'binary_search': {
        const r = this.rangeOf(ev(0), ev(1));
        const val = ev(2);
        if (!r) return 0;
        const arr = r.arr.a;
        let lo = r.from, hi = r.to;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          const c = cmpVals(arr[mid], val, this, null);
          if (c < 0) lo = mid + 1; else hi = mid;
        }
        return (lo < r.to && cmpVals(arr[lo], val, this, null) === 0) ? 1 : 0;
      }
      case 'max_element': case 'min_element': {
        const r = this.rangeOf(ev(0), ev(1));
        if (!r) throw rt(name + ' 的参数不是有效区间');
        let best = r.from;
        for (let i = r.from; i < r.to; i++) {
          const c = cmpVals(r.arr.a[i], r.arr.a[best], this, null);
          if (name === 'max_element' ? c > 0 : c < 0) best = i;
        }
        return mkIt(r.arr, best);
      }
      case 'nth_element': {
        const r = this.rangeOf(ev(0), ev(1));
        const k = ev(2);
        if (!r) return undefined;
        const seg = r.arr.a.slice(r.from, r.to).sort((x, y) => cmpVals(x, y, this, null));
        r.arr.a[r.from + k.i - r.from] = seg[k.i - r.from];
        return undefined;
      }
      case 'next_permutation': case 'prev_permutation': {
        const r = this.rangeOf(ev(0), ev(1));
        if (!r) return 0;
        const arr = r.arr.a;
        let i = r.to - 2;
        const wantNext = name === 'next_permutation';
        while (i >= r.from && (wantNext ? arr[i] >= arr[i + 1] : arr[i] <= arr[i + 1])) i--;
        if (i < r.from) {
          const seg = arr.slice(r.from, r.to).reverse();
          for (let k = 0; k < seg.length; k++) arr[r.from + k] = seg[k];
          return 0;
        }
        let j = r.to - 1;
        while (wantNext ? arr[j] <= arr[i] : arr[j] >= arr[i]) j--;
        let t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        const tail = arr.slice(i + 1, r.to).reverse();
        for (let k = 0; k < tail.length; k++) arr[i + 1 + k] = tail[k];
        return 1;
      }
      case 'accumulate': {
        const r = this.rangeOf(ev(0), ev(1));
        let acc = n > 2 ? ev(2) : 0;
        if (!r) return acc;
        for (let i = r.from; i < r.to; i++) acc += r.arr.a[i];
        return acc;
      }
      case 'count': {
        const r = this.rangeOf(ev(0), ev(1));
        const v = ev(2);
        if (!r) return 0;
        let c = 0;
        for (let i = r.from; i < r.to; i++) if (r.arr.a[i] === v) c++;
        return c;
      }
      case 'fill': {
        const r = this.rangeOf(ev(0), ev(1));
        const v = ev(2);
        if (!r) return undefined;
        for (let i = r.from; i < r.to; i++) r.arr.a[i] = v;
        return undefined;
      }
      case 'iota': {
        const r = this.rangeOf(ev(0), ev(1));
        let v = ev(2) | 0;
        if (!r) return undefined;
        for (let i = r.from; i < r.to; i++) r.arr.a[i] = v++;
        return undefined;
      }

      /* ---- 构造 ---- */
      case 'make_pair': return mkPair(null, null, ev(0), ev(1));
      case 'make_tuple': return mkVec('int', [ev(0), ev(1)]);

      /* ---- 数学 ---- */
      case 'max': return cmpVals(ev(0), ev(1), this, null) >= 0 ? ev(0) : ev(1);
      case 'min': return cmpVals(ev(0), ev(1), this, null) <= 0 ? ev(0) : ev(1);
      case 'abs': case 'fabs': case 'labs': {
        const v = ev(0);
        return Math.abs(Number(v));
      }
      case 'sqrt': return Math.sqrt(ev(0));
      case 'pow': return Math.pow(ev(0), ev(1));
      case 'floor': return Math.floor(ev(0));
      case 'ceil': return Math.ceil(ev(0));
      case 'round': return Math.round(ev(0));
      case 'trunc': return Math.trunc(ev(0));
      case 'fmod': return Math.trunc(ev(0)) % Math.trunc(ev(1));
      case 'log': return Math.log(ev(0));
      case 'log2': return Math.log2(ev(0));
      case 'log10': return Math.log10(ev(0));
      case 'exp': return Math.exp(ev(0));
      case 'sin': return Math.sin(ev(0));
      case 'cos': return Math.cos(ev(0));
      case 'tan': return Math.tan(ev(0));
      case 'asin': return Math.asin(ev(0));
      case 'acos': return Math.acos(ev(0));
      case 'atan': return Math.atan(ev(0));
      case 'atan2': return Math.atan2(ev(0), ev(1));
      case 'hypot': return Math.hypot(ev(0), ev(1));
      case 'cbrt': return Math.cbrt(ev(0));
      case '__gcd': case 'gcd': {
        let a = Math.abs(ev(0) | 0), b = Math.abs(ev(1) | 0);
        while (b) { const t = a % b; a = b; b = t; }
        return a;
      }
      case 'lcm': {
        const g = this.callBuiltin('__gcd', argNodes, sc);
        const a = Math.abs(ev(0) | 0), b = Math.abs(ev(1) | 0);
        return g ? Math.trunc(a / g * b) : 0;
      }
      case '__builtin_popcount': case '__builtin_popcountl': {
        let x = ev(0) | 0, c = 0;
        while (x) { x &= (x - 1); c++; }
        return c;
      }
      case '__builtin_popcountll': {
        let x = Math.trunc(ev(0)), c = 0;
        while (x) { x = Math.floor(x / 2); if (x % 2 === 0) { /* noop */ } c++; x = Math.floor(x); }
        return c;
      }
      case '__builtin_clz': {
        const x = ev(0) | 0;
        return x === 0 ? 32 : Math.clz32(x);
      }
      case '__builtin_ctz': {
        let x = ev(0) | 0;
        if (!x) return 32;
        let c = 0;
        while (!(x & 1)) { x >>= 1; c++; }
        return c;
      }

      /* ---- 转换 ---- */
      case 'to_string': {
        const v = ev(0);
        if (typeof v === 'number' && !Number.isInteger(v)) {
          return String(Math.round(v * 1e6) / 1e6);
        }
        return String(v);
      }
      case 'stoi': case 'stol': case 'stoll': return parseInt(ev(0), 10) || 0;
      case 'stof': case 'stod': return parseFloat(ev(0)) || 0;

      /* ---- 字符串 / 内存 ---- */
      case 'strlen': {
        const v = ev(0);
        if (v && v.__k === 'arr') { let i = 0; while (i < v.a.length && v.a[i]) i++; return i; }
        return String(v == null ? '' : v).length;
      }
      case 'strcmp': {
        const a = this.toCStr(ev(0)), b = this.toCStr(ev(1));
        return a < b ? -1 : (a > b ? 1 : 0);
      }
      case 'strcpy': {
        const dst = ev(0), src = this.toCStr(ev(1));
        if (dst && dst.__k === 'arr') {
          for (let i = 0; i < dst.a.length; i++) dst.a[i] = i < src.length ? src.charCodeAt(i) : 0;
        }
        return dst;
      }
      case 'strcat': {
        const dst = ev(0), src = this.toCStr(ev(1));
        if (dst && dst.__k === 'arr') {
          let len = 0;
          while (len < dst.a.length && dst.a[len]) len++;
          for (let i = 0; i < src.length && len < dst.a.length; i++) dst.a[len++] = src.charCodeAt(i);
          if (len < dst.a.length) dst.a[len] = 0;
        }
        return dst;
      }
      case 'memset': {
        const p = ev(0), val = ev(1) | 0, bytes = ev(2) | 0;
        const byte = val & 0xFF;
        if (p && p.__k === 'arr') {
          const et = p.et;
          if (byte === 0) {
            for (let i = 0; i < p.a.length; i++) p.a[i] = Array.isArray(p.a[i]) ? p.a[i].map(() => 0) : 0;
          } else {
            const per = sizeOfType(et, this) || 4;
            let v2 = 0;
            for (let k = 0; k < per; k++) v2 |= byte << (8 * k);
            if (et === 'char') v2 = byte;
            for (let i = 0; i < p.a.length; i++) p.a[i] = v2 | 0;
          }
          void bytes;
        }
        return p;
      }
      case 'memcpy': {
        const dst = ev(0), src = ev(1);
        if (dst && dst.__k === 'arr' && src && src.__k === 'arr') {
          for (let i = 0; i < dst.a.length && i < src.a.length; i++) dst.a[i] = src.a[i];
        }
        return dst;
      }
      case 'puts': { this.out += this.toCStr(ev(0)) + '\n'; return 0; }
      case 'putchar': { this.out += String.fromCharCode(ev(0) & 0xFF); return ev(0); }
      case 'getchar': { return this.readChar(); }
      case 'toupper': { const c = ev(0); return typeof c === 'string' ? c.toUpperCase() : String.fromCharCode(c).toUpperCase().charCodeAt(0); }
      case 'tolower': { const c = ev(0); return typeof c === 'string' ? c.toLowerCase() : String.fromCharCode(c).toLowerCase().charCodeAt(0); }
      case 'isalpha': case 'isdigit': case 'isspace': case 'isupper': case 'islower': case 'isalnum': {
        const c = String.fromCharCode(ev(0) & 0xFF);
        const t = { isalpha: /[A-Za-z]/, isdigit: /[0-9]/, isspace: /\s/, isupper: /[A-Z]/, islower: /[a-z]/, isalnum: /[A-Za-z0-9]/ }[name];
        return t.test(c) ? 1 : 0;
      }
      case 'reverse_str': return undefined;

      /* ---- 输入输出 ---- */
      case 'printf': {
        const fmt = this.toCStr(ev(0));
        const rest = [];
        for (let i = 1; i < n; i++) rest.push(this.evalExpr(argNodes[i], sc));
        this.out += cppFormat(fmt, rest);
        return 0;
      }
      case 'sprintf': {
        const dst = this.evalExpr(argNodes[0], sc);
        const fmt = this.toCStr(this.evalExpr(argNodes[1], sc));
        const rest = [];
        for (let i = 2; i < n; i++) rest.push(this.evalExpr(argNodes[i], sc));
        const s = cppFormat(fmt, rest);
        if (dst && dst.__k === 'arr') {
          for (let i = 0; i < dst.a.length; i++) dst.a[i] = i < s.length ? s.charCodeAt(i) : 0;
        }
        return s.length;
      }
      case 'scanf': case 'fscanf': case 'sscanf': {
        const off = (name === 'scanf') ? 0 : (name === 'fscanf' ? 1 : 2);
        const fmt = this.toCStr(this.evalExpr(argNodes[off], sc));
        return this.doScanf(fmt, argNodes.slice(off + 1), sc);
      }
      case 'getline': {
        const s = this.readLine();
        const ref = this.refOf(argNodes[1], sc);
        ref.set(s);
        return this.pos > 0 ? 1 : 0;
      }

      /* ---- 杂项 ---- */
      case 'swap': {
        const r1 = this.refOf(argNodes[0], sc);
        const r2 = this.refOf(argNodes[1], sc);
        const t = r1.get();
        r1.set(cloneVal(r2.get()));
        r2.set(t);
        return undefined;
      }
      case 'rand': return Math.floor(Math.random() * 32768) & 0x7FFF;
      case 'srand': return undefined;
      case 'time': return Math.floor(Date.now() / 1000);
      case 'clock': return Math.floor((Date.now() - this.t0) * 1000);
      case 'exit': throw new ReturnSignal(0);
      case 'abort': throw rt('abort() 被调用');
      case 'malloc': case 'calloc': {
        const bytes = name === 'calloc' ? (ev(0) | 0) * (ev(1) | 0) : (ev(0) | 0);
        return mkArr('char', new Array(Math.max(0, bytes)).fill(0));
      }
      case 'free': return undefined;
      case 'numeric_limits_max': return 2147483647;
      case 'ios_sync': return 0;
      default: break;
    }
    throw rt(`未定义的函数 "${name}"`);
  };

  P.toCStr = function (v) {
    if (v && v.__k === 'arr') {
      let s = '';
      for (let i = 0; i < v.a.length && v.a[i]; i++) s += String.fromCharCode(v.a[i] & 0xFF);
      return s;
    }
    if (v && v.__k === 'vec') return v.a.map(x => String.fromCharCode(x & 0xFF)).join('');
    return String(v == null ? '' : v);
  };

  P.doScanf = function (fmt, nodes, sc) {
    let ai = 0;
    let i = 0;
    let got = 0;
    while (i < fmt.length) {
      if (/\s/.test(fmt[i])) { i++; continue; }
      if (fmt[i] !== '%') { i++; continue; }
      i++;
      if (fmt[i] === '%') { i++; continue; }
      let width = 0;
      while (/[0-9]/.test(fmt[i])) width = width * 10 + (+fmt[i++]);
      let suppress = false;
      if (fmt[i] === '*') { suppress = true; i++; }
      while ('hlL'.indexOf(fmt[i]) >= 0) i++;
      const conv = fmt[i++];
      // 输入耗尽 → 返回 EOF，供 while(scanf(...)!=EOF) 正常退出
      let p = this.pos;
      while (p < this.input.length && /\s/.test(this.input[p])) p++;
      if (p >= this.input.length) return got > 0 ? got : -1;
      if (suppress) {
        if (conv === 'c') this.readChar(); else this.readToken();
        continue;
      }
      const node = nodes[ai++];
      if (!node) break;
      const ref = this.refOf(node, sc);
      if (conv === 'd' || conv === 'i' || conv === 'u') {
        ref.set(this.readNumber(false));
      } else if (conv === 'f' || conv === 'lf' || conv === 'e' || conv === 'g') {
        ref.set(this.readNumber(true));
      } else if (conv === 'c') {
        ref.set(this.readChar());
      } else if (conv === 's') {
        ref.set(this.readToken());
      } else {
        ref.set(this.readToken());
      }
      got++;
      void width;
    }
    return got;
  };

  /* ══════════════════════════════════════════════════════════
     11. 格式化 / sizeof
     ══════════════════════════════════════════════════════════ */
  function cppFormat(fmt, args) {
    let out = '';
    let ai = 0;
    for (let i = 0; i < fmt.length; i++) {
      const c = fmt[i];
      if (c !== '%') { out += c; continue; }
      i++;
      if (fmt[i] === '%') { out += '%'; continue; }
      let spec = '%';
      while (/[-+ 0#]/.test(fmt[i])) spec += fmt[i++];
      while (/[0-9]/.test(fmt[i])) spec += fmt[i++];
      if (fmt[i] === '.') { spec += fmt[i++]; while (/[0-9]/.test(fmt[i])) spec += fmt[i++]; }
      let lenMod = '';
      while ('hlLzjt'.indexOf(fmt[i]) >= 0) { lenMod += fmt[i]; i++; }
      /* %ld / %lld / %zu 走 64 位，不做 int32 截断（否则 long long 全被截成 32 位） */
      const wide = /l/.test(lenMod) || /[zjtL]/.test(lenMod);
      const conv = fmt[i];
      const v = args[ai++];
      const asInt = x => (typeof x === 'bigint' ? x : Math.trunc(Number(x) || 0));
      const asUint64 = x => {
        let b = typeof x === 'bigint' ? x : BigInt(Math.trunc(Number(x) || 0));
        b = BigInt.asUintN(64, b);
        return b;
      };
      switch (conv) {
        case 'd': case 'i':
          out += String(wide ? asInt(v) : (Math.trunc(v) | 0));
          break;
        case 'u':
          if (wide) out += String(asUint64(v));
          else out += String((Math.trunc(v) >>> 0));
          break;
        case 'x': out += (wide ? asUint64(v) : (Math.trunc(v) >>> 0)).toString(16); break;
        case 'X': out += (wide ? asUint64(v) : (Math.trunc(v) >>> 0)).toString(16).toUpperCase(); break;
        case 'o': out += (wide ? asUint64(v) : (Math.trunc(v) >>> 0)).toString(8); break;
        case 'c': out += (typeof v === 'string' ? v : String.fromCharCode(v & 0xFF)); break;
        case 's': out += String(v == null ? '' : v); break;
        case 'f': case 'F': {
          const m = spec.match(/\.(\d+)/);
          out += Number(v).toFixed(m ? +m[1] : 6);
          break;
        }
        case 'e': case 'E': {
          const m = spec.match(/\.(\d+)/);
          const s = Number(v).toExponential(m ? +m[1] : 6);
          out += conv === 'E' ? s.toUpperCase() : s;
          break;
        }
        case 'g': case 'G': out += String(Number(v)); break;
        case 'p': out += '0x' + (v >>> 0).toString(16); break;
        default: out += String(v);
      }
    }
    return out;
  }

  function sizeOfType(t, interp) {
    const type = normType(t);
    if (type.endsWith('*') || type.endsWith('&')) return 8;
    const { base, args } = splitTemplate(type);
    if (base === 'vector' || base === 'string' || base === 'map' || base === 'set' || base === 'queue') return 24;
    if (base === 'pair') return sizeOfType(args[0], interp) + sizeOfType(args[1], interp);
    if (isFloatType(type)) return 8;
    if (isLongType(type)) return 8;
    if (type === 'char' || type === 'bool') return 1;
    if (type === 'short') return 2;
    if (isIntType(type)) return 4;
    const def = interp && interp.structs.get(type);
    if (def) return def.fields.reduce((s, f) => s + sizeOfType(f.type, interp), 0) || 4;
    return 4;
  }

  function sizeOfValue(v, interp) {
    if (v && v.__k === 'arr') {
      const n = v.a.reduce((s, row) => s + (Array.isArray(row) ? row.length : 1), 0);
      return n * sizeOfType(v.et, interp);
    }
    if (v && v.__k === 'vec') return 24;
    if (typeof v === 'string') return 24;
    return 8;
  }

  function coerceContainer(v, t, interp) {
    const { base } = splitTemplate(normType(t));
    if (!v || !v.__k) return defaultValue(t);
    if (base === 'vector' || base === 'deque' || base === 'list') {
      if (v.__k === 'vec') return mkVec(v.et, v.a.map(cloneVal));
      if (v.__k === 'arr') return mkVec(v.et, v.a.map(cloneVal));
      return defaultValue(t);
    }
    void interp;
    return v;
  }

  /* ══════════════════════════════════════════════════════════
     12. 对外 API
     ══════════════════════════════════════════════════════════ */
  function compile(src) {
    const pre = preprocess(String(src == null ? '' : src));
    if (!pre.src.trim()) throw CppError('源文件为空');
    const prog = parse(pre.src, pre.macros);
    return prog;
  }

  function run(prog, input, opts) {
    const o = opts || {};
    const it = new Interp(prog, input);
    if (o.timeLimitMs) it.timeLimitMs = o.timeLimitMs;
    if (o.maxSteps) it.maxSteps = o.maxSteps;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    let error = null, verdict = 'OK';
    try {
      it.run();
    } catch (e) {
      error = e && e.message ? e.message : String(e);
      verdict = (e && e.kind === 'TLE') ? 'TLE' : 'RE';
      if (/超时|步数/.test(error)) verdict = 'TLE';
    }
    const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return { output: it.out, error, verdict, ms };
  }

  function judge(prog, cases, opts) {
    const o = opts || {};
    const res = [];
    for (const tc of cases) {
      const r = run(prog, tc.input || '', o);
      let verdict = r.verdict === 'OK' ? 'AC' : r.verdict;
      if (verdict === 'AC' && tc.expected != null && normOut(r.output) !== normOut(tc.expected)) verdict = 'WA';
      res.push({ verdict, ms: r.ms, output: r.output, error: r.error });
    }
    return res;
  }

  function normOut(s) {
    return String(s == null ? '' : s)
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n+$/, '');
  }

  global.CppEngine = {
    compile,
    run,
    judge,
    normOut,
    version: '3.0',
    __internals: { lex, preprocess, stripComments, splitTemplate, normType, cppFormat },
  };
})(typeof window !== 'undefined' ? window : globalThis);
