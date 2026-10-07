// フローチャート工房 v1.0: カード・読み取り・実行・判定・評価・手札のテスト(node --test)
// 仕様は generated/docs/flowchart-kobo.md。テスト名の AC-n は §10 と §11 の受入条件。
// 盤面の書き方(E.fromText): 1 行 = 「開始列:カード カード …」を | で区切る。空行は ''。
//   カードは識別子で書く: start end if yes no loop continue break print input、記号 = == < > + - * / %、
//   変数 a b c、数字はそのまま、ことばは「円」のようにかぎかっこで囲む。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../app/engine.js');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const task = (id) => E.taskById(id);
const board = (lines) => E.fromText(lines);
const judge = (id, lines) => E.judge(task(id), board(lines));
const assertPass = (id, lines) => {
  const r = judge(id, lines);
  assert.deepEqual(r.errors, [], JSON.stringify(r.errors));
  for (const c of r.results) assert.equal(c.pass, true, `${id} 入力 ${c.input} → ${JSON.stringify(c.output)} ${c.error || ''}`);
  assert.equal(r.allPass, true);
};
const out = (lines, input) => {
  const p = E.parse(board(lines));
  assert.equal(p.ok, true, JSON.stringify(p.errors));
  return E.run(p.program, input);
};

// ---- 課題データ(仕様 §5) ----
test('課題は練習 2 問・本編 10 問で、基準枚数と基準時間は仕様 §5.1 どおり', () => {
  assert.deepEqual(E.PRACTICE.map((t) => t.id), ['p1', 'p2']);
  assert.deepEqual(E.TASKS.map((t) => [t.id, t.par, t.parSec]), [
    ['t1', 10, 120], ['t2', 12, 180], ['t3', 11, 180], ['t4', 13, 240], ['t5', 17, 300],
    ['t6', 17, 300], ['t7', 20, 360], ['t8', 21, 420], ['t9', 21, 420], ['t10', 29, 480],
  ]);
  for (const t of E.PRACTICE) assert.equal(t.par, null, '練習には基準がない');
});

test('テストケースは仕様 §5.2 どおり', () => {
  const SPEC = {
    p1: [[3, ['6']], [0, ['0']], [25, ['50']]],
    p2: [[59, ['ふごうかく']], [60, ['ごうかく']], [100, ['ごうかく']], [0, ['ふごうかく']]],
    t1: [[300, ['700円']], [999, ['1円']], [1000, ['0円']], [1, ['999円']]],
    t2: [[100, ['110円']], [98, ['107円']], [1000, ['1100円']], [5, ['5円']], [0, ['0円']]],
    t3: [[7, ['0']], [25, ['2']], [90, ['9']], [130, ['3']], [2026, ['2']]],
    t4: [[10, ['1']], [23, ['5']], [47, ['11']], [50, ['5']], [99, ['18']]],
    t5: [[75, ['1分15秒']], [60, ['1分0秒']], [59, ['0分59秒']], [0, ['0分0秒']], [3600, ['60分0秒']]],
    t6: [[-5, ['5']], [5, ['5']], [0, ['0']], [-120, ['120']], [7, ['7']]],
    t7: [[0, ['C']], [49, ['C']], [50, ['B']], [79, ['B']], [80, ['A']], [100, ['A']]],
    t8: [[3, ['3', '2', '1']], [1, ['1']], [5, ['5', '4', '3', '2', '1']]],
    t9: [[1, ['2']], [5, ['8']], [8, ['16']], [100, ['128']], [1000, ['1024']]],
    t10: [[7, ['1']], [10, ['2']], [999, ['3']], [1000, ['4']], [20261005, ['8']]],
  };
  for (const [id, cases] of Object.entries(SPEC)) {
    assert.deepEqual(task(id).cases.map((c) => [c.input, c.expect]), cases, id);
  }
});

