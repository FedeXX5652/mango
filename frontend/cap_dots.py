from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    page = ctx.new_page()
    page.goto("http://localhost:5173", wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    # tipear 2 digitos -> 2 puntos centrados
    for d in "12":
        page.get_by_role("button", name=d, exact=True).click()
    page.wait_for_timeout(400)
    page.screenshot(path="C:/tmp/mango-shots2/lock_2dots.png")
    # tipear 2 mas -> 4 puntos
    for d in "34":
        page.get_by_role("button", name=d, exact=True).click()
    page.wait_for_timeout(400)
    page.screenshot(path="C:/tmp/mango-shots2/lock_4dots.png")
    ctx.close()
    b.close()
print("OK")
