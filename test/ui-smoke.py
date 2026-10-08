"""
Browser smoke test for the calculator page (v0.3.2+).
Checks that results appear immediately, and that every slider, toggle and typed field updates results live.

Setup once:  pip install playwright && playwright install chromium
Run:         python3 -m http.server 8765   (in this folder, separate terminal)
             python3 test/ui-smoke.py [http://localhost:8765/index.html]
"""
import asyncio, sys
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/index.html'

async def main():
    failures, errors = [], []
    def check(cond, msg):
        print(('PASS ' if cond else 'FAIL ') + msg)
        if not cond: failures.append(msg)

    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1280, 'height': 1000})
        pg.on('pageerror', lambda e: errors.append(str(e)))
        await pg.goto(URL); await pg.evaluate('localStorage.clear()'); await pg.reload(); await pg.wait_for_timeout(800)
        txt = lambda s: pg.inner_text(s)

        check(await pg.input_value('#f-productName') == 'My First Digital Product', 'starts with the default product name')
        check(await txt('#o-aov') not in ('', '—'), 'results show immediately, no name required')
        check(await pg.evaluate("[...document.querySelectorAll('input[type=range]')].every(s => !s.disabled)"), 'sliders work immediately')
        await pg.fill('#f-productName', ''); await pg.wait_for_timeout(300)
        check(await txt('#o-aov') not in ('', '—'), 'a blank name never blocks results')
        check(not (await txt('#o-profit')).startswith('-'), 'a new user opens to a profit')
        before = await txt('#o-profit'); await pg.click('#growList [data-lever="0"]'); await pg.wait_for_timeout(500)
        check(before != await txt('#o-profit'), '"Try it" applies a growth idea')

        async def slide(sel, frac):
            await pg.locator(sel).scroll_into_view_if_needed()
            box = await pg.locator(sel).bounding_box()
            await pg.mouse.click(box['x'] + box['width'] * frac, box['y'] + box['height'] / 2)
            await pg.wait_for_timeout(600)

        for sel, out in [('#r-price', '#o-aov'), ('#r-adSpend', '#o-buyers'), ('#r-socialReach', '#o-buyers'), ('#r-conversionRate', '#o-buyers'),
                         ('#r-bump-rate', '#o-aov'), ('#r-upsell-rate', '#o-aov'), ('#r-downsell-rate', '#o-aov'), ('#r-oto-rate', '#o-aov')]:
            before = await txt(out); await slide(sel, 0.85); after = await txt(out)
            check(before != after, f'{sel} updates {out} ({before} -> {after})')

        before = await txt('#o-aov'); await pg.click('label.switch:has(#t-oto)'); await pg.wait_for_timeout(600)
        check(before != await txt('#o-aov'), 'offer toggle updates AOV')
        before = await txt('#o-profit'); await pg.fill('#f-adSpend', '2500'); await pg.wait_for_timeout(600)
        check(before != await txt('#o-profit'), 'typing updates profit')
        # Conversion scenario switch and main sales data
        await pg.click('#mainSeg .seg-btn[data-mode=stretch]'); await pg.wait_for_timeout(300)
        check(await pg.input_value('#f-conversionRate') == '4', 'Stretch conversion sets 4%')
        await pg.click('#mainSeg .seg-btn[data-mode=data]'); await pg.wait_for_timeout(300)
        await pg.fill('#sd-main-viewed', '1200'); await pg.fill('#sd-main-purchased', '18'); await pg.wait_for_timeout(400)
        check(await pg.input_value('#f-conversionRate') == '1.5', 'main sales data sets conversion to 1.5%')
        # Traffic modes
        check('from ads' in await txt('#trafficSum'), 'traffic built from ads + social by default')
        await pg.click('#trafficSeg .seg-btn[data-traffic=direct]'); await pg.wait_for_timeout(300)
        check('entered directly' in await txt('#trafficSum'), 'direct visitors mode')
        await pg.click('#trafficSeg .seg-btn[data-traffic=sources]'); await pg.wait_for_timeout(300)

        # Scenario switch and sales-data mode
        await pg.click('#offerSeg .seg-btn[data-mode=expected]'); await pg.wait_for_timeout(400)
        check(await pg.input_value('#f-bump-rate') == '20', 'Expected scenario sets the bump to 20%')
        await pg.click('#offerSeg .seg-btn[data-mode=data]'); await pg.wait_for_timeout(300)
        for k, (seen, bought) in {'bump': (100, 35), 'upsell': (100, 25), 'downsell': (75, 15), 'oto': (100, 10)}.items():
            await pg.fill(f'#sd-{k}-viewed', str(seen)); await pg.fill(f'#sd-{k}-purchased', str(bought))
        await pg.wait_for_timeout(500)
        check(await txt('#sr-downsell') == '20%', 'downsell take rate counts only upsell decliners who saw it (15 of 75)')
        await pg.fill('#sd-downsell-viewed', '80'); await pg.wait_for_timeout(300)
        check('Only 75 people declined' in await txt('#sm-downsell'), 'flags more downsell viewers than upsell decliners')

        check(not errors, 'no page errors ' + ('' if not errors else str(errors)))
        await b.close()

    print(f"\n{'All checks passed' if not failures else f'{len(failures)} check(s) failed'}")
    sys.exit(1 if failures else 0)

asyncio.run(main())
