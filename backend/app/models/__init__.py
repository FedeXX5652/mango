# Importar todos los modelos aca puebla Base.metadata para Alembic.
# Una tabla que no se importe no aparece en las migraciones.

from app.models.account import Account, PaymentMethod, PaymentMethodAccount
from app.models.budget import Budget, BudgetRule, Goal
from app.models.category import Category, CategoryRule
from app.models.debt import Debt
from app.models.fx import ExchangeRate
from app.models.recurring import RecurringRule, Template
from app.models.tag import Tag, TransactionTag
from app.models.transaction import Attachment, Transaction, TransactionSplit
from app.models.user import Group, GroupMember, User

__all__ = [
    "Account",
    "Attachment",
    "Budget",
    "BudgetRule",
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
    "Tag",
    "Template",
    "Transaction",
    "TransactionSplit",
    "TransactionTag",
    "User",
]
