"""Plantillas: gastos frecuentes precargados que se materializan de un toque.

Personales o de un grupo (1.6.0, T1). Las de grupo son de gasto, con una
categoria del grupo y sin cuenta ni medio de pago (cada uno paga con lo suyo), y
las edita o borra cualquier miembro, como las categorias del grupo.

Toda la validacion va aca (DomainError, 422): un error de la base llega al
cliente como 409, que el conector toma por "ya aplicado", y la plantilla se
perdia sin aviso.
"""

import uuid

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.crud.group import membresia
from app.models.account import Account, PaymentMethod
from app.models.category import Category
from app.models.recurring import Template
from app.models.reminder import Reminder
from app.models.user import GroupMember
from app.schemas.template import TemplateCreate, TemplateUpdate

_REFERENCIAS = {"category_id", "account_id", "payment_method_id"}


async def _validar(
    session: AsyncSession, user_id: uuid.UUID, t: Template, campos: set[str]
) -> None:
    """Valida la plantilla en su ambito. De las referencias, solo las que cambian
    (al crear, todas): una plantilla vieja que no cumple no traba otro cambio."""
    if t.group_id is not None:
        if await membresia(session, t.group_id, user_id) is None:
            raise DomainError("El grupo no existe")
        if t.kind != "expense":
            raise DomainError("Las plantillas de un grupo son de gastos")
        if t.account_id is not None or t.payment_method_id is not None:
            raise DomainError("Una plantilla del grupo no lleva cuenta: cada uno paga con la suya")
    if "category_id" in campos and t.category_id is not None:
        if t.kind == "transfer":
            raise DomainError("Una transferencia no lleva categoría")
        cat = await session.get(Category, t.category_id)
        del_ambito = cat is not None and (
            cat.group_id == t.group_id
            if t.group_id is not None
            else cat.group_id is None and cat.owner_id == user_id
        )
        tipo = "income" if t.kind == "income" else "expense"
        if not del_ambito or cat.deleted_at is not None or cat.kind != tipo:
            raise DomainError("La categoría no corresponde a la plantilla")
    if "account_id" in campos and t.account_id is not None:
        cuenta = await session.get(Account, t.account_id)
        # Personal: una cuenta propia, no la conjunta de un grupo.
        if (
            cuenta is None
            or cuenta.owner_id != user_id
            or cuenta.group_id is not None
            or cuenta.deleted_at is not None
        ):
            raise DomainError("La cuenta no existe")
    if "payment_method_id" in campos and t.payment_method_id is not None:
        medio = await session.get(PaymentMethod, t.payment_method_id)
        if medio is None or medio.owner_id != user_id or medio.deleted_at is not None:
            raise DomainError("El medio de pago no existe")


async def create_template(
    session: AsyncSession, owner_id: uuid.UUID, data: TemplateCreate
) -> Template:
    template = Template(owner_id=owner_id, **data.model_dump())
    await _validar(session, owner_id, template, _REFERENCIAS)
    session.add(template)
    await session.commit()
    await session.refresh(template)
    return template


async def get_template(
    session: AsyncSession, user_id: uuid.UUID, template_id: uuid.UUID
) -> Template | None:
    """La plantilla, si es mia (personal) o de un grupo del que soy miembro."""
    mis_grupos = select(GroupMember.group_id).where(
        GroupMember.user_id == user_id, GroupMember.deleted_at.is_(None)
    )
    stmt = select(Template).where(
        Template.id == template_id,
        Template.deleted_at.is_(None),
        or_(
            and_(Template.group_id.is_(None), Template.owner_id == user_id),
            Template.group_id.in_(mis_grupos),
        ),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def update_template(
    session: AsyncSession, user_id: uuid.UUID, template: Template, data: TemplateUpdate
) -> Template:
    cambios = data.model_dump(exclude_unset=True)
    for field, value in cambios.items():
        setattr(template, field, value)
    await _validar(session, user_id, template, set(cambios) & _REFERENCIAS)
    await session.commit()
    await session.refresh(template)
    return template


async def soft_delete_template(session: AsyncSession, template: Template) -> None:
    template.deleted_at = func.now()
    # Los recordatorios que la usaban quedan, sin plantilla (0030, C8).
    await session.execute(
        update(Reminder)
        .where(Reminder.template_id == template.id)
        .values(template_id=None, updated_at=func.now())
    )
    await session.commit()
