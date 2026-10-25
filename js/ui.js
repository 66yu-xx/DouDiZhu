/* 斗地主 - 界面与交互 */
(function () {
  'use strict';
  var D = window.DDZ, AI = window.DDZAI, GE = window.DDZGame;
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); }
  var params = new URLSearchParams(location.search);
  var AUTO = params.get('auto') === '1';

  // ---------- 设置与存档 ----------
  var DEFAULTS = { bidMode: 'score', base: '10', ming: '1', speed: '1', timer: '0', counter: '1', voice: '1', voiceName: '', voiceVol: '85', sound: '1', mute: '0' };
  var settings = Object.assign({}, DEFAULTS);
  try { Object.assign(settings, JSON.parse(localStorage.getItem('ddz.settings') || '{}')); } catch (e) { }
  function saveSettings() { try { localStorage.setItem('ddz.settings', JSON.stringify(settings)); } catch (e) { } }
  var session = { scores: [0, 0, 0], round: 0 };
  try { Object.assign(session, JSON.parse(localStorage.getItem('ddz.session') || '{}')); } catch (e) { }
  function saveSession() { if (AUTO) return; try { localStorage.setItem('ddz.session', JSON.stringify(session)); } catch (e) { } }
  if (AUTO) { settings.speed = '0.2'; settings.voice = '0'; settings.timer = '0'; }

  var NAMES = ['你', '小星', '小月'], AV = ['我', '星', '月'];
  var game = null, aiTimer = null, evIdx = 0, sel = new Set(), hintList = null, hintIdx = 0, dealAnim = false, newCards = null;
  var turnTimer = null, timeLeft = 0, scale = 1, zoneKeys = ['', '', ''], bottomKey = '', overShown = false, settleTimer = null;
  function isHuman(p) { return !AUTO && p === 0; }

  // ---------- 缩放 ----------
  var stage = $('stage');
  function fit() {
    var vw = window.innerWidth, vh = window.innerHeight;
    scale = Math.min(vw / 1280, vh / 800);
    var tf = 'translate(' + (vw - 1280 * scale) / 2 + 'px,' + (vh - 800 * scale) / 2 + 'px) scale(' + scale + ')';
    stage.style.transform = tf; stage.style.setProperty('--base-tf', tf);
  }
  window.addEventListener('resize', fit); fit();

  // ---------- 音效（WebAudio） ----------
  var Snd = {
    ctx: null, master: null,
    ensure: function () {
      if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; } }
      if (this.ctx && !this.master) { this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); this.level(); }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    level: function () {
      if (!this.master) return;
      var v = (settings.voice === '1' && Voice.supported) ? 0.55 : 1;
      if (Voice.cur) v *= 0.4;
      try { this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); } catch (e) { this.master.gain.value = v; }
    },
    tone: function (f, t0, dur, vol, type, f2) {
      var c = this.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime + t0;
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
    },
    noise: function (dur, freq, vol, t0, q) {
      var c = this.ctx, n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5);
      var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = b; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1; g.gain.value = vol;
      s.connect(f); f.connect(g); g.connect(this.master); s.start(c.currentTime + (t0 || 0));
    },
    play: function (k) {
      if (settings.sound !== '1' || settings.mute === '1' || !this.ctx || this.ctx.state !== 'running') return;
      try {
        var S = this;
        if (k === 'card') { S.noise(0.08, 3000, 0.8); S.tone(260, 0, 0.07, 0.12, 'triangle'); }
        else if (k === 'deal') { for (var i = 0; i < 8; i++) S.noise(0.04, 3600, 0.35, i * 0.06); }
        else if (k === 'pass') { S.tone(520, 0, 0.12, 0.08, 'sine', 380); }
        else if (k === 'bomb') { S.noise(0.9, 140, 2.4, 0, 0.7); S.tone(120, 0, 0.8, 0.35, 'sine', 40); S.noise(0.3, 900, 0.6, 0.02); }
        else if (k === 'rocket') { S.noise(0.7, 1800, 0.5, 0, 0.6); S.tone(300, 0, 0.7, 0.12, 'sawtooth', 1600); S.noise(0.9, 130, 2.4, 0.6, 0.7); S.tone(110, 0.6, 0.8, 0.35, 'sine', 40); }
        else if (k === 'plane') { S.noise(1.2, 700, 0.6, 0, 0.5); S.tone(180, 0, 1.2, 0.06, 'sawtooth', 120); }
        else if (k === 'chain') { [660, 784, 988].forEach(function (f, i) { S.tone(f, i * 0.06, 0.18, 0.12, 'triangle'); }); }
        else if (k === 'win') { [523, 659, 784, 1047, 1319].forEach(function (f, i) { S.tone(f, i * 0.1, 0.5, 0.2, 'triangle'); }); }
        else if (k === 'lose') { [392, 330, 262, 196].forEach(function (f, i) { S.tone(f, i * 0.16, 0.45, 0.16, 'sine'); }); }
        else if (k === 'click') { S.tone(1200, 0, 0.04, 0.07, 'sine'); }
        else if (k === 'select') { S.tone(1500, 0, 0.03, 0.04, 'sine'); }
        else if (k === 'alarm') { S.tone(880, 0, 0.12, 0.12, 'square'); S.tone(880, 0.18, 0.12, 0.12, 'square'); }
        else if (k === 'tick') { S.tone(1000, 0, 0.05, 0.06, 'square'); }
        else if (k === 'landlord') { [392, 523, 659, 784].forEach(function (f, i) { S.tone(f, i * 0.08, 0.3, 0.14, 'triangle'); }); }
      } catch (e) { }
    }
  };
  document.addEventListener('pointerdown', function () { Snd.ensure(); }, true);

  // ---------- 语音报牌（Web Speech API） ----------
  var Voice = {
    supported: typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined',
    voices: [], cur: null, pending: null, failed: {}, log: [],
    MALE: /Kangkang|Yunxi|Yunyang|Yunjian|Yunxia|Yunye|Yunfeng|Yunhao|Yunze|Yunyi|Zhiwei|\bmale\b/i,
    isZh: function (v) { return /^zh/i.test(v.lang || '') || /Chinese/i.test(v.name); },
    rank: function (v) {
      var n = v.name, r;
      if (/Xiaoxiao/i.test(n)) r = 100;
      else if (/Xiaoyi/i.test(n)) r = 95;
      else if (/Online|Natural/i.test(n) && !this.MALE.test(n)) r = 80;
      else if (/Huihui/i.test(n)) r = 70;
      else if (/Yaoyao/i.test(n)) r = 60;
      else if (!this.MALE.test(n)) r = 50;
      else r = 10;
      if (/^zh[-_]CN/i.test(v.lang || '') || /Simplified|Mainland/i.test(n)) r += 5;
      if (this.failed[n]) r -= 200;
      return r;
    },
    load: function () {
      if (!this.supported) return;
      var self = this;
      this.voices = speechSynthesis.getVoices().filter(function (v) { return self.isZh(v); }).sort(function (a, b) { return self.rank(b) - self.rank(a); });
      fillVoiceSelect();
    },
    pick: function () {
      var self = this;
      if (settings.voiceName) { var v = this.voices.find(function (x) { return x.name === settings.voiceName; }); if (v && !self.failed[v.name]) return v; }
      return this.voices.slice().sort(function (a, b) { return self.rank(b) - self.rank(a); })[0] || null;
    },
    enabled: function () { return this.supported && settings.voice === '1' && settings.mute !== '1' && !AUTO; },
    // pri: 0 = 普通报牌（可被下一手打断）；1 = 炸弹/报警/叫分（不被普通报牌打断）；2 = 结果
    say: function (text, pri, seat) {
      this.log.push(text); if (this.log.length > 300) this.log.shift();
      if (!this.enabled()) return;
      var item = { text: text, pri: pri || 0, t: Date.now(), seat: seat || 0 };
      if (!this.cur) { this._speak(item); return; }
      if (this.cur.pri === 0 || item.pri > this.cur.pri) { this._speak(item, true); return; }
      if (!this.pending || this.pending.pri <= item.pri) this.pending = item;
    },
    _speak: function (item, interrupt) {
      var self = this, ss = window.speechSynthesis;
      try {
        if (interrupt || ss.speaking || ss.pending) ss.cancel();
        var u = new SpeechSynthesisUtterance(item.text), v = this.pick();
        if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'zh-CN';
        u.pitch = [1.1, 1.16, 1.04][item.seat] || 1.1; u.rate = 1.0;
        u.volume = Math.max(0, Math.min(1, (parseInt(settings.voiceVol, 10) || 0) / 100));
        item.voice = v; this.cur = item; Snd.level();
        u.onend = function () { self._done(item); };
        u.onerror = function (e) {
          var err = e && e.error;
          if (err === 'interrupted' || err === 'canceled') { self._done(item); return; }
          if (v && !v.localService && !item.retry) { self.failed[v.name] = 1; item.retry = 1; clearTimeout(item.timer); self.cur = null; self._speak(item); return; }
          self._done(item);
        };
        item.timer = setTimeout(function () { self._done(item); }, 2500 + item.text.length * 400);
        ss.speak(u);
      } catch (e) { this.cur = null; Snd.level(); }
    },
    _done: function (item) {
      clearTimeout(item.timer);
      if (this.cur !== item) return;
      this.cur = null; Snd.level();
      var p = this.pending; this.pending = null;
      if (p && Date.now() - p.t < 2500) this._speak(p);
    },
    stop: function () {
      this.pending = null; var c = this.cur; this.cur = null; if (c) clearTimeout(c.timer);
      if (this.supported) try { speechSynthesis.cancel(); } catch (e) { }
      Snd.level();
    }
  };
  function shortVoice(v) {
    var m = /Microsoft\s+(\w+)/i.exec(v.name), nm = m ? m[1] : v.name;
    var cn = { Xiaoxiao: '晓晓', Xiaoyi: '晓伊', Huihui: '慧慧', Yaoyao: '瑶瑶', Kangkang: '康康', Yunxi: '云希', Yunjian: '云健', Yunyang: '云扬', Yunxia: '云夏', Xiaobei: '晓北', Xiaoni: '晓妮', Xiaochen: '晓辰', Xiaohan: '晓涵', Xiaomo: '晓墨', Xiaorui: '晓睿', Xiaoxuan: '晓萱', Xiaoyan: '晓颜', HsiaoChen: '曉臻', HsiaoYu: '曉雨', HiuMaan: '曉曼', HiuGaai: '曉佳' };
    return (cn[nm] ? cn[nm] + ' ' : '') + nm + (/Natural/i.test(v.name) ? ' 自然' : '') + (/^zh[-_]CN/i.test(v.lang) ? '' : ' ' + v.lang);
  }
  function fillVoiceSelect() {
    var s = $('voiceSel'); if (!s) return;
    clear(s);
    var o = el('option'); o.value = '';
    var auto = Voice.pick();
    o.textContent = '自动（推荐）' + (auto && !settings.voiceName ? ' · ' + shortVoice(auto) : '');
    s.appendChild(o);
    Voice.voices.forEach(function (v) { var x = el('option'); x.value = v.name; x.textContent = shortVoice(v) + (v.localService ? '（本机）' : '（在线）'); s.appendChild(x); });
    s.value = Voice.voices.some(function (v) { return v.name === settings.voiceName; }) ? settings.voiceName : '';
    s.disabled = !Voice.voices.length;
    if (!Voice.voices.length) o.textContent = Voice.supported ? '未找到中文语音' : '此浏览器不支持语音';
  }
  if (Voice.supported) {
    Voice.load();
    try { speechSynthesis.addEventListener('voiceschanged', function () { Voice.load(); }); } catch (e) { speechSynthesis.onvoiceschanged = function () { Voice.load(); }; }
  }

  // ---------- 扑克牌绘制 ----------
  var CROWN = '<svg viewBox="0 0 60 44"><path d="M4 38 L8 10 L20 24 L30 4 L40 24 L52 10 L56 38 Z" fill="currentColor" opacity=".9"/><rect x="4" y="38" width="52" height="5" rx="2" fill="currentColor"/><circle cx="8" cy="9" r="3.5" fill="currentColor"/><circle cx="30" cy="4" r="3.5" fill="currentColor"/><circle cx="52" cy="9" r="3.5" fill="currentColor"/><circle cx="30" cy="27" r="4" fill="#fff" opacity=".85"/></svg>';
  var JOKER_ART = '<svg viewBox="0 0 64 64"><circle cx="32" cy="36" r="17" fill="none" stroke="currentColor" stroke-width="3"/><path d="M15 28 Q10 8 26 14 Q32 2 38 14 Q54 8 49 28" fill="currentColor" opacity=".85"/><circle cx="12" cy="10" r="4" fill="currentColor"/><circle cx="32" cy="3.5" r="3.5" fill="currentColor"/><circle cx="52" cy="10" r="4" fill="currentColor"/><circle cx="26" cy="34" r="2.6" fill="currentColor"/><circle cx="38" cy="34" r="2.6" fill="currentColor"/><path d="M24 42 Q32 50 40 42" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
  function cardEl(id, size, extra) {
    var r = D.rankOf(id), s = D.suitOf(id), d;
    if (id < 0) { d = el('div', 'card back ' + size + (extra ? ' ' + extra : '')); return d; }
    if (r >= 16) {
      d = el('div', 'card joker ' + size + (r === 17 ? ' big red' : ' small') + (extra ? ' ' + extra : ''));
      d.innerHTML = '<div class="jk">J<br>O<br>K<br>E<br>R</div><div class="jc">' + JOKER_ART + '<span>' + (r === 17 ? '大王' : '小王') + '</span></div>';
    } else {
      var L = D.LABEL[r], S = D.SUITS[s];
      d = el('div', 'card ' + size + (D.isRed(id) ? ' red' : ' black') + (extra ? ' ' + extra : ''));
      var center = r >= 11 && r <= 13 ? '<div class="court">' + CROWN.replace('<svg', '<svg class="crown"') + '<b>' + L + '</b><i>' + S + '</i></div>' : '<div class="cc">' + S + '</div>';
      d.innerHTML = '<div class="cn tl"><b>' + L + '</b><i>' + S + '</i></div>' + center + '<div class="cn br"><b>' + L + '</b><i>' + S + '</i></div>';
    }
    d.dataset.id = id;
    return d;
  }
  var HAT = '<svg class="hat" viewBox="0 0 64 40"><path d="M6 32 Q32 22 58 32 L52 36 Q32 28 12 36 Z" fill="#a5641a"/><path d="M16 30 Q18 8 32 6 Q46 8 48 30 Q32 24 16 30 Z" fill="#ffc94a" stroke="#8a4f10" stroke-width="2"/><rect x="18" y="22" width="28" height="5" rx="2" fill="#d0342c"/><circle cx="32" cy="12" r="3" fill="#fff4c4"/></svg>';

  // ---------- 渲染 ----------
  function render() {
    if (!game) return;
    renderTop(); renderBadges(); renderStacks(); renderZones(); renderBottom(); renderCounter(); renderHand(); renderActions(); renderReveal(); renderStatus();
  }
  function renderTop() {
    $('infoRound').textContent = session.round;
    $('infoBase').textContent = game.opts.base;
    var m = game.landlord >= 0 || game.phase !== 'bid' ? game.totalMult() : currentBidMult();
    var mt = $('infoMult'), txt = '×' + m;
    if (mt.textContent !== txt) { mt.textContent = txt; mt.classList.remove('pulse'); void mt.offsetWidth; mt.classList.add('pulse'); }
    $('infoMode').textContent = game.opts.bidMode === 'grab' ? '抢地主' : '叫分';
    $('btnCounter').classList.toggle('on', settings.counter === '1');
  }
  function currentBidMult() {
    var m = game.mult, b = game.opts.bidMode === 'grab' ? Math.pow(2, m.grabs) : Math.max(1, game.bid.max);
    return b * (m.ming ? 2 : 1);
  }
  function renderBadges() {
    for (var p = 0; p < 3; p++) {
      var b = $('badge' + p); clear(b);
      var role = game.landlord < 0 ? '' : (game.landlord === p ? '<span class="role ll">地主</span>' : '<span class="role">农民</span>');
      if (game.ming[p]) role += '<span class="role ming">明牌</span>';
      var sc = session.scores[p];
      b.innerHTML = '<div class="top"><div class="avatar a' + p + '">' + (game.landlord === p ? HAT : '') + AV[p] + '</div><div><div class="nm">' + NAMES[p] + '</div>' + (role || '<span class="role">' + (game.phase === 'bid' ? '叫地主中' : '') + '</span>') + '</div></div>' +
        '<div class="sc"><span>积分</span><b class="' + (sc < 0 ? 'neg' : '') + '">' + sc + '</b></div>';
      b.classList.toggle('active', game.phase !== 'over' && game.cur === p);
      if (p === 0 && turnTimer && game.cur === 0) {
        var t = el('div', 'timer' + (timeLeft <= 5 ? ' urgent' : ''), String(timeLeft)); t.id = 'timerEl'; b.appendChild(t);
      }
    }
  }
  function renderStacks() {
    [1, 2].forEach(function (p) {
      var st = $('stack' + p); clear(st);
      if (game.phase === 'over') return;
      var n = game.hands[p].length, show = Math.min(n, 5);
      for (var i = 0; i < show; i++) {
        var c = cardEl(-1, 'md'); c.style.left = (13 + (p === 1 ? -i * 3 : i * 3)) + 'px'; c.style.top = (i * 9) + 'px'; st.appendChild(c);
      }
      var cnt = el('div', 'cnt' + (n <= 2 ? ' warn' : ''), String(n)); st.appendChild(cnt);
      if (n <= 2) st.appendChild(el('div', 'alarm', '⚠ 报警'));
    });
  }
  function zoneContent(p) {
    var a = game.lastAct[p];
    if (game.phase === 'over' && game.result && game.result.winner === p && !a) return null;
    return a;
  }
  function renderZones() {
    for (var p = 0; p < 3; p++) {
      var z = $('zone' + p), a = zoneContent(p);
      var key = a ? (a.kind + ':' + (a.kind === 'play' ? a.cards.join(',') : a.v)) : '';
      var dim = a && a.kind === 'play' && game.lastPlay && game.lastPlay.p !== p;
      z.classList.toggle('dim', !!dim);
      if (zoneKeys[p] === key) continue;
      zoneKeys[p] = key; clear(z);
      if (!a) continue;
      if (a.kind === 'play') {
        var wrap = el('div', 'cards'), n = a.cards.length, sp = n > 12 ? 22 : 28;
        wrap.style.width = (66 + (n - 1) * sp) + 'px';
        a.cards.forEach(function (id, i) { var c = cardEl(id, 'md'); c.style.left = (i * sp) + 'px'; c.style.animationDelay = (i * 0.02) + 's'; wrap.appendChild(c); });
        z.appendChild(wrap);
        var t = a.combo.type;
        if (t !== 'single' && t !== 'pair') { var lb = el('div', 'ctype', D.comboText(a.combo)); z.appendChild(lb); }
      } else if (a.kind === 'pass') {
        z.appendChild(el('div', 'bubble pass', '不出'));
      } else if (a.kind === 'bid') {
        z.appendChild(el('div', 'bubble ' + (a.v === 0 || a.v === 'pass' ? 'pass' : 'bid'), bidLabel(a.v, a.stage)));
      }
    }
  }
  function bidLabel(v, stage) {
    if (v === 0) return '不叫';
    if (v === 1 || v === 2 || v === 3) return v + ' 分';
    if (v === 'call') return '叫地主';
    if (v === 'grab') return '抢地主';
    if (v === 'pass') return stage === 'grab' ? '不抢' : '不叫';
    return '';
  }
  function renderBottom() {
    var row = $('bcRow'), up = game.landlord >= 0, key = up ? game.bottom.join(',') : 'back';
    if (bottomKey === key) return;
    bottomKey = key; clear(row);
    game.bottom.forEach(function (id, i) {
      var c = cardEl(up ? id : -1, 'sm', up ? 'flip' : ''); c.style.left = (i * 60) + 'px'; c.style.animationDelay = (i * 0.12) + 's'; row.appendChild(c);
    });
  }
  function renderCounter() {
    var box = $('counter'); clear(box);
    box.classList.toggle('hide', settings.counter !== '1');
    if (settings.counter !== '1') return;
    var c = new Array(18).fill(0), r;
    for (r = 3; r <= 15; r++) c[r] = 4; c[16] = c[17] = 1;
    game.hands[0].forEach(function (id) { c[D.rankOf(id)]--; });
    game.played.forEach(function (id) { c[D.rankOf(id)]--; });
    if (game.phase === 'over') game.hands.forEach(function (h, p) { if (p) h.forEach(function (id) { c[D.rankOf(id)]--; }); });
    for (r = 3; r <= 17; r++) c[r] = Math.max(0, c[r]);
    box.appendChild(el('div', 'counter-title', '记牌器'));
    [17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3].forEach(function (r) {
      var lab = r === 17 ? '大' : r === 16 ? '小' : D.LABEL[r];
      var cell = el('div', 'ct', '<div class="r' + (r >= 16 ? ' jk' + (r === 17 ? ' red' : '') : '') + '">' + lab + '</div><div class="n' + (c[r] === 0 ? ' zero' : c[r] === 4 ? ' four' : '') + '">' + c[r] + '</div>');
      box.appendChild(cell);
    });
  }
  var handIds = [];
  function renderHand() {
    var h = $('hand'); clear(h);
    var hand = game.hands[0];
    handIds = hand.slice();
    sel.forEach(function (id) { if (hand.indexOf(id) < 0) sel.delete(id); });
    var n = hand.length; if (!n) return;
    var W = 1256, cw = 96, sp = Math.min(54, (1040 - cw) / Math.max(1, n - 1)), total = cw + (n - 1) * sp, x0 = (W - total) / 2;
    var mid = (n - 1) / 2, hl = hintList && hintList.length ? null : null;
    hand.forEach(function (id, i) {
      var cls = sel.has(id) ? 'sel' : '';
      if (dealAnim) cls += ' deal';
      if (newCards && newCards.indexOf(id) >= 0) cls += ' newc';
      var c = cardEl(id, 'lg', cls.trim());
      var off = i - mid, rot = off * 0.9, dy = off * off * 0.16 + 4;
      c.style.left = (x0 + i * sp) + 'px';
      c.style.top = '0px';
      c.style.setProperty('--rot', rot + 'deg');
      c.style.setProperty('--dy', dy + 'px');
      c.style.setProperty('--dx0', (W / 2 - (x0 + i * sp)) + 'px');
      c.style.zIndex = i + 1;
      if (dealAnim) c.style.animationDelay = (i * 0.045) + 's';
      c.dataset.idx = i;
      h.appendChild(c);
    });
    void hl;
    dealAnim = false;
    h.classList.toggle('locked', !(game.phase === 'play' && game.cur === 0 && isHuman(0)));
  }
  function renderReveal() {
    [1, 2].forEach(function (p) {
      var r = $('reveal' + p); clear(r);
      if (game.phase !== 'over') return;
      var hand = game.hands[p]; if (!hand.length) return;
      r.appendChild(el('div', 'lbl', NAMES[p] + ' 剩余手牌'));
      var sp = 22;
      r.style.width = (50 + (hand.length - 1) * sp) + 'px';
      hand.forEach(function (id, i) { var c = cardEl(id, 'sm'); c.style.left = (i * sp) + 'px'; c.style.top = '0'; c.style.animationDelay = (i * 0.03) + 's'; r.appendChild(c); });
    });
  }
  function renderStatus() {
    var s = $('status'), txt = '';
    if (game.phase !== 'over' && !isHuman(game.cur)) txt = game.phase === 'bid' ? '等待 ' + NAMES[game.cur] + (game.opts.bidMode === 'grab' ? ' 叫/抢地主…' : ' 叫分…') : NAMES[game.cur] + ' 思考中…';
    if (AUTO && game.phase !== 'over') txt = '';
    s.textContent = txt; s.classList.toggle('show', !!txt);
  }

  // ---------- 操作按钮 ----------
  function btn(cls, text, fn, disabled) {
    var b = el('button', 'abtn ' + cls, text);
    if (disabled) b.disabled = true;
    b.addEventListener('click', function (e) { e.stopPropagation(); if (!b.disabled) { Snd.play('click'); fn(); } });
    return b;
  }
  function canMing() { return settings.ming === '1' && !game.ming[0] && (game.phase === 'bid' || (game.phase === 'play' && game.playCount[0] === 0)); }
  function renderActions() {
    var box = $('actions'); clear(box);
    if (!isHuman(game.cur) || game.phase === 'over') return;
    if (game.phase === 'bid') {
      var opts = game.bidOptions(0);
      if (game.opts.bidMode === 'grab') {
        var grab = game.bid.stage === 'grab';
        box.appendChild(btn('nobid', grab ? '不抢' : '不叫', function () { humanBid('pass'); }));
        box.appendChild(btn('bid', grab ? '抢地主' : '叫地主', function () { humanBid(grab ? 'grab' : 'call'); }));
      } else {
        box.appendChild(btn('nobid', '不叫', function () { humanBid(0); }));
        [1, 2, 3].forEach(function (v) { box.appendChild(btn('bid', v + ' 分', function () { humanBid(v); }, opts.indexOf(v) < 0)); });
      }
      if (canMing()) box.appendChild(btn('ming', '明牌 ×2', humanMing));
      return;
    }
    var free = game.isFree(0);
    if (!free && !getHints().length) {
      box.appendChild(btn('cant', '要不起', humanPass));
      box.appendChild(el('span', 'act-tip', '没有牌能大过上家'));
      return;
    }
    if (!free) box.appendChild(btn('pass', '不出', humanPass));
    box.appendChild(btn('hint', '提示', humanHint));
    var ok = !!game.canPlay(0, Array.from(sel));
    var pb = btn('play', '出牌', humanPlay, !ok); pb.id = 'btnPlay';
    box.appendChild(pb);
    if (canMing()) box.appendChild(btn('ming', '明牌 ×2', humanMing));
  }
  function updatePlayBtn() {
    var pb = $('btnPlay'); if (!pb) return;
    pb.disabled = !game.canPlay(0, Array.from(sel));
  }

  // ---------- 提示 ----------
  function keyOf(ids) { return ids.slice().sort(function (a, b) { return a - b; }).join(','); }
  function getHints() {
    if (hintList) return hintList;
    var g = game, hand = g.hands[0], list = [], seen = {}, seenTR = {};
    function add(ids) { if (!ids || !ids.length) return; var k = keyOf(ids); if (seen[k]) return; seen[k] = 1; list.push(ids.slice()); }
    if (g.isFree(0)) {
      add(AI.lead(g, 0));
      var ev = AI.evalHand(hand);
      ev.groups.slice().sort(function (a, b) { return (a.type === 'bomb' || a.type === 'rocket' ? 50 : 0) + a.rank - ((b.type === 'bomb' || b.type === 'rocket' ? 50 : 0) + b.rank); }).forEach(function (x) { add(x.cards); });
    } else {
      var last = g.lastPlay.combo, c = D.beatingPlays(hand, last);
      var ai = AI.follow(g, 0); if (ai) add(ai);
      c.sort(function (a, b) {
        var ba = a.type === 'bomb' ? 1 : a.type === 'rocket' ? 2 : 0, bb = b.type === 'bomb' ? 1 : b.type === 'rocket' ? 2 : 0;
        return ba - bb || a.rank - b.rank;
      }).forEach(function (x) { var tr = x.type + x.rank + '_' + x.len; if (seenTR[tr]) return; seenTR[tr] = 1; add(x.cards); });
    }
    hintList = list; hintIdx = 0;
    return list;
  }
  function humanHint() {
    var l = getHints();
    if (!l.length) { toast('没有牌能大过上家'); return; }
    var pick = l[hintIdx % l.length]; hintIdx++;
    sel = new Set(pick);
    renderHand(); updatePlayBtn();
  }

  // ---------- 选牌（点击 / 拖动） ----------
  var drag = null, handDown = false;
  document.addEventListener('pointerdown', function (e) { handDown = !!(e.target.closest && e.target.closest('#hand')); }, true);
  function cardIdxAt(x, y) {
    var t = document.elementFromPoint(x, y);
    var c = t && t.closest ? t.closest('#hand .card') : null;
    return c ? parseInt(c.dataset.idx, 10) : -1;
  }
  $('hand').addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    var i = cardIdxAt(e.clientX, e.clientY); if (i < 0) return;
    e.preventDefault();
    drag = { start: i, cur: i, mode: !sel.has(handIds[i]), base: new Set(sel), moved: false };
    applyDrag();
  });
  document.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var i = cardIdxAt(e.clientX, e.clientY);
    if (i >= 0 && i !== drag.cur) { drag.cur = i; drag.moved = true; applyDrag(); }
  });
  document.addEventListener('pointerup', function () { if (drag) { drag = null; updatePlayBtn(); } });
  function applyDrag() {
    var a = Math.min(drag.start, drag.cur), b = Math.max(drag.start, drag.cur);
    sel = new Set(drag.base);
    for (var i = a; i <= b; i++) { if (drag.mode) sel.add(handIds[i]); else sel.delete(handIds[i]); }
    var cards = $('hand').children;
    for (var j = 0; j < cards.length; j++) cards[j].classList.toggle('sel', sel.has(parseInt(cards[j].dataset.id, 10)));
    Snd.play('select');
    updatePlayBtn();
  }
  $('table').addEventListener('click', function (e) {
    if (handDown || e.target.closest('.card') || e.target.closest('#hand') || e.target.closest('.abtn')) { handDown = false; return; }
    if (sel.size) { sel.clear(); renderHand(); updatePlayBtn(); }
  });
  $('table').addEventListener('contextmenu', function (e) {
    e.preventDefault();
    if (game && game.phase === 'play' && game.cur === 0 && isHuman(0)) { if (game.canPlay(0, Array.from(sel))) humanPlay(); }
  });

  // ---------- 玩家动作 ----------
  function humanBid(v) { if (game.cur !== 0 || game.phase !== 'bid') return; stopTimer(); game.doBid(0, v); after(); }
  function humanPlay(ids) {
    if (game.cur !== 0 || game.phase !== 'play') return;
    ids = ids || Array.from(sel);
    if (!game.canPlay(0, ids)) { toast('出牌不符合规则'); return; }
    stopTimer(); game.play(0, ids); sel.clear(); after();
  }
  function humanPass() { if (game.cur !== 0 || game.phase !== 'play' || game.isFree(0)) return; stopTimer(); game.pass(0); sel.clear(); after(); }
  function humanMing() { if (game.showCards(0)) after(true); }
  function after(keepTurn) {
    hintList = null; hintIdx = 0;
    processEvents(); render();
    if (!keepTurn) schedule();
  }

  // ---------- 事件处理（语音/特效/音效） ----------
  function toast(text) { var t = el('div', 'toast', text); $('toasts').appendChild(t); setTimeout(function () { t.remove(); }, 1800); }
  function fx(kind, text) {
    var box = $('fx');
    function add(node, ms) { box.appendChild(node); setTimeout(function () { node.remove(); }, ms); }
    if (kind === 'bomb' || kind === 'rocket') {
      add(el('div', 'flash'), 800);
      for (var i = 0; i < 26; i++) { var s = el('div', 'spark'), a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 260; s.style.left = '628px'; s.style.top = '300px'; s.style.setProperty('--sx', Math.cos(a) * d + 'px'); s.style.setProperty('--sy', Math.sin(a) * d + 'px'); s.style.animationDelay = (kind === 'rocket' ? 0.5 : 0) + Math.random() * 0.1 + 's'; add(s, 1700); }
      if (kind === 'rocket') add(el('div', 'rocket', '🚀'), 1400);
      setTimeout(function () { stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake'); setTimeout(function () { stage.classList.remove('shake'); }, 520); }, kind === 'rocket' ? 600 : 0);
      add(el('div', 'banner bomb', text), 1500);
    } else if (kind === 'plane') { add(el('div', 'plane', '✈'), 1700); add(el('div', 'banner small', text), 1500); }
    else if (kind === 'chain') { add(el('div', 'sweep'), 1000); add(el('div', 'banner small', text), 1500); }
    else add(el('div', 'banner' + (kind === 'small' ? ' small' : ''), text), 1500);
  }
  var SPOKEN_BID = { 0: '不叫', 1: '一分', 2: '两分', 3: '三分', call: '叫地主', grab: '抢地主' };
  function processEvents() {
    var evs = game.events;
    for (; evIdx < evs.length; evIdx++) {
      var e = evs[evIdx];
      switch (e.type) {
        case 'deal':
          dealAnim = true; newCards = null; zoneKeys = [null, null, null]; bottomKey = ''; overShown = false; Snd.play('deal');
          if (e.redeal) toast('没有人叫地主，重新发牌');
          break;
        case 'bid':
          Voice.say(e.v === 'pass' ? (e.stage === 'grab' ? '不抢' : '不叫') : SPOKEN_BID[e.v], 1, e.p);
          Snd.play(e.v === 0 || e.v === 'pass' ? 'pass' : 'click');
          break;
        case 'landlord':
          if (e.p === 0) newCards = e.bottom.slice();
          zoneKeys = [null, null, null];
          Snd.play('landlord');
          fx('small', (e.p === 0 ? '你' : NAMES[e.p]) + ' 是地主');
          Voice.say(e.p === 0 ? '你是地主' : '我是地主', 1, e.p);
          break;
        case 'ming':
          Voice.say('明牌', 1, e.p); fx('small', '明牌 ×2'); break;
        case 'play':
          newCards = null;
          var t = e.combo.type, line = D.speakCombo(e.combo);
          if (!e.newTrick && ['straight', 'pairs', 'plane', 'plane1', 'plane2', 'triple1', 'triple2', 'four2', 'four22'].indexOf(t) >= 0 && Math.random() < 0.4) line = '大你';
          if (t === 'bomb') { Snd.play('bomb'); fx('bomb', '炸弹'); Voice.say('炸弹', 1, e.p); }
          else if (t === 'rocket') { Snd.play('rocket'); fx('rocket', '王炸'); Voice.say('王炸', 1, e.p); }
          else {
            Snd.play('card');
            if (t === 'plane' || t === 'plane1' || t === 'plane2') { Snd.play('plane'); fx('plane', '飞机'); }
            else if (t === 'straight' || t === 'pairs') { Snd.play('chain'); fx('chain', D.TYPE_NAME[t]); }
            Voice.say(line, 0, e.p);
          }
          if (e.left === 2 || e.left === 1) { Snd.play('alarm'); Voice.say(e.left === 2 ? '还剩两张' : '还剩一张', 1, e.p); }
          break;
        case 'pass':
          Snd.play('pass');
          var could = game.lastPlay && D.beatingPlays(game.hands[e.p], game.lastPlay.combo).length > 0;
          Voice.say(could ? (Math.random() < 0.5 ? '不要' : '过') : '要不起', 0, e.p);
          break;
        case 'over':
          var r = e.result, humanWin = r.delta[0] > 0;
          var spring = r.mult.spring === 1 ? '春天' : r.mult.spring === 2 ? '反春天' : '';
          if (spring) setTimeout(function () { fx('', spring); }, 300);
          Snd.play(humanWin ? 'win' : 'lose');
          Voice.say((spring ? spring + '！' : '') + (humanWin ? '恭喜你，赢了' : '很遗憾，你输了'), 2, 0);
          break;
      }
    }
  }

  // ---------- 调度 ----------
  function speed() { return parseFloat(settings.speed) || 1; }
  function schedule() {
    clearTimeout(aiTimer); stopTimer();
    if (!game) return;
    if (game.phase === 'over') { onOver(); return; }
    var p = game.cur;
    if (!isHuman(p)) {
      var delay = (game.phase === 'bid' ? 800 : 950) * speed();
      if (game.phase === 'play' && game.lastPlay && game.lastPlay.p !== p && !D.beatingPlays(game.hands[p], game.lastPlay.combo).length) delay *= 0.7;
      aiTimer = setTimeout(aiStep, delay);
      return;
    }
    startTimer();
  }
  function aiStep() {
    var p = game.cur;
    try {
      if (game.phase === 'bid') game.doBid(p, AI.decideBid(game, p));
      else if (game.phase === 'play') { var ids = AI.decidePlay(game, p); if (ids) game.play(p, ids); else game.pass(p); }
    } catch (err) { console.error(err); return; }
    after();
  }
  function startTimer() {
    var secs = parseInt(settings.timer, 10) || 0;
    if (!secs || AUTO) { renderBadges(); return; }
    timeLeft = secs;
    turnTimer = setInterval(function () {
      timeLeft--;
      var t = $('timerEl'); if (t) { t.textContent = timeLeft; t.classList.toggle('urgent', timeLeft <= 5); }
      if (timeLeft <= 5 && timeLeft > 0) Snd.play('tick');
      if (timeLeft <= 0) { stopTimer(); autoAct(); }
    }, 1000);
    renderBadges();
  }
  function stopTimer() { if (turnTimer) { clearInterval(turnTimer); turnTimer = null; } }
  function autoAct() {
    if (game.cur !== 0) return;
    if (game.phase === 'bid') { humanBid(game.opts.bidMode === 'grab' ? 'pass' : 0); return; }
    if (!game.isFree(0)) { humanPass(); return; }
    var l = getHints(); humanPlay(l[0]);
  }
  function onOver() {
    if (overShown) return; overShown = true;
    var r = game.result;
    session.scores = game.scores.slice(); saveSession();
    render();
    for (var p = 0; p < 3; p++) {
      var d = el('div', 'delta', (r.delta[p] > 0 ? '+' : '') + r.delta[p]);
      d.style.color = r.delta[p] > 0 ? '#7dff9e' : '#ff8f80'; $('badge' + p).appendChild(d);
    }
    clearTimeout(settleTimer);
    settleTimer = setTimeout(showSettle, AUTO ? 300 : 1600);
  }
  function showSettle() {
    var r = game.result, L = game.landlord, meWin = r.delta[0] > 0;
    $('settleRibbon').textContent = meWin ? '胜 利' : '失 败';
    $('settleRibbon').classList.toggle('lose', !meWin);
    $('settleWho').innerHTML = (r.landlordWin ? '<b>地主</b>（' + NAMES[L] + '）获胜' : '<b>农民</b>获胜') + (r.mult.spring === 1 ? ' · 春天！' : r.mult.spring === 2 ? ' · 反春天！' : '');
    var list = $('multList'); clear(list);
    var m = r.mult, rows = [];
    rows.push(['底分', String(r.base), true]);
    if (r.bidMode === 'grab') { rows.push(['叫地主', '×1', true]); rows.push(['抢地主' + (m.grabs ? '（' + m.grabs + ' 次）' : ''), '×' + Math.pow(2, m.grabs), m.grabs > 0]); }
    else rows.push(['叫分', '×' + m.bid, true]);
    rows.push(['炸弹 / 王炸' + (m.bombs ? '（' + m.bombs + ' 个）' : ''), '×' + Math.pow(2, m.bombs), m.bombs > 0]);
    rows.push([m.spring === 2 ? '反春天' : '春天', m.spring ? '×2' : '×1', !!m.spring]);
    rows.push(['明牌', m.ming ? '×2' : '×1', !!m.ming]);
    rows.forEach(function (x, i) { var d = el('div', 'mrow' + (x[2] ? '' : ' off'), '<span>' + x[0] + '</span><b>' + x[1] + '</b>'); d.style.animationDelay = (i * 0.08) + 's'; list.appendChild(d); });
    $('multTotal').textContent = '×' + r.total;
    $('multFormula').textContent = '每位农民 ' + (r.landlordWin ? '输' : '赢') + ' ' + r.base + ' × ' + r.total + ' = ' + r.unit + ' 分，地主 ' + (r.landlordWin ? '赢' : '输') + '双倍';
    var tb = $('scoreTable'); clear(tb);
    tb.appendChild(el('div', 'srow head', '<span>玩家</span><span>身份</span><span>本局</span><span>总分</span>'));
    for (var p = 0; p < 3; p++) {
      var dv = r.delta[p];
      tb.appendChild(el('div', 'srow' + (p === 0 ? ' me' : ''), '<span>' + NAMES[p] + '</span><span>' + (p === L ? '地主' : '农民') + '</span><span class="' + (dv > 0 ? 'pos' : 'neg') + '">' + (dv > 0 ? '+' : '') + dv + '</span><span>' + game.scores[p] + '</span>'));
    }
    $('settle').classList.add('show');
    if (AUTO) setTimeout(function () { if (game.phase === 'over' && $('settle').classList.contains('show')) nextRound(); }, 1500);
  }
  $('btnNext').addEventListener('click', function () { nextRound(); });
  $('btnSettleView').addEventListener('click', function () { $('settle').classList.remove('show'); $('btnBackToSettle').classList.add('show'); });
  $('btnBackToSettle').addEventListener('click', function () { $('settle').classList.add('show'); $('btnBackToSettle').classList.remove('show'); });

  function makeGame() {
    var g = new GE.Game({ bidMode: settings.bidMode, base: parseInt(settings.base, 10) || 10, scores: session.scores });
    return g;
  }
  function nextRound() {
    clearTimeout(aiTimer); clearTimeout(settleTimer); stopTimer();
    $('settle').classList.remove('show'); $('btnBackToSettle').classList.remove('show');
    if (!game) game = makeGame();
    game.opts.bidMode = settings.bidMode; game.opts.base = parseInt(settings.base, 10) || 10;
    sel.clear(); hintList = null;
    session.round++; saveSession();
    game.newRound();
    processEvents(); render(); schedule();
  }
  function startGame() {
    ['startScreen', 'settings', 'help', 'confirm'].forEach(function (id) { $(id).classList.remove('show'); });
    Voice.stop();
    game = makeGame(); evIdx = 0;
    nextRound();
  }

  // ---------- 设置界面 ----------
  function syncSegs() {
    document.querySelectorAll('.seg').forEach(function (seg) {
      var k = seg.dataset.key;
      seg.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', String(settings[k]) === b.dataset.v); });
    });
    $('btnSound').textContent = settings.mute !== '1' ? '🔊' : '🔇';
    $('btnSound').classList.toggle('muted', settings.mute === '1');
    $('voiceVol').value = settings.voiceVol; $('voiceVolTxt').textContent = settings.voiceVol + '%';
    fillVoiceSelect();
  }
  document.querySelectorAll('.seg').forEach(function (seg) {
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var k = seg.dataset.key;
      settings[k] = b.dataset.v; saveSettings(); syncSegs(); Snd.level(); Snd.play('click');
      if (k === 'voice' && settings.voice !== '1') Voice.stop();
      if (game && (k === 'counter')) renderCounter(), renderTop();
      if (game && k === 'ming') renderActions();
      if (k === 'timer' && game && game.cur === 0 && game.phase !== 'over') { stopTimer(); startTimer(); }
    });
  });
  $('voiceSel').addEventListener('change', function () { settings.voiceName = this.value; saveSettings(); fillVoiceSelect(); Voice.stop(); Voice.say('对三', 0); });
  $('voiceVol').addEventListener('input', function () { settings.voiceVol = this.value; $('voiceVolTxt').textContent = this.value + '%'; saveSettings(); });
  $('voiceVol').addEventListener('change', function () { Voice.stop(); Voice.say('王炸', 0); });
  $('btnVoiceTest').addEventListener('click', function () {
    Snd.ensure(); Voice.stop();
    if (settings.voice !== '1') { toast('请先打开语音报牌'); return; }
    if (settings.mute === '1') { toast('当前已静音'); return; }
    ['我是地主', '顺子', '飞机', '炸弹', '还剩两张'].forEach(function (t, i) { Voice.say(t, i ? 1 : 0); });
  });
  function confirmBox(text, yes) {
    $('confirmText').textContent = text; $('confirm').classList.add('show');
    $('confirmYes').onclick = function () { $('confirm').classList.remove('show'); yes(); };
    $('confirmNo').onclick = function () { $('confirm').classList.remove('show'); };
  }
  $('btnStart').addEventListener('click', function () { Snd.ensure(); startGame(); });
  $('btnNew').addEventListener('click', function () {
    confirmBox('开始新游戏？所有积分将清零。', function () {
      session = { scores: [0, 0, 0], round: 0 }; saveSession();
      clearTimeout(aiTimer); clearTimeout(settleTimer); stopTimer(); Voice.stop();
      game = null; $('settle').classList.remove('show'); $('btnBackToSettle').classList.remove('show');
      $('startScreen').classList.add('show');
    });
  });
  $('btnCounter').addEventListener('click', function () { settings.counter = settings.counter === '1' ? '0' : '1'; saveSettings(); syncSegs(); if (game) { renderCounter(); renderTop(); } });
  $('btnSettings').addEventListener('click', function () { syncSegs(); $('settings').classList.add('show'); });
  $('btnHelp').addEventListener('click', function () { $('help').classList.add('show'); });
  $('btnSound').addEventListener('click', function () { settings.mute = settings.mute === '1' ? '0' : '1'; saveSettings(); syncSegs(); if (settings.mute === '1') Voice.stop(); Snd.ensure(); Snd.play('click'); });
  document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { $(b.dataset.close).classList.remove('show'); }); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') ['help', 'settings', 'confirm'].forEach(function (id) { $(id).classList.remove('show'); });
    if (!game || game.cur !== 0 || game.phase !== 'play' || !isHuman(0)) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (game.canPlay(0, Array.from(sel))) humanPlay(); }
    else if (e.key === 'h' || e.key === 'H') humanHint();
    else if (e.key === 'p' || e.key === 'P') humanPass();
  });

  // ---------- 规则说明 ----------
  (function buildHelp() {
    function ex(spec) { // spec: 'r:s r:s ...'，s 为花色 0-3
      var d = el('div', 'cards-ex');
      spec.split(' ').forEach(function (t) {
        var id; if (t === 'BJ') id = 53; else if (t === 'SJ') id = 52; else { var p = t.split(':'); id = (parseInt(p[0], 10) - 3) * 4 + parseInt(p[1], 10); }
        d.appendChild(cardEl(id, 'xs'));
      });
      return d.outerHTML;
    }
    var combos = [
      ['单张', '任意一张牌。大小：3 < 4 < … < K < A < 2 < 小王 < 大王。', '14:1'],
      ['对子', '两张点数相同的牌。', '13:0 13:1'],
      ['三张', '三张点数相同的牌。', '9:0 9:1 9:2'],
      ['三带一', '三张 + 任意一张单牌。', '9:0 9:1 9:2 4:3'],
      ['三带二', '三张 + 一个对子。', '9:0 9:1 9:2 4:3 4:1'],
      ['顺子', '五张或更多连续单牌（3 到 A，不含 2 和王）。', '5:0 6:1 7:2 8:3 9:0'],
      ['连对', '三对或更多连续对子（不含 2 和王）。', '5:0 5:1 6:2 6:3 7:0 7:1'],
      ['飞机', '两组或更多连续三张（不含 2）。', '7:0 7:1 7:2 8:0 8:1 8:2'],
      ['飞机带翅膀', '飞机 + 同数量的单牌，或同数量的对子。', '7:0 7:1 7:2 8:0 8:1 8:2 3:0 4:1'],
      ['四带二', '四张相同 + 两张单牌，或 + 两个对子（不算炸弹）。', '10:0 10:1 10:2 10:3 3:1 5:2'],
      ['炸弹', '四张相同的牌，可以压任何非炸弹牌型；炸弹之间比点数。', '15:0 15:1 15:2 15:3'],
      ['王炸', '大王 + 小王，最大的牌型，可以压任何牌。', 'SJ BJ']
    ];
    var html = '<div class="rules-sec"><h3>基本玩法</h3><p>一副牌 54 张，三人各 17 张，留 3 张底牌。叫地主后，地主获得底牌（底牌对所有人公开），共 20 张；另外两家为农民，合作对抗地主。地主先出牌，按逆时针（你 → 右家 → 左家）轮流出牌，必须出同牌型且更大的牌，或选择不出；其余两家都不出时，由最后出牌者重新自由出牌。谁先出完手牌，所在一方获胜。</p>' +
      '<h3>叫地主</h3><p><b>叫分模式：</b>每人依次叫 1 / 2 / 3 分或不叫，只能比前面叫得高，叫 3 分直接当地主；三人都不叫则重新发牌。<b>抢地主模式：</b>第一个“叫地主”的人成为候选，之后的玩家可以“抢地主”（每抢一次倍数 ×2），最初叫地主的人最后还有一次反抢机会。</p>' +
      '<h3>牌型</h3><div class="combo-grid">';
    combos.forEach(function (c) { html += '<div class="combo-def">' + ex(c[2]) + '<div class="txt"><b>' + c[0] + '</b>' + c[1] + '</div></div>'; });
    html += '</div><h3>计分</h3><p>每局得分 = 底分 × 叫分（或 2<sup>抢地主次数</sup>）× 2<sup>炸弹与王炸个数</sup> × 春天/反春天 ×2 × 明牌 ×2。' +
      '<br><b>春天：</b>地主出完牌时两位农民一张牌都没出过。<b>反春天：</b>农民获胜时地主只出过一手牌。<b>明牌：</b>叫地主阶段或自己出第一手牌前，可以选择明牌，本局倍数 ×2。' +
      '<br>地主获胜：每位农民各付给地主一份得分（地主赢双份）；农民获胜：地主付给每位农民一份得分。</p>' +
      '<h3>操作</h3><p>点击手牌选中/取消，按住拖动可以连续选择多张；点击桌面空白处取消选择。「提示」会循环给出可以出的牌；右键或回车键出牌，H 键提示，P 键不出。记牌器显示除你手牌外、还没打出的每种点数的张数。</p></div>';
    $('helpBody').innerHTML = html;
  })();
  // 开始界面装饰
  (function deco() {
    var box = $('startDeco');
    [[14, 0], [13, 1], [53, -1], [12, 3], [11, 2]].forEach(function (x, i) {
      var id = x[1] < 0 ? x[0] : (x[0] - 3) * 4 + x[1];
      var c = cardEl(id, 'lg'); c.style.left = '-48px'; c.style.top = '0px'; c.style.transform = 'rotate(' + ((i - 2) * 14) + 'deg)'; c.style.zIndex = i; box.appendChild(c);
    });
  })();

  syncSegs();
  window.__ddz = {
    get game() { return game; }, settings: settings, voice: Voice, startGame: startGame, nextRound: nextRound, render: render,
    bid: humanBid, play: humanPlay, pass: humanPass, hint: humanHint, ming: humanMing, getHints: function () { return getHints(); },
    get sel() { return Array.from(sel); }
  };
  if (AUTO) startGame();
})();
