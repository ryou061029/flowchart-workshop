// スマートフォン幅・タッチ操作の UI テスト(仕様 AC-9・AC-11。ケースは generated/docs/tests/mobile/test-spec.md)
// 使い方: node test/ui/mobile-touch.js [出力先ディレクトリ]   (環境変数 PORT・APP_DIR で待ち受けポートと配信フォルダを変えられる)
//   Playwright はリポジトリの依存に入れない。tmp/playwright に `npm i playwright` と `npx playwright install chromium` をしておく。
//   手元の確認用サーバー(tools/preview-server.js)を自分で起動し、公開サイトには触らない。
//   結果は generated/reports/ui-tests/<yyyy-mm-dd_HHmm>/index.html(スクリーンショット付き)と result.json。NG があれば終了コード 1。
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const pw = (() => {
  try { return require('playwright'); } catch (err) { return require(path.join(ROOT, 'tmp', 'playwright', 'node_modules', 'playwright')); }
})();
const PW_VERSION = (() => { try { return require(path.join(ROOT, 'tmp', 'playwright', 'node_modules', 'playwright', 'package.json')).version; } catch (err) { return '?'; } })();
const PORT = Number(process.env.PORT) || 5190;
const APP_DIR = process.env.APP_DIR ? path.resolve(process.env.APP_DIR) : path.join(ROOT, 'app'); // 壊したコピーでテストが落ちることを確かめるときに差し替える
const BASE = `http://127.0.0.1:${PORT}/`;
const CW = 34, RH = 60, CH = 50, TOP = 5; // index.html の盤面の定数と同じ
const VIEWPORTS = [
  { name: '360', width: 360, height: 800 },
  { name: '390', width: 390, height: 844 },
  { name: '400', width: 400, height: 860 },
  { name: 'landscape', width: 844, height: 390 },
];
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'generated', 'reports', 'ui-tests', stamp));
fs.mkdirSync(OUT, { recursive: true });

// ---- 結果の記録 ----
const CASES = {
  'FC-MOB-001': ['P1', 'スタート画面で本文が横にスクロールしない(4 幅)'],
  'FC-MOB-002': ['P1', '課題画面(フリー 課題 1)で本文が横にスクロールしない(4 幅)'],
  'FC-MOB-003': ['P1', 'クリア画面で本文が横にスクロールしない(4 幅)'],
  'FC-MOB-004': ['P1', 'チャレンジ結果画面で本文が横にスクロールしない(4 幅)'],
  'FC-MOB-005': ['P2', '盤面は盤面の枠の中だけで横にスクロールできる(4 幅)'],
  'FC-MOB-006': ['P1', 'スタート画面と課題画面の操作要素が 24×24px 以上(4 幅)'],
  'FC-MOB-007': ['P3', '同じ操作要素が 44×44px 以上'],
  'FC-MOB-010': ['P1', '手札から盤面へタッチでドラッグして置ける'],
  'FC-MOB-011': ['P1', '盤面のカードをタッチでドラッグして動かせる'],
  'FC-MOB-012': ['P1', '盤面のカードを盤面の外へドラッグすると手札に戻る'],
  'FC-MOB-013': ['P2', '置けないマスへドラッグしても置かれず、盤面は変わらない'],
  'FC-MOB-014': ['P1', '手札をタップして選び、空きマスをタップして置ける'],
  'FC-MOB-015': ['P1', '盤面のカードをタップして選び、「手札に戻す」で手札に戻る'],
  'FC-MOB-016': ['P2', '「ヒントを見る」→ 確認ダイアログ → OK でヒントが表示される'],
  'FC-MOB-017': ['P2', '「盤面を片付ける」で盤面が空になる'],
  'FC-MOB-018': ['P2', '試しに動かす欄に数を入れて実行すると出力が表示される'],
  'FC-MOB-019': ['P2', '「一覧へ戻る」の確認で「やめる」を選ぶと課題画面に留まる'],
  'FC-MOB-020': ['P1', '練習 1 をタッチだけで置いて判定し、クリア画面まで進める'],
  'FC-MOB-021': ['P1', 'セット A で課題 1 をクリアし、残り 2 問をあきらめて結果画面まで進める'],
  'FC-MOB-022': ['P2', '再読み込みしても同じ課題画面で盤面のカードが残る'],
};
const results = {}; // id → { checks: [{ok, note, shot}] }
function record(id, ok, note, shot) {
  (results[id] = results[id] || { checks: [] }).checks.push({ ok: !!ok, note, shot: shot ? path.basename(shot) : null });
  console.log(`${ok ? 'ok ' : 'NG '} ${id} ${note}`);
}
async function shot(page, name, full) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: !!full });
  return file;
}

