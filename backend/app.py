"""Cursor: single-team server. Database and sessions never served as assets."""
import hashlib, hmac, json, os, secrets, time, re, math
from datetime import date
from urllib.parse import urlparse
from threading import Lock
from pathlib import Path
from sqlalchemy.exc import IntegrityError, DBAPIError
from backend.database import Database, read_state, write_state
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field, ConfigDict

ROOT = Path(__file__).resolve().parent.parent
CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
class Credentials(BaseModel):
    model_config = ConfigDict(extra='forbid')
    username: str = Field(min_length=3, max_length=80, pattern=r'^[a-zA-Z0-9_.@-]+$')
    password: str = Field(min_length=12, max_length=128)
class NewUser(Credentials):
    role: str = Field(pattern=r'^(reader|editor|admin)$')
class PasswordChange(BaseModel):
    model_config = ConfigDict(extra='forbid')
    current_password: str = Field(min_length=12,max_length=128)
    password: str = Field(min_length=12,max_length=128)
class State(BaseModel):
    model_config = ConfigDict(extra='forbid')
    revision: int = Field(ge=0)
    data: dict

def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
def digest(value): return hashlib.sha256(value.encode()).hexdigest()

def validate_state(data):
    required={'companies','people','relations','interactions','committee'}
    if not required <= data.keys() or set(data)-required-{'deals'}: raise HTTPException(422,'Неверная структура карты')
    for key, rows in data.items():
        if not isinstance(rows,list) or len(rows)>10000 or any(not isinstance(r,dict) for r in rows): raise HTTPException(422,'Неверный список записей')
    def identifier(value): return isinstance(value,str) and re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',value)
    def text(value): return isinstance(value,str) and len(value)<=20000
    def strings(value): return isinstance(value,list) and len(value)<=500 and all(text(v) for v in value)
    for key in ('companies','people','relations','interactions','deals'):
        ids=[]
        for row in data.get(key,[]):
            if not identifier(row.get('id')): raise HTTPException(422,'Некорректный ID')
            ids.append(row['id'])
        if len(set(ids))!=len(ids): raise HTTPException(422,'Повторяющиеся ID')
    for c in data['companies']:
        if not text(c.get('name')) or not text(c.get('topic','')): raise HTTPException(422,'Некорректная компания')
    for p in data['people']:
        for key in ('name','position','department','style','note','source','nextStep'):
            if not text(p.get(key,'')): raise HTTPException(422,'Некорректное текстовое поле')
        if not strings(p.get('knows',[])) or not strings(p.get('topics',[])): raise HTTPException(422,'Некорректный список контактов или тем')
        if not all(isinstance(p.get(k),str) for k in ('role','influence','attitude')) or p.get('role') not in {'ЛПР','Технический','Пользователь','Коуч','Неизвестна'} or p.get('influence') not in {'high','medium','low','unknown'} or p.get('attitude') not in {'positive','neutral','skeptical','unknown'}: raise HTTPException(422,'Некорректная оценка')
        for key in ('x','y'):
            if key in p and (not isinstance(p[key],(float,int)) or not math.isfinite(p[key]) or abs(p[key])>100000): raise HTTPException(422,'Некорректная позиция')
        observations=p.get('observations',[])
        if not isinstance(observations,list) or len(observations)>2000: raise HTTPException(422,'Некорректная история оценок')
        for o in observations:
            if not isinstance(o,dict) or not text(o.get('field')) or not (text(o.get('value')) or strings(o.get('value'))): raise HTTPException(422,'Некорректная оценка в истории')
    for t in data['interactions']:
        for key in ('date','type','summary','author','createdAt'):
            if not text(t.get(key,'')): raise HTTPException(422,'Некорректная встреча')
        try: date.fromisoformat(t.get('date',''))
        except ValueError: raise HTTPException(422,'Некорректная дата встречи')
        if not isinstance(t.get('participantIds',[]),list): raise HTTPException(422,'Некорректные участники')
    for d in data.get('deals',[]):
        if not text(d.get('name')) or not isinstance(d.get('participantIds'),list): raise HTTPException(422,'Некорректная закупка')
    companies={c.get('id') for c in data['companies']}
    people={p.get('id'):p for p in data['people']}
    if None in companies or len(companies)!=len(data['companies']) or None in people or len(people)!=len(data['people']): raise HTTPException(422,'Повторяющиеся или пустые ID')
    for p in people.values():
        if not identifier(p.get('companyId')) or p.get('companyId') not in companies or not isinstance(p.get('name'),str) or not p['name'].strip(): raise HTTPException(422,'Некорректный контакт')
    def contact(id,company): return bool(identifier(id)) and isinstance(company,str) and id in people and people[id]['companyId']==company
    relation_ids=set(); pairs=set()
    for r in data['relations']:
        a,b=r.get('source'),r.get('target')
        if not identifier(a) or not identifier(b): raise HTTPException(422,'Некорректная связь')
        company=r.get('companyId') or people.get(a,{}).get('companyId'); pair=(a,b,r.get('kind'))
        if not identifier(a) or not identifier(b) or not contact(a,company) or not contact(b,company) or a==b or not isinstance(r.get('kind'),str) or r.get('kind') not in {'reports_to','influences','works_with'} or pair in pairs or not r.get('id') or r['id'] in relation_ids: raise HTTPException(422,'Некорректная связь')
        pairs.add(pair); relation_ids.add(r['id'])
    for t in data['interactions']:
        c=t.get('companyId')
        if not isinstance(c,str) or c not in companies or not contact(t.get('personId'),c) or any(not contact(id,c) for id in t.get('participantIds',[])): raise HTTPException(422,'Некорректные участники встречи')
    for r in data['committee']:
        if not isinstance(r.get('companyId'),str) or r.get('companyId') not in companies or (r.get('personId') and not contact(r['personId'],r['companyId'])): raise HTTPException(422,'Некорректный комитет')
    for d in data.get('deals',[]):
        if not isinstance(d.get('companyId'),str) or d.get('companyId') not in companies or any(not contact(id,d['companyId']) for id in d.get('participantIds',[])): raise HTTPException(422,'Некорректная закупка')
    if len(json.dumps(data))>2_000_000: raise HTTPException(413,'Карта слишком большая')

