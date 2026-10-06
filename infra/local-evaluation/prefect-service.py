import json
import os
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from prefect import flow, task
from prefect.context import get_run_context

RUNS = {}
LOCK = threading.Lock()
STEP_IDS = ["context", "policy", "retrieval", "model", "validation"]
API = os.environ["PREFECT_API_URL"].rstrip("/")


def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@task(name="orcheval-step")
def run_step(step_id, state, execution):
    index = STEP_IDS.index(step_id)
    if state["completed"] != STEP_IDS[:index]:
        raise ValueError(f"Unexpected task order at {step_id}.")
    started_at = now()
    time.sleep(0.005)
    output = f"approved:{execution['tenantId']}:{execution['id']}" if step_id == "validation" else None
    return {
        "state": {"completed": [*state["completed"], step_id], "output": output},
        "observation": {"id": step_id, "startedAt": started_at, "endedAt": now(), "attempt": 1, "outcome": "SUCCEEDED"},
    }


@flow(name="orcheval-sequential")
def sequential(execution):
    flow_run_id = str(get_run_context().flow_run.id)
    with LOCK:
        record = RUNS[execution["id"]]
        record["prefectFlowRunId"] = flow_run_id
        record["ready"].set()
    state = {"completed": [], "output": None}
    steps = []
    for step_id in STEP_IDS:
        result = run_step(step_id, state, execution)
        state = result["state"]
        steps.append(result["observation"])
    return {"execution": execution, "steps": steps, "output": state["output"]}


def fetch(path):
    request = urllib.request.Request(f"{API}{path}")
    with urllib.request.urlopen(request, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def invoke(execution):
    try:
        result = sequential(execution)
        with LOCK:
            RUNS[execution["id"]]["result"] = result
    except Exception as error:
        with LOCK:
            RUNS[execution["id"]]["error"] = str(error)[:500]
            RUNS[execution["id"]]["ready"].set()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def reply(self, code, value):
        encoded = json.dumps(value).encode("utf-8")
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def body(self):
        return json.loads(self.rfile.read(int(self.headers.get("content-length", "0"))).decode("utf-8"))

    def do_GET(self):
        try:
            if self.path == "/health":
                fetch("/health")
                return self.reply(200, {"healthy": True})
            if self.path.startswith("/observe/"):
                execution_id = self.path.removeprefix("/observe/")
                with LOCK:
                    record = RUNS.get(execution_id)
                    if record:
                        record = {key: value for key, value in record.items() if key != "ready"}
                if not record:
                    return self.reply(404, {"message": "Flow run not found."})
                if not record.get("prefectFlowRunId"):
                    return self.reply(200, {"record": record, "flowRun": None})
                flow_run = fetch(f"/flow_runs/{record['prefectFlowRunId']}")
                return self.reply(200, {"record": record, "flowRun": flow_run})
            return self.reply(404, {"message": "Not found."})
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as error:
            return self.reply(503, {"message": str(error)[:200]})

    def do_POST(self):
        try:
            if self.path != "/execute":
                return self.reply(404, {"message": "Not found."})
            execution = self.body()
            ready = threading.Event()
            with LOCK:
                if execution["id"] in RUNS:
                    return self.reply(409, {"message": "Execution already exists."})
                RUNS[execution["id"]] = {"execution": execution, "submittedAt": now(), "ready": ready}
            threading.Thread(target=invoke, args=(execution,), daemon=True).start()
            ready.wait(10)
            with LOCK:
                record = RUNS[execution["id"]]
                if record.get("error"):
                    return self.reply(500, {"message": record["error"]})
                flow_run_id = record.get("prefectFlowRunId")
            return self.reply(202, {"flowRunId": flow_run_id}) if flow_run_id else self.reply(503, {"message": "Prefect flow run did not start."})
        except (KeyError, ValueError, json.JSONDecodeError) as error:
            return self.reply(400, {"message": str(error)[:200]})


ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "9083"))), Handler).serve_forever()
