"""SQLite for local work; PostgreSQL for shared hosting, same transactions and schema."""
import os, re
from pathlib import Path
from contextlib import contextmanager
from sqlalchemy import create_engine, event, text, select, delete, inspect
from sqlalchemy.engine import make_url
from dotenv import load_dotenv
from alembic.config import Config
from alembic import command
from backend import schema_v1 as s
ROOT=Path(__file__).resolve().parent.parent

def database_url(db_path=None):
    load_dotenv(ROOT/'.env',override=False)
    if db_path is not None:
        return 'sqlite:///'+str(Path(db_path).resolve())
    url=os.getenv('DATABASE_URL')
    if url:
        if url.startswith('postgres://'): url='postgresql+psycopg://'+url[len('postgres://'):]
        elif url.startswith('postgresql://'): url='postgresql+psycopg://'+url[len('postgresql://'):]
        if url.startswith('postgresql'):
            schema=os.getenv('CURSOR_DB_SCHEMA','cursor_app')
            if not re.fullmatch(r'[a-z][a-z0-9_]{0,62}',schema) or schema in {'public','auth','storage','extensions'}:
                raise ValueError('Use a private CURSOR_DB_SCHEMA, e.g. cursor_app')
            parsed=make_url(url)
            url=parsed.update_query_dict({'options':'-csearch_path='+schema}).render_as_string(hide_password=False)
        return url
    return 'sqlite:///'+str(Path(os.getenv('CURSOR_DB', ROOT/'.data/cursor-v2.sqlite3')).resolve())

class Database:
    def __init__(self, db_path=None):
        url=database_url(db_path)
        local=url.startswith('sqlite:')
        if local:
            Path(url.removeprefix('sqlite:///')).parent.mkdir(parents=True,exist_ok=True)
        self.engine=create_engine(url,pool_pre_ping=True,**(
            {'connect_args':{'check_same_thread':False,'timeout':15}} if local else
            {'pool_size':5,'max_overflow':5,'pool_timeout':15,'isolation_level':'REPEATABLE READ'}))
        self.kind=self.engine.dialect.name
        if local:
            @event.listens_for(self.engine,'connect')
            def sqlite_config(conn,record):
                conn.isolation_level=None
                conn.execute('PRAGMA foreign_keys=ON')
            @event.listens_for(self.engine,'begin')
            def sqlite_begin(conn): conn.exec_driver_sql('BEGIN IMMEDIATE')
        with self.engine.begin() as conn:
            if not local:
                conn.execute(text('SELECT pg_advisory_xact_lock(78410327)'))
                schema=os.getenv('CURSOR_DB_SCHEMA','cursor_app')
                conn.execute(text('CREATE SCHEMA IF NOT EXISTS "'+schema+'"'))
            if 'workspace' in inspect(conn).get_table_names() and 'data' in {c['name'] for c in inspect(conn).get_columns('workspace')}:
                raise RuntimeError('Legacy database detected. Keep it as backup; use a new DATABASE_URL or CURSOR_DB path.')
            config=Config(str(ROOT/'alembic.ini'))
            config.attributes['connection']=conn
            command.upgrade(config,'head')
        if local: os.chmod(url.removeprefix('sqlite:///'),0o600)
    @contextmanager
    def transaction(self):
        with self.engine.begin() as conn:
            yield Connection(conn)

class Connection:
    """Small parameter binding adapter for authentication queries shared by both dialects."""
    def __init__(self, conn): self.raw=conn
    def execute(self, query, params=()):
        if query=='BEGIN IMMEDIATE':
            if self.raw.dialect.name=='postgresql':
                return self.raw.execute(text('SELECT pg_advisory_xact_lock(78410327)'))
            return None
        parts=query.split('?')
        bound=''.join(p+(f':p{i}' if i<len(parts)-1 else '') for i,p in enumerate(parts))
        return Result(self.raw.execute(text(bound),{f'p{i}':v for i,v in enumerate(params)}))
class Result:
    def __init__(self,result): self.result=result; self.rowcount=result.rowcount
    def fetchone(self): return self.result.mappings().first()
    def __iter__(self): return iter(self.result.mappings())

def read_state(conn):
    raw=conn.raw
    state={}
    for key,table in [('companies',s.companies),('people',s.people),('relations',s.relations),
                      ('interactions',s.interactions),('committee',s.committee),('deals',s.deals)]:
        state[key]=[r.payload for r in raw.execute(select(table.c.payload).order_by(table.c.ordinal))]
    workspace=raw.execute(select(s.workspace)).mappings().one()
    if not workspace['has_deals']: state.pop('deals')
    return {'revision':workspace['revision'],'data':state}

def write_state(conn,data):
    raw=conn.raw
    # Parent-first inserts and child-first deletes keep FK checks active throughout the transaction.
    for table in [s.interaction_people,s.deal_people,s.relations,s.committee,s.interactions,s.deals,s.people,s.companies]:
        raw.execute(delete(table))
    people={p['id']:p for p in data['people']}
    for i,p in enumerate(data['companies']):
        raw.execute(s.companies.insert().values(id=p['id'],name=p['name'],ordinal=i,payload=p))
    for i,p in enumerate(data['people']):
        raw.execute(s.people.insert().values(id=p['id'],company_id=p['companyId'],name=p['name'],role=p['role'],
            influence=p['influence'],attitude=p['attitude'],ordinal=i,payload=p))
    for i,p in enumerate(data['relations']):
        raw.execute(s.relations.insert().values(id=p['id'],company_id=p.get('companyId') or people[p['source']]['companyId'],
            source=p['source'],target=p['target'],kind=p['kind'],ordinal=i,payload=p))
    for key,table in [('interactions',s.interactions),('deals',s.deals)]:
        for i,p in enumerate(data.get(key,[])):
            fields={'person_id':p['personId'],'date':p['date']} if key=='interactions' else {'name':p['name']}
            raw.execute(table.insert().values(id=p['id'],company_id=p['companyId'],ordinal=i,payload=p,**fields))
            participants=s.interaction_people if key=='interactions' else s.deal_people
            for person in set(p.get('participantIds',[])):
                raw.execute(participants.insert().values(parent_id=p['id'],person_id=person,company_id=p['companyId']))
    for i,p in enumerate(data['committee']):
        raw.execute(s.committee.insert().values(ordinal=i,company_id=p['companyId'],person_id=p.get('personId') or None,payload=p))
    raw.execute(s.workspace.update().where(s.workspace.c.id==1).values(has_deals=int('deals' in data)))
