"""Relational workspace and account schema."""
from alembic import op
from backend.schema_v1 import metadata
revision='0001'
down_revision=None
branch_labels=None
depends_on=None

def upgrade(): metadata.create_all(bind=op.get_bind())
def downgrade():
    raise RuntimeError('Destructive downgrade is disabled; restore a verified backup instead.')
