# Importar todos los modelos aca puebla Base.metadata para Alembic.
# Una tabla que no se importe no aparece en las migraciones.

from app.models.account import Account, PaymentMethod, PaymentMethodAccount
from app.models.budget import Budget, Goal
from app.models.category import Category, CategoryRule
from app.models.debt import Debt
from app.models.fx import ExchangeRate
from app.models.recurring import RecurringRule, Template
from app.models.sync import SyncLog, SyncState
from app.models.transaction import Attachment, Transaction, TransactionSplit
from app.models.user import Group, GroupMember, User

__all__ = [
    "Account",
    "Attachment",
    "Budget",
    "Category",
    "CategoryRule",
    "Debt",
    "ExchangeRate",
    "Goal",
    "Group",
    "GroupMember",
    "PaymentMethod",
    "PaymentMethodAccount",
    "RecurringRule",
    "SyncLog",
    "SyncState",
    "Template",
    "Transaction",
    "TransactionSplit",
    "User",
]
