import {test,expect} from '@playwright/test';
import {scenarios} from './scenarios.mjs';
for(const [name,scenario] of Object.entries(scenarios)) {
 test(name,async({page})=>{
   await page.goto('/');
   await scenario(page,{observe:async()=>{},reload:()=>page.reload(),key:key=>page.keyboard.press(key)});
 });
}
test('Телефон и уменьшение движения',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Карта клиента'})).toBeVisible();
 await expect(page.locator('#boot-loader')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(await page.locator('.topbar .cursor-eye').first().evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
});