test('課題の数字とことばは仕様 §5.1 どおり', () => {
  const SPEC = {
    p1: [[1, 2, 3], []], p2: [[50, 59, 60, 100], ['ふごうかく', 'ごうかく']],
    t1: [[10, 100, 1000], ['円']], t2: [[1, 10, 11, 100], ['円']], t3: [[1, 10, 100], []], t4: [[1, 10, 100], []],
    t5: [[1, 60, 100], ['分', '秒']], t6: [[0, 1], []], t7: [[49, 50, 79, 80, 100], ['A', 'B', 'C']],
    t8: [[0, 1, 2], []], t9: [[1, 2], []], t10: [[0, 1, 10], []],
  };
  for (const [id, [nums, words]] of Object.entries(SPEC)) {
    assert.deepEqual([task(id).nums, task(id).words], [nums, words], id);
  }
});

// ---- カード(仕様 §3) ----
test('AC-13: 命令と流れのカード、= と == に日本語の添え字がある', () => {
  const SPEC = {
    start: ['Start', 'はじめ'], end: ['End', 'おわり'], if: ['IF', 'もし'], yes: ['Yes', 'はい'], no: ['No', 'いいえ'],
    loop: ['LOOP', 'くり返し'], continue: ['CONTINUE', 'もどる'], break: ['BREAK', 'ぬける'],
    print: ['PRINT', '出力'], input: ['INPUT', '入力'], set: ['=', '入れる'], eq: ['==', '等しい'],
    lt: ['<', ''], gt: ['>', ''], add: ['+', ''], sub: ['−', ''], mul: ['×', ''], div: ['÷', ''], mod: ['%', ''],
  };
  for (const [id, [label, sub]] of Object.entries(SPEC)) {
    assert.deepEqual([E.card(id).label, E.card(id).sub], [label, sub], id);
  }
  assert.deepEqual([E.card('var:a').label, E.card('var:a').sub], ['a', '']);
  assert.deepEqual([E.card('num:60').label, E.card('word:円').label], ['60', '円']);
});

test('カードは仲間ごとに分かれる(§3.2 の色の仲間)', () => {
  const g = (id) => E.card(id).group;
  assert.deepEqual(['start', 'end'].map(g), ['terminal', 'terminal']);
  assert.deepEqual(['if', 'yes', 'no'].map(g), ['branch', 'branch', 'branch']);
  assert.deepEqual(['loop', 'continue', 'break'].map(g), ['loop', 'loop', 'loop']);
  assert.deepEqual(['print', 'word:円'].map(g), ['print', 'print']);
  assert.deepEqual(['var:a', 'var:b', 'var:c'].map(g), ['var', 'var', 'var']);
  assert.deepEqual(['input', 'num:1', 'num:1000'].map(g), ['num', 'num', 'num']);
  assert.deepEqual(['set', 'eq', 'lt', 'gt', 'add', 'sub', 'mul', 'div', 'mod'].map(g), Array(9).fill('sym'));
  assert.deepEqual(E.GROUPS.map((x) => x.id), ['terminal', 'branch', 'loop', 'print', 'var', 'num', 'sym']);
});

test('カードの幅は §3.1 どおり(数字は 3 けたから 2 マス、= と == は 2 マス)', () => {
  const w = (id) => E.card(id).width;
  assert.deepEqual(['start', 'end', 'if', 'yes', 'no', 'loop', 'break', 'print', 'input'].map(w), Array(9).fill(2));
  assert.equal(w('continue'), 3);
  assert.deepEqual([w('set'), w('eq'), w('lt'), w('gt'), w('add')], [2, 2, 1, 1, 1]);
  assert.deepEqual([w('num:1'), w('num:60'), w('num:100'), w('num:20261005')], [1, 1, 2, 2]);
  assert.deepEqual([w('var:a'), w('word:円'), w('word:ごうかく'), w('word:ふごうかく')], [1, 1, 2, 3]);
});

