"""add_stripe_columns_to_user_profiles

Revision ID: 9f2a3b4c5d6e
Revises: 8e1f2a3b4c5d
Create Date: 2026-09-20 12:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9f2a3b4c5d6e'
down_revision: Union[str, Sequence[str], None] = '8e1f2a3b4c5d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add stripe_customer_id and stripe_subscription_id columns to user_profiles table."""
    op.add_column('user_profiles', sa.Column('stripe_customer_id', sa.String(length=255), nullable=True))
    op.add_column('user_profiles', sa.Column('stripe_subscription_id', sa.String(length=255), nullable=True))
    op.create_index(op.f('ix_user_profiles_stripe_customer_id'), 'user_profiles', ['stripe_customer_id'], unique=False)
    op.create_index(op.f('ix_user_profiles_stripe_subscription_id'), 'user_profiles', ['stripe_subscription_id'], unique=False)


def downgrade() -> None:
    """Remove stripe columns from user_profiles table."""
    op.drop_index(op.f('ix_user_profiles_stripe_subscription_id'), table_name='user_profiles')
    op.drop_index(op.f('ix_user_profiles_stripe_customer_id'), table_name='user_profiles')
    op.drop_column('user_profiles', 'stripe_subscription_id')
    op.drop_column('user_profiles', 'stripe_customer_id')
