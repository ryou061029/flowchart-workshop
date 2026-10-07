// フローチャート工房 v1.0: カード・課題・盤面の読み取り・実行・判定・評価・手札(DOM に依存しない)
// ブラウザでは window.FlowEngine、Node では require('./engine.js') で使う。
// 仕様は generated/docs/flowchart-kobo.md(§3 カード、§4 読み取りルール、§5 課題、§6 評価)。
(function (root) {
  'use strict';

  const MAX_STEPS = 10000;
  const BOARD = { cols: 26, rows: 16 };

  // ---- カード ----
  // 課題データ・保存データ・テストは識別子で書き、画面に出すラベルと日本語の添え字は card() から引く。
  // 識別子: start end if yes no loop continue break print input set eq lt gt add sub mul div mod、
  //         var:a(変数)、num:60(数字)、word:円(ことば)
  const GROUPS = [
    { id: 'terminal', name: 'はじまりとおわり' },
    { id: 'branch', name: '条件分岐' },
    { id: 'loop', name: 'ループ' },
    { id: 'print', name: '出力' },
    { id: 'var', name: '変数' },
    { id: 'num', name: '数値' },
    { id: 'sym', name: '記号' },
  ];
  const FIXED = {
    start: ['terminal', 'term', 'Start', 'はじめ', 2],
    end: ['terminal', 'term', 'End', 'おわり', 2],
    if: ['branch', 'if', 'IF', 'もし', 2],
    yes: ['branch', 'yn', 'Yes', 'はい', 2],
    no: ['branch', 'yn', 'No', 'いいえ', 2],
    loop: ['loop', 'loop', 'LOOP', 'くり返し', 2],
    continue: ['loop', 'loopend', 'CONTINUE', 'もどる', 3],
    break: ['loop', 'loopend', 'BREAK', 'ぬける', 2],
    print: ['print', 'print', 'PRINT', '出力', 2],
    input: ['num', 'input', 'INPUT', '入力', 2],
    set: ['sym', 'sym', '=', '入れる', 2],
    eq: ['sym', 'sym', '==', '等しい', 2],
    lt: ['sym', 'sym', '<', '', 1],
    gt: ['sym', 'sym', '>', '', 1],
    add: ['sym', 'sym', '+', '', 1],
    sub: ['sym', 'sym', '−', '', 1],
    mul: ['sym', 'sym', '×', '', 1],
    div: ['sym', 'sym', '÷', '', 1],
    mod: ['sym', 'sym', '%', '', 1],
  };
  const VARS = ['a', 'b', 'c'];
  const OPS = ['add', 'sub', 'mul', 'div', 'mod'];
  const CMPS = ['eq', 'lt', 'gt'];
  // どの課題でも出る共通カード(手札に並べる順)
  const COMMON = ['start', 'end', 'if', 'yes', 'no', 'loop', 'continue', 'break', 'print',
    ...VARS.map((v) => `var:${v}`), 'input', 'set', 'eq', 'lt', 'gt', ...OPS];

  const wordWidth = (w) => (w.length <= 1 ? 1 : w.length <= 4 ? 2 : w.length <= 7 ? 3 : 4);
  const cache = new Map();
  function card(id) {
    if (cache.has(id)) return cache.get(id);
    let c = null;
    if (FIXED[id]) {
      const [group, kind, label, sub, width] = FIXED[id];
      c = { id, group, kind, label, sub, width };
    } else if (/^var:[abc]$/.test(id)) {
      c = { id, group: 'var', kind: 'var', label: id.slice(4), sub: '', width: 1 };
    } else if (/^num:\d+$/.test(id)) {
      const n = id.slice(4);
      c = { id, group: 'num', kind: 'num', label: n, sub: '', width: n.length <= 2 ? 1 : 2, value: Number(n) };
    } else if (/^word:.+$/.test(id)) {
      const w = id.slice(5);
      c = { id, group: 'print', kind: 'word', label: w, sub: '', width: wordWidth(w) };
    } else {
      throw new Error(`未知のカード: ${id}`);
    }
    cache.set(id, c);
    return c;
  }
  const isValue = (id) => id === 'input' || id.startsWith('var:') || id.startsWith('num:');
  const isPrintable = (id) => isValue(id) || id.startsWith('word:');

  // ---- 盤面の書き方(正解例とテスト用) ----
  // 「開始列:カード カード … | 開始列:…」の行の並びから盤面を作る。カードは識別子の略記で書く
  const TOKENS = {
    start: 'start', end: 'end', if: 'if', yes: 'yes', no: 'no', loop: 'loop', continue: 'continue', break: 'break',
    print: 'print', input: 'input', '=': 'set', '==': 'eq', '<': 'lt', '>': 'gt', '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '%': 'mod',
  };
  function tokenToId(t) {
    if (TOKENS[t]) return TOKENS[t];
    if (VARS.includes(t)) return `var:${t}`;
    if (/^\d+$/.test(t)) return `num:${t}`;
    const m = t.match(/^「(.+)」$/);
    if (m) return `word:${m[1]}`;
    throw new Error(`未知のカード: ${t}`);
  }
  function fromText(lines) {
    const cards = [];
    lines.forEach((line, row) => {
      if (!line.trim()) return;
      for (const seg of line.split('|')) {
        const m = seg.trim().match(/^(\d+):(.*)$/);
        let col = Number(m[1]);
        for (const t of m[2].trim().split(/\s+/)) {
          const id = tokenToId(t);
          cards.push({ id: `c${cards.length + 1}`, card: id, row, col });
          col += card(id).width;
        }
      }
    });
    return cards;
  }

  function usage(board) {
    const n = {};
    for (const c of board) n[c.card] = (n[c.card] || 0) + 1;
    return n;
  }

  // ---- 読み取り ----
  // 式: 値(変数・INPUT・数字)と計算の記号を交互に並べたもの
  function parseExpr(cards) {
    if (!cards.length || cards.length % 2 === 0) return null;
    const toks = [];
    for (let i = 0; i < cards.length; i++) {
      const id = cards[i].card;
      if (i % 2 === 0) {
        if (id === 'input') toks.push({ t: 'in' });
        else if (id.startsWith('var:')) toks.push({ t: 'var', name: card(id).label });
        else if (id.startsWith('num:')) toks.push({ t: 'num', v: card(id).value });
        else return null;
      } else if (OPS.includes(id)) toks.push({ t: 'op', o: id });
      else return null;
    }
    return toks;
  }
  function parseCond(cards) {
    const cmp = cards.filter((c) => CMPS.includes(c.card));
    if (cmp.length !== 1) return null;
    const i = cards.indexOf(cmp[0]);
    const left = parseExpr(cards.slice(0, i)), right = parseExpr(cards.slice(i + 1));
    return left && right ? { op: cmp[0].card, left, right } : null;
  }

  function parse(board) {
    const errors = [];
    const err = (msg, cards) => errors.push({ msg, cards: cards.map((c) => c.id) });
    const fail = () => ({ ok: false, errors, program: null });
    const W = (c) => card(c.card).width;

    // 同じ行ですき間なく並んだカードを 1 つの並び(セグメント)にまとめる
    const segs = [];
    const rows = new Map();
    for (const c of board) {
      if (!rows.has(c.row)) rows.set(c.row, []);
      rows.get(c.row).push(c);
    }
    for (const [row, cs] of rows) {
      cs.sort((a, b) => a.col - b.col);
      let cur = null;
      for (const c of cs) {
        if (cur && c.col === cur.c1) { cur.cards.push(c); cur.c1 += W(c); } else { cur = { row, c0: c.col, c1: c.col + W(c), cards: [c] }; segs.push(cur); }
      }
    }
    const used = new Set();
    const freeSegs = (row, x0, x1) => segs.filter((s) => !used.has(s) && s.row === row && s.c0 >= x0 && s.c0 < x1);

    const starts = board.filter((c) => c.card === 'start');
    if (!starts.length) { err('Start のカードがありません。一番上に Start を 1 枚置いてください。', []); return fail(); }
    if (starts.length > 1) { err('Start のカードが 2 枚以上あります。Start は 1 枚だけにしてください。', starts); return fail(); }
    const startSeg = segs.find((s) => s.cards.includes(starts[0]));
    used.add(startSeg);
    if (startSeg.cards.length > 1) err('Start の横にはカードを並べず、Start だけで 1 行にしてください。', startSeg.cards.filter((c) => c !== starts[0]));
    const ends = board.filter((c) => c.card === 'end');
    const bottomEnd = ends.reduce((a, c) => (!a || c.row > a.row ? c : a), null);
    const lowestEnd = bottomEnd ? bottomEnd.row : -Infinity;

    function parseStatement(cards, row, x0, x1) {
      const node = (kind, extra) => Object.assign({ kind, row, cards: cards.map((c) => c.id) }, extra);
      const head = cards[0].card;
      if (head === 'end') {
        if (cards.length > 1) err('End の横にはカードを並べません。', cards.slice(1));
        return node('end');
      }
      if (head === 'yes' || head === 'no') { err('Yes / No は、IF の行のすぐ下の行に置きます。', [cards[0]]); return null; }
      if (card(head).group === 'loop') {
        if (cards.length > 1) err(`${card(head).label} の横にはカードを並べず、1 枚で 1 行にしてください。`, cards.slice(1));
        return node(head);
      }
      if (head === 'if') {
        const rest = cards.slice(1);
        const sets = rest.filter((c) => c.card === 'set');
        if (sets.length) { err('IF の条件では = ではなく == を使います(= は値を入れるカードです)。', sets); return null; }
        const cond = parseCond(rest);
        if (!cond) { err('IF の後ろには「式 比較 式」を並べます(例: IF a == 0)。比較のカード(== < >)は 1 枚だけ使います。', cards); return null; }
        const next = freeSegs(row + 1, x0, x1);
        const labels = next.filter((s) => s.cards[0].card === 'yes' || s.cards[0].card === 'no');
        const others = next.filter((s) => !labels.includes(s));
        if (!labels.length) { err('IF のすぐ下の行に Yes か No を置いてください。', cards); return null; }
        if (others.length) {
          err('Yes / No の行には、Yes / No で始まる並びだけを置きます。', others.flatMap((s) => s.cards));
          others.forEach((s) => used.add(s));
        }
        labels.forEach((s) => used.add(s));
        if (labels.length > 2 || (labels.length === 2 && labels[0].cards[0].card === labels[1].cards[0].card)) {
          err('IF 1 つにつき、Yes と No は 1 枚ずつ置きます。', labels.map((s) => s.cards[0]));
          return null;
        }
        labels.sort((a, b) => a.c0 - b.c0);
        // Yes と No の間のすき間の中央で左右に区切る
        const mid = labels.length === 2 ? (labels[0].c1 + labels[1].c0) / 2 : null;
        const regions = labels.length === 2 ? [[x0, mid], [mid, x1]] : [[x0, x1]];
        const out = { yes: null, no: null };
        labels.forEach((s, i) => {
          const which = s.cards[0].card;
          out[which] = { label: s.cards[0].id, row: row + 1, body: parseBlock(regions[i][0], regions[i][1], row + 1, s.cards.slice(1)) };
        });
        return node('if', { cond, yes: out.yes, no: out.no });
      }
      if (head === 'print') {
        const items = cards.slice(1);
        if (!items.length || items.some((c) => !isPrintable(c.card))) {
          err('PRINT の後ろには、変数・INPUT・数字・ことばを並べます(例: PRINT a 円)。', cards);
          return null;
        }
        return node('print', { items: items.map((c) => c.card) });
      }
      const words = cards.filter((c) => c.card.startsWith('word:'));
      if (words.length) { err('ことばのカードは PRINT の後ろにだけ置けます。', words); return null; }
      const cmps = cards.filter((c) => CMPS.includes(c.card));
      if (cmps.length) { err('比較のカード(== < >)は IF の条件の中だけで使います。値を入れるときは = を使います。', cmps); return null; }
      const sets = cards.filter((c) => c.card === 'set');
      if (sets.length > 1) { err('1 つの命令に = は 1 枚だけ置きます。', sets); return null; }
      if (sets.length === 1) {
        const i = cards.indexOf(sets[0]);
        if (i !== 1 || !cards[0].card.startsWith('var:')) {
          err('= の左には変数を 1 枚だけ置きます(例: a = INPUT)。', i > 0 ? cards.slice(0, i) : cards);
          return null;
        }
        const expr = parseExpr(cards.slice(2));
        if (!expr) {
          err('= の右には、値(変数・INPUT・数字)と計算の記号を交互に並べます(例: a = INPUT + 1)。', cards.length > 2 ? cards.slice(2) : cards);
          return null;
        }
        return node('set', { target: card(cards[0].card).label, expr });
      }
      err('この並びは命令として読めません。値を入れるなら「a = 式」、出力するなら「PRINT a」の形にします。', cards);
      return null;
    }

    // 区間 [x0, x1) の中を row 行目から下へ読む。firstCards は Yes / No の右に続けて置いた命令
    function parseBlock(x0, x1, row, firstCards) {
      const stmts = [];
      let r = row;
      let cards = firstCards && firstCards.length ? firstCards : null;
      if (firstCards) r = row + (cards ? 0 : 1);
      for (;;) {
        if (!cards) {
          const here = freeSegs(r, x0, x1);
          if (!here.length) break;
          here.forEach((s) => used.add(s));
          if (here.length > 1) {
            err('同じ行に命令が 2 つあります。1 行に置ける命令は 1 つです(Yes / No の行を除く)。', here.flatMap((s) => s.cards));
            break;
          }
          cards = here[0].cards;
        }
        const st = parseStatement(cards, r, x0, x1);
        cards = null;
        if (st) stmts.push(st);
        if (st && st.kind === 'if') break; // IF の下は Yes / No それぞれの道になる
        r += 1;
      }
      return stmts;
    }

    const top = parseBlock(-Infinity, Infinity, starts[0].row + 1, null);

    for (const s of segs) {
      if (used.has(s)) continue;
      const loose = s.cards.filter((c) => c.card !== 'end');
      if (loose.length) err('上の命令とつながっていないカードがあります。行が空いていないか、Yes / No のどちら側に置いたかを確かめてください。', loose);
    }

    // 命令の並びを、ジャンプ付きの一列の命令に変換する
    const code = [];
    const cardsOf = (ids) => board.filter((c) => ids.includes(c.id));
    const finish = (row, cardIds) => {
      if (!(lowestEnd > row)) errors.push({ msg: 'この道の下に End がありません。一番下に End を置いてください。', cards: cardIds });
      code.push({ kind: 'end', row, cards: bottomEnd ? [bottomEnd.id] : [] }); // 道が尽きたら一番下の End に行き着く
    };
    function emitBlock(stmts, loops, tailRow, tailCards) {
      for (const s of stmts) {
        if (s.kind === 'set' || s.kind === 'print') code.push(s);
        else if (s.kind === 'loop') { code.push(s); loops = loops.concat(code.length); } else if (s.kind === 'break') {
          if (!loops.length) err('BREAK の前に LOOP がありません。', cardsOf(s.cards));
          code.push(s);
          loops = loops.slice(0, -1);
        } else if (s.kind === 'continue') {
          if (!loops.length) { err('CONTINUE の前に LOOP がありません。', cardsOf(s.cards)); code.push({ kind: 'end', row: s.row, cards: s.cards }); } else code.push({ kind: 'jump', to: loops[loops.length - 1], row: s.row, cards: s.cards });
          return;
        } else if (s.kind === 'end') { code.push(s); return; } else if (s.kind === 'if') {
          const at = code.length;
          code.push({ kind: 'if', cond: s.cond, row: s.row, cards: s.cards, yesLabel: s.yes && s.yes.label, noLabel: s.no && s.no.label, noAt: null });
          for (const which of ['yes', 'no']) {
            if (which === 'no') code[at].noAt = code.length;
            const br = s[which];
            if (br) emitBlock(br.body, loops, br.row, [br.label]);
            else finish(s.row + 1, s.cards);
          }
          return;
        }
        tailRow = s.row;
        tailCards = s.cards;
      }
      finish(tailRow, tailCards);
    }
    emitBlock(top, [], starts[0].row, [starts[0].id]);

    if (errors.length) return fail();
    return { ok: true, errors, program: { code, startId: starts[0].id } };
  }

  // ---- 実行 ----
  class RunError extends Error {}
  function evalExpr(toks, vars, input) {
    const val = (t) => {
      if (t.t === 'num') return t.v;
      if (t.t === 'in') {
        if (input === null || input === undefined) throw new RunError('この課題には INPUT(入力)がありません。');
        return input;
      }
      if (!(t.name in vars)) throw new RunError(`変数「${t.name}」に値が入っていません。先に「${t.name} = …」で値を入れてください。`);
      return vars[t.name];
    };
    const calc = (a, o, b) => {
      if (o === 'add') return a + b;
      if (o === 'sub') return a - b;
      if (o === 'mul') return a * b;
      if (b === 0) throw new RunError('0 で割ることはできません。');
      return o === 'div' ? Math.trunc(a / b) : a % b;
    };
    // × ÷ % を先にまとめてから + − を左から計算する(同じ強さの記号は左から)
    const terms = [val(toks[0])];
    const ops = [];
    for (let i = 1; i < toks.length; i += 2) {
      const o = toks[i].o, v = val(toks[i + 1]);
      if (o === 'mul' || o === 'div' || o === 'mod') terms.push(calc(terms.pop(), o, v));
      else { ops.push(o); terms.push(v); }
    }
    return ops.reduce((acc, o, i) => calc(acc, o, terms[i + 1]), terms[0]);
  }
  function compare(cond, vars, input) {
    const l = evalExpr(cond.left, vars, input), r = evalExpr(cond.right, vars, input);
    return cond.op === 'eq' ? l === r : cond.op === 'lt' ? l < r : l > r;
  }

  function run(program, input) {
    const vars = {};
    const output = [];
    const visited = new Set([program.startId]);
    const code = program.code;
    let pc = 0;
    let steps = 0;
    const done = (error) => ({ output, visited: [...visited], steps, error });
    try {
      for (;;) {
        if (steps >= MAX_STEPS) return done(`${MAX_STEPS.toLocaleString('ja-JP')} ステップを超えても終わらないため止めました。くり返しを抜ける条件(BREAK)を見直してください。`);
        const ins = code[pc];
        steps += 1;
        ins.cards.forEach((id) => visited.add(id));
        if (ins.kind === 'set') { vars[ins.target] = evalExpr(ins.expr, vars, input); pc += 1; } else if (ins.kind === 'print') {
          output.push(ins.items.map((id) => {
            if (id.startsWith('word:') || id.startsWith('num:')) return card(id).label;
            if (id === 'input') return String(evalExpr([{ t: 'in' }], vars, input));
            return String(evalExpr([{ t: 'var', name: card(id).label }], vars, input));
          }).join(''));
          pc += 1;
        } else if (ins.kind === 'if') {
          const yes = compare(ins.cond, vars, input);
          const label = yes ? ins.yesLabel : ins.noLabel;
          if (label) visited.add(label);
          pc = yes ? pc + 1 : ins.noAt;
        } else if (ins.kind === 'jump') pc = ins.to;
        else if (ins.kind === 'end') return done(null);
        else pc += 1; // loop / break
      }
    } catch (e) {
      if (e instanceof RunError) return done(e.message);
      throw e;
    }
  }

  // ---- 判定 ----
  const sameLines = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  function judge(task, board) {
    const p = parse(board);
    const results = task.cases.map((c) => {
      if (!p.ok) return { input: c.input, expect: c.expect, output: null, error: null, pass: false, visited: [] };
      const r = run(p.program, c.input);
      const pass = !r.error && sameLines(c.expect, r.output);
      return { input: c.input, expect: c.expect, output: r.output, error: r.error, pass, visited: r.visited };
    });
    return { errors: p.errors.slice(), results, allPass: p.ok && results.every((r) => r.pass) };
  }

  // ---- 課題(仕様 §5) ----
  const cases = (list) => list.map(([input, expect]) => ({ input, expect }));
  const ex = (title, note, rows) => ({ title, note, rows });
  const PRACTICE = [
    {
      id: 'p1', level: '練習', no: 1, title: '2 倍にする', nums: [1, 2, 3], words: [],
      goal: 'INPUT(入力)を 2 倍した数を出力する。',
      hint: 'INPUT に × 2 をした結果を変数に入れて、その変数を PRINT します。',
      cases: cases([[3, ['6']], [0, ['0']], [25, ['50']]]),
      examples: [
        ex('正解例', 'INPUT を 2 倍した値を変数 a に入れ、a を PRINT します。',
          ['2:start', '0:a = input * 2', '0:print a', '2:end']),
        ex('別解: 足し算で 2 倍にする', '同じ数を 2 回足しても 2 倍になります。',
          ['2:start', '0:a = input + input', '0:print a', '2:end']),
      ],
    },
    {
      id: 'p2', level: '練習', no: 2, title: '合格かな', nums: [50, 59, 60, 100], words: ['ふごうかく', 'ごうかく'],
      goal: 'INPUT(点数)が 60 より小さければ「ふごうかく」、そうでなければ「ごうかく」と出力する。',
      hint: 'IF の行のすぐ下に Yes と No を置き、それぞれの下に PRINT を置きます。',
      cases: cases([[59, ['ふごうかく']], [60, ['ごうかく']], [100, ['ごうかく']], [0, ['ふごうかく']]]),
      examples: [
        ex('正解例', 'IF の行のすぐ下に Yes と No を置き、それぞれの下に PRINT を置きます。Yes の側は条件に当てはまったとき、No の側は当てはまらなかったときに通ります。',
          ['3:start', '0:if input < 60', '0:yes | 6:no', '0:print 「ふごうかく」 | 6:print 「ごうかく」', '3:end']),
        ex('別解: 59 より大きいかを調べる', '「60 以上」は「59 より大きい」と同じです。Yes と No の下に置く PRINT が入れ替わります。',
          ['3:start', '0:if input > 59', '0:yes | 6:no', '0:print 「ごうかく」 | 6:print 「ふごうかく」', '3:end']),
      ],
    },
  ];
  const min = (m) => m * 60;
  const TASKS = [
    {
      id: 't1', level: '入門', no: 1, title: 'おつり', nums: [10, 100, 1000], words: ['円'], parSec: min(2),
      goal: '1000 円を出して、INPUT の金額の買い物をしたときのおつりを「◯円」と出力する。',
      hint: 'おつりは「出したお金 − 買い物の金額」です。引く順番に気をつけましょう。',
      cases: cases([[300, ['700円']], [999, ['1円']], [1000, ['0円']], [1, ['999円']]]),
      examples: [
        ex('正解例', '出したお金 1000 から買い物の金額を引くと、おつりになります。PRINT の後ろに a と「円」を並べると、つなげて 1 行で出ます。',
          ['3:start', '0:a = 1000 - input', '0:print a 「円」', '3:end']),
        ex('別解: 1000 を変数に入れてから引く', '1000 を先に b に入れておく書き方です。カードは増えますが、何の数かが読みやすくなります。',
          ['3:start', '0:b = 1000', '0:a = b - input', '0:print a 「円」', '3:end']),
      ],
    },
    {
      id: 't2', level: '入門', no: 2, title: '税込み価格', nums: [1, 10, 11, 100], words: ['円'], parSec: min(3),
      goal: 'INPUT(税抜きの値段)に 10% の消費税を足した金額を、1 円未満を切り捨てて「◯円」と出力する。',
      hint: '10% を足すことは 1.1 倍することと同じです。小数のカードはないので、11 倍してから 10 で割ると…?',
      cases: cases([[100, ['110円']], [98, ['107円']], [1000, ['1100円']], [5, ['5円']], [0, ['0円']]]),
      examples: [
        ex('正解例', '10% 増しは 1.1 倍です。小数は使えないので、11 倍してから 10 で割ります。× と ÷ は左から順に計算されます。',
          ['3:start', '0:a = input * 11 / 10', '0:print a 「円」', '3:end']),
        ex('別解: 消費税だけを足す', '値段の 10 分の 1 が消費税です。÷ は + より先に計算されるので、値段に消費税を足した金額になります。',
          ['3:start', '0:a = input + input / 10', '0:print a 「円」', '3:end']),
      ],
    },
    {
      id: 't3', level: '入門', no: 3, title: '十の位', nums: [1, 10, 100], words: [], parSec: min(3),
      goal: 'INPUT の十の位の数字を出力する。',
      hint: '÷ 10 で一の位を切り捨てると、十の位が一番下に来ます。そこから一の位だけを取り出すには…?',
      cases: cases([[7, ['0']], [25, ['2']], [90, ['9']], [130, ['3']], [2026, ['2']]]),
      examples: [
        ex('正解例', '÷ 10 で一の位を切り捨てると、十の位が一番下に来ます。それを 10 で割った余りが十の位です。',
          ['3:start', '0:a = input / 10 % 10', '0:print a', '3:end']),
        ex('別解: 下 2 けたを取り出してから割る', '100 で割った余りで下 2 けたを取り出し、それを 10 で割っても十の位になります。',
          ['3:start', '0:a = input % 100 / 10', '0:print a', '3:end']),
      ],
    },
    {
      id: 't4', level: '初級', no: 4, title: '2 けたの数字の和', nums: [1, 10, 100], words: [], parSec: min(4),
      goal: '2 けたの INPUT について、十の位と一の位の数字を足した数を出力する。',
      hint: '十の位は ÷ 10、一の位は % 10 で取り出せます。',
      cases: cases([[10, ['1']], [23, ['5']], [47, ['11']], [50, ['5']], [99, ['18']]]),
      examples: [
        ex('正解例', '十の位は ÷ 10、一の位は % 10 で取り出せます。÷ と % は + より先に計算されるので、1 行で足せます。',
          ['3:start', '0:a = input / 10 + input % 10', '0:print a', '3:end']),
        ex('別解: 別々の変数に入れてから足す', '十の位を a、一の位を b に入れてから足します。カードは増えますが、何をしているかが分かりやすくなります。',
          ['3:start', '0:a = input / 10', '0:b = input % 10', '0:a = a + b', '0:print a', '3:end']),
      ],
    },
    {
      id: 't5', level: '初級', no: 5, title: '分と秒', nums: [1, 60, 100], words: ['分', '秒'], parSec: min(5),
      goal: 'INPUT(秒数)を「◯分◯秒」の形で出力する。',
      hint: '1 分は 60 秒。分は ÷、残りの秒は % で求められます。PRINT の後ろには変数とことばを交互に並べられます。',
      cases: cases([[75, ['1分15秒']], [60, ['1分0秒']], [59, ['0分59秒']], [0, ['0分0秒']], [3600, ['60分0秒']]]),
      examples: [
        ex('正解例', '60 で割った商が分、余りが秒です。PRINT の後ろに変数とことばを交互に並べます。',
          ['3:start', '0:a = input / 60', '0:b = input % 60', '0:print a 「分」 b 「秒」', '3:end']),
        ex('別解: 余りを引き算で求める', '元の秒数から「分 × 60」を引いた残りが秒です。% を使わずに余りを求める書き方です。',
          ['3:start', '0:a = input / 60', '0:b = input - a * 60', '0:print a 「分」 b 「秒」', '3:end']),
        ex('別解: INPUT をいったん変数に入れる', 'INPUT を c に入れておくと、INPUT のカードは 1 枚で済みます。INPUT が足りないときの書き方です。',
          ['3:start', '0:c = input', '0:a = c / 60', '0:b = c % 60', '0:print a 「分」 b 「秒」', '3:end']),
      ],
    },
    {
      id: 't6', level: '中級', no: 6, title: '絶対値', nums: [0, 1], words: [], parSec: min(5),
      goal: 'INPUT がマイナスならマイナスを取った数を、そうでなければそのままの数を出力する。',
      hint: 'マイナスの数は 0 より小さい数です。0 からその数を引くと、マイナスが取れます。',
      cases: cases([[-5, ['5']], [5, ['5']], [0, ['0']], [-120, ['120']], [7, ['7']]]),
      examples: [
        ex('正解例', 'マイナスの数は 0 より小さい数です。0 からその数を引くとマイナスが取れます。そうでないときは INPUT をそのまま PRINT します。',
          ['4:start', '0:if input < 0', '0:yes | 8:no', '0:a = 0 - input | 8:print input', '0:print a', '4:end']),
        ex('別解: INPUT をいったん変数に入れる', '先に a に入れてから判定します。カードは増えますが、INPUT のカードは 1 枚で済みます。',
          ['4:start', '0:a = input', '0:if a < 0', '0:yes | 7:no', '0:a = 0 - a | 7:print a', '0:print a', '4:end']),
      ],
    },
    {
      id: 't7', level: '中級', no: 7, title: '3 段階の評価', nums: [49, 50, 79, 80, 100], words: ['A', 'B', 'C'], parSec: min(6),
      goal: 'INPUT(点数)が 80 以上なら「A」、50 以上 80 未満なら「B」、50 未満なら「C」と出力する。',
      hint: 'まず 50 より小さいかを調べ、そうでなければ No の側でもう一度調べます。「80 以上」は「79 より大きい」とも言えます。',
      cases: cases([[0, ['C']], [49, ['C']], [50, ['B']], [79, ['B']], [80, ['A']], [100, ['A']]]),
      examples: [
        ex('正解例', 'まず 50 より小さいかを調べ、小さければ C。そうでなければ No の側で 80 より小さいかを調べます。IF の中にもう 1 つ IF を入れる形です。',
          ['4:start', '0:if input < 50', '0:yes | 4:no', '0:print 「C」 | 4:if input < 80', '4:yes | 8:no', '4:print 「B」 | 8:print 「A」', '4:end']),
        ex('別解: 大きいほうから調べる', '「80 以上」は「79 より大きい」と同じです。A から順に決めていく書き方です。',
          ['4:start', '0:if input > 79', '0:yes | 4:no', '0:print 「A」 | 4:if input > 49', '4:yes | 8:no', '4:print 「B」 | 8:print 「C」', '4:end']),
      ],
    },
    {
      id: 't8', level: '上級', no: 8, title: 'カウントダウン', nums: [0, 1, 2], words: [], parSec: min(7),
      goal: 'INPUT(1 以上)から 1 まで、1 ずつ減らしながら 1 行に 1 つずつ出力する。',
      hint: 'LOOP の中で PRINT してから 1 減らし、CONTINUE で戻ります。1 を出力したら BREAK で抜けます。',
      cases: cases([[3, ['3', '2', '1']], [1, ['1']], [5, ['5', '4', '3', '2', '1']]]),
      examples: [
        ex('正解例', 'a を PRINT してから 1 減らし、CONTINUE で LOOP の直後へ戻ります。a が 1 のときは PRINT のあと BREAK で抜けます。',
          ['3:start', '0:a = input', '0:loop', '0:print a', '0:if a == 1', '0:yes break | 6:no a = a - 1', '6:continue', '3:end']),
        ex('別解: 2 より小さいかを調べる', '「1 と等しい」の代わりに「2 より小さい」で調べても同じです。数字の 1 を 1 枚節約できます。',
          ['3:start', '0:a = input', '0:loop', '0:print a', '0:if a < 2', '0:yes break | 6:no a = a - 1', '6:continue', '3:end']),
      ],
    },
    {
      id: 't9', level: '上級', no: 9, title: '2 倍、2 倍', nums: [1, 2], words: [], parSec: min(7),
      goal: '1 から始めて 2 倍し続け、INPUT(1 以上)を初めて超えた数を出力する。',
      hint: '変数に 1 を入れておき、LOOP の中で 2 倍します。INPUT より大きくなったら BREAK で抜けて PRINT します。',
      cases: cases([[1, ['2']], [5, ['8']], [8, ['16']], [100, ['128']], [1000, ['1024']]]),
      examples: [
        ex('正解例', 'a を 2 倍するたびに INPUT と比べ、大きくなったら BREAK で抜けて PRINT します。まだ大きくなければ CONTINUE で戻ります。',
          ['3:start', '0:a = 1', '0:loop', '0:a = a * 2', '0:if a > input', '0:yes break | 6:no continue', '0:print a', '3:end']),
        ex('別解: 2 から始めて先に比べる', '1 を 2 倍した 2 から始め、2 倍する前に比べます。数字の 1 を使わずに書けます。',
          ['3:start', '0:a = 2', '0:loop', '0:if a > input', '0:yes break | 6:no a = a * 2', '0:print a | 6:continue', '3:end']),
      ],
    },
    {
      id: 't10', level: '上級', no: 10, title: 'けた数', nums: [0, 1, 10], words: [], parSec: min(8),
      goal: 'INPUT(1 以上)が何けたの数かを出力する。',
      hint: '10 で割るたびに 1 けたずつ減っていきます。割った回数を別の変数で数え、0 になったら抜けます。',
      cases: cases([[7, ['1']], [10, ['2']], [999, ['3']], [1000, ['4']], [20261005, ['8']]]),
      examples: [
        ex('正解例', '10 で割るたびに 1 けた減り、そのたびに b を 1 増やして数えます。a が 0 になったら、けたを数え終わっています。',
          ['4:start', '0:a = input', '0:b = 0', '0:loop', '0:a = a / 10', '0:b = b + 1', '0:if a == 0', '0:yes break | 6:no continue', '0:print b', '4:end']),
        ex('別解: 0 より大きいかを調べる', '「まだ 0 より大きければ続ける」と考える書き方です。Yes の側で CONTINUE、No の側で BREAK します。',
          ['4:start', '0:a = input', '0:b = 0', '0:loop', '0:a = a / 10', '0:b = b + 1', '0:if a > 0', '0:yes continue | 7:no break', '7:print b', '4:end']),
      ],
    },
  ];
  // 基準枚数 = 正解例と別解のうち最少の枚数(練習には基準を設けない)
  for (const t of PRACTICE) { t.par = null; t.parSec = null; }
  for (const t of TASKS) t.par = Math.min(...t.examples.map((x) => fromText(x.rows).length));
  const ALL = [...PRACTICE, ...TASKS];
  const taskById = (id) => ALL.find((t) => t.id === id) || null;

  // フリーの手札: 共通カード + その課題の数字とことば(枚数の制限なし)
  function trayCards(task) {
    return [...COMMON, ...task.nums.map((n) => `num:${n}`), ...task.words.map((w) => `word:${w}`)];
  }

  // ---- 評価(仕様 §6) ----
  const starCount = (s) => (s.clear ? 1 : 0) + (s.few ? 1 : 0) + (s.fast ? 1 : 0);
  function freeStars(task, { cleared, cards, sec, hintUsed }) {
    return { clear: !!cleared, few: !!cleared && cards <= task.par, fast: !!cleared && !hintUsed && sec <= task.parSec };
  }
  // 一番よい記録を残す。未クリアの回は記録を変えない
  function mergeBest(prev, stars, cards, sec) {
    const p = prev || { clear: false, few: false, fast: false, minCards: null, minSec: null };
    if (!stars.clear) return prev || p;
    return {
      clear: true, few: p.few || stars.few, fast: p.fast || stars.fast,
      minCards: p.minCards === null ? cards : Math.min(p.minCards, cards),
      minSec: p.minSec === null ? sec : Math.min(p.minSec, sec),
    };
  }

  // ---- チャレンジ(仕様 §6.2) ----
  function consume(hand, board) {
    const h = Object.assign({}, hand);
    for (const c of board) {
      h[c.card] = (h[c.card] || 0) - 1;
      if (h[c.card] < 0) return null;
    }
    return h;
  }
  function fitsHand(hand, boards) {
    let h = hand;
    for (const b of boards) { h = consume(h, b); if (!h) return false; }
    return true;
  }
  // plans: 仕掛けを満たす解き方(課題の順に [課題, 正解例・別解の番号])。手札 = 解き方ごとの必要枚数の最大 + 余裕
  const SET_DEFS = [
    { id: 'A', title: '計算の組み立て', tasks: ['t1', 't3', 't5'],
      twist: { card: 'input', count: 3, text: 'INPUT が 3 枚しかない。課題 5 では INPUT の値をいったん変数に入れる必要がある' },
      plans: [[['t1', 0], ['t3', 0], ['t5', 2]]], slack: { set: 1, 'var:a': 1, add: 1 } },
    { id: 'B', title: '分かれ道', tasks: ['t2', 't6', 't7'],
      twist: { card: 'input', count: 4, text: 'INPUT が 4 枚しかない。課題 6 では INPUT の値をいったん変数に入れる必要がある' },
      plans: [[['t2', 0], ['t6', 1], ['t7', 0]]], slack: { set: 1, 'var:a': 1, sub: 1 } },
    { id: 'C', title: 'くり返し', tasks: ['t8', 't9', 't10'],
      twist: { card: 'num:1', count: 3, text: '数字の 1 が 3 枚しかない。どこかで 1 を使わない書き方が必要になる' },
      plans: [[['t8', 0], ['t9', 1], ['t10', 0]], [['t8', 1], ['t9', 0], ['t10', 0]]], slack: { set: 1, 'var:a': 1, add: 1 } },
  ];
  const planBoards = (plan) => plan.map(([id, i]) => fromText(taskById(id).examples[i].rows));
  const SETS = SET_DEFS.map((d) => {
    const hand = {};
    for (const plan of d.plans) {
      const need = {};
      for (const b of planBoards(plan)) for (const [k, n] of Object.entries(usage(b))) need[k] = (need[k] || 0) + n;
      for (const [k, n] of Object.entries(need)) hand[k] = Math.max(hand[k] || 0, n);
    }
    for (const [k, n] of Object.entries(d.slack)) hand[k] = (hand[k] || 0) + n;
    const total = Object.values(hand).reduce((a, b) => a + b, 0);
    const least = Math.min(...d.plans.map((plan) => planBoards(plan).reduce((n, b) => n + b.length, 0)));
    return Object.assign({}, d, {
      hand, parLeft: total - least,
      parSec: d.tasks.reduce((n, id) => n + taskById(id).parSec, 0),
    });
  });
  function challengeStars(set, results, left) {
    const clear = results.length === set.tasks.length && results.every((r) => r.cleared);
    const sec = results.reduce((n, r) => n + r.sec, 0);
    return { clear, few: clear && left >= set.parLeft, fast: clear && sec <= set.parSec && !results.some((r) => r.hintUsed) };
  }

  const api = {
    MAX_STEPS, BOARD, GROUPS, COMMON, card, fromText, usage, parse, run, judge,
    PRACTICE, TASKS, SETS, taskById, trayCards,
    freeStars, starCount, mergeBest, consume, fitsHand, challengeStars,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FlowEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
