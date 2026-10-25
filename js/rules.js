/* 斗地主 - 牌型规则（浏览器与 Node 通用） */
(function (G) {
  'use strict';
  // 牌编号 0..53：0..51 为 3..2 四种花色（id = (点数-3)*4 + 花色），52 小王，53 大王
  // 点数：3..10, J=11, Q=12, K=13, A=14, 2=15, 小王=16, 大王=17
  var SUITS = ['♠', '♥', '♣', '♦'];
  var LABEL = { 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小王', 17: '大王' };
  var SPEAK = { 3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八', 9: '九', 10: '十', 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '二', 16: '小王', 17: '大王' };
  var TYPE_NAME = {
    single: '单张', pair: '对子', triple: '三张', triple1: '三带一', triple2: '三带二', straight: '顺子', pairs: '连对',
    plane: '飞机', plane1: '飞机带翅膀', plane2: '飞机带翅膀', four2: '四带二', four22: '四带两对', bomb: '炸弹', rocket: '王炸'
  };
  function rankOf(id) { return id >= 52 ? (id === 52 ? 16 : 17) : 3 + (id >> 2); }
  function suitOf(id) { return id >= 52 ? -1 : (id & 3); }
  function isRed(id) { return id === 53 || (id < 52 && ((id & 3) === 1 || (id & 3) === 3)); }
  function counts(ids) { var c = new Array(18).fill(0); for (var i = 0; i < ids.length; i++) c[rankOf(ids[i])]++; return c; }
  // 手牌排序：大的在左
  function sortHand(ids) { return ids.slice().sort(function (a, b) { return b - a; }); }

  function mk(type, rank, len, n) { return { type: type, rank: rank, len: len, n: n }; }

  // 识别一手牌的所有可能牌型（通常只有一种）
  function analyze(ids) {
    var n = ids.length, c = counts(ids), res = [];
    if (!n) return res;
    var ranks = [], r;
    for (r = 3; r <= 17; r++) if (c[r]) ranks.push(r);
    var maxCnt = 0; ranks.forEach(function (x) { if (c[x] > maxCnt) maxCnt = c[x]; });
    if (n === 1) res.push(mk('single', ranks[0], 1, 1));
    if (n === 2) {
      if (c[16] && c[17]) res.push(mk('rocket', 17, 1, 2));
      else if (ranks.length === 1) res.push(mk('pair', ranks[0], 1, 2));
    }
    if (n === 3 && ranks.length === 1) res.push(mk('triple', ranks[0], 1, 3));
    if (n === 4) {
      if (ranks.length === 1) res.push(mk('bomb', ranks[0], 1, 4));
      else if (ranks.length === 2 && maxCnt === 3) res.push(mk('triple1', ranks.filter(function (x) { return c[x] === 3; })[0], 1, 4));
    }
    if (n === 5 && ranks.length === 2 && maxCnt === 3) {
      var t = ranks.filter(function (x) { return c[x] === 3; })[0], k = ranks.filter(function (x) { return c[x] === 2; })[0];
      if (k !== undefined && k < 16) res.push(mk('triple2', t, 1, 5));
    }
    function consecutive(list) { for (var i = 1; i < list.length; i++) if (list[i] !== list[i - 1] + 1) return false; return true; }
    var top = ranks[ranks.length - 1];
    if (n >= 5 && maxCnt === 1 && ranks.length === n && top <= 14 && consecutive(ranks)) res.push(mk('straight', top, n, n));
    if (n >= 6 && n % 2 === 0 && ranks.length === n / 2 && top <= 14 && consecutive(ranks) && ranks.every(function (x) { return c[x] === 2; })) res.push(mk('pairs', top, n / 2, n));
    // 飞机
    if (n >= 6 && n % 3 === 0 && ranks.length === n / 3 && top <= 14 && consecutive(ranks) && ranks.every(function (x) { return c[x] === 3; })) res.push(mk('plane', top, n / 3, n));
    var k2, s, i, ok;
    if (n >= 8 && n % 4 === 0) {
      k2 = n / 4;
      for (s = 14 - k2 + 1; s >= 3; s--) {
        ok = true; for (i = 0; i < k2; i++) if (c[s + i] < 3) { ok = false; break; }
        if (!ok) continue;
        var rem = c.slice(); for (i = 0; i < k2; i++) rem[s + i] -= 3;
        if (rem[16] && rem[17]) continue;
        res.push(mk('plane1', s + k2 - 1, k2, n)); break;
      }
    }
    if (n >= 10 && n % 5 === 0) {
      k2 = n / 5;
      for (s = 14 - k2 + 1; s >= 3; s--) {
        ok = true; for (i = 0; i < k2; i++) if (c[s + i] < 3) { ok = false; break; }
        if (!ok) continue;
        var rem2 = c.slice(); for (i = 0; i < k2; i++) rem2[s + i] -= 3;
        var pairsOk = true, np = 0;
        for (r = 3; r <= 17; r++) { if (rem2[r] % 2) { pairsOk = false; break; } if (rem2[r] && r >= 16) { pairsOk = false; break; } np += rem2[r] / 2; }
        if (pairsOk && np === k2) { res.push(mk('plane2', s + k2 - 1, k2, n)); break; }
      }
    }
    // 四带二
    if (n === 6 && maxCnt === 4) {
      var f = ranks.filter(function (x) { return c[x] === 4; })[0];
      if (!(c[16] && c[17])) res.push(mk('four2', f, 1, 6));
    }
    if (n === 8 && maxCnt === 4) {
      ranks.filter(function (x) { return c[x] === 4; }).sort(function (a, b) { return b - a; }).forEach(function (f) {
        var okp = true; for (var r2 = 3; r2 <= 17; r2++) { if (r2 === f) continue; if (c[r2] % 2 || (c[r2] && r2 >= 16)) okp = false; }
        if (okp) res.push(mk('four22', f, 1, 8));
      });
    }
    return res;
  }

  function beats(a, b) {
    if (!b) return true;
    if (a.type === 'rocket') return true;
    if (b.type === 'rocket') return false;
    if (a.type === 'bomb') return b.type !== 'bomb' || a.rank > b.rank;
    if (b.type === 'bomb') return false;
    return a.type === b.type && a.len === b.len && a.n === b.n && a.rank > b.rank;
  }
  // 若 ids 可以出（并压过 last），返回其牌型，否则 null
  function match(ids, last) {
    var list = analyze(ids);
    for (var i = 0; i < list.length; i++) if (beats(list[i], last)) return list[i];
    return null;
  }

  // ---------- 枚举手牌中所有可出的牌型 ----------
  function byRank(hand) {
    var m = {}; for (var r = 3; r <= 17; r++) m[r] = [];
    hand.slice().sort(function (a, b) { return a - b; }).forEach(function (id) { m[rankOf(id)].push(id); });
    return m;
  }
  // 从剩余计数中选 k 张单牌作翅膀（多重集合），返回点数数组列表
  function kickerSets(rem, k, pairMode, exclude) {
    var out = [], cur = [];
    function rec(r, left) {
      if (left === 0) { out.push(cur.slice()); return; }
      if (r > 17) return;
      var maxUse = pairMode ? (r >= 16 || exclude[r] ? 0 : Math.floor(rem[r] / 2)) : (exclude[r] ? 0 : rem[r]);
      for (var u = Math.min(maxUse, left); u >= 0; u--) {
        if (!pairMode && r === 17 && u > 0 && cur.indexOf(16) >= 0) continue; // 翅膀不能是双王
        for (var j = 0; j < u; j++) cur.push(r);
        rec(r + 1, left - u);
        for (j = 0; j < u; j++) cur.pop();
      }
    }
    rec(3, k);
    return out;
  }
  function generate(hand) {
    var c = counts(hand), m = byRank(hand), out = [];
    function take(spec) { // spec: [[rank, count], ...]
      var used = {}, ids = [];
      for (var i = 0; i < spec.length; i++) {
        var r = spec[i][0], k = spec[i][1], st = used[r] || 0;
        for (var j = 0; j < k; j++) ids.push(m[r][st + j]);
        used[r] = st + k;
      }
      return ids;
    }
    function push(type, rank, len, spec) { var ids = take(spec); out.push({ type: type, rank: rank, len: len, n: ids.length, cards: ids }); }
    var r, s, L, i;
    for (r = 3; r <= 17; r++) {
      if (c[r] >= 1) push('single', r, 1, [[r, 1]]);
      if (c[r] >= 2) push('pair', r, 1, [[r, 2]]);
      if (c[r] >= 3) {
        push('triple', r, 1, [[r, 3]]);
        for (var k = 3; k <= 17; k++) {
          if (k === r) continue;
          if (c[k] >= 1) push('triple1', r, 1, [[r, 3], [k, 1]]);
          if (c[k] >= 2 && k < 16) push('triple2', r, 1, [[r, 3], [k, 2]]);
        }
      }
      if (c[r] === 4) {
        push('bomb', r, 1, [[r, 4]]);
        var rem = c.slice(); rem[r] = 0;
        kickerSets(rem, 2, false, {}).forEach(function (ks) { push('four2', r, 1, [[r, 4]].concat(ks.map(function (x) { return [x, 1]; }))); });
        kickerSets(rem, 2, true, {}).forEach(function (ks) { push('four22', r, 1, [[r, 4]].concat(ks.map(function (x) { return [x, 2]; }))); });
      }
    }
    if (c[16] && c[17]) push('rocket', 17, 1, [[16, 1], [17, 1]]);
    for (s = 3; s <= 14; s++) {
      for (L = 1; s + L - 1 <= 14; L++) { if (c[s + L - 1] < 1) break; if (L >= 5) { var sp = []; for (i = 0; i < L; i++) sp.push([s + i, 1]); push('straight', s + L - 1, L, sp); } }
      for (L = 1; s + L - 1 <= 14; L++) { if (c[s + L - 1] < 2) break; if (L >= 3) { var sp2 = []; for (i = 0; i < L; i++) sp2.push([s + i, 2]); push('pairs', s + L - 1, L, sp2); } }
      for (L = 1; s + L - 1 <= 14; L++) {
        if (c[s + L - 1] < 3) break;
        if (L >= 2) {
          var base = [], rem3 = c.slice(), ex = {};
          for (i = 0; i < L; i++) { base.push([s + i, 3]); rem3[s + i] -= 3; ex[s + i] = true; }
          push('plane', s + L - 1, L, base);
          if (L * 4 <= hand.length) kickerSets(rem3, L, false, {}).forEach(function (ks) { push('plane1', s + L - 1, L, base.concat(ks.map(function (x) { return [x, 1]; }))); });
          if (L * 5 <= hand.length) kickerSets(rem3, L, true, ex).forEach(function (ks) { push('plane2', s + L - 1, L, base.concat(ks.map(function (x) { return [x, 2]; }))); });
        }
      }
    }
    return out;
  }
  function beatingPlays(hand, last) {
    return generate(hand).filter(function (p) { return beats(p, last); });
  }

  function comboText(cb) {
    if (!cb) return '';
    var L = LABEL[cb.rank];
    switch (cb.type) {
      case 'single': return L;
      case 'pair': return '对' + L;
      case 'triple': return '三个' + L;
      case 'bomb': return '炸弹';
      case 'rocket': return '王炸';
      default: return TYPE_NAME[cb.type];
    }
  }
  // 语音读法
  function speakCombo(cb) {
    var S = SPEAK[cb.rank];
    switch (cb.type) {
      case 'single': return S;
      case 'pair': return '对' + S;
      case 'triple': return '三个' + S;
      case 'triple1': return '三带一';
      case 'triple2': return '三带一对';
      case 'straight': return '顺子';
      case 'pairs': return '连对';
      case 'plane': case 'plane1': case 'plane2': return '飞机';
      case 'four2': return '四带二';
      case 'four22': return '四带两对';
      case 'bomb': return '炸弹';
      case 'rocket': return '王炸';
    }
    return '';
  }

  var DDZ = {
    SUITS: SUITS, LABEL: LABEL, SPEAK: SPEAK, TYPE_NAME: TYPE_NAME,
    rankOf: rankOf, suitOf: suitOf, isRed: isRed, counts: counts, sortHand: sortHand,
    analyze: analyze, beats: beats, match: match, generate: generate, beatingPlays: beatingPlays,
    comboText: comboText, speakCombo: speakCombo
  };
  G.DDZ = DDZ;
  if (typeof module !== 'undefined' && module.exports) module.exports = DDZ;
})(typeof window !== 'undefined' ? window : globalThis);