test('フリーの手札は共通カードとその課題の数字・ことば', () => {
  const ids = E.trayCards(task('t5'));
  for (const id of ['start', 'end', 'if', 'yes', 'no', 'loop', 'continue', 'break', 'print', 'input',
    'set', 'eq', 'lt', 'gt', 'add', 'sub', 'mul', 'div', 'mod', 'var:a', 'var:b', 'var:c',
    'num:1', 'num:60', 'num:100', 'word:分', 'word:秒']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes('word:円'));
  assert.ok(!ids.includes('num:10'));
});

// ---- 正解例と別解(AC-1・AC-2) ----
for (const t of [...E.PRACTICE, ...E.TASKS]) {
  test(`AC-1: ${t.id} には正解例と別解があり、並べ方はすべて異なり、その課題で使えるカードだけを使う`, () => {
    assert.ok(t.examples.length >= 2);
    assert.equal(t.examples[0].title, '正解例');
    t.examples.slice(1).forEach((ex) => assert.ok(ex.title.startsWith('別解'), ex.title));
    for (const ex of t.examples) assert.ok(ex.note, '説明がある');
    const shapes = t.examples.map((ex) => JSON.stringify(board(ex.rows).map((c) => [c.card, c.row, c.col])));
    assert.equal(new Set(shapes).size, shapes.length);
    const tray = new Set(E.trayCards(t));
    for (const ex of t.examples) for (const c of board(ex.rows)) assert.ok(tray.has(c.card), `${ex.title}: ${c.card}`);
  });
  for (const ex of t.examples) {
    test(`AC-1: ${t.id} の「${ex.title}」は全テストケースに合格する`, () => assertPass(t.id, ex.rows));
  }
  if (t.par !== null) {
    test(`AC-2: ${t.id} の基準枚数は正解例と別解のうち最少の枚数`, () => {
      assert.equal(t.par, Math.min(...t.examples.map((ex) => board(ex.rows).length)));
    });
  }
}

// ---- 誤答(AC-3) ----
test('AC-3: 誤った並べ方は、読み取れても不合格になる', () => {
  const WRONG = {
    p1: ['2:start', '0:a = input + 2', '0:print a', '2:end'],
    p2: ['3:start', '0:if input < 59', '0:yes | 6:no', '0:print 「ふごうかく」 | 6:print 「ごうかく」', '3:end'],
    t1: ['3:start', '0:a = input - 1000', '0:print a 「円」', '3:end'],
    t2: ['3:start', '0:a = input / 10 * 11', '0:print a 「円」', '3:end'],
    t3: ['3:start', '0:a = input / 10', '0:print a', '3:end'],
    t4: ['3:start', '0:a = input / 10 + input', '0:print a', '3:end'],
    t5: ['3:start', '0:a = input % 60', '0:b = input / 60', '0:print a 「分」 b 「秒」', '3:end'],
    t6: ['4:start', '0:if input > 0', '0:yes | 8:no', '0:a = 0 - input | 8:print input', '0:print a', '4:end'],
    t7: ['4:start', '0:if input < 49', '0:yes | 4:no', '0:print 「C」 | 4:if input < 80', '4:yes | 8:no', '4:print 「B」 | 8:print 「A」', '4:end'],
    t8: ['3:start', '0:a = input', '0:loop', '0:a = a - 1', '0:print a', '0:if a == 1', '0:yes break | 6:no continue', '3:end'],
    t9: ['3:start', '0:a = 2', '0:loop', '0:a = a * 2', '0:if a > input', '0:yes break | 6:no continue', '0:print a', '3:end'],
    t10: ['4:start', '0:a = input', '0:b = 1', '0:loop', '0:a = a / 10', '0:b = b + 1', '0:if a == 0', '0:yes break | 6:no continue', '0:print b', '4:end'],
  };
  for (const [id, lines] of Object.entries(WRONG)) {
    const r = judge(id, lines);
    assert.deepEqual(r.errors, [], `${id} は読み取れるはず: ${JSON.stringify(r.errors)}`);
    assert.equal(r.allPass, false, `${id} が合格してしまう`);
  }
  // 境界と計算順のケースが狙いどおりに落とす
  const failedOn = (id, lines, input) => judge(id, lines).results.find((c) => c.input === input).pass === false;
  assert.ok(failedOn('t2', WRONG.t2, 98), '課題 2 の 98 は「INPUT ÷ 10 × 11」を落とす');
  assert.ok(failedOn('t7', WRONG.t7, 49), '課題 7 の 49 は境界の取り違えを落とす');
  assert.ok(failedOn('p2', WRONG.p2, 59), '練習 2 の 59 は境界の取り違えを落とす');
});

