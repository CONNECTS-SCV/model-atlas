import {test,expect} from '@playwright/test';
test('real catalog search, detail, comparison, favorites and saved views',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.locator('.model-link').first()).toBeVisible();
 await page.getByRole('textbox',{name:'모델 검색'}).fill('Germinal');
 await expect(page.locator('.model-link')).toHaveCount(2);
 await page.locator('.model-link').filter({hasText:'OpenGerminal'}).click();
 await expect(page.getByRole('dialog')).toBeVisible();await expect(page.locator('.detail-heading h2')).toHaveText('OpenGerminal');
 await expect(page.locator('.provenance').first()).toBeVisible();
 await page.getByRole('button',{name:'상세 닫기'}).click();
 await page.locator('input[aria-label$="비교 선택"]').first().check();await page.locator('input[aria-label$="비교 선택"]').nth(1).check();
 await page.locator('.compare-tray').getByRole('button',{name:'모델 비교'}).click();
 await expect(page.locator('.compare-name')).toHaveCount(2);await expect(page.locator('.compare-table')).toContainText('가중치 라이선스');
 await page.getByRole('button',{name:'모델 탐색으로'}).click();
 await page.locator('.star-button').first().click();await page.locator('nav').getByRole('button',{name:/즐겨찾기/}).click();await expect(page.locator('.model-link')).toHaveCount(1);
 await page.reload();await page.getByRole('textbox',{name:'모델 검색'}).fill('Germinal');await expect(page.locator('.starred')).toHaveCount(1);
 await page.locator('.toolbar').getByTitle('현재 필터 저장').click();await expect(page.locator('.saved-views')).toContainText('저장된 탐색 1');
 await page.locator('.toolbar').getByTitle('열 표시 설정').click();await page.getByLabel('한 줄 설명',{exact:true}).uncheck();await page.keyboard.press('Escape');await expect(page.locator('th').filter({hasText:'한 줄 설명'})).toHaveCount(0);
 expect(errors).toEqual([]);
});
test('multiple filters, pagination and 5-model comparison cap',async({page})=>{
 await page.goto('/');await expect(page.locator('.model-link').first()).toBeVisible();
 await page.getByRole('button',{name:'대상',exact:true}).click();await page.locator('.popover').getByText('DNA',{exact:true}).click();await page.locator('.popover').getByText('RNA',{exact:true}).click();await page.keyboard.press('Escape');
 await expect(page.locator('.active-filters')).toContainText('DNA');await expect(page.locator('.active-filters')).toContainText('RNA');
 await page.getByRole('button',{name:'모두 초기화'}).click();await expect(page.locator('.model-link')).toHaveCount(30);
 await page.getByRole('button',{name:'다음 페이지',exact:true}).click();await expect(page.locator('.pagination')).toContainText('31–60');
 for(let i=0;i<6;i++)await page.locator('input[aria-label$="비교 선택"]').nth(i).click();
 await expect(page.locator('input[aria-label$="비교 선택"]:checked')).toHaveCount(5);await expect(page.locator('.toast')).toContainText('최대 5개');
});
test('admin isolation, real source status, queue deduplication',async({page,request})=>{
 expect((await request.post('/api/admin',{data:{action:'sync',sourceId:'protein'}})).status()).toBe(401);
 await page.goto('/');await page.locator('nav').getByRole('button',{name:'수집 관리'}).click();await expect(page.locator('.source-card')).toHaveCount(5);
 await expect(page.locator('.source-card').first()).toContainText('적용 commit');
 if(process.env.ADMIN_TOKEN){await page.getByRole('textbox',{name:'관리자 토큰'}).fill(process.env.ADMIN_TOKEN);await page.getByRole('button',{name:'관리자 연결'}).click();await expect(page.locator('.admin-panel')).toContainText('인증됨');const headers={Authorization:`Bearer ${process.env.ADMIN_TOKEN}`};const a=await request.post('/api/admin',{headers,data:{action:'sync',sourceId:'nucleotide'}});const b=await request.post('/api/admin',{headers,data:{action:'sync',sourceId:'nucleotide'}});expect(a.status()).toBe(202);expect((await a.json()).job.id).toBe((await b.json()).job.id);}
});
test('mobile navigation and page do not overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.locator('.model-link').first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.getByRole('button',{name:'메뉴 열기'}).click();await page.locator('nav').getByRole('button',{name:'업데이트 피드'}).click();await expect(page.locator('h1')).toContainText('업데이트 피드');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'.research/atlas-mobile.png',fullPage:false});
});

test('superseded models are archived and reachable from successor notes',async({page,request})=>{
 const active=await (await request.get('/api/catalog?q=DNABERT&kind=model')).json();expect(active.rows.some((r:any)=>r.name==='DNABERT')).toBe(false);
 await page.goto('/');await page.getByRole('textbox',{name:'모델 검색'}).fill('DNABERT-2');await expect(page.locator('.model-link')).toHaveCount(1);await page.locator('.model-link').click();
 await expect(page.getByRole('dialog')).toContainText('이전 모델과 변경 메모');await expect(page.getByRole('dialog')).toContainText('토크나이저');
 await page.locator('.provenance .related-model').filter({hasText:'DNABERT'}).click();await expect(page.locator('.detail-heading h2')).toHaveText('DNABERT');await expect(page.getByRole('dialog')).toContainText('이전 항목으로 보관됨');
 await page.getByRole('button',{name:'상세 닫기'}).click();await page.getByRole('textbox',{name:'모델 검색'}).fill('DNABERT');await page.getByLabel('모델 보관 상태').selectOption('archived');await expect(page.locator('.model-link')).toHaveCount(1);
 await page.locator('nav').getByRole('button',{name:'수집 관리'}).click();await expect(page.locator('.management-note')).toContainText('Mac');
});

test('update button queues all repositories, reuses a pending refresh, and reports completion',async({page,request})=>{
 test.setTimeout(90000);
 await page.goto('/');await expect(page.locator('.model-link').first()).toBeVisible();
 await expect(page.locator('.stat-strip')).toHaveCount(0);await expect(page.locator('.topbar .compact-stats')).toContainText('모델');
 const reply=page.waitForResponse(r=>r.url().endsWith('/api/update')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'최신 리포 업데이트'}).click();const response=await reply;expect(response.ok()).toBe(true);const {update}=await response.json();expect(update.total).toBe(5);
 const duplicate=await request.post('/api/update');expect((await duplicate.json()).update.id).toBe(update.id);
 await expect.poll(async()=>{const r=await request.get('/api/update?id='+update.id);return (await r.json()).update.status;},{timeout:75000,intervals:[2000]}).not.toBe('running');
 await expect(page.locator('.update-status')).toContainText('점검 완료',{timeout:10000});await expect(page.getByRole('button',{name:'최신 리포 업데이트'})).toBeEnabled();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.waitForFunction(()=>document.querySelector('.sidebar')!.getBoundingClientRect().right<=1);await page.screenshot({path:'.research/atlas-refresh-mobile.png'});
});
