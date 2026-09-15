"""add_user_id_to_datasets

Revision ID: 7c8d9e0f1a2b
Revises: 5b7532d8ceef
Create Date: 2026-09-15 12:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c8d9e0f1a2b'
down_revision: Union[str, Sequence[str], None] = '5b7532d8ceef'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to add user_id column and index to datasets table."""
    op.add_column('datasets', sa.Column('user_id', sa.String(length=255), nullable=True))
    op.create_index(op.f('ix_datasets_user_id'), 'datasets', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema to remove user_id column and index from datasets table."""
    op.drop_index(op.f('ix_datasets_user_id'), table_name='datasets')
    op.drop_column('datasets', 'user_id')