test('AC-3: くり返しの抜け忘れは、終わらないエラーで不合格になる', () => {
  const r = judge('t8', ['3:start', '0:a = input', '0:loop', '0:print a', '0:a = a - 1', '0:continue', '3:end']);
  assert.deepEqual(r.errors, []);
  assert.equal(r.allPass, false);
  assert.match(r.results[0].error, /終わらない/);
});

// ---- 読み取りエラー(AC-4、§4-9) ----
test('AC-4: 読み取りエラーは、原因のカードと一緒に返る', () => {
  const firstError = (lines) => {
    const b = board(lines);
    const p = E.parse(b);
    assert.equal(p.ok, false, `エラーにならない: ${lines.join(' / ')}`);
    return { e: p.errors[0], b };
  };
  assert.match(firstError(['0:a = 1', '0:print a', '0:end']).e.msg, /Start/);
  assert.match(firstError(['0:start | 5:start', '0:end']).e.msg, /Start/);

  const gap = firstError(['2:start', '0:a = 1', '', '0:print a', '2:end']);
  assert.match(gap.e.msg, /つながって/);
  assert.deepEqual(gap.e.cards.sort(), gap.b.filter((c) => c.row === 3).map((c) => c.id).sort());

  const cases = [
    [['2:start', '0:a = 1 | 6:b = 2', '2:end'], /同じ行/],
    [['2:start', '0:a = 1', '0:if a == 1', '0:print a', '2:end'], /Yes/],
    [['2:start', '0:a +', '2:end'], /読めません/],
    [['2:start', '0:1 = a', '2:end'], /= の左/],
    [['2:start', '0:a = +', '2:end'], /= の右/],
    [['2:start', '0:print +', '2:end'], /PRINT の後ろ/],
    [['2:start', '0:a == 1', '2:end'], /IF の条件の中/],
    [['2:start', '0:a = 「円」', '2:end'], /PRINT の後ろにだけ/],
    [['2:start', '0:a = 1', '0:if a = 1', '0:yes | 4:no', '2:end'], /==/],
    [['2:start', '0:a = 1', '0:print a'], /End/],
    [['2:start', '0:a = 1', '0:continue', '2:end'], /LOOP/],
    [['2:start', '0:a = 1', '0:break', '2:end'], /LOOP/],
    [['2:start', '0:yes', '2:end'], /IF の行のすぐ下/],
  ];
  for (const [lines, re] of cases) {
    const { e } = firstError(lines);
    assert.match(e.msg, re, lines.join(' / '));
    assert.ok(e.cards.length > 0, `原因のカードがある: ${lines.join(' / ')}`);
  }
});

test('AC-4: 実行時のエラー(値の入っていない変数・0 で割る・終わらない)', () => {
  const e1 = out(['2:start', '0:print a', '2:end']).error;
  assert.match(e1, /a/);
  assert.match(e1, /値が入っていません/);
  assert.match(out(['2:start', '0:a = 1 / 0', '2:end']).error, /0 で割る/);
  const loop = out(['2:start', '0:a = 1', '0:loop', '0:a = a + 1', '0:continue', '2:end']);
  assert.match(loop.error, /終わらない/);
  assert.equal(loop.steps, E.MAX_STEPS);
});

