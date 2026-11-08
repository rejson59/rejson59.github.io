/* Test rzeczywistych rozmiarów i interakcji; bez zrzutów ekranu. */
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--no-sandbox', '--disable-webgl'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', timezoneId: 'America/Los_Angeles' });
    await ctx.route('**/*', r => r.request().url().startsWith('http://127.0.0.1:8889/') ? r.continue() : r.abort());
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date('2026-11-09T10:08:58Z') });
    await page.goto('http://127.0.0.1:8889/rejclass.html');
    assert.equal(await page.locator('#countdown-minutes').innerText(), '01');
    assert.equal(await page.locator('#countdown-seconds').innerText(), '02');
    await page.clock.fastForward(2000);
    assert.equal(await page.locator('#countdown-minutes').innerText(), '01');
    assert.equal(await page.locator('#countdown-seconds').innerText(), '00');
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      for (const width of [320, 375, 760, 1024, 1280, 1600]) {
        await page.setViewportSize({ width, height: 900 });
        const bounds = await page.evaluate(() => {
          const section = document.querySelector('.rjc-countdown').getBoundingClientRect();
          const clock = document.querySelector('#countdown-clock').getBoundingClientRect();
          return { doc: document.documentElement.scrollWidth, viewport: innerWidth, section: {left: section.left,right: section.right,top: section.top,bottom: section.bottom}, clock: {left: clock.left,right: clock.right,top: clock.top,bottom: clock.bottom} };
        });
        assert(bounds.doc <= bounds.viewport, `${theme} ${width}: overflow`);
        assert(bounds.clock.left >= bounds.section.left && bounds.clock.right <= bounds.section.right && bounds.clock.bottom <= bounds.section.bottom, `${theme} ${width}: zegar poza ramką`);
      }
    }
    await page.clock.fastForward(60000);
    assert.equal(await page.locator('#countdown-clock').isHidden(), true);
    assert.match(await page.locator('#countdown-status').innerText(), /Lekcja angielskiego rozpoczęła się/);
    await ctx.close();
    console.log('PASS: Chromium, sekundy, inne strefy czasowe, zakończenie i szerokości 320–1600');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
