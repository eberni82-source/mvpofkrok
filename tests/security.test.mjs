import test from 'node:test';
import assert from 'node:assert/strict';
import {publicPath,CSP} from '../scripts/dev-server.mjs';
import {csvCell,contactsCsv} from '../src/export.js';
test('Сервер не публикует Git, env, зависимости, тесты и произвольные файлы',()=>{
 for(const path of ['/.git/config','/.env','/package.json','/docs/04.md','/node_modules/a.js','/tests/model.test.mjs','/src/.secret.js','/src/%2e%2e%2f.env','/src/a%5cb.js'])assert.equal(publicPath(path),null,path);
 assert.equal(publicPath('/'),'index.html');assert.equal(publicPath('/src/main.js'),'src/main.js');
});
test('Политика не разрешает внешние скрипты, eval, фреймы и плагины',()=>{
 assert.match(CSP,/script-src 'self'/);assert.doesNotMatch(CSP,/unsafe-eval/);assert.match(CSP,/frame-ancestors 'none'/);assert.match(CSP,/object-src 'none'/);
});
test('CSV нейтрализует формулы и экранирует разделители и кавычки',()=>{
 for(const s of ['=HYPERLINK("x")','  +SUM(1)','\t@cmd','-2','\n=1'])assert.ok(csvCell(s).startsWith('"\''));
 assert.equal(csvCell('Иван; "ИТ"'),'"Иван; ""ИТ"""');
 assert.ok(contactsCsv([],{ }).startsWith('\uFEFF'));
});