// ---- ブラウザ操作の部品 ----
const $ = (page, sel) => page.locator(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 画面の状態は DOM と保存データ(localStorage)から読む(画面側の変数はクロージャの中で、外から触らない)
const screen = (page) => page.evaluate(() => ['home', 'play', 'clear', 'result'].find((k) => !document.getElementById(`s-${k}`).hidden) || null);
const boardCards = (page) => page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('flowchart-kobo:v3') || 'null');
  return s && s.play ? s.play.board.map((k) => [k.card, k.row, k.col]) : null;
});
const waitScreen = (page, name) => page.waitForFunction((name) => !document.getElementById(`s-${name}`).hidden, name);
const layoutOf = (page, id) => page.evaluate((id) => FlowEngine.fromText(FlowEngine.taskById(id).examples[0].rows).map((k) => [k.card, k.row, k.col]), id);

async function hscroll(page) {
  return page.evaluate(() => {
    const d = document.documentElement;
    const over = [...document.querySelectorAll('body *')].filter((el) => {
      if (el.closest('.board-scroll, .table-wrap, .tray-panel, [hidden]')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > window.innerWidth + 1;
    }).slice(0, 5).map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}`);
    return { sw: Math.max(d.scrollWidth, document.body.scrollWidth), iw: window.innerWidth, over };
  });
}
async function checkNoHScroll(page, id, vp, name) {
  const h = await hscroll(page);
  const ok = h.sw <= h.iw && h.over.length === 0;
  const file = await shot(page, `${id}-${vp.name}-${name}`, true);
  record(id, ok, `幅 ${vp.name}: scrollWidth ${h.sw} / innerWidth ${h.iw}${h.over.length ? ' はみ出し: ' + h.over.join(', ') : ''}`, file);
}
async function sizes(page) {
  return page.evaluate(() => [...document.querySelectorAll('button, a, input, summary')]
    // 文中のリンク(段落の中の inline の a)は WCAG 2.5.8 の例外なので対象にしない
    .filter((el) => el.offsetParent !== null && !el.closest('[hidden]') && !(el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.closest('p, li')))
    .map((el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), name: (el.getAttribute('aria-label') || el.textContent || el.id || el.tagName).trim().slice(0, 24) }; }));
}
// タッチのドラッグ(CDP で touchStart → touchMove × steps → touchEnd。index.html の pointer イベントに届く)
async function touchDrag(page, cdp, from, to, steps = 12) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps, y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await sleep(16);
  }
  // 指を止めてから離す。動かしながら離すと Chromium がフリングと見なし、直後のタップの click を抑止する(実機ではなく合成イベントの出し方の問題)
  for (let k = 0; k < 3; k++) { await sleep(100); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: to.x, y: to.y }] }); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(150);
}
// 押さえる位置はカードの中心にする(Start・End・IF・PRINT は角を落とした形で、左上の角はカードの外になる)
const boardMsg = (page) => page.evaluate(() => document.getElementById('board-msg').textContent.trim());
// 盤面の (row, col) にあるカードの左上(index.html の cardHtml と同じ: left = col*CW+2, top = row*RH+TOP)
async function cellOrigin(page, row, col) {
  const r = await $(page, '#board').boundingBox();
  return { x: r.x + col * CW + 2, y: r.y + row * RH + TOP };
}
// 要素の中心と、左上からの差(ドロップ先の計算に使う)
async function centerOf(page, sel) {
  const r = await $(page, sel).boundingBox();
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, offX: r.width / 2, offY: r.height / 2 } : null;
}
// カードを from(中心)で押さえたまま、(row, col) へ動かしたときの指の位置
async function dropPoint(page, from, row, col) {
  const o = await cellOrigin(page, row, col);
  return { x: o.x + from.offX, y: o.y + from.offY };
}
// 画面上のその点で、指定の要素が実際に押せるか(別の要素に隠れていないか・画面内か)
const hitTest = (page, p, sel) => page.evaluate(([x, y, sel]) => {
  if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
  const el = document.elementFromPoint(x, y);
  return !!(el && el.closest(sel));
}, [p.x, p.y, sel]);
// 置き先のマスが画面に入るように本文をスクロールする(上端・下端から 30px の余裕を取る)
async function showCell(page, row, col) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const o = await cellOrigin(page, row, col);
    const vh = await page.evaluate(() => innerHeight);
    if (o.y + RH > vh - 30) await page.evaluate((d) => window.scrollBy(0, d), o.y + RH - (vh - 30));
    else if (o.y < 30) await page.evaluate((d) => window.scrollBy(0, d), o.y - 30);
    else break;
    await sleep(100);
  }
}
// 手札のチップと置き先のマスが同時に画面に入るように整える。入らなければ理由を返す
//   1. 置き先のマスを画面の下側に出す  2. 手札の枠(tray-panel)の中だけをスクロールしてチップを出す  3. 両方が押せるか確かめる
async function arrange(page, chipSel, row, col) {
  await $(page, '#tray').scrollIntoViewIfNeeded();
  await showCell(page, row, col);
  await page.evaluate((sel) => {
    const chip = document.querySelector(sel), panel = chip && chip.closest('.tray-panel');
    if (!chip || !panel) return;
    const pr = panel.getBoundingClientRect(), cr = chip.getBoundingClientRect();
    const top = Math.max(pr.top, 0), bottom = Math.min(pr.bottom, innerHeight);
    if (cr.top < top) panel.scrollTop -= top - cr.top + 4;
    else if (cr.bottom > bottom) panel.scrollTop += cr.bottom - bottom + 4;
  }, chipSel);
  await sleep(100);
  const from = await centerOf(page, `${chipSel} .card`);
  const to = from && (await dropPoint(page, from, row, col));
  const okFrom = from && (await hitTest(page, from, chipSel));
  const okTo = to && (await hitTest(page, to, '#board'));
  if (okFrom && okTo) return { from, to };
  return { why: `手札と置き先が同時に画面に入らない(手札 ${okFrom ? '見える' : '見えない'} / 置き先 ${okTo ? '見える' : '見えない'})` };
}
async function dragChipToCell(page, cdp, card, row, col) {
  const a = await arrange(page, `#tray .chip[data-card="${card}"]`, row, col);
  if (a.why) return { done: false, why: a.why };
  await touchDrag(page, cdp, a.from, a.to);
  return { done: true, msg: await boardMsg(page) };
}
// 盤面のカード(sel)を押さえて (row, col) へ動かす。row が null なら to(指の位置)へそのまま動かす
async function dragBoardCard(page, cdp, sel, row, col, to) {
  await showCell(page, row === null ? 0 : row, 0);
  const from = await centerOf(page, sel);
  if (!from || !(await hitTest(page, from, sel))) return { done: false, why: '盤面のカードが押せない' };
  await touchDrag(page, cdp, from, row === null ? to : await dropPoint(page, from, row, col));
  return { done: true, msg: await boardMsg(page) };
}
// 手札をタップして選び、(row, col) のマスをタップして置く。各段階を確かめ、だめなら理由を返す
async function tapChipThenCell(page, card, row, col) {
  const chipSel = `#tray .chip[data-card="${card}"]`;
  const chip = $(page, chipSel);
  await chip.scrollIntoViewIfNeeded();
  await chip.tap();
  await sleep(50);
  const selected = await page.evaluate(() => !document.getElementById('sel-bar').hidden);
  if (!selected) return { done: false, why: `手札のタップで選べない: ${await boardMsg(page)}` };
  await showCell(page, row, col);
  const o = await cellOrigin(page, row, col);
  const p = { x: o.x + 8, y: o.y + CH / 2 }; // マスの左端寄り・上下の中央(カードの形の影響を受けない)
  if (!(await hitTest(page, p, '#board'))) return { done: false, why: '置き先のマスが押せない' };
  const before = ((await boardCards(page)) || []).length;
  await page.touchscreen.tap(p.x, p.y);
  await sleep(50);
  const after = ((await boardCards(page)) || []).length;
  return after === before + 1 ? { done: true } : { done: false, why: `マスのタップで置けない: ${await boardMsg(page)}` };
}
async function placeByTap(page, layout) {
  const fails = [];
  for (const [card, row, col] of layout) { const r = await tapChipThenCell(page, card, row, col); if (!r.done) fails.push(`${card}@${row},${col}: ${r.why}`); }
  return fails;
}
// スタートへ戻る。保存した続き(クリア画面・結果画面・課題画面)から開いたときは、画面のボタンで戻る
async function openHome(page) {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof FlowEngine !== 'undefined');
  const scr = await screen(page);
  if (scr === 'clear') await $(page, '#cl-actions [data-act="home"]').tap();
  else if (scr === 'result') await $(page, '#rs-home').tap();
  else if (scr === 'play') {
    await $(page, '#leave-btn').tap();
    const asked = await page.waitForSelector('#ask:not([hidden])', { timeout: 1000 }).then(() => true).catch(() => false);
    if (asked) await $(page, '#ask-ok').tap();
  }
  await waitScreen(page, 'home');
}
async function tapHome(page, sel) {
  await openHome(page);
  await $(page, sel).scrollIntoViewIfNeeded();
  await $(page, sel).tap();
  await waitScreen(page, 'play');
}
// あきらめる → 確認 OK。最後の課題でなければクリア画面(あきらめた記録)を経て「次の課題へ」、最後なら結果画面
async function giveUp(page) {
  await $(page, '#giveup-btn').scrollIntoViewIfNeeded();
  await $(page, '#giveup-btn').tap();
  await page.waitForSelector('#ask:not([hidden])');
  await $(page, '#ask-ok').tap();
  await page.waitForFunction(() => !document.getElementById('s-clear').hidden || !document.getElementById('s-result').hidden);
  if ((await screen(page)) === 'clear') {
    await $(page, '#cl-actions [data-act="next-ch"]').tap();
    await waitScreen(page, 'play');
  }
}

// ---- 幅ごとの確認(001〜007) ----
async function runLayout(browser, vp, errors) {
  const ctx = await browser.newContext({ ...pw.devices['iPhone 13'], viewport: { width: vp.width, height: vp.height }, locale: 'ja-JP', colorScheme: 'light' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${vp.name}: ${e.message}`));
  await openHome(page);
  await checkNoHScroll(page, 'FC-MOB-001', vp, 'home');
  const homeSizes = await sizes(page);

  await tapHome(page, '[data-free="t1"]');
  await checkNoHScroll(page, 'FC-MOB-002', vp, 'play');
  const playSizes = await sizes(page);
  const bs = await page.evaluate(() => { const el = document.getElementById('board-scroll'); return { sw: el.scrollWidth, cw: el.clientWidth }; });
  record('FC-MOB-005', bs.sw > bs.cw, `幅 ${vp.name}: 盤面の枠 scrollWidth ${bs.sw} > clientWidth ${bs.cw}`);
  const all = [...homeSizes, ...playSizes];
  const small24 = all.filter((s) => s.w < 24 || s.h < 24);
  const small44 = all.filter((s) => s.w < 44 || s.h < 44);
  record('FC-MOB-006', small24.length === 0, `幅 ${vp.name}: ${all.length} 要素中 24px 未満 ${small24.length} 件${small24.length ? ': ' + small24.map((s) => `${s.name}(${s.w}×${s.h})` ).join(', ') : ''}`);
  const names = [...new Set(small44.map((s) => `${s.name}(${s.w}×${s.h})`))];
  record('FC-MOB-007', small44.length === 0, `幅 ${vp.name}: ${all.length} 要素中 44px 未満 ${small44.length} 件${names.length ? ': ' + names.slice(0, 12).join(', ') + (names.length > 12 ? ' …' : '') : ''}`);

  const f3 = await placeByTap(page, await layoutOf(page, 't1'));
  if (f3.length) record('FC-MOB-003', false, `幅 ${vp.name}: タップで置けない: ${f3.join(' / ')}`);
  await $(page, '#judge-btn').scrollIntoViewIfNeeded();
  await $(page, '#judge-btn').tap();
  await waitScreen(page, 'clear');
  await checkNoHScroll(page, 'FC-MOB-003', vp, 'clear');

  await tapHome(page, '[data-set="A"]');
  for (let i = 0; i < 3; i++) await giveUp(page);
  await waitScreen(page, 'result');
  await checkNoHScroll(page, 'FC-MOB-004', vp, 'result');
  await ctx.close();
}

// ---- タッチ操作(010〜022、幅 390) ----
async function runTouch(browser, errors) {
  const vp = VIEWPORTS[1];
  const ctx = await browser.newContext({ ...pw.devices['iPhone 13'], viewport: { width: vp.width, height: vp.height }, locale: 'ja-JP', colorScheme: 'light' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`touch: ${e.message}`));
  const cdp = await ctx.newCDPSession(page);
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // 010: 手札 → 盤面
  await tapHome(page, '[data-practice="p1"]');
  let r = await dragChipToCell(page, cdp, 'start', 0, 2);
  let b = await boardCards(page);
  record('FC-MOB-010', r.done && eq(b, [['start', 0, 2]]), r.done ? `ドラッグ後の盤面 ${JSON.stringify(b)}。${r.msg}` : r.why, await shot(page, 'FC-MOB-010'));
  if (!eq(b, [['start', 0, 2]])) { await $(page, '#clear-btn').tap(); await tapChipThenCell(page, 'start', 0, 2); }

  // 011: 盤面内で動かす
  r = await dragBoardCard(page, cdp, '#board .card[data-id]', 0, 4);
  b = await boardCards(page);
  record('FC-MOB-011', r.done && eq(b, [['start', 0, 4]]), r.done ? `盤面 ${JSON.stringify(b)}。${r.msg}` : r.why, await shot(page, 'FC-MOB-011'));

  // 012: 盤面の外へ
  await showCell(page, 0, 0);
  const sc = await $(page, '#board-scroll').boundingBox();
  const c0 = await centerOf(page, '#board .card[data-id]');
  const to = { x: c0.x, y: Math.max(10, sc.y - 40) };
  r = await dragBoardCard(page, cdp, '#board .card[data-id]', null, null, to);
  b = await boardCards(page);
  record('FC-MOB-012', r.done && eq(b, []), r.done ? `盤面 ${JSON.stringify(b)}(枠の上 ${Math.round(to.y)}px へ)。${r.msg}` : r.why, await shot(page, 'FC-MOB-012'));

  // 013: 重なるマスへ
  await tapChipThenCell(page, 'start', 0, 2);
  r = await dragChipToCell(page, cdp, 'end', 0, 3);
  b = await boardCards(page);
  record('FC-MOB-013', r.done && eq(b, [['start', 0, 2]]), r.done ? `盤面 ${JSON.stringify(b)}。${r.msg}` : r.why, await shot(page, 'FC-MOB-013'));

  // 014: タップで置く
  const r14 = await tapChipThenCell(page, 'var:a', 1, 0);
  b = await boardCards(page);
  const sel = await page.evaluate(() => (document.getElementById('sel-bar').hidden ? null : document.getElementById('sel-bar').textContent));
  record('FC-MOB-014', r14.done && eq(b, [['start', 0, 2], ['var:a', 1, 0]]) && !sel, `盤面 ${JSON.stringify(b)} 選択 ${JSON.stringify(sel)}${r14.done ? '' : ' ' + r14.why}`, await shot(page, 'FC-MOB-014'));

  // 015: 盤面のカードを選んで手札に戻す
  await $(page, '#board').scrollIntoViewIfNeeded();
  const aCard = $(page, '#board .card[data-id]').nth(1);
  await aCard.tap();
  await $(page, '#sel-bar [data-selbar="remove"]').tap();
  b = await boardCards(page);
  record('FC-MOB-015', eq(b, [['start', 0, 2]]), `盤面 ${JSON.stringify(b)}`, await shot(page, 'FC-MOB-015'));

  // 017: 片付ける
  await $(page, '#clear-btn').scrollIntoViewIfNeeded();
  await $(page, '#clear-btn').tap();
  b = await boardCards(page);
  record('FC-MOB-017', eq(b, []), `盤面 ${JSON.stringify(b)}`, await shot(page, 'FC-MOB-017'));

  // 018: 試しに動かす
  const f18 = await placeByTap(page, await layoutOf(page, 'p1'));
  await $(page, '#trial-input').scrollIntoViewIfNeeded();
  await $(page, '#trial-input').tap();
  await $(page, '#trial-input').fill('3');
  await $(page, '#trial button[type="submit"]').tap();
  await sleep(100);
  const out = await $(page, '#trial-out').textContent();
  record('FC-MOB-018', /6/.test(out) && f18.length === 0, `出力欄: ${out.trim()}${f18.length ? ' 置けなかった: ' + f18.join(' / ') : ''}`, await shot(page, 'FC-MOB-018'));

  // 020: 練習 1 をタッチだけでクリア(ドラッグで置く。置けなければタップ)
  await $(page, '#clear-btn').scrollIntoViewIfNeeded();
  await $(page, '#clear-btn').tap();
  const layout = await layoutOf(page, 'p1');
  const fallback = [];
  for (const [card, row, col] of layout) {
    const before = (await boardCards(page)).length;
    const d = await dragChipToCell(page, cdp, card, row, col);
    if (!d.done || (await boardCards(page)).length === before) { fallback.push(`${card}@${row},${col}(${d.done ? d.msg : d.why})`); await tapChipThenCell(page, card, row, col); }
  }
  await $(page, '#judge-btn').scrollIntoViewIfNeeded();
  await $(page, '#judge-btn').tap();
  await sleep(200);
  const scr = await screen(page);
  record('FC-MOB-020', scr === 'clear' && fallback.length === 0, `判定後の画面 ${scr}。ドラッグで置けずタップで置いた: ${fallback.length ? fallback.join(' ') : 'なし'}`, await shot(page, 'FC-MOB-020', true));

  // 016 / 019 / 022: フリー 課題 1 で
  await tapHome(page, '[data-free="t1"]');
  await $(page, '#hint-btn').scrollIntoViewIfNeeded();
  await $(page, '#hint-btn').tap();
  const asked = await page.waitForSelector('#ask:not([hidden])', { timeout: 2000 }).then(() => true).catch(() => false);
  if (asked) await $(page, '#ask-ok').tap();
  await sleep(100);
  const hintShown = await page.evaluate(() => !document.getElementById('hint-text').hidden && document.getElementById('hint-btn').textContent === 'ヒントを閉じる');
  record('FC-MOB-016', asked && hintShown, `確認ダイアログ ${asked ? '表示' : 'なし'}、ヒント ${hintShown ? '表示' : 'なし'}`, await shot(page, 'FC-MOB-016'));

  await tapChipThenCell(page, 'start', 0, 3);
  await $(page, '#leave-btn').scrollIntoViewIfNeeded();
  await $(page, '#leave-btn').tap();
  const asked2 = await page.waitForSelector('#ask:not([hidden])', { timeout: 2000 }).then(() => true).catch(() => false);
  if (asked2) await $(page, '#ask-cancel').tap();
  await sleep(100);
  record('FC-MOB-019', asked2 && (await screen(page)) === 'play' && eq(await boardCards(page), [['start', 0, 3]]), `確認ダイアログ ${asked2 ? '表示' : 'なし'}、画面 ${await screen(page)}`, await shot(page, 'FC-MOB-019'));

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof FlowEngine !== 'undefined');
  record('FC-MOB-022', (await screen(page)) === 'play' && eq(await boardCards(page), [['start', 0, 3]]), `再読み込み後の画面 ${await screen(page)}、盤面 ${JSON.stringify(await boardCards(page))}`, await shot(page, 'FC-MOB-022'));

  // 021: セット A を通しで結果画面まで
  await tapHome(page, '[data-set="A"]');
  const f21 = await placeByTap(page, await layoutOf(page, 't1'));
  if (f21.length) record('FC-MOB-021', false, `タップで置けない: ${f21.join(' / ')}`);
  await $(page, '#judge-btn').scrollIntoViewIfNeeded();
  await $(page, '#judge-btn').tap();
  await waitScreen(page, 'clear');
  await $(page, '#cl-actions [data-act="next-ch"]').scrollIntoViewIfNeeded();
  await $(page, '#cl-actions [data-act="next-ch"]').tap();
  await waitScreen(page, 'play');
  await giveUp(page);
  await giveUp(page);
  await sleep(200);
  const note = await $(page, '#rs-note').textContent().catch(() => '');
  record('FC-MOB-021', (await screen(page)) === 'result' && /1 \/ 3/.test(note), `画面 ${await screen(page)}、${note.trim()}`, await shot(page, 'FC-MOB-021', true));
  await ctx.close();
}

// ---- レポート ----
function writeReport(errors, ms) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const rows = Object.entries(CASES).map(([id, [pri, title]]) => {
    const r = results[id] || { checks: [] };
    const ok = r.checks.length > 0 && r.checks.every((c) => c.ok);
    const status = r.checks.length === 0 ? '未実施' : ok ? 'OK' : 'NG';
    return { id, pri, title, status, checks: r.checks };
  });
  const count = (s) => rows.filter((r) => r.status === s).length;
  // P3(あると良い確認)の NG は残課題にできるので、終了コードには数えない(テスト計画 §5)
  const ngBlocking = rows.filter((r) => r.status === 'NG' && r.pri !== 'P3').length;
  const summary = { ok: count('OK'), ng: count('NG'), ngBlocking, none: count('未実施'), total: rows.length, errors, ms, stamp };
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ summary, rows }, null, 2));
  const css = fs.readFileSync(path.join(__dirname, 'report-shell.css'), 'utf8');
  const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>UI テスト実行記録(スマートフォン) ${stamp}</title>
<style>${css}
.thumbs{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}.thumbs a{display:block}.thumbs img{width:120px;height:auto;border:1px solid var(--line);border-radius:4px}
.st-ok{color:var(--accent);font-weight:700}.st-ng{color:var(--danger);font-weight:700}
</style></head><body><main>
<header class="doc-header"><h1>UI テスト実行記録: スマートフォンでの操作</h1><dl>
<dt>対象</dt><dd>フローチャート工房 / スマートフォン幅・タッチ操作(AC-9・AC-11)。Chromium のモバイルエミュレーション(iPhone 13 相当、幅 ${VIEWPORTS.map((v) => v.name).join(' / ')})</dd>
<dt>作成日</dt><dd>${stamp.slice(0, 10)}</dd>
<dt>生成元</dt><dd>test/ui/mobile-touch.js(Playwright ${PW_VERSION})</dd>
<dt>入力資料</dt><dd>generated/docs/tests/mobile/test-spec.md、app/(手元の確認用サーバー ${BASE})</dd>
<dt>機密区分</dt><dd><span class="badge badge-public">公開可</span></dd></dl></header>
<h2 id="s1">サマリ</h2>
<div class="table-wrap"><table><thead><tr><th>判定</th><th class="a-right">件数</th></tr></thead><tbody>
<tr><td>OK</td><td class="a-right">${summary.ok}</td></tr><tr><td>NG</td><td class="a-right">${summary.ng}(うち P1・P2: ${summary.ngBlocking})</td></tr><tr><td>未実施</td><td class="a-right">${summary.none}</td></tr><tr><td>合計</td><td class="a-right">${summary.total}</td></tr>
<tr><td>ページの JS エラー</td><td class="a-right">${errors.length}</td></tr><tr><td>所要時間</td><td class="a-right">${Math.round(ms / 1000)} 秒</td></tr></tbody></table></div>
${errors.length ? `<pre><code>${esc(errors.join('\n'))}</code></pre>` : ''}
<h2 id="s2">ケースごとの結果</h2>
<div class="table-wrap"><table><thead><tr><th>ケースID</th><th>優先度</th><th>判定</th><th>確認すること</th><th>確認した内容</th></tr></thead><tbody>
${rows.map((r) => `<tr><td class="nb">${r.id}</td><td>${r.pri}</td><td class="${r.status === 'OK' ? 'st-ok' : 'st-ng'}">${r.status}</td><td>${esc(r.title)}</td><td>${r.checks.map((c) => `<div>${c.ok ? '○' : '×'} ${esc(c.note)}</div>`).join('')}<div class="thumbs">${r.checks.filter((c) => c.shot).map((c) => `<a href="${c.shot}"><img src="${c.shot}" alt="${r.id}"></a>`).join('')}</div></td></tr>`).join('\n')}
</tbody></table></div>
</main></body></html>`;
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  return summary;
}

// ---- 実行 ----
(async () => {
  const t0 = Date.now();
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'preview-server.js'), APP_DIR, String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => { server.stdout.on('data', (d) => { if (String(d).includes('preview on')) resolve(); }); server.on('exit', (c) => reject(new Error(`server exit ${c}`))); });
  const errors = [];
  const browser = await pw.chromium.launch();
  try {
    for (const vp of VIEWPORTS) await runLayout(browser, vp, errors);
    await runTouch(browser, errors);
  } catch (err) {
    errors.push(`テストの実行が止まった: ${err.stack || err}`);
    console.error(err);
  } finally {
    await browser.close();
    server.kill();
  }
  const s = writeReport(errors, Date.now() - t0);
  console.log(`\n${OUT}\nOK ${s.ok} / NG ${s.ng} / 未実施 ${s.none} / 合計 ${s.total} / JS エラー ${errors.length}`);
  console.log(`P1・P2 の NG ${s.ngBlocking} 件(P3 の NG は残課題として扱い、終了コードに数えない)`);
  process.exit(s.ngBlocking || s.none || errors.length ? 1 : 0);
})();