def create_app(db_path=None, seed=None):
    app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None)
    production=os.getenv('CURSOR_ENV')=='production'
    if production and not os.getenv('DATABASE_URL','').startswith(('postgres://','postgresql://','postgresql+psycopg://')):
        raise RuntimeError('Production requires PostgreSQL DATABASE_URL')
    database=Database(db_path)
    app.state.database=database
    db=database.transaction
    production=os.getenv('CURSOR_ENV')=='production'
    if production and database.kind!='postgresql':
        raise RuntimeError('Production requires PostgreSQL DATABASE_URL')
    allowed_hosts={h.strip().lower() for h in os.getenv('CURSOR_ALLOWED_HOSTS','localhost,127.0.0.1,testserver').split(',') if h.strip()}
    if production and (not os.getenv('CURSOR_ALLOWED_HOSTS') or '*' in allowed_hosts):
        raise RuntimeError('Set CURSOR_ALLOWED_HOSTS to the public hostname')
    if production:
        public=urlparse(os.getenv('CURSOR_PUBLIC_ORIGIN',''))
        if public.scheme!='https' or public.hostname not in allowed_hosts or public.path not in {'','/'}:
            raise RuntimeError('Set CURSOR_PUBLIC_ORIGIN to the HTTPS application origin')
    with db() as con:
        con.execute('BEGIN IMMEDIATE')
        if not con.execute('SELECT id FROM workspace').fetchone():
            initial=seed if seed is not None else json.loads((ROOT/'backend/seed.json').read_text())
            validate_state(initial)
            con.execute('INSERT INTO workspace(id,revision,has_deals) VALUES(1,0,0)')
            write_state(con,initial)
    # In hosting, bootstrap is through the private CLI, never first-visitor signup.
    @app.exception_handler(DBAPIError)
    async def database_error(req,exc):
        if getattr(exc.orig,'sqlstate',None) in {'40001','40P01'}:
            return JSONResponse({'detail':'Карта обновляется другим сотрудником. Перезагрузите страницу; скачайте несохранённые правки перед этим.'},409)
        # No SQL text, credentials or connection URL in client-facing errors.
        return JSONResponse({'detail':'База временно недоступна. Повторите запрос позже.'},503)
    failures={}
    failure_lock=Lock()
    @app.middleware('http')
    async def guard(req,call_next):
        host=req.url.hostname or ''
        if host.lower() not in allowed_hosts: return JSONResponse({'detail':'Неверный Host'},421)
        if req.method not in {'GET','HEAD'}:
            origin=req.headers.get('origin')
            expected_origin=os.getenv('CURSOR_PUBLIC_ORIGIN',str(req.base_url).rstrip('/'))
            if origin and origin!=expected_origin: return JSONResponse({'detail':'Неверный Origin'},403)
            if req.headers.get('sec-fetch-site')=='cross-site': return JSONResponse({'detail':'Запрос с другого сайта'},403)
            body=bytearray()
            async for chunk in req.stream():
                body.extend(chunk)
                if len(body)>2_000_000: return JSONResponse({'detail':'Запрос слишком большой'},413)
            req._body=bytes(body)
        response=await call_next(req)
        if production: response.headers['Strict-Transport-Security']='max-age=31536000'
        for k,v in {'Content-Security-Policy':CSP,'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Cache-Control':'no-store'}.items(): response.headers[k]=v
        return response
    def auth(req,write=False,admin=False):
        token=req.cookies.get('cursor_session','')
        with db() as con:
            user=con.execute('SELECT u.*,s.csrf FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND u.active=1',(digest(token),time.time())).fetchone()
        if not user: raise HTTPException(401,'Войдите в Cursor')
        if write and not hmac.compare_digest(req.headers.get('x-csrf-token',''),user['csrf']): raise HTTPException(403,'Обновите страницу')
        if admin and user['role']!='admin': raise HTTPException(403,'Нужен администратор')
        if write and user['role']=='reader': raise HTTPException(403,'Доступ только для чтения')
        return user
    def login_response(user):
        token=secrets.token_urlsafe(32);csrf=secrets.token_urlsafe(32)
        with db() as con:
            con.execute('DELETE FROM sessions WHERE expires<?',(time.time(),))
            con.execute('INSERT INTO sessions(token,user_id,csrf,expires) VALUES(?,?,?,?)',(digest(token),user['id'],csrf,time.time()+8*3600))
        response=JSONResponse({'username':user['username'],'role':user['role'],'csrf':csrf})
        response.set_cookie('cursor_session',token,httponly=True,samesite='strict',secure=production or os.getenv('CURSOR_SECURE_COOKIE')=='1',max_age=8*3600,path='/')
        return response
    @app.get('/api/health')
    def health():
        with db() as con: setup=not con.execute('SELECT id FROM users LIMIT 1').fetchone()
        return {'backend':'fastapi','database':database.kind,'setup':setup and not production}
    @app.post('/api/setup')
    def setup(body:Credentials,req:Request):
        if production: raise HTTPException(403,'Создайте администратора через команду на сервере')
        if req.client.host not in {'127.0.0.1','::1','testclient'}: raise HTTPException(403,'Настройка доступна только на сервере')
        salt=secrets.token_hex(16)
        with db() as con:
            con.execute('BEGIN IMMEDIATE')
            if con.execute('SELECT id FROM users LIMIT 1').fetchone(): raise HTTPException(409,'Администратор уже создан')
            con.execute('INSERT INTO users(username,hash,salt,role) VALUES(?,?,?,?)',(body.username.lower(),password_hash(body.password,salt),salt,'admin'))
            user=con.execute('SELECT * FROM users').fetchone()
        return login_response(user)
    @app.post('/api/login')
    def login(body:Credentials,req:Request):
        key=req.client.host;now=time.time()
        with failure_lock:
            if len(failures)>1000:
                for address in list(failures):
                    if not failures[address] or failures[address][-1]<now-60: failures.pop(address,None)
            attempts=[t for t in failures.get(key,[]) if t>now-60]
            if len(attempts)>=10 or len(failures)>10000: raise HTTPException(429,'Подождите минуту перед следующей попыткой')
            attempts.append(now);failures[key]=attempts
        with db() as con: user=con.execute('SELECT * FROM users WHERE username=? AND active=1',(body.username.lower(),)).fetchone()
        # Fixed dummy hash prevents skipping expensive verification for unknown users.
        calculated=password_hash(body.password,user['salt'] if user else '00'*16)
        if not user or not hmac.compare_digest(calculated,user['hash']):
            raise HTTPException(401,'Неверный логин или пароль')
        with failure_lock: failures.pop(key,None)
        return login_response(user)
    @app.get('/api/session')
    def session(req:Request):
        u=auth(req);return {'username':u['username'],'role':u['role'],'csrf':u['csrf']}
    @app.post('/api/logout')
    def logout(req:Request):
        u=auth(req)
        if not hmac.compare_digest(req.headers.get('x-csrf-token',''),u['csrf']): raise HTTPException(403,'Обновите страницу')
        with db() as con: con.execute('DELETE FROM sessions WHERE token=?',(digest(req.cookies.get('cursor_session','')),))
        r=JSONResponse({'ok':True});r.delete_cookie('cursor_session');return r
    @app.post('/api/account/password')
    def change_password(body:PasswordChange,req:Request):
        user=auth(req)
        if not hmac.compare_digest(req.headers.get('x-csrf-token',''),user['csrf']):
            raise HTTPException(403,'Обновите страницу')
        if not hmac.compare_digest(password_hash(body.current_password,user['salt']),user['hash']):
            raise HTTPException(401,'Текущий пароль неверен')
        salt=secrets.token_hex(16)
        with db() as con:
            # Compare old hash to prevent concurrent password changes from overwriting each other.
            changed=con.execute('UPDATE users SET hash=?,salt=? WHERE id=? AND hash=?',
                (password_hash(body.password,salt),salt,user['id'],user['hash'])).rowcount
            if not changed: raise HTTPException(409,'Пароль уже изменён. Войдите снова.')
            con.execute('DELETE FROM sessions WHERE user_id=?',(user['id'],))
            con.execute('INSERT INTO audit(at,user_id,action) VALUES(?,?,?)',(time.time(),user['id'],'change_password'))
        return login_response(user)
    @app.get('/api/state')
    def state(req:Request):
        auth(req)
        with db() as con: return read_state(con)
    @app.put('/api/state')
    def save(body:State,req:Request):
        user=auth(req,write=True);validate_state(body.data)
        with db() as con:
            changed=con.execute('UPDATE workspace SET revision=revision+1 WHERE id=1 AND revision=?',(body.revision,)).rowcount
            if not changed: raise HTTPException(409,'Карта обновлена другим сотрудником. Перезагрузите страницу; ваши несохранённые правки доступны для скачивания.')
            write_state(con,body.data)
            con.execute('INSERT INTO audit(at,user_id,action,revision) VALUES(?,?,?,?)',(time.time(),user['id'],'save',body.revision+1))
        return {'revision':body.revision+1}
    @app.get('/api/admin/users')
    def users(req:Request):
        auth(req,admin=True)
        with db() as con: return [dict(r) for r in con.execute('SELECT id,username,role,active FROM users')]
    @app.post('/api/admin/users')
    def add_user(body:NewUser,req:Request):
        actor=auth(req,write=True,admin=True);salt=secrets.token_hex(16)
        try:
            with db() as con:
                con.execute('INSERT INTO users(username,hash,salt,role) VALUES(?,?,?,?)',(body.username.lower(),password_hash(body.password,salt),salt,body.role))
                con.execute('INSERT INTO audit(at,user_id,action) VALUES(?,?,?)',(time.time(),actor['id'],'create_user'))
        except IntegrityError: raise HTTPException(409,'Логин уже занят')
        return {'ok':True}
    @app.delete('/api/admin/users/{id}/sessions')
    def disable(id:int,req:Request):
        actor=auth(req,write=True,admin=True)
        if id==actor['id']: raise HTTPException(422,'Нельзя отключить свою учётную запись')
        with db() as con:
            con.execute('UPDATE users SET active=0 WHERE id=?',(id,));con.execute('DELETE FROM sessions WHERE user_id=?',(id,))
            con.execute('INSERT INTO audit(at,user_id,action) VALUES(?,?,?)',(time.time(),actor['id'],'disable_user'))
        return {'ok':True}
    @app.get('/api/admin/audit')
    def audit(req:Request):
        auth(req,admin=True)
        with db() as con: return [dict(r) for r in con.execute('SELECT a.at,u.username,a.action,a.revision FROM audit a LEFT JOIN users u ON a.user_id=u.id ORDER BY a.id DESC LIMIT 50')]
    @app.get('/{path:path}')
    def assets(path:str):
        if not path:path='index.html'
        parts=Path(path).parts
        if any(p.startswith('.') for p in parts) or ('\\' in path) or (path!='index.html' and parts[0] not in {'src','assets'}): raise HTTPException(404)
        target=(ROOT/path).resolve()
        if not target.is_relative_to(ROOT) or not target.is_file() or target.suffix not in {'.html','.css','.js','.png','.jpg','.jpeg','.svg','.webp','.ico'}: raise HTTPException(404)
        return FileResponse(target)
    return app

app=create_app() if os.getenv('CURSOR_TEST')!='1' else None
