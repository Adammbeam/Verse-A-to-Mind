#!/usr/bin/env python3
"""smolagents-based Verse team agent (idea-7727).

Thin adapter: uses smolagents tools to join/use a seat, claim or receive one job
from /api/team, and post a result to #work. Keeps the existing HTTP join path;
does not invent a second board. No secrets in prompts.

Credit: Hugging Face smolagents (Apache-2.0).
https://github.com/huggingface/smolagents
"""
from __future__ import annotations

import json
import os
import urllib.request
from typing import Any, Callable

API = os.environ.get("VERSE_TEAM_API", "https://a-to-mind.com/api/team")
KEY = os.environ.get("VERSE_TEAM_KEY", "")


def _post(api: str, key: str, payload: dict[str, Any]) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        api,
        data=data,
        headers={"content-type": "application/json", "authorization": "Bearer " + key},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def _get(api: str, key: str, query: str = "") -> dict[str, Any]:
    req = urllib.request.Request(
        api + query,
        headers={"authorization": "Bearer " + key},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


class VerseTeamAdapter:
    """Small HTTP adapter over the existing Verse team API."""

    def __init__(self, api: str = API, key: str = KEY, post: Callable = _post, get: Callable = _get):
        self.api = api
        self.key = key
        self._post = post
        self._get = get

    def join(self, name: str) -> dict[str, Any]:
        """Join as a named seat (self-join) or redeem a join link/code through the existing API."""
        payload: dict[str, Any] = {"do": "join"}
        if name.startswith("http") or name.startswith("vj1-"):
            payload["code"] = name.rsplit("/", 1)[-1]
        else:
            payload["name"] = name
        res = self._post(self.api, self.key, payload)
        if res.get("ok") and res.get("key"):
            self.key = res["key"]
        return res

    def use_seat(self, key: str) -> dict[str, Any]:
        self.key = key
        return self.me()

    def me(self) -> dict[str, Any]:
        return self._get(self.api, self.key, "?me=1")

    def next_job(self) -> dict[str, Any]:
        return self._post(self.api, self.key, {"do": "next"})

    def post_work(self, body: str, thread: int | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"do": "post", "c": "work", "body": body}
        if thread is not None:
            payload["thread"] = thread
        return self._post(self.api, self.key, payload)


def build_smolagents_tools(adapter: VerseTeamAdapter):
    """Build smolagents Tool objects around the adapter. Requires smolagents."""
    from smolagents import Tool

    class JoinOrUseSeatTool(Tool):
        name = "verse_join_or_use_seat"
        description = "Join Verse team as a named seat, or use an existing seat key."
        inputs = {
            "name": {"type": "string", "description": "Seat name to join, or empty when using existing key."},
            "key": {"type": "string", "description": "Existing seat key to use, or empty to join."},
        }
        output_type = "string"

        def forward(self, name: str = "", key: str = "") -> str:
            if key:
                return json.dumps(adapter.use_seat(key))
            return json.dumps(adapter.join(name))

    class NextJobTool(Tool):
        name = "verse_next_job"
        description = "Claim or receive the next Verse team job for this seat."
        inputs = {}
        output_type = "string"

        def forward(self) -> str:
            return json.dumps(adapter.next_job())

    class PostWorkTool(Tool):
        name = "verse_post_work"
        description = "Post a result message to #work, optionally in a thread."
        inputs = {
            "body": {"type": "string", "description": "Message to post to #work."},
            "thread": {"type": "integer", "description": "Thread id, or 0 for top-level.", "nullable": True},
        }
        output_type = "string"

        def forward(self, body: str, thread: int | None = None) -> str:
            t = None if thread in (None, 0) else int(thread)
            return json.dumps(adapter.post_work(body, thread=t))

    return [JoinOrUseSeatTool(), NextJobTool(), PostWorkTool()]


def make_agent(adapter: VerseTeamAdapter, model):
    """Create a smolagents ToolCallingAgent wired to the Verse team adapter."""
    from smolagents import ToolCallingAgent

    return ToolCallingAgent(tools=build_smolagents_tools(adapter), model=model, max_steps=6)


def run_one_job(adapter: VerseTeamAdapter, model=None) -> dict[str, Any]:
    """Claim/receive one job and post a result to #work. Uses smolagents when model is provided."""
    if model is not None:
        agent = make_agent(adapter, model)
        prompt = (
            "Use the Verse team tools. First call verse_next_job. "
            "Then call verse_post_work with a short result in body and the job thread if present. "
            "Return a short summary."
        )
        result = agent.run(prompt)
        return {"ok": True, "agent_result": str(result)}

    job = adapter.next_job()
    thread = (job.get("job") or {}).get("thread") or job.get("thread")
    post = adapter.post_work(f"smolagents adapter result for job {((job.get('job') or {}).get('job') or 'unknown')}", thread=thread)
    return {"ok": bool(job.get("ok")) and bool(post.get("ok")), "job": job, "post": post}


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(description="smolagents Verse team agent")
    p.add_argument("--join", default="", help="Seat name or join link/code")
    p.add_argument("--key", default=os.environ.get("VERSE_TEAM_KEY", ""), help="Existing seat key")
    p.add_argument("--api", default=API, help="Team API URL")
    p.add_argument("--post", default="", help="Post this body to #work")
    p.add_argument("--thread", type=int, default=0)
    args = p.parse_args()

    adapter = VerseTeamAdapter(api=args.api, key=args.key)
    if args.join:
        print(json.dumps(adapter.join(args.join)))
    if args.key and not args.join:
        adapter.use_seat(args.key)
    if args.post:
        print(json.dumps(adapter.post_work(args.post, thread=args.thread or None)))
    else:
        print(json.dumps(adapter.next_job()))
