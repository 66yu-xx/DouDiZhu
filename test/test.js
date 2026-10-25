/* 斗地主 规则 / 计分 / AI 自对弈 测试：node test/test.js */
'use strict';
const path = require('path');
const D = require(path.join(__dirname, '../js/rules.js')); global.DDZ = D;
const AI = require(path.join(__dirname, '../js/ai.js'));
const { Game } = require(path.join(__dirname, '../js/game.js'));
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } }
const RK = { '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15, 'x': 16, 'X': 17 };
function H(str) { // "3 3 3 4" -> ids（同点数依次取不同花色）
  const used = {}; return str.trim().split(/\s+/).map(t => { const r = RK[t]; if (r === 16) return 52; if (r === 17) return 53; used[r] = (used[r] || 0); return (r - 3) * 4 + used[r]++; });
}
function T(str) { const a = D.analyze(H(str)); return a.length ? a[0].type : null; }
function C(str) { return D.analyze(H(str))[0]; }

console.log('— 牌型识别');
const cases = [
  ['5', 'single'], ['X', 'single'], ['8 8', 'pair'], ['x X', 'rocket'], ['x 2', null], ['9 9 9', 'triple'],
  ['9 9 9 4', 'triple1'], ['9 9 9 x', 'triple1'], ['9 9 9 4 4', 'triple2'], ['9 9 9 x X', null], ['7 7 7 7', 'bomb'],
  ['3 4 5 6 7', 'straight'], ['3 4 5 6 7 8 9 T J Q K A', 'straight'], ['T J Q K A', 'straight'], ['J Q K A 2', null], ['3 4 5 6', null], ['3 4 5 6 8', null],
  ['3 3 4 4 5 5', 'pairs'], ['Q Q K K A A', 'pairs'], ['K K A A 2 2', null], ['3 3 4 4', null],
  ['3 3 3 4 4 4', 'plane'], ['K K K A A A', 'plane'], ['A A A 2 2 2', null], ['3 3 3 5 5 5', null],
  ['3 3 3 4 4 4 9 J', 'plane1'], ['3 3 3 4 4 4 x X', null], ['3 3 3 4 4 4 9 9 J J', 'plane2'], ['3 3 3 4 4 4 9 9 x X', null],
  ['5 5 5 6 6 6 7 7 7 3 9 J', 'plane1'], ['5 5 5 6 6 6 7 7 7 3 3 9 9 J J', 'plane2'],
  ['8 8 8 8 3 4', 'four2'], ['8 8 8 8 3 3', 'four2'], ['8 8 8 8 x X', null], ['8 8 8 8 3 3 4 4', 'four22'], ['8 8 8 8 3 3 4 5', null],
  ['3 4', null], ['3 3 4', null], ['9 9 9 4 5', null], ['2 2 2 A A A', null],
];
for (const [s, t] of cases) ok(T(s) === t, `analyze(${s}) = ${T(s)}, 期望 ${t}`);
ok(C('3 3 3 4 4 4 9 J').rank === 4 && C('3 3 3 4 4 4 9 J').len === 2, '飞机主点数/长度');
ok(C('9 9 9 9 9'.split(' ').slice(0, 4).join(' ')).rank === 9, '炸弹点数');
// 3334 + 444? 飞机带同点数翅膀
ok(T('3 3 3 4 4 4 4 5') !== null, '33344445 可识别（飞机带翅或四带二对）');

console.log('— 大小比较');
const B = (a, b) => !!D.match(H(a), C(b));
ok(B('4', '3') && !B('3', '4') && !B('3', '3'), '单张比较');
ok(B('2', 'A') && B('x', '2') && B('X', 'x') && !B('x', 'X'), '2 < 小王 < 大王');
ok(B('4 4', '3 3') && !B('4', '3 3'), '对子 / 牌型不同不能压');
ok(B('4 5 6 7 8', '3 4 5 6 7') && !B('4 5 6 7 8 9', '3 4 5 6 7'), '顺子须同长度');
ok(B('4 4 5 5 6 6', '3 3 4 4 5 5') && !B('4 4 5 5 6 6 7 7', '3 3 4 4 5 5'), '连对须同长度');
ok(B('4 4 4 3', '3 3 3 K') && !B('4 4 4 3 3', '3 3 3 K'), '三带一 vs 三带二 不同型');
ok(B('5 5 5 6 6 6 3 4', '3 3 3 4 4 4 9 J'), '飞机带翅比较');
ok(!B('5 5 5 6 6 6 3 3 4 4', '3 3 3 4 4 4 9 J'), '飞机带对不压飞机带单');
ok(B('3 3 3 3', '2 2') && B('3 3 3 3', '3 4 5 6 7 8 9 T J Q K A') && B('4 4 4 4', '3 3 3 3') && !B('3 3 3 3', '4 4 4 4'), '炸弹规则');
ok(B('x X', '2 2 2 2') && !B('2 2 2 2', 'x X'), '王炸最大');
ok(B('9 9 9 9 3 4', '8 8 8 8 3 4') && !B('9 9 9 9 3 4', '8 8 8 8 3 3 4 4'), '四带二比较');
ok(D.match(H('5'), null) && !D.match(H('3 4'), null), 'match 自由出牌');

console.log('— 枚举出牌');
{ const hand = H('3 3 3 4 4 4 5 6 7 8 9 9 9 9 x X 2'); const all = D.generate(hand);
  ok(all.every(p => D.match(p.cards || p.ids || p, null)), 'generate 结果都合法');
  const types = new Set(all.map(p => (p.combo || D.analyze(p.cards || p.ids || p)[0]).type));
  ['single', 'pair', 'triple', 'triple1', 'triple2', 'straight', 'plane', 'plane1', 'bomb', 'rocket', 'four2'].forEach(t => ok(types.has(t), 'generate 包含 ' + t));
  const beat = D.beatingPlays(hand, C('T J Q K A'));
  ok(beat.length > 0 && beat.every(p => { const cb = p.combo || D.analyze(p.cards || p)[0]; return cb.type === 'bomb' || cb.type === 'rocket'; }), '无更大顺子时只能炸');
}

console.log('— 叫分 / 抢地主 / 计分');
function seq(vals) { let i = 0; return () => vals[i++ % vals.length]; }
{ // 叫分：0家1分，1家3分 → 1家地主，倍数3
  const g = new Game({ rng: seq([0.1, 0.5, 0.9, 0.3, 0.7]), base: 10 }); g.newRound();
  const f = g.cur; g.doBid(f, 1); g.doBid((f + 1) % 3, 3);
  ok(g.phase === 'play' && g.landlord === (f + 1) % 3 && g.mult.bid === 3 && g.hands[g.landlord].length === 20, '叫3分直接当地主并拿底牌');
  let threw = false; try { const g2 = new Game({}); g2.newRound(); const p = g2.cur; g2.doBid(p, 2); g2.doBid(g2.cur, 1); } catch (e) { threw = true; } ok(threw, '不能叫比前面低的分');
}
{ const g = new Game({}); g.newRound(); const r0 = g.round; g.doBid(g.cur, 0); g.doBid(g.cur, 0); g.doBid(g.cur, 0);
  ok(g.phase === 'bid' && g.round === r0 && g.events.some(e => e.type === 'redeal'), '都不叫→重新发牌'); }
{ const g = new Game({}); g.newRound(); const f = g.cur; g.doBid(f, 2); g.doBid(g.cur, 0); g.doBid(g.cur, 0);
  ok(g.landlord === f && g.mult.bid === 2, '三人叫完取最高分'); }
{ const g = new Game({ bidMode: 'grab' }); g.newRound(); const f = g.cur;
  g.doBid(f, 'call'); g.doBid(g.cur, 'grab'); g.doBid(g.cur, 'grab');
  ok(g.phase === 'bid' && g.cur === f, '抢地主：叫的人最后有一次反抢机会');
  g.doBid(f, 'grab'); ok(g.landlord === f && g.mult.grabs === 3 && g.totalMult() === 8, '反抢成功，倍数 2^3'); }
{ const g = new Game({ bidMode: 'grab' }); g.newRound(); const f = g.cur;
  g.doBid(f, 'call'); const p2 = g.cur; g.doBid(p2, 'grab'); g.doBid(g.cur, 'pass'); g.doBid(f, 'pass');
  ok(g.landlord === p2 && g.totalMult() === 2, '最后抢的人当地主'); }
{ const g = new Game({ bidMode: 'grab' }); g.newRound(); const f = g.cur; g.doBid(f, 'pass'); const p2 = g.cur; g.doBid(p2, 'call'); g.doBid(g.cur, 'pass');
  ok(g.landlord === p2 && g.totalMult() === 1, '无人抢→叫的人当地主'); }
function rig(g, L, hands) { g.landlord = L; g.phase = 'play'; g.cur = L; g.lastPlay = null; g.hands = hands.map(h => D.sortHand(H(h))); g.lastAct = [null, null, null]; }
{ // 春天：地主一路出完
  const g = new Game({ base: 10 }); g.newRound(); g.mult.bid = 3; rig(g, 0, ['3 3 3 3 x X 9', '4', '5']);
  g.play(0, H('x X')); g.pass(1); g.pass(2); g.play(0, H('3 3 3 3')); g.pass(1); g.pass(2); g.play(0, H('9'));
  const r = g.result; ok(r.landlordWin && r.mult.spring === 1 && r.mult.bombs === 2, '春天+2炸识别');
  ok(r.total === 3 * 4 * 2 && r.unit === 240 && r.delta[0] === 480 && r.delta[1] === -240 && r.delta[2] === -240, '倍数 3×2²×2=24，地主+480');
  ok(r.delta.reduce((a, b) => a + b, 0) === 0, '零和'); }
{ // 反春天：地主只出一手
  const g = new Game({ base: 1 }); g.newRound(); g.mult.bid = 2; g.showCards(1); rig(g, 0, ['3 4', 'K', 'A']);
  g.play(0, H('3')); g.play(1, H('K'));
  const r = g.result; ok(!r.landlordWin && r.mult.spring === 2 && r.total === 2 * 2 * 2, '反春天×2、明牌×2');
  ok(r.delta[0] === -16 && r.delta[1] === 8 && r.delta[2] === 8, '地主输双倍'); }
{ const g = new Game({}); g.newRound(); rig(g, 0, ['3 4', '5', '6']); let t = false; try { g.pass(0); } catch (e) { t = true; } ok(t, '自由出牌时不能不出');
  t = false; try { g.play(0, H('3 4')); } catch (e) { t = true; } ok(t, '非法牌型不能出');
  t = false; try { g.play(1, H('5')); } catch (e) { t = true; } ok(t, '没轮到不能出'); }

console.log('— AI 自对弈');
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function selfPlay(mode, N, seed) {
  const g = new Game({ rng: mulberry(seed), bidMode: mode, base: 10 }); const st = { games: 0, lw: 0, spring: 0, anti: 0, bombs: 0, errors: 0, maxMs: 0, plays: 0 };
  for (let i = 0; i < N; i++) {
    try {
      g.newRound(); let guard = 0;
      while (g.phase !== 'over') {
        if (++guard > 3000) throw new Error('死循环');
        const p = g.cur;
        if (g.phase === 'bid') { g.doBid(p, AI.decideBid(g, p)); continue; }
        const t = Date.now(); const ids = AI.decidePlay(g, p); st.maxMs = Math.max(st.maxMs, Date.now() - t);
        if (ids) { if (!g.canPlay(p, ids)) throw new Error('AI 出了非法牌'); g.play(p, ids); st.plays++; }
        else { if (g.isFree(p)) throw new Error('AI 自由出牌时不出'); g.pass(p); }
        const total = g.hands.reduce((a, h) => a + h.length, 0) + g.played.length;
        if (total !== 54) throw new Error('牌数不守恒 ' + total);
      }
      const r = g.result; st.games++; if (r.landlordWin) st.lw++; if (r.mult.spring === 1) st.spring++; if (r.mult.spring === 2) st.anti++; st.bombs += r.mult.bombs;
      if (r.delta.reduce((a, b) => a + b, 0) !== 0) throw new Error('非零和');
    } catch (e) { st.errors++; if (st.errors < 4) console.log('  错误:', e.message); }
  }
  if (g.scores.reduce((a, b) => a + b, 0) !== 0) st.errors++;
  return st;
}
const t0 = Date.now();
const s1 = selfPlay('score', 500, 20261022), s2 = selfPlay('grab', 200, 7);
for (const [name, s] of [['叫分 500 局', s1], ['抢地主 200 局', s2]]) {
  console.log(`  ${name}: 完成 ${s.games}，错误 ${s.errors}，地主胜率 ${(s.lw / s.games * 100).toFixed(1)}%，春天 ${s.spring}，反春天 ${s.anti}，平均炸弹 ${(s.bombs / s.games).toFixed(2)}，最慢决策 ${s.maxMs}ms`);
  ok(s.errors === 0 && s.games > 0, name + ' 无错误');
}
console.log(`  用时 ${Date.now() - t0}ms`);
console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
