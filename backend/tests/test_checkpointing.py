import os
import uuid
from typing import TypedDict
from unittest.mock import patch

import pytest
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt
from langchain_core.runnables import RunnableConfig
from langgraph.config import var_child_runnable_config

from app.graph.checkpointing import (
    create_checkpoint_pool,
    normalize_checkpoint_database_url,
    postgres_checkpoint_workflow,
)


def test_normalize_checkpoint_database_url_accepts_sqlalchemy_and_provider_urls():
    assert normalize_checkpoint_database_url(
        "postgresql+psycopg://user:pass@db:5432/finsight"
    ) == "postgresql://user:pass@db:5432/finsight"
    assert normalize_checkpoint_database_url(
        "postgres://user:pass@db/finsight"
    ) == "postgresql://user:pass@db/finsight"


def test_checkpoint_pool_is_bounded_and_uses_checkpoint_url(monkeypatch):
    monkeypatch.setenv(
        "DATABASE_CHECKPOINT_URL",
        "postgresql+psycopg://user:pass@checkpoint-db:5432/finsight",
    )
    monkeypatch.setenv("CHECKPOINT_POOL_MIN_SIZE", "2")
    monkeypatch.setenv("CHECKPOINT_POOL_MAX_SIZE", "7")

    with patch("app.graph.checkpointing.AsyncConnectionPool") as pool_class:
        pool_class.check_connection = object()
        create_checkpoint_pool()

    kwargs = pool_class.call_args.kwargs
    assert kwargs["conninfo"] == "postgresql://user:pass@checkpoint-db:5432/finsight"
    assert kwargs["min_size"] == 2
    assert kwargs["max_size"] == 7
    assert kwargs["open"] is False
    assert kwargs["kwargs"]["autocommit"] is True
    assert kwargs["kwargs"]["prepare_threshold"] == 0


@pytest.mark.asyncio
async def test_workflow_sets_up_postgres_checkpointer_and_closes_pool(monkeypatch):
    events = []
    compiled_workflow = object()

    class FakePool:
        async def open(self, wait, timeout):
            events.append(("open", wait, timeout))

        async def close(self):
            events.append(("close",))

    class FakeCheckpointer:
        def __init__(self, pool, serde):
            events.append(("checkpointer", pool, serde))

        async def setup(self):
            events.append(("setup",))

    fake_pool = FakePool()
    monkeypatch.setenv("CHECKPOINT_POOL_STARTUP_TIMEOUT", "12")

    with (
        patch("app.graph.checkpointing.create_checkpoint_pool", return_value=fake_pool),
        patch("app.graph.checkpointing.AsyncPostgresSaver", FakeCheckpointer),
        patch("app.graph.checkpointing.create_checkpoint_serializer", return_value="serde"),
        patch("app.graph.checkpointing.compile_compliance_graph", return_value=compiled_workflow),
    ):
        async with postgres_checkpoint_workflow() as workflow:
            assert workflow is compiled_workflow
            assert events[:3] == [
                ("open", True, 12.0),
                ("checkpointer", fake_pool, "serde"),
                ("setup",),
            ]

    assert events[-1] == ("close",)


@pytest.mark.asyncio
async def test_postgres_checkpoint_resumes_after_pool_restart():
    if os.getenv("RUN_POSTGRES_INTEGRATION_TESTS", "false").lower() != "true":
        pytest.skip("set RUN_POSTGRES_INTEGRATION_TESTS=true to exercise durable checkpoint restart")

    class RestartState(TypedDict):
        request: str
        decision: str

    def approval_node(state: RestartState, config: RunnableConfig):
        var_child_runnable_config.set(config)
        decision = interrupt({"request": state["request"]})
        return {"decision": decision}

    def build_graph(checkpointer):
        builder = StateGraph(RestartState)
        builder.add_node("approval", approval_node)
        builder.add_edge(START, "approval")
        builder.add_edge("approval", END)
        return builder.compile(checkpointer=checkpointer)

    thread_id = f"checkpoint-restart-{uuid.uuid4().hex}"
    config = {"configurable": {"thread_id": thread_id}}

    first_pool = create_checkpoint_pool()
    await first_pool.open(wait=True)
    try:
        first_checkpointer = AsyncPostgresSaver(first_pool)
        await first_checkpointer.setup()
        interrupted = await build_graph(first_checkpointer).ainvoke(
            {"request": "approve investigation", "decision": ""},
            config=config,
        )
        assert interrupted["__interrupt__"]
    finally:
        await first_pool.close()

    second_pool = create_checkpoint_pool()
    await second_pool.open(wait=True)
    try:
        second_checkpointer = AsyncPostgresSaver(second_pool)
        resumed = await build_graph(second_checkpointer).ainvoke(
            Command(resume="APPROVED"),
            config=config,
        )
        assert resumed["decision"] == "APPROVED"
    finally:
        try:
            async with second_pool.connection() as connection:
                async with connection.cursor() as cursor:
                    for table in ("checkpoint_writes", "checkpoints", "checkpoint_blobs"):
                        await cursor.execute(
                            f"DELETE FROM {table} WHERE thread_id = %s",
                            (thread_id,),
                        )
        finally:
            await second_pool.close()
