/* 斗地主 - 电脑策略：拆牌（动态规划）+ 跟牌/配合/叫分 */
(function (G) {
  'use strict';
  var D = G.DDZ || (typeof require !== 'undefined' ? require('./rules.js') : null);

  // ---------- 拆牌：把手牌拆成最少、最“好出”的若干手 ----------
  var memo = new Map();
  var FT = 1.15, FT2 = 0.3;
  function gcost(type, r, len) {
    switch (type) {
      case 'single': return r === 17 ? 0.3 : r === 16 ? 0.45 : r === 15 ? 0.65 : 1 + (14 - r) * 0.05;
      case 'pair': return r === 15 ? 0.55 : 1 + (14 - r) * 0.04;
      case 'triple': return r === 15 ? 0.3 : 0.5 + (14 - r) * 0.02;
      case 'straight': return 1 + (10 - (r - len + 1)) * 0.01;
      case 'pairs': return 1;
      case 'plane': return 0.5;
      case 'bomb': return -0.3;
      case 'rocket': return -0.5;
    }
    return 1;
  }
  function solve(c) {
    var r = 3; while (r <= 17 && !c[r]) r++;
    if (r > 17) return { cost: 0, groups: [] };
    var k = c.join(''), hit = memo.get(k);
    if (hit) return hit;
    var best = null;
    function opt(type, rank, len, spec) {
      for (var i = 0; i < spec.length; i++) c[spec[i][0]] -= spec[i][1];
      var sub = solve(c);
      for (i = 0; i < spec.length; i++) c[spec[i][0]] += spec[i][1];
      var cost = sub.cost + gcost(type, rank, len);
      if (!best || cost < best.cost - 1e-9) best = { cost: cost, groups: [{ type: type, rank: rank, len: len, spec: spec }].concat(sub.groups) };
    }
    var x = c[r], L, i, sp;
    if (r === 16 && c[17]) opt('rocket', 17, 1, [[16, 1], [17, 1]]);
    opt('single', r, 1, [[r, 1]]);
    if (x >= 2) opt('pair', r, 1, [[r, 2]]);
    if (x >= 3) opt('triple', r, 1, [[r, 3]]);
    if (x === 4) opt('bomb', r, 1, [[r, 4]]);
    if (r <= 10) {
      for (L = 1; r + L - 1 <= 14 && c[r + L - 1] >= 1; L++) if (L >= 5) { sp = []; for (i = 0; i < L; i++) sp.push([r + i, 1]); opt('straight', r + L - 1, L, sp); }
    }
    for (L = 1; r + L - 1 <= 14 && c[r + L - 1] >= 2; L++) if (L >= 3) { sp = []; for (i = 0; i < L; i++) sp.push([r + i, 2]); opt('pairs', r + L - 1, L, sp); }
    for (L = 1; r + L - 1 <= 14 && c[r + L - 1] >= 3; L++) if (L >= 2) { sp = []; for (i = 0; i < L; i++) sp.push([r + i, 3]); opt('plane', r + L - 1, L, sp); }
    if (memo.size > 300000) memo.clear();
    memo.set(k, best);
    return best;
  }
  // 三张/飞机带上最小的单牌或对子；返回实际可出的牌组
  function evalHand(hand) {
    var c = D.counts(hand), sol = solve(c);
    var groups = sol.groups.map(function (g) { return { type: g.type, rank: g.rank, len: g.len, spec: g.spec.map(function (s) { return s.slice(); }) }; });
    var singles = groups.filter(function (g) { return g.type === 'single' && g.rank < 15; }).sort(function (a, b) { return a.rank - b.rank; });
    var pairs = groups.filter(function (g) { return g.type === 'pair' && g.rank < 15; }).sort(function (a, b) { return a.rank - b.rank; });
    var removed = new Set();
    groups.filter(function (g) { return g.type === 'triple' || g.type === 'plane'; }).sort(function (a, b) { return a.rank - b.rank; }).forEach(function (t) {
      var need = t.len, s = singles.filter(function (g) { return !removed.has(g); }), p = pairs.filter(function (g) { return !removed.has(g); });
      var useS = s.length >= need, useP = p.length >= need;
      if (useS && useP) { if (p[0].rank < s[0].rank && need === 1 && s.length < 2) useS = false; }
      if (useS) { for (var i = 0; i < need; i++) { removed.add(s[i]); t.spec.push([s[i].rank, 1]); } t.type = t.type === 'triple' ? 'triple1' : 'plane1'; }
      else if (useP) { for (var j = 0; j < need; j++) { removed.add(p[j]); t.spec.push([p[j].rank, 2]); } t.type = t.type === 'triple' ? 'triple2' : 'plane2'; }
    });
    groups = groups.filter(function (g) { return !removed.has(g); });
    // 换成实际牌
    var pool = {}; for (var r = 3; r <= 17; r++) pool[r] = [];
    hand.slice().sort(function (a, b) { return a - b; }).forEach(function (id) { pool[D.rankOf(id)].push(id); });
    var out = groups.map(function (g) {
      var ids = [];
      g.spec.forEach(function (s) { for (var i = 0; i < s[1]; i++) ids.push(pool[s[0]].shift()); });
      return { type: g.type, rank: g.rank, len: g.len, n: ids.length, cards: ids };
    });
    var cost = 0; out.forEach(function (g) { cost += g.type === 'triple1' || g.type === 'triple2' || g.type === 'plane1' || g.type === 'plane2' ? 1 : gcost(g.type, g.rank, g.len); });
    return { cost: cost, groups: out, turns: out.length };
  }

  // ---------- 局面信息 ----------
  function unseenCounts(g, p) {
    var c = new Array(18).fill(0);
    for (var q = 0; q < 3; q++) if (q !== p) g.hands[q].forEach(function (id) { c[D.rankOf(id)]++; });
    return c;
  }
  // 对手（对方阵营）的牌里是否可能有压过 cb 的牌（不考虑带牌细节）
  function mayBeBeaten(c, cb, maxEnemyCards) {
    if (cb.type === 'rocket') return false;
    if (c[16] && c[17] && maxEnemyCards >= 2) return true;
    var r, need;
    for (r = 3; r <= 15; r++) if (c[r] === 4 && maxEnemyCards >= 4 && (cb.type !== 'bomb' || r > cb.rank)) return true;
    if (cb.type === 'bomb') return false;
    if (cb.n > maxEnemyCards) return false;
    function run(per, len) {
      for (var top = cb.rank + 1; top <= 14; top++) { var ok = true; for (var i = 0; i < len; i++) if (top - i < 3 || c[top - i] < per) { ok = false; break; } if (ok) return true; }
      return false;
    }
    switch (cb.type) {
      case 'single': for (r = cb.rank + 1; r <= 17; r++) if (c[r]) return true; return false;
      case 'pair': for (r = cb.rank + 1; r <= 15; r++) if (c[r] >= 2) return true; return false;
      case 'triple': case 'triple1': case 'triple2': for (r = cb.rank + 1; r <= 15; r++) if (c[r] >= 3) return true; return false;
      case 'four2': case 'four22': return false;
      case 'straight': return run(1, cb.len);
      case 'pairs': return run(2, cb.len);
      default: return run(3, cb.len);
    }
  }
  function roles(g, p) {
    var L = g.landlord, enemies = p === L ? [0, 1, 2].filter(function (q) { return q !== p; }) : [L];
    var mate = p === L ? -1 : 3 - p - L;
    var minEnemy = Math.min.apply(null, enemies.map(function (q) { return g.hands[q].length; }));
    var maxEnemy = Math.max.apply(null, enemies.map(function (q) { return g.hands[q].length; }));
    return { enemies: enemies, mate: mate, minEnemy: minEnemy, maxEnemy: maxEnemy, next: (p + 1) % 3 };
  }
  function enemyCounts(g, p, ro) {
    // 地主：两家农民的牌都是对手；农民：只知道“别人”的牌，队友的也算进去（保守）
    return unseenCounts(g, p);
  }
  function minus(hand, ids) { var s = new Set(ids); return hand.filter(function (x) { return !s.has(x); }); }
  function isBomb(cb) { return cb.type === 'bomb' || cb.type === 'rocket'; }
  function bigCards(ids) { var n = 0; ids.forEach(function (id) { if (D.rankOf(id) >= 15) n++; }); return n; }

  // ---------- 主动出牌 ----------
  function lead(g, p) {
    var hand = g.hands[p], ro = roles(g, p);
    var whole = D.analyze(hand);
    if (whole.length) return hand.slice();
    var ev = evalHand(hand), groups = ev.groups, uc = enemyCounts(g, p, ro);
    // 队友只剩一两张且是下家：送牌
    if (ro.mate >= 0 && ro.next === ro.mate && g.hands[ro.mate].length <= 2) {
      var low = hand.slice().sort(function (a, b) { return a - b; });
      if (g.hands[ro.mate].length === 2) {
        var pr = D.generate(hand).filter(function (x) { return x.type === 'pair'; }).sort(function (a, b) { return a.rank - b.rank; })[0];
        if (pr && pr.rank < 12) return pr.cards;
      }
      return [low[0]];
    }
    var safe = groups.filter(function (x) { return !mayBeBeaten(uc, x, ro.maxEnemy); });
    var nonBomb = groups.filter(function (x) { return !isBomb(x); });
    // 收官：除一手外都“必大”，先出必大的
    if (safe.length && groups.length - safe.length <= 1) {
      var sb = safe.filter(function (x) { return !isBomb(x); });
      if (groups.length - safe.length === 1 && sb.length) return sb[0].cards;
      if (groups.length - safe.length === 0) return (sb[0] || safe[0]).cards;
    }
    if (!nonBomb.length) return groups.slice().sort(function (a, b) { return a.rank - b.rank; })[0].cards;
    var cand = nonBomb.slice();
    var feedMate = ro.mate >= 0 && ro.next === ro.mate;
    function key(x) {
      if (feedMate) return x.rank + (x.rank >= 15 ? 8 : 0) - (x.n >= 5 ? 1 : 0);
      var k = x.rank - (x.n >= 5 ? 2.5 : x.n >= 3 ? 1 : 0) + (x.rank >= 15 ? 8 : 0);
      if (ro.minEnemy === 1 && x.type === 'single') k += 20;
      if (ro.minEnemy === 2 && x.type === 'pair') k += 12;
      return k;
    }
    cand.sort(function (a, b) { return key(a) - key(b); });
    var pick = cand[0];
    if (ro.minEnemy === 1 && pick.type === 'single') {
      // 只剩单牌可出：先出最大的单牌，防止对手跑掉
      var singles = cand.filter(function (x) { return x.type === 'single'; }).sort(function (a, b) { return b.rank - a.rank; });
      if (singles.length >= 2) pick = singles[0];
    }
    return pick.cards;
  }

  // ---------- 跟牌 ----------
  function follow(g, p) {
    var hand = g.hands[p], last = g.lastPlay, ro = roles(g, p);
    var cands = D.beatingPlays(hand, last.combo);
    if (!cands.length) return null;
    for (var i = 0; i < cands.length; i++) if (cands[i].n === hand.length) return cands[i].cards;
    var fromMate = ro.mate >= 0 && last.p === ro.mate;
    if (fromMate) {
      // 队友出的牌：一般不压；队友牌很小且地主快走完时才顶一下
      if (ro.minEnemy <= 2 && last.combo.type === 'single' && last.combo.rank < 12 && ro.next === g.landlord) {
        var top = cands.filter(function (c) { return c.type === 'single' && c.rank >= 14 && c.rank < 16; }).sort(function (a, b) { return b.rank - a.rank; })[0];
        if (top) return top.cards;
      }
      return null;
    }
    var base = evalHand(hand).cost, uc = unseenCounts(g, p);
    var lastOwnerCards = g.hands[last.p].length;
    var danger = ro.minEnemy <= 2 || lastOwnerCards <= 4;
    var best = null, bestScore = Infinity;
    cands.forEach(function (c) {
      if (isBomb(c)) return;
      var rem = minus(hand, c.cards), e = evalHand(rem);
      var score = e.cost - base + c.rank * 0.01;
      if (!danger) score += bigCards(c.cards) * 0.55;
      if (danger && ro.minEnemy === 1 && last.combo.type === 'single') score -= c.rank * 0.2; // 用最大的顶
      if (!mayBeBeaten(uc, c, ro.maxEnemy)) score -= 0.4; // 抢到出牌权的价值
      if (score < bestScore) { bestScore = score; best = c; }
    });
    var threshold = danger ? Infinity : (p === g.landlord ? 1.05 : FT);
    // 农民在地主上家（地主是下家）时更积极顶牌
    if (ro.mate >= 0 && ro.next === g.landlord) threshold += FT2;
    if (ro.mate >= 0 && last.p === g.landlord && p === (g.landlord + 1) % 3) threshold += 0.6;
    if (best && bestScore <= threshold) return best.cards;
    var bombs = cands.filter(isBomb).sort(function (a, b) { return (a.type === 'rocket' ? 99 : a.rank) - (b.type === 'rocket' ? 99 : b.rank); });
    if (bombs.length) {
      var b = bombs[0], after = evalHand(minus(hand, b.cards));
      if (danger || after.turns <= 2 || (lastOwnerCards <= 6 && ro.minEnemy <= 6)) return b.cards;
    }
    return null;
  }

  function decidePlay(g, p) {
    var free = !g.lastPlay || g.lastPlay.p === p;
    return free ? lead(g, p) : follow(g, p);
  }

  // ---------- 叫分 / 抢地主 ----------
  function strength(hand) {
    var c = D.counts(hand), s = 0;
    if (c[16] && c[17]) s += 8; else s += c[17] * 4 + c[16] * 3;
    s += c[15] * 2;
    for (var r = 3; r <= 15; r++) if (c[r] === 4) s += 6;
    s += c[14] * 0.6;
    var ev = evalHand(hand);
    s += (8 - ev.turns) * 0.9;
    return s;
  }
  function decideBid(g, p) {
    var s = strength(g.hands[p]), opts = g.bidOptions(p);
    if (g.opts.bidMode === 'grab') {
      var st = g.bid.stage;
      if (st === 'call') return s >= 7 ? 'call' : 'pass';
      return s >= 9.5 ? 'grab' : 'pass';
    }
    var want = s >= 12 ? 3 : s >= 9 ? 2 : s >= 7 ? 1 : 0;
    if (want && opts.indexOf(want) < 0) want = opts.filter(function (x) { return x > 0 && x <= Math.max(want, 0); }).pop() || 0;
    return opts.indexOf(want) >= 0 ? want : 0;
  }

  var AI = { evalHand: evalHand, decidePlay: decidePlay, decideBid: decideBid, strength: strength, lead: lead, follow: follow, mayBeBeaten: mayBeBeaten };
  G.DDZAI = AI;
  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
