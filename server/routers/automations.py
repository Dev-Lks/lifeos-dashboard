"""Automation APIs."""
from fastapi import APIRouter

from ..lifeos import (
    create_automation,
    delete_automation,
    get_automation,
    lifeos_command_center,
    lifeos_summary,
    list_automation_runs,
    list_automations,
    run_automation,
    update_automation,
)

router = APIRouter(prefix="/api", tags=["automations"])


@router.get("/lifeos/summary")
def summary():
    return lifeos_summary()


@router.get("/lifeos/command-center")
def command_center():
    return lifeos_command_center()


@router.get("/automations")
def automations():
    return list_automations()


@router.post("/automations")
def automation_create(payload: dict):
    return create_automation(payload)


@router.get("/automations/{automation_id}")
def automation_get(automation_id: str):
    return get_automation(automation_id) or {"error": "not found"}


@router.patch("/automations/{automation_id}")
def automation_update(automation_id: str, payload: dict):
    return update_automation(automation_id, payload)


@router.delete("/automations/{automation_id}")
def automation_delete(automation_id: str):
    return {"ok": delete_automation(automation_id)}


@router.post("/automations/{automation_id}/run")
def automation_run(automation_id: str):
    return run_automation(automation_id)


@router.get("/automations/{automation_id}/runs")
def automation_runs_for(automation_id: str):
    return list_automation_runs(automation_id)


@router.get("/automation-runs")
def automation_runs():
    return list_automation_runs()
