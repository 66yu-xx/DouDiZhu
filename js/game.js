/* 斗地主 - 对局引擎 */
(function (G) {
  'use strict';
  var D = G.DDZ || (typeof require !== 'undefined' ? require('./rules.js') : null);

  function Game(opts) {
    opts = opts || {};
    this.opts = { bidMode: opts.bidMode || 'score', base: opts.base || 10 };
    this.rng = opts.rng || Math.random;
    this.scores = (opts.scores || [0, 0, 0]).slice();
    this.round = 0;
    this.events = [];
    this.firstBidder = Math.floor(this.rng() * 3);
  }
  Game.prototype.emit = function (e) { this.events.push(e); };
  Game.prototype.newRound = function (redeal) {
    if (!redeal) this.round++;
    var deck = []; for (var i = 0; i < 54; i++) deck.push(i);
    for (i = deck.length - 1; i > 0; i--) { var j = Math.floor(this.rng() * (i + 1)), t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    this.hands = [D.sortHand(deck.slice(0, 17)), D.sortHand(deck.slice(17, 34)), D.sortHand(deck.slice(34, 51))];
    this.bottom = D.sortHand(deck.slice(51));
    this.landlord = -1;
    this.phase = 'bid';
    this.lastPlay = null;
    this.history = [];            // 所有出牌/不出记录
    this.playCount = [0, 0, 0];   // 每家出过几手
    this.played = [];             // 已打出的所有牌
    this.lastAct = [null, null, null]; // 每家最近一次动作（用于界面显示）
    this.mult = { bid: 1, grabs: 0, bombs: 0, spring: 0, ming: 0 };
    this.ming = [false, false, false];
    var f = this.firstBidder;
    this.firstBidder = (this.firstBidder + 1) % 3;
    this.bid = { first: f, cur: f, max: 0, maxP: -1, turns: 0, stage: 'call', caller: -1, lastGrabber: -1, asked: 0, callerFinal: false, log: [] };
    this.cur = f;
    this.result = null;
    this.emit({ type: 'deal', redeal: !!redeal, first: f });
  };
  Game.prototype.bidOptions = function (p) {
    if (this.phase !== 'bid' || p !== this.cur) return [];
    if (this.opts.bidMode === 'grab') return this.bid.stage === 'call' ? ['call', 'pass'] : ['grab', 'pass'];
    var o = [0]; for (var v = this.bid.max + 1; v <= 3; v++) o.push(v); return o;
  };
  Game.prototype.doBid = function (p, v) {
    if (this.bidOptions(p).indexOf(v) < 0) throw new Error('非法叫分 ' + p + ' ' + v);
    var b = this.bid;
    b.log.push({ p: p, v: v });
    this.lastAct[p] = { kind: 'bid', v: v };
    this.emit({ type: 'bid', p: p, v: v, mode: this.opts.bidMode, stage: b.stage });
    if (this.opts.bidMode !== 'grab') {
      if (v > b.max) { b.max = v; b.maxP = p; }
      b.turns++;
      if (v === 3 || b.turns === 3) {
        if (b.maxP < 0) { this.emit({ type: 'redeal' }); this.firstBidder = b.first; this.newRound(true); return; }
        this.mult.bid = b.max;
        this.setLandlord(b.maxP);
        return;
      }
      this.cur = (p + 1) % 3; return;
    }
    // 抢地主
    if (b.callerFinal) {
      if (v === 'grab') { this.mult.grabs++; this.setLandlord(b.caller); } else this.setLandlord(b.lastGrabber);
      return;
    }
    b.asked++;
    if (b.stage === 'call') { if (v === 'call') { b.caller = p; b.stage = 'grab'; } }
    else if (v === 'grab') { this.mult.grabs++; b.lastGrabber = p; }
    if (b.asked === 3) {
      if (b.caller < 0) { this.emit({ type: 'redeal' }); this.firstBidder = b.first; this.newRound(true); return; }
      if (b.lastGrabber < 0) { this.setLandlord(b.caller); return; }
      if (b.lastGrabber === b.caller) { this.setLandlord(b.caller); return; }
      b.callerFinal = true; this.cur = b.caller; return;
    }
    this.cur = (p + 1) % 3;
  };
  Game.prototype.setLandlord = function (p) {
    this.landlord = p;
    this.hands[p] = D.sortHand(this.hands[p].concat(this.bottom));
    this.phase = 'play';
    this.cur = p;
    this.lastPlay = null;
    this.lastAct = [null, null, null];
    this.emit({ type: 'landlord', p: p, bottom: this.bottom.slice() });
  };
  Game.prototype.showCards = function (p) { // 明牌 ×2（每局一次）
    if (this.ming[p] || this.phase === 'over') return false;
    this.ming[p] = true; this.mult.ming = 1;
    this.emit({ type: 'ming', p: p });
    return true;
  };
  Game.prototype.isFree = function (p) { return !this.lastPlay || this.lastPlay.p === p; };
  Game.prototype.canPlay = function (p, ids) {
    if (this.phase !== 'play' || p !== this.cur || !ids.length) return null;
    var hand = this.hands[p];
    for (var i = 0; i < ids.length; i++) if (hand.indexOf(ids[i]) < 0) return null;
    if (new Set(ids).size !== ids.length) return null;
    return D.match(ids, this.isFree(p) ? null : this.lastPlay.combo);
  };
  Game.prototype.play = function (p, ids) {
    var cb = this.canPlay(p, ids);
    if (!cb) throw new Error('不能这样出牌');
    var newTrick = this.isFree(p);
    var s = new Set(ids);
    this.hands[p] = this.hands[p].filter(function (x) { return !s.has(x); });
    var cards = D.sortHand(ids);
    this.lastPlay = { p: p, combo: cb, cards: cards };
    if (newTrick) this.lastAct = [null, null, null];
    this.lastAct[p] = { kind: 'play', combo: cb, cards: cards };
    this.playCount[p]++;
    this.played = this.played.concat(cards);
    this.history.push({ p: p, combo: cb, cards: cards });
    if (cb.type === 'bomb' || cb.type === 'rocket') this.mult.bombs++;
    this.emit({ type: 'play', p: p, combo: cb, cards: cards, left: this.hands[p].length, newTrick: newTrick });
    if (!this.hands[p].length) { this.finish(p); return; }
    this.cur = (p + 1) % 3;
  };
  Game.prototype.pass = function (p) {
    if (this.phase !== 'play' || p !== this.cur || this.isFree(p)) throw new Error('现在不能不出');
    this.lastAct[p] = { kind: 'pass' };
    this.history.push({ p: p, pass: true });
    this.emit({ type: 'pass', p: p });
    this.cur = (p + 1) % 3;
    if (this.lastPlay && this.lastPlay.p === this.cur) this.emit({ type: 'trickWon', p: this.cur });
  };
  Game.prototype.totalMult = function () {
    var m = this.mult, bidPart = this.opts.bidMode === 'grab' ? Math.pow(2, m.grabs) : m.bid;
    return bidPart * Math.pow(2, m.bombs) * (m.spring ? 2 : 1) * (m.ming ? 2 : 1);
  };
  Game.prototype.finish = function (w) {
    var L = this.landlord, lw = w === L, self = this;
    if (lw && this.playCount[(L + 1) % 3] === 0 && this.playCount[(L + 2) % 3] === 0) this.mult.spring = 1;          // 春天
    if (!lw && this.playCount[L] === 1) this.mult.spring = 2;                                                             // 反春天
    var total = this.totalMult(), unit = this.opts.base * total, delta = [0, 0, 0];
    for (var q = 0; q < 3; q++) delta[q] = q === L ? (lw ? 2 * unit : -2 * unit) : (lw ? -unit : unit);
    for (q = 0; q < 3; q++) this.scores[q] += delta[q];
    this.phase = 'over';
    this.result = { winner: w, landlordWin: lw, total: total, unit: unit, delta: delta, mult: Object.assign({}, this.mult), base: this.opts.base, bidMode: this.opts.bidMode,
      hands: this.hands.map(function (h) { return h.slice(); }) };
    this.emit({ type: 'over', result: this.result });
    void self;
  };

  var E = { Game: Game };
  G.DDZGame = E;
  if (typeof module !== 'undefined' && module.exports) module.exports = E;
})(typeof window !== 'undefined' ? window : globalThis);
