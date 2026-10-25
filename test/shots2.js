const { chromium } = require('/workspace/tools/node_modules/playwright-core');
const OUT = '/workspace/doudizhu/shots/';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errors = [];
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', e => errors.push(e.message));
  await p.goto('file:///workspace/doudizhu/index.html');
  await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.click('.start-opts [data-key="bidMode"] [data-v="grab"]');
  await p.click('#btnStart');
  for (let i = 0; i < 80; i++) { const s = await p.evaluate(() => ({ ph: __ddz.game.phase, cur: __ddz.game.cur, n: __ddz.game.bid.log.length })); if (s.ph === 'bid' && s.cur === 0 && s.n > 0) break; if (s.ph === 'bid' && s.cur === 0) await p.evaluate(() => __ddz.bid('pass')); await p.waitForTimeout(150); }
  await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '13-grab-bid.png' });
  const rig = async (hands, last) => p.evaluate(([hands, last]) => {
    const g = __ddz.game; g.phase = 'play'; g.landlord = 0; g.cur = 0; g.lastAct = [null, null, null]; g.hands = hands.map(h => h.slice().sort((a, b) => b - a));
    if (last) { g.lastPlay = { p: 1, combo: DDZ.analyze(last)[0], cards: last }; g.lastAct[1] = { kind: 'play', combo: g.lastPlay.combo, cards: last }; g.hands[1] = g.hands[1].filter(x => !last.includes(x)); } else g.lastPlay = null;
    __ddz.render();
  }, [hands, last]);
  // 要不起
  await rig([[0, 4, 8, 13, 17, 22, 26, 30, 34, 39, 43, 1, 5], [48, 49, 50, 44, 45, 2, 6], [3, 7, 11, 15, 19, 23]], [48, 49, 50]);
  await p.evaluate(() => { __ddz.game.cur = 0; __ddz.render(); });
  await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '14-cant-beat.png' });
  // 飞机
  await rig([[0, 1, 2, 4, 5, 6, 40, 44, 20, 24, 28, 32], [46, 47, 9, 10], [3, 7, 11, 15, 19, 23, 27]], null);
  await p.evaluate(() => __ddz.play([0, 1, 2, 4, 5, 6, 40, 44]));
  await p.waitForTimeout(350);
  await p.screenshot({ path: OUT + '15-plane-fx.png' });
  // 王炸
  await p.waitForTimeout(2500);
  await rig([[52, 53, 30, 31, 34], [9, 10, 14], [3, 7, 11, 15, 19, 23]], [9, 10]);
  await p.evaluate(() => { __ddz.game.lastPlay.combo = DDZ.analyze([9,10])[0]; __ddz.play([52, 53]); });
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + '16-rocket-fx.png' });
  await p.setViewportSize({ width: 900, height: 600 }); await p.waitForTimeout(2500);
  await p.screenshot({ path: OUT + '17-small-window.png' });
  console.log('errors:', errors.length ? errors : 'none');
  await b.close();
})();
