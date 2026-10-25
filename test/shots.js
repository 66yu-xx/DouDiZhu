const { chromium } = require('/workspace/tools/node_modules/playwright-core');
const OUT = '/workspace/doudizhu/shots/';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errors = [];
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await p.goto('file:///workspace/doudizhu/index.html');
  await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + '01-start.png' });
  await p.click('.start-opts [data-key="speed"] [data-v="0.55"]');
  await p.click('#btnStart');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: OUT + '02-deal-bid.png' });
  // 叫地主：轮到自己时叫 3 分
  for (let i = 0; i < 60; i++) {
    const st = await p.evaluate(() => ({ ph: __ddz.game.phase, cur: __ddz.game.cur }));
    if (st.ph !== 'bid') break;
    if (st.cur === 0) { await p.screenshot({ path: OUT + '03-my-bid.png' }); await p.evaluate(() => __ddz.bid(__ddz.game.bidOptions(0).slice(-1)[0])); }
    await p.waitForTimeout(250);
  }
  await p.waitForTimeout(1200);
  await p.screenshot({ path: OUT + '04-landlord.png' });
  // 出几手
  let shotSel = false, shotFollow = false;
  for (let i = 0; i < 400; i++) {
    const st = await p.evaluate(() => ({ ph: __ddz.game.phase, cur: __ddz.game.cur, free: __ddz.game.phase === 'play' && __ddz.game.isFree(0), played: __ddz.game.history.length }));
    if (st.ph === 'over') break;
    if (st.ph === 'play' && st.cur === 0) {
      await p.waitForTimeout(300);
      await p.evaluate(() => __ddz.hint());
      await p.waitForTimeout(250);
      if (!shotSel && st.played >= 0) { await p.screenshot({ path: OUT + '05-hint-selected.png' }); shotSel = true; }
      if (!shotFollow && !st.free && st.played > 3) { await p.screenshot({ path: OUT + '06-follow.png' }); shotFollow = true; }
      await p.evaluate(() => { const h = __ddz.getHints(); if (__ddz.game.isFree(0) || !h.length) { if (h.length) __ddz.play(h[0]); else __ddz.pass(); } else __ddz.play(h[0]); });
      if (st.played > 6 && st.played < 12) { await p.waitForTimeout(500); await p.screenshot({ path: OUT + '07-midgame.png' }); }
    }
    await p.waitForTimeout(150);
  }
  await p.waitForTimeout(2200);
  await p.screenshot({ path: OUT + '08-settlement.png' });
  await p.click('#btnSettleView'); await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + '09-revealed.png' });
  await p.click('#btnBackToSettle');
  await p.click('#btnNext'); await p.waitForTimeout(300);
  await p.click('#btnHelp'); await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '10-help.png' });
  await p.click('[data-close="help"]');
  await p.click('#btnSettings'); await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '11-settings.png' });
  await p.click('#settings [data-close="settings"].close');
  // 特效：构造炸弹
  await p.evaluate(() => {
    const g = __ddz.game; g.phase = 'play'; g.landlord = 0; g.cur = 0; g.lastPlay = null; g.lastAct = [null, null, null];
    g.hands[0] = [48, 49, 50, 51, 52, 53, 44, 45, 40, 36, 32, 28, 24, 20, 16]; g.hands[0].sort((a, b) => b - a);
    __ddz.render();
    __ddz.play([48, 49, 50, 51]);
  });
  await p.waitForTimeout(250);
  await p.screenshot({ path: OUT + '12-bomb-fx.png' });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
