"""Rutas de asignaciones recurrentes a sobres. CRUD plano; la aplicacion mensual
la dispara /recurring/run (ver crud.budget_rule.apply_due)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import DomainError
from app.crud import budget_rule as crud
from app.db import get_session
from app.schemas.budget import BudgetRuleCreate, BudgetRuleRead, BudgetRuleUpdate

router = APIRouter(prefix="/budget-rules", tags=["budget-rules"])

_NOT_FOUND = "Asignacion recurrente no encontrada"


@router.post("", response_model=BudgetRuleRead, status_code=status.HTTP_201_CREATED)
async def create_rule(
    data: BudgetRuleCreate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> BudgetRuleRead:
    try:
        return await crud.create_rule(session, owner_id, data)
    except DomainError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc


@router.get("", response_model=list[BudgetRuleRead])
async def list_rules(
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> list[BudgetRuleRead]:
    return await crud.list_rules(session, owner_id)


@router.get("/{rule_id}", response_model=BudgetRuleRead)
async def get_rule(
    rule_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> BudgetRuleRead:
    rule = await crud.get_rule(session, owner_id, rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return rule


@router.patch("/{rule_id}", response_model=BudgetRuleRead)
async def update_rule(
    rule_id: uuid.UUID,
    data: BudgetRuleUpdate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> BudgetRuleRead:
    rule = await crud.get_rule(session, owner_id, rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return await crud.update_rule(session, rule, data)


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    rule = await crud.get_rule(session, owner_id, rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    await crud.soft_delete_rule(session, rule)
