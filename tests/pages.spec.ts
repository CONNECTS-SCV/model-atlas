import {test,expect} from '@playwright/test';
const url=process.env.STATIC_BASE_URL||'http://127.0.0.1:4173/model-atlas/';
test('Pages serves catalog, search, detail, comparison and persisted favorites without API server',async({page})=>{
 const errors:string[]=[];const apiCalls:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))apiCalls.push(r.url());});
 await page.goto(url);await expect(page.locator('.model-link')).toHaveCount(30);await expect(page.locator('.compact-stats')).toContainText('모델');
 await page.getByRole('textbox',{name:'모델 검색'}).fill('Germinal');await expect(page.locator('.model-link')).toHaveCount(2);
 await page.locator('.model-link').filter({hasText:'OpenGerminal'}).click();await expect(page.getByRole('dialog')).toContainText('원문 출처');await page.getByRole('button',{name:'상세 닫기'}).click();
 for(let i=0;i<2;i++)await page.locator('input[aria-label$="비교 선택"]').nth(i).check();await page.locator('.compare-tray').getByRole('button',{name:'모델 비교'}).click();await expect(page.locator('.compare-name')).toHaveCount(2);
 await page.getByRole('button',{name:'모델 탐색으로'}).click();await page.locator('.star-button').first().click();await page.reload();await page.getByRole('textbox',{name:'모델 검색'}).fill('Germinal');await expect(page.locator('.starred')).toHaveCount(1);
 expect(errors).toEqual([]);expect(apiCalls).toEqual([]);expect(page.url()).toBe(url);
});
test('Pages retains archive policy and source panels; manual collection opens GitHub Actions',async({page,context})=>{
 await page.goto(url);await page.getByRole('textbox',{name:'모델 검색'}).fill('DNABERT');await expect(page.locator('.model-link')).toHaveCount(2);await page.getByLabel('모델 보관 상태').selectOption('archived');await expect(page.locator('.model-link')).toHaveCount(1);
 await page.getByRole('button',{name:'수집원 살펴보기',exact:true}).click();await expect(page.locator('#heading-info .heading-source')).toHaveCount(5);await page.getByRole('button',{name:'안내 접기'}).click();
 await context.route('https://github.com/**',route=>route.fulfill({body:'GitHub Actions',contentType:'text/html'}));const popup=page.waitForEvent('popup');await page.getByRole('button',{name:'최신 리포 업데이트'}).click();const actions=await popup;await actions.waitForLoadState();expect(actions.url()).toContain('/CONNECTS-SCV/model-atlas/actions/workflows/pages.yml');await actions.close();
 await page.locator('nav').getByRole('button',{name:'수집 관리'}).click();await expect(page.locator('.admin-panel')).toHaveCount(0);await expect(page.locator('.pages-admin')).toContainText('GitHub');
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.sidebar')!.getBoundingClientRect().right<=1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
