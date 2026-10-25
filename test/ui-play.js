// 无头浏览器 UI 对局测试：真实点击/拖动 + 假语音引擎（在线/离线）+ 两种叫地主模式 + 积分持久化
const { chromium } = require('/workspace/tools/node_modules/playwright-core');
const mock = (online) => {
  const voices = [
    { name: 'Microsoft Kangkang - Chinese (Simplified, PRC)', lang: 'zh-CN', localService: true },
    { name: 'Microsoft Huihui - Chinese (Simplified, PRC)', lang: 'zh-CN', localService: true },
    { name: 'Microsoft Yaoyao - Chinese (Simplified, PRC)', lang: 'zh-CN', localService: true },
    { name: 'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)', lang: 'zh-CN', localService: false },
    { name: 'Microsoft Yunxi Online (Natural) - Chinese (Mainland)', lang: 'zh-CN', localService: false },
  ];
  const spoken = []; let cur = null, timer = null;
  const ss = { speaking: false, pending: false, _l: {}, getVoices: () => voices, addEventListener(t, f) { this._l[t] = f; },
    speak(u) { cur = u; this.speaking = true; spoken.push({ text: u.text, voice: u.voice && u.voice.name, pitch: u.pitch, rate: u.rate, volume: u.volume });
      if (!online && u.voice && !u.voice.localService) { setTimeout(() => { cur = null; ss.speaking = false; u.onerror && u.onerror({ error: 'network' }); }, 30); return; }
      timer = setTimeout(() => { if (cur === u) { cur = null; ss.speaking = false; u.onend && u.onend({}); } }, 250 + u.text.length * 90); },
    cancel() { if (cur) { const u = cur; cur = null; this.speaking = false; clearTimeout(timer); u.onerror && u.onerror({ error: 'interrupted' }); } } };
  Object.defineProperty(window, 'speechSynthesis', { value: ss, configurable: true, writable: true });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  window.__spoken = spoken;
};
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errors = []; let failed = 0;
  const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failed++; };
  for (const [online, mode] of [[true, 'score'], [false, 'grab']]) {
    console.log(`== ${online ? '在线语音' : '离线语音'} / ${mode === 'score' ? '叫分' : '抢地主'}`);
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await p.addInitScript(mock, online);
    await p.goto('file:///workspace/doudizhu/index.html');
    await p.evaluate(() => localStorage.clear()); await p.reload();
    await p.click(`.start-opts [data-key="bidMode"] [data-v="${mode}"]`);
    await p.click('.start-opts [data-key="speed"] [data-v="0.55"]');
    await p.click('#btnStart');
    const stat = { rounds: 0, clicks: 0, drags: 0, rightClicks: 0, hints: 0, passBtn: 0, bids: 0, landlordHuman: 0 };
    const t0 = Date.now();
    while (stat.rounds < 3 && Date.now() - t0 < 150000) {
      const st = await p.evaluate(() => { const g = __ddz.game; return { ph: g.phase, cur: g.cur, free: g.phase === 'play' && g.isFree(0), settle: document.getElementById('settle').classList.contains('show'), btns: [...document.querySelectorAll('#actions .abtn')].map(x => x.textContent) }; });
      if (st.settle) { stat.rounds++; await p.waitForTimeout(300); if (stat.rounds < 3) await p.click('#btnNext'); continue; }
      if (st.ph === 'bid' && st.cur === 0 && st.btns.length) {
        const v = await p.evaluate(() => DDZAI.decideBid(__ddz.game, 0));
        const label = { 0: '不叫', 1: '1 分', 2: '2 分', 3: '3 分', call: '叫地主', grab: '抢地主', pass: null }[v];
        const btns = await p.$$('#actions .abtn');
        let clicked = false;
        for (const bt of btns) { const t = (await bt.textContent()).replace(/\s/g, ''); if ((label && t === label.replace(/\s/g, '')) || (!label && (t === '不抢' || t === '不叫'))) { await bt.click(); clicked = true; break; } }
        if (!clicked) await p.evaluate(v => __ddz.bid(v), v);
        stat.bids++; await p.waitForTimeout(200); continue;
      }
      if (st.ph === 'play' && st.cur === 0 && st.btns.length) {
        const ids = await p.evaluate(() => DDZAI.decidePlay(__ddz.game, 0));
        if (!ids) {
          const bt = await p.$('#actions .abtn.pass'); if (bt) { await bt.click(); stat.passBtn++; } else await p.evaluate(() => __ddz.pass());
        } else {
          // 用鼠标点选这些牌
          const k = stat.clicks + stat.drags + stat.rightClicks;
          const pos = await p.evaluate(ids => { const s = new Set(ids); return [...document.querySelectorAll('#hand .card')].map((c, i) => ({ i, id: +c.dataset.id, r: c.getBoundingClientRect() })).filter(x => s.has(x.id)).map(x => { let pt = null; for (let dy = 20; dy < x.r.height && !pt; dy += 8) for (let dx = 4; dx < x.r.width && !pt; dx += 4) { const e = document.elementFromPoint(x.r.left + dx, x.r.top + dy); const c = e && e.closest('#hand .card'); if (c && +c.dataset.id === x.id) pt = { x: x.r.left + dx, y: x.r.top + dy }; } return { i: x.i, x: pt ? pt.x : x.r.left + 12, y: pt ? pt.y : x.r.top + 40 }; }); }, ids);
          const contiguous = pos.every((q, j) => j === 0 || q.i === pos[j - 1].i + 1);
          if (k % 3 === 1 && contiguous && pos.length > 1) {
            await p.mouse.move(pos[0].x, pos[0].y); await p.mouse.down(); await p.mouse.move(pos[pos.length - 1].x, pos[pos.length - 1].y, { steps: 8 }); await p.mouse.up(); stat.drags++;
          } else { for (const q of pos) await p.mouse.click(q.x, q.y); stat.clicks++; }
          const selOk = await p.evaluate(ids => { const s = __ddz.sel.sort(); return JSON.stringify(s) === JSON.stringify(ids.slice().sort()); }, ids);
          if (!selOk) { errors.push('选牌不一致 ' + JSON.stringify({ ids, got: await p.evaluate(() => __ddz.sel) })); await p.evaluate(ids => __ddz.play(ids), ids); }
          else if (k % 3 === 2) { await p.mouse.click(640, 250, { button: 'right' }); stat.rightClicks++; }
          else await p.click('#actions .abtn.play');
          if (k % 5 === 0) { // 也试一下提示按钮循环
            await p.waitForTimeout(50);
          }
        }
        await p.waitForTimeout(150); continue;
      }
      await p.waitForTimeout(120);
    }
    // 提示按钮循环测试（下一局开局时）
    await p.click('#btnNext'); 
    for (let i = 0; i < 200; i++) { const s = await p.evaluate(() => ({ ph: __ddz.game.phase, cur: __ddz.game.cur })); if (s.ph === 'bid' && s.cur === 0) await p.evaluate(() => __ddz.bid(__ddz.game.bidOptions(0).slice(-1)[0])); if (s.ph === 'play' && s.cur === 0) break; await p.waitForTimeout(100); }
    const hintCycle = await p.evaluate(async () => { const out = []; for (let i = 0; i < 6; i++) { document.querySelector('#actions .abtn.hint').click(); await new Promise(r => setTimeout(r, 30)); out.push(__ddz.sel.join(',')); } return { free: __ddz.game.isFree(0), distinct: new Set(out).size, allLegal: out.every(s => !!__ddz.game.canPlay(0, s.split(',').map(Number))) }; });
    check(hintCycle.allLegal && (hintCycle.distinct > 1 || !hintCycle.free), `提示按钮循环 ${hintCycle.distinct} 种不同合法出法`);
    const sess = await p.evaluate(() => ({ s: JSON.parse(localStorage.getItem('ddz.session') || 'null'), shown: [0, 1, 2].map(i => document.querySelector('#badge' + i + ' .score, #badge' + i + ' .pts') && document.querySelector('#badge' + i + ' .score, #badge' + i + ' .pts').textContent) }));
    const sp = await p.evaluate(() => window.__spoken);
    const texts = sp.map(x => x.text), vset = [...new Set(sp.map(x => x.voice))];
    console.log('  对局:', JSON.stringify(stat));
    console.log('  语音样本:', texts.slice(0, 18).join(' / '));
    console.log('  使用声音:', vset.join(', '), ' 音高样本:', [...new Set(sp.map(x => x.pitch))].join(','));
    check(stat.rounds === 3, '完成 3 局');
    check(sess.s && sess.s.scores && sess.s.scores.reduce((a, c) => a + c, 0) === 0 && sess.s.scores.some(x => x !== 0), '积分持久化且零和 ' + JSON.stringify(sess.s && sess.s.scores));
    check(texts.some(t => /分|叫|抢|不/.test(t)), '叫地主有语音');
    check(texts.some(t => /地主/.test(t)), '"我是地主/你是地主" 播报');
    check(texts.some(t => /^(对|三个|顺子|连对|飞机|三带|四带|炸弹|王炸)|^[三四五六七八九十JQKA二]$|大王|小王/.test(t)), '出牌报牌');
    check(texts.some(t => /要不起|不要|过/.test(t)), '不出播报');
    check(texts.some(t => /还剩/.test(t)), '报警 还剩X张');
    check(texts.some(t => /赢了|输了/.test(t)), '结算播报');
    if (online) check(vset[0] && /Xiaoxiao/.test(vset[0]), '在线优先晓晓');
    else check(vset.includes('Microsoft Huihui - Chinese (Simplified, PRC)') && sp.some(x => /Xiaoxiao/.test(x.voice || '')), '离线：晓晓失败后回退到慧慧');
    // 刷新后积分仍在
    await p.reload(); await p.waitForTimeout(300);
    const after = await p.evaluate(() => JSON.parse(localStorage.getItem('ddz.session')).scores);
    check(JSON.stringify(after) === JSON.stringify(sess.s.scores), '刷新后积分保留');
    // 设置：选声音+试听
    await p.click('#btnStart'); await p.waitForTimeout(300);
    await p.click('#btnSettings'); await p.waitForTimeout(200);
    const opts = await p.$$eval('#voiceSel option', o => o.map(x => x.textContent));
    check(opts.length >= 3 && !opts.some(o => /Kangkang|Yunxi/.test(o) && /推荐/.test(o)), '声音列表: ' + opts.join(' | '));
    const n0 = (await p.evaluate(() => window.__spoken.length));
    await p.click('#btnVoiceTest'); await p.waitForTimeout(150);
    const n1 = (await p.evaluate(() => window.__spoken.length));
    check(n1 > n0, '试听发声');
    await ctx.close();
  }
  // 计时器 + 记牌器开关 + 小窗口
  {
    const ctx = await b.newContext({ viewport: { width: 900, height: 600 } }); const p = await ctx.newPage();
    p.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await p.goto('file:///workspace/doudizhu/index.html');
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('ddz.settings', JSON.stringify({ timer: '15', speed: '0.55' })); }); await p.reload();
    await p.click('#btnStart');
    let sawTimer = false;
    for (let i = 0; i < 80 && !sawTimer; i++) { sawTimer = await p.evaluate(() => !!document.querySelector('.timer, .badge .clock') && __ddz.game.cur === 0); await p.waitForTimeout(150); }
    check(sawTimer, '计时器显示');
    const c1 = await p.evaluate(() => getComputedStyle(document.getElementById('counter')).display);
    await p.click('#btnCounter'); await p.waitForTimeout(100);
    const c2 = await p.evaluate(() => getComputedStyle(document.getElementById('counter')).display);
    check(c1 !== c2, `记牌器开关 ${c1} → ${c2}`);
    const fit = await p.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return r.width <= innerWidth + 1 && r.height <= innerHeight + 1; });
    check(fit, '小窗口自动缩放适配');
    await ctx.close();
  }
  check(errors.length === 0, '无页面错误' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  await b.close();
  console.log(failed ? `失败 ${failed}` : '全部通过');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