// ---- 計算と出力(AC-5) ----
test('AC-5: 計算の優先順位と、同じ強さの記号は左から順に計算する', () => {
  assert.deepEqual(out(['2:start', '0:a = 2 + 3 * 4', '0:print a', '2:end']).output, ['14']);
  assert.deepEqual(out(['2:start', '0:a = input / 10 % 10', '0:print a', '2:end'], 2026).output, ['2']);
  assert.deepEqual(out(['2:start', '0:a = 100 - 10 - 1', '0:print a', '2:end']).output, ['89']);
  assert.deepEqual(out(['2:start', '0:a = input * 11 / 10', '0:print a', '2:end'], 98).output, ['107']);
});

test('AC-5: ÷ は小数点以下を切り捨て、マイナスは 0 の方向へ切り捨てる', () => {
  assert.deepEqual(out(['2:start', '0:a = 7 / 2', '0:print a', '2:end']).output, ['3']);
  assert.deepEqual(out(['2:start', '0:a = 0 - 7', '0:b = a / 2', '0:print b', '2:end']).output, ['-3']);
});

test('AC-5: 比較 3 種(== < >)', () => {
  const lines = (cmp) => ['3:start', `0:if input ${cmp} 5`, '0:yes | 6:no', '0:print 「A」 | 6:print 「B」', '3:end'];
  const pick = (cmp, input) => out(lines(cmp), input).output[0];
  assert.deepEqual(['==', '==', '==', '<', '<', '<', '>', '>', '>'].map((c, i) => pick(c, [4, 5, 6][i % 3])),
    ['B', 'A', 'B', 'A', 'B', 'B', 'B', 'B', 'A']);
});

test('AC-5: PRINT は後ろに並べたものをつなげて 1 行出す', () => {
  assert.deepEqual(out(['2:start', '0:a = 1', '0:b = 15', '0:print a 「分」 b 「秒」', '2:end']).output, ['1分15秒']);
  assert.deepEqual(out(['2:start', '0:print input', '2:end'], 7).output, ['7']);
  assert.deepEqual(out(['2:start', '0:print 100 「円」', '2:end']).output, ['100円']);
});

test('実行: 通ったカードだけが visited に入る(Start と、道の行き着く End を含む)', () => {
  const b = board(task('t7').examples[0].rows);
  const r = E.run(E.parse(b).program, 79);
  const seen = b.filter((c) => r.visited.includes(c.id)).map((c) => c.card);
  assert.ok(seen.includes('word:B'));
  assert.ok(!seen.includes('word:A'));
  assert.ok(!seen.includes('word:C'));
  assert.ok(seen.includes('start'));
  assert.ok(seen.includes('end'));
});

// ---- フリーの評価(AC-6) ----
test('AC-6: フリーの ★ は §6.1 どおり(★2 と ★3 は別々に判定し、ヒントを開くと ★3 は付かない)', () => {
  const t = task('t3'); // 基準 11 枚・180 秒
  const s = (o) => E.freeStars(t, Object.assign({ cleared: true, cards: 11, sec: 180, hintUsed: false }, o));
  assert.deepEqual(s({}), { clear: true, few: true, fast: true });
  assert.deepEqual(s({ cards: 12 }), { clear: true, few: false, fast: true });
  assert.deepEqual(s({ sec: 181 }), { clear: true, few: true, fast: false });
  assert.deepEqual(s({ hintUsed: true }), { clear: true, few: true, fast: false });
  assert.deepEqual(s({ cleared: false }), { clear: false, few: false, fast: false });
  assert.equal(E.starCount(s({ cards: 15 })), 2);
  assert.equal(E.starCount(s({ cleared: false })), 0);
});

test('AC-6: 記録は一番よいものを残し、やり直しで下がらない', () => {
  let best = E.mergeBest(null, { clear: true, few: true, fast: false }, 11, 300);
  best = E.mergeBest(best, { clear: true, few: false, fast: true }, 14, 90);
  assert.deepEqual(best, { clear: true, few: true, fast: true, minCards: 11, minSec: 90 });
  const after = E.mergeBest(best, { clear: false, few: false, fast: false }, 5, 10);
  assert.deepEqual(after, best, '未クリアの回は記録を変えない');
  const worse = E.mergeBest(best, { clear: true, few: false, fast: false }, 30, 900);
  assert.deepEqual(worse, best);
});

