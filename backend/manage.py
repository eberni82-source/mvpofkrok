"""Private administration: python -m backend.manage --help. Never expose as HTTP routes."""
import argparse, getpass, json, os, secrets, time
from pathlib import Path
from sqlalchemy import select, text
from backend.database import Database
from backend import schema_v1 as s

# Sessions deliberately excluded: restoring a backup requires everyone to log in again.
TABLES=[s.users,s.workspace,s.companies,s.people,s.relations,s.interactions,s.deals,s.committee,
        s.interaction_people,s.deal_people,s.audit]

def backup(database,path):
    with database.transaction() as con:
        data={t.name:[dict(r) for r in con.raw.execute(select(t)).mappings()] for t in TABLES}
    content={'format':'cursor-backup-v1','createdAt':time.time(),'tables':data}
    # Exclusive create prevents accidental overwrite; mode protects password hashes.
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as file: json.dump(content,file,ensure_ascii=False)

def restore(database,path):
    data=json.loads(Path(path).read_text())
    if data.get('format')!='cursor-backup-v1' or set(data.get('tables',{}))!={t.name for t in TABLES}:
        raise ValueError('Unsupported backup format')
    with database.transaction() as con:
        con.execute('BEGIN IMMEDIATE')
        if any(con.raw.execute(select(t).limit(1)).first() for t in TABLES):
            raise ValueError('Restore requires a new empty database; existing data was not changed')
        for table in TABLES:
            rows=data['tables'][table.name]
            if rows: con.raw.execute(table.insert(),rows)
        if database.kind=='postgresql':
            for table in (s.users,s.audit):
                name=table.name
                con.raw.execute(text(f"SELECT setval(pg_get_serial_sequence('{name}','id'), COALESCE((SELECT MAX(id) FROM {name}),1), EXISTS(SELECT 1 FROM {name}))"))

def main():
    parser=argparse.ArgumentParser(description='Cursor database administration')
    commands=parser.add_subparsers(dest='command',required=True)
    commands.add_parser('migrate')
    admin=commands.add_parser('init-admin');admin.add_argument('username')
    for name in ('backup','restore'):
        child=commands.add_parser(name);child.add_argument('file')
    args=parser.parse_args();database=Database()
    try:
        if args.command=='init-admin':
            # Import validation without creating the public application.
            os.environ['CURSOR_TEST']='1'
            from backend.app import Credentials,password_hash
            password=getpass.getpass('Пароль администратора (минимум 12 символов): ')
            if password!=getpass.getpass('Повторите пароль: '): raise ValueError('Пароли не совпадают')
            credentials=Credentials(username=args.username,password=password)
            salt=secrets.token_hex(16)
            with database.transaction() as con:
                con.execute('BEGIN IMMEDIATE')
                if con.execute('SELECT id FROM users LIMIT 1').fetchone(): raise ValueError('Administrator already exists; use the team panel')
                con.execute('INSERT INTO users(username,hash,salt,role) VALUES(?,?,?,?)',
                    (credentials.username.lower(),password_hash(credentials.password,salt),salt,'admin'))
        elif args.command=='backup': backup(database,args.file)
        elif args.command=='restore': restore(database,args.file)
        print('Готово:',args.command)
    finally: database.engine.dispose()

if __name__=='__main__': main()
