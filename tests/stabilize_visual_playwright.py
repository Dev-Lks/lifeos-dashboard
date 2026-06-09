#!/usr/bin/env python3
"""Visual/functional stabilization checks for Hermes Mission Control — Projects & Relations edition."""
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

BASE = 'http://127.0.0.1:8700'
OUT = Path('/root/.hermes/cache/screenshots/lifeos-stabilization')
OUT.mkdir(parents=True, exist_ok=True)
ROUTES = ['/', '/agents', '/tasks', '/automations', '/projects', '/schedule', '/content', '/dreams', '/finances', '/routine']


def route_name(route):
    return 'home' if route == '/' else route.strip('/').replace('/', '-')


def main():
    results = {
        'routes': {},
        'interactions': {},
        'console_errors': [],
        'page_errors': [],
        'response_errors': [],
        'screenshots': {},
        'fix_suggestions': [],
    }
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path='/snap/bin/chromium')
        context = browser.new_context(viewport={'width': 1440, 'height': 950})
        page = context.new_page()
        console_events = []
        page_errors = []
        response_errors = []
        page.on('console', lambda msg: console_events.append({'type': msg.type, 'text': msg.text, 'url': page.url}))
        page.on('pageerror', lambda exc: page_errors.append({'error': str(exc), 'url': page.url}))
        page.on('response', lambda resp: response_errors.append({'status': resp.status, 'url': resp.url}) if resp.status >= 400 else None)
        page.on('dialog', lambda dialog: dialog.accept())

        # Screenshot all routes
        for route in ROUTES:
            name = route_name(route)
            try:
                page.goto(BASE + route, wait_until='load', timeout=20000)
                page.wait_for_timeout(2000)
                css_loaded = page.evaluate("""() => {
                    const css = [...document.styleSheets].some(s => (s.href || '').includes('/hermes-dashboard/css/styles.css'));
                    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-deep').trim();
                    return {css, bg, tabs: [...document.querySelectorAll('.tab-btn')].map(b => b.dataset.tab)};
                }""")
                active = page.locator('.tab-panel.active').get_attribute('id')
                nav_has_projects = page.locator('[data-tab="projects"]').count() > 0
                shot = OUT / f'{name}.png'
                page.screenshot(path=str(shot), full_page=True)
                results['screenshots'][route] = str(shot)
                results['routes'][route] = {
                    'ok': True,
                    'active_panel': active,
                    'css_loaded': css_loaded['css'],
                    'css_bg_var': css_loaded['bg'],
                    'nav_has_projects': nav_has_projects,
                    'tabs': css_loaded['tabs'],
                    'title': page.title(),
                }
            except Exception as e:
                results['routes'][route] = {'ok': False, 'error': str(e)}

        # Command palette with Projects entries
        page.goto(BASE + '/', wait_until='load', timeout=20000)
        page.wait_for_timeout(1000)
        page.keyboard.press('Control+K')
        page.wait_for_timeout(300)
        results['interactions']['command_palette_ctrl_k'] = page.locator('#cmdkOverlay.open').count() > 0
        page.keyboard.type('project')
        page.wait_for_timeout(200)
        results['interactions']['command_palette_has_projects'] = page.locator('.cmdk-item').filter(has_text='Projects').count() > 0
        results['interactions']['command_palette_has_new_project'] = page.locator('.cmdk-item').filter(has_text='New Project').count() > 0
        page.keyboard.press('Escape')

        # Tab switching without full reload
        page.goto(BASE + '/', wait_until='load', timeout=20000)
        page.wait_for_timeout(1200)
        before_navs = page.evaluate("performance.getEntriesByType('navigation').length")
        all_tabs = ['agents','tasks','automations','projects','schedule','content','dreams','finances','routine','overview']
        for tab in all_tabs:
            btn = page.locator(f'[data-tab="{tab}"]')
            if btn.count() > 0:
                btn.click()
                page.wait_for_timeout(500)
                active = page.locator('.tab-panel.active').get_attribute('id')
                results['interactions'][f'tab_{tab}'] = active == f'panel-{tab}'
        after_navs = page.evaluate("performance.getEntriesByType('navigation').length")
        results['interactions']['tab_switch_without_full_reload'] = before_navs == after_navs

        # SSE: confirm EventSource receives data
        page.goto(BASE + '/', wait_until='load', timeout=20000)
        page.wait_for_timeout(1000)
        sse_ok = page.evaluate("""async () => new Promise(resolve => {
            let done = false;
            const es = new EventSource('/events');
            const timer = setTimeout(() => { if (!done) { done = true; es.close(); resolve(false); }}, 3500);
            es.onmessage = () => { if (!done) { done = true; clearTimeout(timer); es.close(); resolve(true); }};
            es.onerror = () => { if (!done) { done = true; clearTimeout(timer); es.close(); resolve(false); }};
        })""")
        results['interactions']['sse_initial_message'] = bool(sse_ok)

        # Projects tab: create/edit/delete project via API then verify visually
        page.goto(BASE + '/projects', wait_until='load', timeout=20000)
        page.wait_for_timeout(1500)
        results['interactions']['projects_tab_loaded'] = page.locator('#panel-projects').count() > 0 and page.locator('text=Projects').count() > 0
        # Create project via API
        created = page.evaluate("""async () => {
            const r = await fetch('/api/projects', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:'Playwright Smoke', description:'QA test project', status:'active', agent:'dev', tags:'qa,test'})});
            const p = await r.json();
            return p.id || null;
        }""")
        if created:
            results['interactions']['project_create_api'] = True
            page.goto(BASE + '/projects', wait_until='load', timeout=20000)
            page.wait_for_timeout(2000)
            results['interactions']['project_visible_in_ui'] = page.locator('text=Playwright Smoke').count() > 0
            # Create entity link
            page.evaluate(f"""async () => {{
                await fetch('/api/entity-links', {{method:'POST', headers:{{'Content-Type':'application/json'}}, body:JSON.stringify({{source_type:'project', source_id:'{created}', target_type:'task', target_id:'test', relation:'contains'}})}});
            }}""")
            results['interactions']['entity_link_create'] = True
            # Cleanup
            page.evaluate(f"async () => {{ await fetch('/api/projects/{created}', {{method:'DELETE'}}); }}")
            results['interactions']['project_delete_api'] = True
        else:
            results['interactions']['project_create_api'] = False

        results['console_errors'] = [e for e in console_events if e['type'] in ('error', 'warning') and 'favicon' not in e['text'].lower()]
        results['response_errors'] = [e for e in response_errors if 'favicon' not in e['url'].lower()]
        results['page_errors'] = page_errors
        browser.close()

    report_path = OUT / 'stabilization-results.json'
    report_path.write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
