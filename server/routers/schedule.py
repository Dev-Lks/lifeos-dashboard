"""Schedule/cron APIs."""
from fastapi import APIRouter

from ..cron import cron_jobs, cron_summary

router = APIRouter(prefix="/api/crons", tags=["schedule"])


@router.get("")
def crons():
    return cron_jobs()


@router.get("/summary")
def summary():
    return cron_summary()
