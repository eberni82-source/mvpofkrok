from alembic import context
from sqlalchemy import create_engine
from backend.database import database_url
from backend.schema_v1 import metadata

def run(connection):
    context.configure(connection=connection,target_metadata=metadata)
    with context.begin_transaction(): context.run_migrations()
connection=context.config.attributes.get('connection')
if connection is not None:
    run(connection)
else:
    engine=create_engine(database_url())
    with engine.begin() as connection:
        if engine.dialect.name=='postgresql':
            from sqlalchemy import text
            connection.execute(text('SELECT pg_advisory_xact_lock(78410327)'))
        run(connection)
    engine.dispose()