// ---- チャレンジ(AC-7・AC-8) ----
const handTotal = (h) => Object.values(h).reduce((a, b) => a + b, 0);

test('チャレンジは 3 セットで、課題の並びと基準時間は §6.2 どおり', () => {
  assert.deepEqual(E.SETS.map((s) => [s.id, s.tasks]), [
    ['A', ['t1', 't3', 't5']], ['B', ['t2', 't6', 't7']], ['C', ['t8', 't9', 't10']],
  ]);
  for (const s of E.SETS) {
    assert.equal(s.parSec, s.tasks.reduce((n, id) => n + task(id).parSec, 0), s.id);
    assert.ok(s.title && s.twist.text, s.id);
  }
});

test('AC-7: 仕掛けを満たす解き方は手札に収まり、正解例をそのまま並べると収まらない', () => {
  const SPEC_TWIST = { A: ['input', 3], B: ['input', 4], C: ['num:1', 3] };
  for (const s of E.SETS) {
    assert.deepEqual([s.twist.card, s.hand[s.twist.card]], SPEC_TWIST[s.id], `${s.id} の足りないカード`);
    assert.ok(s.plans.length >= 1);
    for (const plan of s.plans) {
      assert.deepEqual(plan.map(([id]) => id), s.tasks, `${s.id} の解き方は課題の順`);
      const boards = plan.map(([id, i]) => board(task(id).examples[i].rows));
      assert.ok(E.fitsHand(s.hand, boards), `${s.id} の解き方 ${JSON.stringify(plan)} が収まらない`);
    }
    const models = s.tasks.map((id) => board(task(id).examples[0].rows));
    assert.equal(E.fitsHand(s.hand, models), false, `${s.id} は正解例のままでも収まってしまう`);
  }
});

test('AC-7: 手札の基準(残り枚数)は、最少の解き方で残る枚数', () => {
  for (const s of E.SETS) {
    const least = Math.min(...s.plans.map((plan) => plan.reduce((n, [id, i]) => n + board(task(id).examples[i].rows).length, 0)));
    assert.equal(s.parLeft, handTotal(s.hand) - least, s.id);
    assert.ok(s.parLeft > 0, `${s.id} には余裕のカードがある`);
  }
});

test('AC-8: 正解した課題の盤面のカードは手札から減る。足りなければ使えない', () => {
  const s = E.SETS[0];
  const before = Object.assign({}, s.hand);
  const b1 = board(task('t1').examples[0].rows);
  const after = E.consume(s.hand, b1);
  assert.equal(after.input, s.hand.input - 1);
  assert.equal(handTotal(after), handTotal(s.hand) - b1.length);
  assert.deepEqual(s.hand, before, '元の手札は変えない');
  assert.equal(E.consume({ start: 0 }, b1), null);
});

test('AC-8: チャレンジの ★ は §6.2 どおり', () => {
  const s = E.SETS[1];
  const ok = (sec, hintUsed) => ({ cleared: true, sec, hintUsed: !!hintUsed });
  const third = s.parSec / 3;
  assert.deepEqual(E.challengeStars(s, [ok(third), ok(third), ok(third)], s.parLeft), { clear: true, few: true, fast: true });
  assert.deepEqual(E.challengeStars(s, [ok(third), ok(third), ok(third + 1)], s.parLeft - 1), { clear: true, few: false, fast: false });
  assert.deepEqual(E.challengeStars(s, [ok(10), ok(10, true), ok(10)], s.parLeft), { clear: true, few: true, fast: false });
  assert.deepEqual(E.challengeStars(s, [ok(10), { cleared: false, sec: 10, hintUsed: false }, ok(10)], 99), { clear: false, few: false, fast: false });
  assert.deepEqual(E.challengeStars(s, [ok(10), ok(10)], 99), { clear: false, few: false, fast: false }, '3 問そろわないとクリアではない');
});

