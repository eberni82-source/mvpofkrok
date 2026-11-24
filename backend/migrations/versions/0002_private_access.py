"""Keep server-owned tables private, including on Supabase."""
from alembic import op
from sqlalchemy import text
from backend.schema_v1 import metadata
revision='0002'
down_revision='0001'
branch_labels=None
depends_on=None

def upgrade():
    conn=op.get_bind()
    if conn.dialect.name!='postgresql': return
    schema=conn.scalar(text('SELECT current_schema()'))
    if schema in {'public','auth','storage','extensions'} or not schema:
        raise RuntimeError('Cursor requires a dedicated private PostgreSQL schema')
    quote=conn.dialect.identifier_preparer.quote_identifier
    target=quote(schema)
    conn.execute(text('REVOKE ALL ON SCHEMA '+target+' FROM PUBLIC'))
    roles=[r for r in ('anon','authenticated') if conn.scalar(text('SELECT 1 FROM pg_roles WHERE rolname=:role'),{'role':r})]
    for role in roles:
        conn.execute(text('REVOKE ALL ON SCHEMA '+target+' FROM '+quote(role)))
    for name in [*metadata.tables,'alembic_version']:
        table=target+'.'+quote(name)
        conn.execute(text('ALTER TABLE '+table+' ENABLE ROW LEVEL SECURITY'))
        conn.execute(text('REVOKE ALL ON TABLE '+table+' FROM PUBLIC'))
        for role in roles:
            conn.execute(text('REVOKE ALL ON TABLE '+table+' FROM '+quote(role)))

def downgrade():
    raise RuntimeError('Security downgrade is disabled')
