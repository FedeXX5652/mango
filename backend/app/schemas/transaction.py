import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.account import Currency

TransactionKind = Literal["expense", "income", "transfer"]
Visibility = Literal["private", "shared"]


class TransactionCreate(BaseModel):
    # El id lo genera el cliente (decision 5.1).
    id: uuid.UUID
    kind: TransactionKind
    occurred_at: datetime
    # Monto: magnitud positiva en centavos. La direccion la da `kind` (ver 0001).
    amount: int = Field(ge=0)
    currency: Currency
    # Obligatoria, salvo en un gasto compartido que pagaron otros enteros
    # (`amount_owner` 0, 0032): de la cuenta de quien lo cargo no sale nada.
    account_id: uuid.UUID | None = None
    transfer_account_id: uuid.UUID | None = None
    payment_method_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    payee: str | None = None
    notes: str | None = None
    # Compartir con un grupo (fase 3b). `shared` exige `group_id` de un grupo
    # del que el usuario sea miembro; `private` fuerza `group_id` NULL. Lo valida
    # el CRUD, que es quien puede mirar la membresia.
    visibility: Visibility = "private"
    group_id: uuid.UUID | None = None
    # De donde sale el movimiento. El cliente genera dos cosas: lo que carga una
    # persona y lo que produce una regla recurrente (ver ESPECIFICACION 3.7).
    # 'email_import' es de la ingesta automatica y no se acepta por aca: es lo
    # unico que puede dejar un movimiento en 'pending' (regla 4).
    source: Literal["manual", "recurring"] = "manual"
    # Conversion, cuando la moneda del movimiento no es la de la cuenta
    # debitada (ver 0005). **Dos de tres determinan el tercero**: alcanza con
    # mandar uno de estos dos y el servidor completa el otro. Si vienen los dos
    # y no cierran, manda `amount_account`, que es lo que figura en el resumen
    # del banco. Con la misma moneda los dos quedan en NULL.
    amount_account: int | None = Field(default=None, gt=0)
    exchange_rate: Decimal | None = Field(default=None, gt=0, max_digits=20, decimal_places=10)
    # Pagos en conjunto (0032): en un gasto compartido que pagaron varios, lo que
    # puso quien lo carga (`amount` es el total). NULL = lo pago entero.
    amount_owner: int | None = Field(default=None, ge=0)


class TransactionUpdate(BaseModel):
    kind: TransactionKind | None = None
    # CONFIRMAR un pendiente (un cobro, 0018; un pago a confirmar, 0032).
    # 'rejected' ("no la pague") y 'pending' (deshacer esa respuesta) solo en el
    # pago a confirmar de quien pago (0032): una carga manual nunca queda
    # pendiente (regla 4).
    status: Literal["confirmed", "rejected", "pending"] | None = None
    occurred_at: datetime | None = None
    amount: int | None = Field(default=None, ge=0)
    currency: Currency | None = None
    account_id: uuid.UUID | None = None
    transfer_account_id: uuid.UUID | None = None
    payment_method_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    payee: str | None = None
    notes: str | None = None
    visibility: Visibility | None = None
    # Compartir/dejar de compartir al editar (ver create). Nullable-tolerante:
    # pasar a `private` limpia el group_id.
    group_id: uuid.UUID | None = None
    # Al editar: si cambia `amount`, se recalcula la cotizacion y el monto
    # debitado NO se toca (es el dato del banco). Si cambia `amount_account`,
    # se recalcula la cotizacion. Ver `services.conversion`.
    amount_account: int | None = Field(default=None, gt=0)
    exchange_rate: Decimal | None = Field(default=None, gt=0, max_digits=20, decimal_places=10)
    amount_owner: int | None = Field(default=None, ge=0)


class TransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: TransactionKind
    status: str
    occurred_at: datetime
    account_id: uuid.UUID | None
    transfer_account_id: uuid.UUID | None
    payment_method_id: uuid.UUID | None
    category_id: uuid.UUID | None
    amount: int
    currency: str
    amount_account: int | None
    exchange_rate: Decimal | None
    payee: str | None
    notes: str | None
    source: str
    visibility: str
    amount_owner: int | None = None
    paid_for_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