// ---- 公開(§11) ----
// 前の版の語句と、公開しない資料に関わる語句の検査は、公開しない作業用の環境で公開前に行う(AC-12・AC-14)
test('AC-14: 公開するファイルが作業用のフォルダを指しておらず、作業用のフォルダは公開しない', () => {
  const files = ['app/index.html', 'app/engine.js', 'app/favicon.svg', 'README.md', 'LICENSE', 'generated/docs/flowchart-kobo.md',
    'generated/docs/flowchart-kobo-card-design.html', 'tools/preview-server.js', '.github/workflows/pages.yml'];
  // 作業用のフォルダの中のファイルを指すパス(フォルダ名だけを書いた決まりの文は対象外)
  const paths = [/tmp\/[\w.-]/, /generated\/reports\/[\w.-]/, /flowchart-puzzle\//];
  for (const f of files) {
    const t = read(f);
    for (const re of paths) assert.ok(!re.test(t), `${f} に ${re} がある`);
  }
  const ignore = read('.gitignore').split(/\r?\n/);
  for (const p of ['tmp/', 'generated/reports/', '.claude/']) assert.ok(ignore.includes(p), `.gitignore に ${p} がない`);
});

test('AC-15: index.html は単体の HTML として開ける', () => {
  const html = read('app/index.html');
  assert.match(html, /^<!doctype html>\s*<html lang="ja">/i);
  for (const re of [
    /<meta charset="utf-8">/, /<meta name="viewport" content="width=device-width, initial-scale=1">/, /<title>フローチャート工房<\/title>/,
    /<meta name="description" content="[^"]{20,}">/, /<meta property="og:title" content="[^"]+">/, /<meta property="og:description" content="[^"]+">/,
    /<meta property="og:type" content="website">/, /<meta property="og:url" content="https:\/\/[^"]+\/flowchart-workshop\/">/,
    /<link rel="icon" href="favicon\.svg" type="image\/svg\+xml">/, /<\/body>\s*<\/html>\s*$/,
  ]) assert.match(html, re);
  assert.match(read('app/favicon.svg'), /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
});

test('AC-16: 画面の下に、記録の保存先・フォントの読み込み・不具合報告先・ソースコード・作者・ライセンスを載せる', () => {
  const foot = read('app/index.html').match(/<footer[\s\S]*?<\/footer>/);
  assert.ok(foot, 'footer がある');
  const f = foot[0];
  assert.match(f, /このブラウザの中にだけ保存/);
  assert.match(f, /Google Fonts/);
  assert.match(f, /href="https:\/\/github\.com\/[^/"]+\/flowchart-workshop\/issues"/);
  assert.match(f, /href="https:\/\/github\.com\/[^/"]+\/flowchart-workshop"/);
  assert.match(f, /© 2026 [^·<]+ · [^<]+<\/p>/, '作者の後ろにライセンスの表記がある');
});

test('AC-17: main への push でテストし、合格したときだけ app/ を公開する。プルリクエストではテストだけ', () => {
  const y = read('.github/workflows/pages.yml');
  assert.match(y, /push:\s*\n\s*branches:\s*\[\s*main\s*\]/);
  assert.match(y, /pull_request:/);
  assert.match(y, /run: node --test test\/engine\.test\.js/);
  assert.match(y, /needs: test/);
  assert.match(y, /if: github\.event_name != 'pull_request'/);
  assert.match(y, /path: app/);
  assert.match(y, /uses: actions\/deploy-pages@v\d+/);
});

test('AC-18: 公開前に置き換える文字(ユーザー名・作者名・ライセンス名)が残っていない', () => {
  for (const f of ['app/index.html', 'README.md', 'LICENSE']) {
    assert.ok(!/__(GITHUB_USER|AUTHOR|LICENSE)__/.test(read(f)), `${f} に置き換え待ちの文字が残っている`);
  }
});
