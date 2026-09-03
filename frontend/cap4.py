from playwright.sync_api import sync_playwright

OUT = "C:/tmp/mango-shots2"
BASE = "http://localhost:5173"


def unlock(page):
    for d in "1234":
        page.get_by_role("button", name=d, exact=True).click()
    page.get_by_role("button", name="Continuar").click()
    page.wait_for_timeout(300)
    for d in "1234":
        page.get_by_role("button", name=d, exact=True).click()
    page.get_by_role("button", name="Crear código").click()
    page.wait_for_timeout(1500)


with sync_playwright() as p:
    b = p.chromium.launch(headless=True)

    # MOBILE
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    pg = ctx.new_page()
    pg.goto(BASE, wait_until="domcontentloaded")
    pg.wait_for_timeout(1000)
    unlock(pg)
    pg.wait_for_timeout(6000)
    pg.goto(f"{BASE}/presupuestos", wait_until="domcontentloaded")
    pg.wait_for_timeout(800)
    unlock(pg)
    pg.wait_for_timeout(1000)
    pg.get_by_role("button", name="Agregar sobre").click()
    pg.wait_for_timeout(700)
    pg.screenshot(path=f"{OUT}/m_sheet.png")
    print("m_sheet")
    ctx.close()

    # DESKTOP
    ctx = b.new_context(viewport={"width": 1366, "height": 850})
    pg = ctx.new_page()
    pg.goto(BASE, wait_until="domcontentloaded")
    pg.wait_for_timeout(1000)
    unlock(pg)
    pg.wait_for_timeout(6000)
    pg.goto(f"{BASE}/presupuestos", wait_until="domcontentloaded")
    pg.wait_for_timeout(800)
    unlock(pg)
    pg.wait_for_timeout(1000)
    pg.get_by_role("button", name="Agregar sobre").click()
    pg.wait_for_timeout(700)
    pg.screenshot(path=f"{OUT}/d_modal.png")
    print("d_modal")
    ctx.close()
    b.close()
print("OK")
