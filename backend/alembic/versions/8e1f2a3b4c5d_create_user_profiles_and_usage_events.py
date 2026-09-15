"""create_user_profiles_and_usage_events

Revision ID: 8e1f2a3b4c5d
Revises: 7c8d9e0f1a2b
Create Date: 2026-09-15 13:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '8e1f2a3b4c5d'
down_revision: Union[str, Sequence[str], None] = '7c8d9e0f1a2b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to create user_profiles and usage_events tables."""
    # 1. Create user_profiles table
    op.create_table(
        'user_profiles',
        sa.Column('user_id', sa.String(length=255), nullable=False),
        sa.Column('tier', sa.String(length=50), server_default='free', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('user_id'),
    )
    op.create_index(op.f('ix_user_profiles_user_id'), 'user_profiles', ['user_id'], unique=False)

    # 2. Create usage_events table
    op.create_table(
        'usage_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', sa.String(length=255), nullable=False),
        sa.Column('event_type', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_usage_events_id'), 'usage_events', ['id'], unique=False)
    op.create_index(op.f('ix_usage_events_user_id'), 'usage_events', ['user_id'], unique=False)
    op.create_index(op.f('ix_usage_events_event_type'), 'usage_events', ['event_type'], unique=False)
    op.create_index(op.f('ix_usage_events_created_at'), 'usage_events', ['created_at'], unique=False)
    op.create_index(
        'ix_usage_events_user_event_created',
        'usage_events',
        ['user_id', 'event_type', 'created_at'],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema to drop user_profiles and usage_events tables."""
    op.drop_index('ix_usage_events_user_event_created', table_name='usage_events')
    op.drop_index(op.f('ix_usage_events_created_at'), table_name='usage_events')
    op.drop_index(op.f('ix_usage_events_event_type'), table_name='usage_events')
    op.drop_index(op.f('ix_usage_events_user_id'), table_name='usage_events')
    op.drop_index(op.f('ix_usage_events_id'), table_name='usage_events')
    op.drop_table('usage_events')

    op.drop_index(op.f('ix_user_profiles_user_id'), table_name='user_profiles')
    op.drop_table('user_profiles')
