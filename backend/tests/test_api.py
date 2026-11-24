import os, json, sqlite3, tempfile, unittest, copy
from pathlib import Path
from unittest.mock import patch
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
import secrets
os.environ['CURSOR_TEST']='1'
from fastapi.testclient import TestClient
from backend.app import create_app, ROOT

class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)/'test.db'
        self.seed=json.loads((ROOT/'backend/seed.json').read_text())
        self.environment=None; self.pg_admin=None; self.schema=None
        if os.getenv('TEST_DATABASE_URL'):
            self.pg_admin=create_engine(os.environ['TEST_DATABASE_URL'])
            self.schema='cursor_test_'+secrets.token_hex(8)
            with self.pg_admin.begin() as con: con.execute(text('CREATE SCHEMA '+self.schema))
            url=make_url(os.environ['TEST_DATABASE_URL']).update_query_dict({'options':'-csearch_path='+self.schema})
            self.environment=patch.dict(os.environ,{'DATABASE_URL':url.render_as_string(hide_password=False),'CURSOR_DB_SCHEMA':self.schema})
            self.environment.start();self.path=None
        self.app=create_app(self.path,self.seed);self.client=TestClient(self.app)
        self.creds={'username':'tester','password':'test-only-long-password'}
    def tearDown(self):
        self.client.close();self.app.state.database.engine.dispose()
        if self.environment: self.environment.stop()
        if self.pg_admin:
            with self.pg_admin.begin() as con: con.execute(text('DROP SCHEMA '+self.schema+' CASCADE'))
            self.pg_admin.dispose()
        self.temp.cleanup()
    def setup(self):
        r=self.client.post('/api/setup',json=self.creds);self.assertEqual(r.status_code,200,r.text)
        return {'X-CSRF-Token':r.json()['csrf']}
    def test_setup_is_once_password_is_hashed_cookie_is_http_only(self):
        self.setup();self.assertEqual(self.client.post('/api/setup',json=self.creds).status_code,409)
        self.assertTrue(self.client.cookies.get('cursor_session'))
        with self.app.state.database.transaction() as con: row=con.execute('SELECT hash,salt FROM users').fetchone()
        self.assertNotEqual(row['hash'],self.creds['password']);self.assertEqual(len(row['salt']),32)
        if self.path: self.assertNotIn(self.creds['password'],self.path.read_bytes().decode(errors='ignore'))
    def test_auth_csrf_and_cross_site_are_enforced(self):
        self.assertEqual(self.client.get('/api/state').status_code,401)
        self.setup();body=self.client.get('/api/state').json()
        self.assertEqual(self.client.put('/api/state',json=body).status_code,403)
        self.assertEqual(self.client.put('/api/state',headers={'Origin':'https://evil.example'},json=body).status_code,403)
        self.assertEqual(self.client.get('/api/state',headers={'Host':'evil.example'}).status_code,421)
    def test_revision_prevents_lost_update_and_data_survives_new_app(self):
        headers=self.setup();body=self.client.get('/api/state').json();body['data']['people'][0]['name']='Изменение из API'
        self.assertEqual(self.client.put('/api/state',headers=headers,json=body).status_code,200)
        self.assertEqual(self.client.put('/api/state',headers=headers,json=body).status_code,409)
        other=TestClient(create_app(self.path,self.seed));other.post('/api/login',json=self.creds)
        self.assertEqual(other.get('/api/state').json()['data']['people'][0]['name'],'Изменение из API');other.close();other.app.state.database.engine.dispose()
    def test_cross_client_relation_rejected_without_partial_save(self):
        headers=self.setup();body=self.client.get('/api/state').json()
        first=body['data']['people'][0];other=next(p for p in body['data']['people'] if p['companyId']!=first['companyId'])
        body['data']['relations'].append({'id':'bad','source':first['id'],'target':other['id'],'kind':'influences'})
        self.assertEqual(self.client.put('/api/state',headers=headers,json=body).status_code,422)
        self.assertEqual(self.client.get('/api/state').json()['revision'],0)
    def test_roles_revocation_and_admin_audit(self):
        headers=self.setup();reader={'username':'reader','password':'reader-only-test-password','role':'reader'}
        self.assertEqual(self.client.post('/api/admin/users',headers=headers,json=reader).status_code,200)
        other=TestClient(self.app);login=other.post('/api/login',json={k:v for k,v in reader.items() if k!='role'})
        self.assertEqual(login.status_code,200);rh={'X-CSRF-Token':login.json()['csrf']}
        self.assertEqual(other.get('/api/state').status_code,200)
        self.assertEqual(other.put('/api/state',headers=rh,json=other.get('/api/state').json()).status_code,403)
        self.assertEqual(other.get('/api/admin/users').status_code,403)
        users=self.client.get('/api/admin/users').json();id=next(u['id'] for u in users if u['username']=='reader')
        self.assertEqual(self.client.delete(f'/api/admin/users/{id}/sessions',headers=headers).status_code,200)
        self.assertEqual(other.get('/api/state').status_code,401)
        self.assertEqual(self.client.delete('/api/admin/users/1/sessions',headers=headers).status_code,422)
        self.assertTrue(self.client.get('/api/admin/audit').json());other.close()
    def test_malformed_types_are_rejected_and_revision_unchanged(self):
        headers=self.setup()
        for field,value in [('role',[]),('knows','bad'),('companyId',{}),('id','bad\"selector')]:
            body=self.client.get('/api/state').json();body['data']['people'][0][field]=value
            self.assertEqual(self.client.put('/api/state',headers=headers,json=body).status_code,422)
        self.assertEqual(self.client.get('/api/state').json()['revision'],0)
    def test_logout_revokes_session(self):
        headers=self.setup();token=self.client.cookies.get('cursor_session')
        self.assertEqual(self.client.post('/api/logout',headers=headers).status_code,200)
        self.client.cookies.set('cursor_session',token)
        self.assertEqual(self.client.get('/api/state').status_code,401)
    def test_private_files_not_served_and_security_headers_present(self):
        for path in ['/.git/config','/.data/cursor.sqlite3','/backend/seed.json','/package.json','/src/../../backend/app.py']:
            self.assertEqual(self.client.get(path).status_code,404,path)
        r=self.client.get('/');self.assertEqual(r.status_code,200)
        self.assertEqual(r.headers['x-content-type-options'],'nosniff');self.assertIn("frame-ancestors 'none'",r.headers['content-security-policy'])
    def test_login_rate_limit_and_wrong_password(self):
        self.setup()
        for i in range(10): self.assertEqual(self.client.post('/api/login',json={**self.creds,'password':'incorrect-test-password'}).status_code,401)
        self.assertEqual(self.client.post('/api/login',json=self.creds).status_code,429)

    def test_relational_roundtrip_with_survey_metadata_and_deals(self):
        from sqlalchemy import select, func
        from backend import schema_v1 as schema
        headers=self.setup();body=self.client.get('/api/state').json()
        self.assertEqual(body['data'],self.seed)
        p=body['data']['people'][0]
        p['observations']=[{'field':'attitude','value':'positive','author':'Тест','basis':'Встреча'}]
        p['fieldMeta']={'attitude':{'author':'Тест','touchId':'t1'}}
        body['data']['deals']=[{'id':'deal1','companyId':p['companyId'],'name':'Поставка','participantIds':[p['id']]}]
        self.assertEqual(self.client.put('/api/state',headers=headers,json=body).status_code,200)
        self.assertEqual(self.client.get('/api/state').json()['data'],body['data'])
        with self.app.state.database.transaction() as con:
            self.assertEqual(con.raw.scalar(select(func.count()).select_from(schema.people)),len(self.seed['people']))
            self.assertEqual(con.raw.scalar(select(func.count()).select_from(schema.deal_people)),1)
            self.assertNotIn('data',schema.workspace.c)
    def test_database_rejects_cross_company_without_api(self):
        from backend import schema_v1 as schema
        from sqlalchemy.exc import IntegrityError
        first=self.seed['people'][0];other=next(p for p in self.seed['people'] if p['companyId']!=first['companyId'])
        with self.assertRaises(IntegrityError):
            with self.app.state.database.transaction() as con:
                con.raw.execute(schema.relations.insert().values(id='invalid',company_id=first['companyId'],source=first['id'],target=other['id'],kind='influences',ordinal=99,payload={}))
    def test_failed_storage_rolls_back_rows_revision_and_audit(self):
        from backend.database import write_state
        headers=self.setup();body=self.client.get('/api/state').json()
        def failure(con,data):
            write_state(con,data)
            raise RuntimeError('simulated disk failure')
        with patch('backend.app.write_state',side_effect=failure):
            with self.assertRaises(RuntimeError): self.client.put('/api/state',headers=headers,json=body)
        self.assertEqual(self.client.get('/api/state').json(),body)
        self.assertEqual(self.client.get('/api/admin/audit').json(),[])
    def test_malformed_relation_endpoints_do_not_crash(self):
        headers=self.setup()
        for bad in ({},[],True):
            body=self.client.get('/api/state').json();body['data']['relations'][0]['source']=bad
            self.assertEqual(self.client.put('/api/state',headers=headers,json=body).status_code,422)
    def test_password_change_revokes_other_sessions(self):
        headers=self.setup()
        other=TestClient(self.app);other.post('/api/login',json=self.creds)
        payload={'current_password':self.creds['password'],'password':'changed-test-password-123'}
        self.assertEqual(self.client.post('/api/account/password',json=payload).status_code,403)
        self.assertEqual(self.client.post('/api/account/password',headers=headers,json={**payload,'current_password':'incorrect-long-password'}).status_code,401)
        result=self.client.post('/api/account/password',headers=headers,json=payload)
        self.assertEqual(result.status_code,200);self.assertNotEqual(result.json()['csrf'],headers['X-CSRF-Token'])
        self.assertEqual(self.client.get('/api/state').status_code,200)
        self.assertEqual(other.get('/api/state').status_code,401)
        self.assertEqual(other.post('/api/login',json=self.creds).status_code,401)
        self.assertEqual(other.post('/api/login',json={**self.creds,'password':payload['password']}).status_code,200)
        other.close()
    def test_two_simultaneous_saves_have_one_winner(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        self.setup();body=self.client.get('/api/state').json();barrier=Barrier(2)
        clients=[TestClient(self.app),TestClient(self.app)]
        headers=[{'X-CSRF-Token':c.post('/api/login',json=self.creds).json()['csrf']} for c in clients]
        def save(i):
            payload=copy.deepcopy(body);payload['data']['people'][0]['name']='Concurrent '+str(i)
            barrier.wait(timeout=5)
            return clients[i].put('/api/state',headers=headers[i],json=payload).status_code
        with ThreadPoolExecutor(max_workers=2) as executor: results=list(executor.map(save,[0,1]))
        self.assertEqual(sorted(results),[200,409])
        self.assertEqual(self.client.get('/api/state').json()['revision'],1)
        for c in clients: c.close()
    def test_backup_restore_and_refuses_overwrite(self):
        from backend.database import Database,read_state
        from backend.manage import backup,restore
        self.setup();file=Path(self.temp.name)/'backup.json'
        backup(self.app.state.database,file)
        self.assertEqual(file.stat().st_mode & 0o777,0o600)
        with self.assertRaises(FileExistsError): backup(self.app.state.database,file)
        target=Database(Path(self.temp.name)/'restored.db')
        restore(target,file)
        with target.transaction() as con:
            self.assertEqual(read_state(con)['data'],self.seed)
            self.assertIsNotNone(con.execute('SELECT id FROM users').fetchone())
            self.assertIsNone(con.execute('SELECT token FROM sessions').fetchone())
        with self.assertRaises(ValueError): restore(target,file)
        target.engine.dispose()
    def test_production_secure_cookie_and_web_setup_disabled(self):
        if self.app.state.database.kind!='postgresql': self.skipTest('Requires PostgreSQL')
        self.setup()
        with patch.dict(os.environ,{'CURSOR_ENV':'production','CURSOR_ALLOWED_HOSTS':'cursor.example','CURSOR_PUBLIC_ORIGIN':'https://cursor.example'}):
            app=create_app(None,self.seed)
            with TestClient(app,base_url='https://cursor.example') as client:
                self.assertFalse(client.get('/api/health').json()['setup'])
                self.assertEqual(client.post('/api/setup',json=self.creds).status_code,403)
                login=client.post('/api/login',headers={'Origin':'https://cursor.example'},json=self.creds)
                self.assertEqual(login.status_code,200)
                self.assertIn('Secure',login.headers['set-cookie']);self.assertIn('HttpOnly',login.headers['set-cookie'])
                self.assertEqual(client.get('/api/state').status_code,200)
                self.assertEqual(client.get('/api/state',headers={'Host':'evil.example'}).status_code,421)
            app.state.database.engine.dispose()

    def test_private_schema_has_rls_and_no_anonymous_access(self):
        if self.app.state.database.kind!='postgresql': self.skipTest('Requires PostgreSQL')
        from backend import schema_v1 as schema
        with self.app.state.database.transaction() as con:
            current=con.raw.scalar(text('SELECT current_schema()'))
            self.assertNotIn(current,{'public','auth','storage'})
            flags=con.raw.execute(text('SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relkind=\'r\'')).scalars().all()
            self.assertEqual(len(flags),len(schema.metadata.tables)+1);self.assertTrue(all(flags))
            for role in ('anon','authenticated'):
                if con.raw.scalar(text('SELECT 1 FROM pg_roles WHERE rolname=:role'),{'role':role}):
                    self.assertFalse(con.raw.scalar(text('SELECT has_schema_privilege(:role,current_schema(),\'USAGE\')'),{'role':role}))
                    self.assertFalse(con.raw.scalar(text('SELECT has_table_privilege(:role,\'users\',\'SELECT\')'),{'role':role}))
    def test_restore_into_postgresql_preserves_identity_sequences(self):
        if self.app.state.database.kind!='postgresql': self.skipTest('Requires PostgreSQL')
        from backend.database import Database,read_state
        from backend.manage import backup,restore
        self.setup();file=Path(self.temp.name)/'postgres-backup.json'
        backup(self.app.state.database,file)
        target_schema=self.schema+'_restore'
        try:
            with patch.dict(os.environ,{'CURSOR_DB_SCHEMA':target_schema}):
                target=Database()
                try:
                    restore(target,file)
                    with target.transaction() as con:
                        self.assertEqual(read_state(con)['data'],self.seed)
                        con.execute("INSERT INTO users(username,hash,salt,role) VALUES(?,?,?,?)",('second','testhash','00'*16,'reader'))
                        self.assertEqual(con.execute('SELECT id FROM users WHERE username=?',('second',)).fetchone()['id'],2)
                finally: target.engine.dispose()
        finally:
            with self.pg_admin.begin() as con: con.execute(text('DROP SCHEMA IF EXISTS '+target_schema+' CASCADE'))
    def test_reader_can_change_own_password_without_receiving_write_access(self):
        headers=self.setup()
        self.client.post('/api/admin/users',headers=headers,json={'username':'reader','password':'reader-test-password-123','role':'reader'})
        other=TestClient(self.app)
        login=other.post('/api/login',json={'username':'reader','password':'reader-test-password-123'}).json()
        result=other.post('/api/account/password',headers={'X-CSRF-Token':login['csrf']},json={'current_password':'reader-test-password-123','password':'new-reader-test-password-123'})
        self.assertEqual(result.status_code,200)
        self.assertEqual(other.put('/api/state',headers={'X-CSRF-Token':result.json()['csrf']},json=other.get('/api/state').json()).status_code,403)
        other.close()
    def test_production_refuses_sqlite(self):
        with patch.dict(os.environ,{'CURSOR_ENV':'production','DATABASE_URL':'sqlite:////tmp/not-a-production-database.db'}):
            with self.assertRaisesRegex(RuntimeError,'Production requires PostgreSQL'): create_app(self.path,self.seed)

if __name__=='__main__':unittest.main()
