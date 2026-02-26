#!/usr/bin/env python3
"""Run reproducible Python vs C++ benchmark scenarios."""

from __future__ import annotations

import argparse
import contextlib
import http.client
import json
import random
import shlex
import socket
import statistics
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


DEFAULT_MAP_URL = "https://download.geofabrik.de/europe/monaco-latest.osm.pbf"
DEFAULT_SCENARIOS = ("full-stack", "http-only")
DEFAULT_CONCURRENCY_LEVELS = (4, 8, 16, 32)
DEFAULT_WARMUP_SECONDS = 10
DEFAULT_DURATION_SECONDS = 60
DEFAULT_REPEATS = 3
DEFAULT_TIMEOUT_SECONDS = 1800


@dataclass(frozen=True)
class ImplementationConfig:
    name: str
    ref: str
    compose_file_rel: Path
    env_file_rel: Path
    api_service: str
    api_port_key: str
    osrm_host_port_key: str | None
    stub_override_rel: Path


class CommandError(RuntimeError):
    """Raised when an external command fails."""


class DockerStatsSampler:
    def __init__(
        self,
        *,
        docker_bin: str,
        container_ids: list[str],
        interval_seconds: float = 1.0,
    ) -> None:
        self._docker_bin = docker_bin
        self._container_ids = container_ids
        self._interval_seconds = interval_seconds
        self._cpu_samples: list[float] = []
        self._memory_samples: list[float] = []
        self._sample_errors: list[str] = []
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> dict:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=5)
        return {
            "sample_count": len(self._cpu_samples),
            "sample_errors": list(self._sample_errors),
            "cpu_pct": {
                "avg": mean_or_none(self._cpu_samples),
                "p95": percentile_or_none(self._cpu_samples, 0.95),
            },
            "memory_bytes": {
                "avg": mean_or_none(self._memory_samples),
                "p95": percentile_or_none(self._memory_samples, 0.95),
            },
        }

    def _run(self) -> None:
        while not self._stop.is_set():
            started = time.monotonic()
            try:
                cpu_total, memory_total = sample_container_totals(
                    self._docker_bin, self._container_ids
                )
                self._cpu_samples.append(cpu_total)
                self._memory_samples.append(memory_total)
            except Exception as exc:  # pragma: no cover - defensive telemetry
                self._sample_errors.append(type(exc).__name__)

            elapsed = time.monotonic() - started
            remaining = self._interval_seconds - elapsed
            if remaining > 0:
                self._stop.wait(timeout=remaining)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Benchmark Python (origin/main) vs C++ (HEAD) for optimize API."
    )
    parser.add_argument(
        "--python-ref",
        default="origin/main",
        help="Git ref for Python implementation worktree.",
    )
    parser.add_argument(
        "--cpp-ref",
        default="HEAD",
        help="Git ref for C++ implementation worktree.",
    )
    parser.add_argument(
        "--scenario",
        action="append",
        choices=DEFAULT_SCENARIOS,
        default=None,
        help="Benchmark scenario. Repeat flag to select multiple scenarios.",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        action="append",
        default=None,
        help="Concurrency level. Repeat for matrix.",
    )
    parser.add_argument(
        "--warmup-seconds",
        type=int,
        default=DEFAULT_WARMUP_SECONDS,
        help="Warmup duration per run.",
    )
    parser.add_argument(
        "--duration-seconds",
        type=int,
        default=DEFAULT_DURATION_SECONDS,
        help="Measured duration per run.",
    )
    parser.add_argument(
        "--repeats",
        type=int,
        default=DEFAULT_REPEATS,
        help="Repetitions per scenario/concurrency.",
    )
    parser.add_argument(
        "--map-url",
        default=DEFAULT_MAP_URL,
        help="OSRM PBF URL applied to both implementations.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Output directory (defaults to benchmarks/reports/<timestamp>).",
    )
    parser.add_argument(
        "--docker-bin",
        default="docker",
        help="Docker binary path/name.",
    )
    parser.add_argument(
        "--keep-worktrees",
        action="store_true",
        help="Do not remove temporary .bench-worktrees after completion.",
    )
    return parser.parse_args()


def run_cmd(
    args: list[str],
    *,
    cwd: Path,
    capture_output: bool = False,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    process = subprocess.run(
        args,
        cwd=str(cwd),
        text=True,
        capture_output=capture_output,
        check=False,
    )
    if check and process.returncode != 0:
        message = "command failed: " + " ".join(shlex.quote(token) for token in args)
        if process.stdout:
            message += f"\nstdout:\n{process.stdout.strip()}"
        if process.stderr:
            message += f"\nstderr:\n{process.stderr.strip()}"
        raise CommandError(message)
    return process


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return int(sock.getsockname()[1])


def parse_env_file(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key] = value
    return env


def write_env_file(path: Path, values: dict[str, str]) -> None:
    lines = [f"{key}={value}" for key, value in sorted(values.items())]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_percent(raw: str) -> float:
    value = raw.strip()
    if value.endswith("%"):
        value = value[:-1]
    return float(value)


def parse_size_to_bytes(raw: str) -> float:
    token = raw.strip().split(" ")[0]
    number = ""
    unit = ""
    for char in token:
        if char.isdigit() or char == ".":
            number += char
        else:
            unit += char

    if not number:
        return 0.0

    magnitude = float(number)
    normalized_unit = unit.strip()
    if not normalized_unit:
        return magnitude

    factors = {
        "B": 1.0,
        "KB": 1_000.0,
        "MB": 1_000_000.0,
        "GB": 1_000_000_000.0,
        "TB": 1_000_000_000_000.0,
        "KIB": 1024.0,
        "MIB": 1024.0**2,
        "GIB": 1024.0**3,
        "TIB": 1024.0**4,
    }

    factor = factors.get(normalized_unit.upper())
    if factor is None:
        return magnitude
    return magnitude * factor


def sample_container_totals(
    docker_bin: str, container_ids: list[str]
) -> tuple[float, float]:
    if not container_ids:
        return (0.0, 0.0)

    cmd = [
        docker_bin,
        "stats",
        "--no-stream",
        "--format",
        "{{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}",
    ]
    cmd.extend(container_ids)
    output = run_cmd(
        cmd, cwd=Path(__file__).resolve().parents[1], capture_output=True
    ).stdout

    cpu_total = 0.0
    mem_total = 0.0
    for raw_line in output.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue

        cpu_total += parse_percent(parts[1])
        usage = parts[2].split("/")[0].strip()
        mem_total += parse_size_to_bytes(usage)

    return (cpu_total, mem_total)


def percentile_or_none(values: Iterable[float], quantile: float) -> float | None:
    ordered = sorted(values)
    if not ordered:
        return None
    if len(ordered) == 1:
        return ordered[0]

    index = (len(ordered) - 1) * quantile
    lower = int(index)
    upper = min(lower + 1, len(ordered) - 1)
    if lower == upper:
        return ordered[lower]

    ratio = index - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * ratio


def mean_or_none(values: Iterable[float]) -> float | None:
    items = list(values)
    if not items:
        return None
    return sum(items) / len(items)


def median_or_none(values: Iterable[float | int | None]) -> float | None:
    candidates = [float(value) for value in values if isinstance(value, (int, float))]
    if not candidates:
        return None
    return float(statistics.median(candidates))


def create_worktree(repo_root: Path, ref: str, name: str) -> Path:
    bench_root = repo_root / ".bench-worktrees"
    bench_root.mkdir(parents=True, exist_ok=True)
    worktree_path = bench_root / name

    if worktree_path.exists():
        run_cmd(
            ["git", "worktree", "remove", "--force", str(worktree_path)],
            cwd=repo_root,
            check=False,
        )

    run_cmd(
        ["git", "worktree", "add", "--detach", str(worktree_path), ref], cwd=repo_root
    )
    return worktree_path


def remove_worktree(repo_root: Path, path: Path) -> None:
    run_cmd(
        ["git", "worktree", "remove", "--force", str(path)], cwd=repo_root, check=False
    )


def compose_base_cmd(
    docker_bin: str,
    project_name: str,
    env_file: Path,
    compose_files: list[Path],
) -> list[str]:
    cmd = [docker_bin, "compose", "-p", project_name, "--env-file", str(env_file)]
    for compose_file in compose_files:
        cmd.extend(["-f", str(compose_file)])
    return cmd


def compose_up(
    *,
    docker_bin: str,
    repo_root: Path,
    project_name: str,
    env_file: Path,
    compose_files: list[Path],
    api_service: str,
) -> None:
    cmd = compose_base_cmd(docker_bin, project_name, env_file, compose_files)
    cmd.extend(["up", "-d", "--build", "osrm", api_service])
    run_cmd(cmd, cwd=repo_root)


def compose_down(
    *,
    docker_bin: str,
    repo_root: Path,
    project_name: str,
    env_file: Path,
    compose_files: list[Path],
) -> None:
    cmd = compose_base_cmd(docker_bin, project_name, env_file, compose_files)
    cmd.extend(["down", "--volumes", "--remove-orphans"])
    run_cmd(cmd, cwd=repo_root, check=False)


def compose_container_ids(
    *,
    docker_bin: str,
    repo_root: Path,
    project_name: str,
    env_file: Path,
    compose_files: list[Path],
) -> list[str]:
    cmd = compose_base_cmd(docker_bin, project_name, env_file, compose_files)
    cmd.extend(["ps", "-q"])
    output = run_cmd(cmd, cwd=repo_root, capture_output=True).stdout
    return [line.strip() for line in output.splitlines() if line.strip()]


def wait_for_stack(
    *,
    api_port: int,
    payload_bytes: bytes,
    timeout_seconds: int,
) -> None:
    start = time.monotonic()
    health_seen = False

    while time.monotonic() - start <= timeout_seconds:
        conn: http.client.HTTPConnection | None = None
        try:
            conn = http.client.HTTPConnection("127.0.0.1", api_port, timeout=5)
            conn.request("GET", "/health")
            response = conn.getresponse()
            response.read()
            if response.status in {200, 503}:
                health_seen = True
        except Exception:
            health_seen = False
        finally:
            with contextlib.suppress(Exception):
                if conn is not None:
                    conn.close()

        if health_seen:
            conn = None
            try:
                conn = http.client.HTTPConnection("127.0.0.1", api_port, timeout=10)
                conn.request(
                    "POST",
                    "/api/v1/deliveries/optimize",
                    body=payload_bytes,
                    headers={"Content-Type": "application/json"},
                )
                response = conn.getresponse()
                body = response.read()
                if response.status == 200:
                    parsed = json.loads(body.decode("utf-8"))
                    if parsed.get("status") == "ok":
                        return
            except Exception:
                pass
            finally:
                with contextlib.suppress(Exception):
                    if conn is not None:
                        conn.close()

        time.sleep(2)

    raise RuntimeError(
        f"Timed out waiting for stack on port {api_port} (timeout={timeout_seconds}s)."
    )


def run_load(
    *,
    script_path: Path,
    base_url: str,
    implementation_label: str,
    concurrency: int,
    warmup_seconds: int,
    duration_seconds: int,
    output_path: Path,
) -> dict:
    cmd = [
        sys.executable,
        str(script_path),
        "--implementation",
        implementation_label,
        "--base-url",
        base_url,
        "--concurrency",
        str(concurrency),
        "--warmup-seconds",
        str(warmup_seconds),
        "--duration-seconds",
        str(duration_seconds),
        "--validate-response-status-field",
        "--output",
        str(output_path),
    ]
    run_cmd(cmd, cwd=script_path.parent.parent)
    return json.loads(output_path.read_text(encoding="utf-8"))


def aggregate_by_concurrency(entries: list[dict]) -> list[dict]:
    grouped: dict[int, list[dict]] = {}
    for entry in entries:
        grouped.setdefault(int(entry["concurrency"]), []).append(entry)

    aggregated_runs = []
    for concurrency in sorted(grouped):
        values = grouped[concurrency]
        aggregated_runs.append(
            {
                "concurrency": concurrency,
                "throughput_rps_total": median_or_none(
                    value.get("throughput_rps_total") for value in values
                ),
                "throughput_rps_success": median_or_none(
                    value.get("throughput_rps_success") for value in values
                ),
                "error_rate": median_or_none(
                    value.get("error_rate") for value in values
                ),
                "success_latency_ms": {
                    "p50": median_or_none(
                        value.get("success_latency_ms", {}).get("p50")
                        for value in values
                    ),
                    "p90": median_or_none(
                        value.get("success_latency_ms", {}).get("p90")
                        for value in values
                    ),
                    "p95": median_or_none(
                        value.get("success_latency_ms", {}).get("p95")
                        for value in values
                    ),
                    "p99": median_or_none(
                        value.get("success_latency_ms", {}).get("p99")
                        for value in values
                    ),
                },
                "resource_usage": {
                    "cpu_pct": {
                        "avg": median_or_none(
                            value.get("resource_usage", {})
                            .get("cpu_pct", {})
                            .get("avg")
                            for value in values
                        ),
                        "p95": median_or_none(
                            value.get("resource_usage", {})
                            .get("cpu_pct", {})
                            .get("p95")
                            for value in values
                        ),
                    },
                    "memory_bytes": {
                        "avg": median_or_none(
                            value.get("resource_usage", {})
                            .get("memory_bytes", {})
                            .get("avg")
                            for value in values
                        ),
                        "p95": median_or_none(
                            value.get("resource_usage", {})
                            .get("memory_bytes", {})
                            .get("p95")
                            for value in values
                        ),
                    },
                },
            }
        )

    return aggregated_runs


def format_pct(value: float | None) -> str:
    if value is None:
        return "n/a"
    return f"{value:+.2f}%"


def format_error_pp(value: float | None) -> str:
    if value is None:
        return "n/a"
    return f"{value:+.3f}pp"


def render_markdown_summary(comparison: dict) -> str:
    lines: list[str] = []
    lines.append("# Python vs C++ Benchmark")
    lines.append("")
    lines.append(
        f"Generated at: {comparison['generated_at']} (python_ref={comparison['python_ref']}, cpp_ref={comparison['cpp_ref']})"
    )
    lines.append("")

    for scenario, report in comparison["scenarios"].items():
        lines.append(f"## Scenario: {scenario}")
        lines.append("")
        lines.append(
            "| Concurrency | success_rps_delta_pct | p95_latency_improvement_pct | error_rate_delta_pp | cpu_avg_delta_pct | cpu_p95_delta_pct | mem_avg_delta_pct | mem_p95_delta_pct |"
        )
        lines.append("|---:|---:|---:|---:|---:|---:|---:|---:|")

        for row in report.get("rows", []):
            lines.append(
                "| {c} | {rps} | {lat} | {err} | {cpu_avg} | {cpu_p95} | {mem_avg} | {mem_p95} |".format(
                    c=row.get("concurrency", "n/a"),
                    rps=format_pct(row.get("success_rps_delta_pct")),
                    lat=format_pct(row.get("p95_latency_improvement_pct")),
                    err=format_error_pp(row.get("error_rate_delta_pp")),
                    cpu_avg=format_pct(row.get("cpu_avg_delta_pct")),
                    cpu_p95=format_pct(row.get("cpu_p95_delta_pct")),
                    mem_avg=format_pct(row.get("mem_avg_delta_pct")),
                    mem_p95=format_pct(row.get("mem_p95_delta_pct")),
                )
            )

        lines.append("")

    return "\n".join(lines) + "\n"


def main() -> int:
    args = parse_args()
    if args.warmup_seconds < 0:
        raise ValueError("--warmup-seconds must be >= 0")
    if args.duration_seconds <= 0:
        raise ValueError("--duration-seconds must be > 0")
    if args.repeats <= 0:
        raise ValueError("--repeats must be > 0")

    scenarios = args.scenario or list(DEFAULT_SCENARIOS)
    concurrency_levels = args.concurrency or list(DEFAULT_CONCURRENCY_LEVELS)
    if any(level <= 0 for level in concurrency_levels):
        raise ValueError("--concurrency values must be positive")

    repo_root = Path(__file__).resolve().parents[1]
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_dir = (
        args.output_dir.resolve()
        if args.output_dir
        else (repo_root / "benchmarks" / "reports" / timestamp)
    )
    raw_dir = output_dir / "raw"
    intermediate_dir = output_dir / "intermediate"
    tmp_dir = output_dir / "tmp"
    raw_dir.mkdir(parents=True, exist_ok=True)
    intermediate_dir.mkdir(parents=True, exist_ok=True)
    tmp_dir.mkdir(parents=True, exist_ok=True)

    default_payload_path = repo_root / "benchmarks" / "default_optimize_payload.json"
    payload_bytes = default_payload_path.read_bytes()

    implementations = {
        "python": ImplementationConfig(
            name="python",
            ref=args.python_ref,
            compose_file_rel=Path("infra/compose/routing.compose.yml"),
            env_file_rel=Path("infra/env/routing.env"),
            api_service="deliveryoptimizer-api",
            api_port_key="OSRM_PUBLIC_PORT",
            osrm_host_port_key=None,
            stub_override_rel=Path("benchmarks/compose/python.vroom-stub.override.yml"),
        ),
        "cpp": ImplementationConfig(
            name="cpp",
            ref=args.cpp_ref,
            compose_file_rel=Path("deploy/compose/docker-compose.arm64.yml"),
            env_file_rel=Path("deploy/env/http-server.arm64.env"),
            api_service="http-server",
            api_port_key="DELIVERYOPTIMIZER_HOST_PORT",
            osrm_host_port_key="DELIVERYOPTIMIZER_OSRM_HOST_PORT",
            stub_override_rel=Path("benchmarks/compose/cpp.vroom-stub.override.yml"),
        ),
    }

    worktrees: dict[str, Path] = {}
    aggregated: dict[str, dict[str, list[dict]]] = {"python": {}, "cpp": {}}

    try:
        worktrees["python"] = create_worktree(
            repo_root, implementations["python"].ref, "python"
        )
        worktrees["cpp"] = create_worktree(repo_root, implementations["cpp"].ref, "cpp")

        for implementation_name, implementation in implementations.items():
            worktree_root = worktrees[implementation_name]
            compose_file = worktree_root / implementation.compose_file_rel
            env_base_file = worktree_root / implementation.env_file_rel

            if not compose_file.exists():
                raise FileNotFoundError(f"compose file not found: {compose_file}")
            if not env_base_file.exists():
                raise FileNotFoundError(f"env file not found: {env_base_file}")

            for scenario in scenarios:
                composed_files = [compose_file]
                if scenario == "http-only":
                    composed_files.append(repo_root / implementation.stub_override_rel)

                base_env = parse_env_file(env_base_file)
                api_port = find_free_port()
                env_overrides = {
                    implementation.api_port_key: str(api_port),
                    "OSRM_PBF_URL": args.map_url,
                    "BENCH_VROOM_STUB_HOST_PATH": str(
                        (repo_root / "benchmarks" / "stubs" / "vroom_stub.sh").resolve()
                    ),
                }
                if implementation.osrm_host_port_key:
                    env_overrides[implementation.osrm_host_port_key] = str(
                        find_free_port()
                    )

                scenario_env = {**base_env, **env_overrides}
                env_file = tmp_dir / f"{implementation_name}-{scenario}.env"
                write_env_file(env_file, scenario_env)

                project_name = f"bench-{implementation_name}-{scenario.replace('-', '')}-{int(time.time())}-{random.randint(1000, 9999)}"

                scenario_entries: list[dict] = []
                print(
                    f"[{implementation_name}:{scenario}] starting stack (project={project_name}, api_port={api_port})"
                )
                try:
                    compose_up(
                        docker_bin=args.docker_bin,
                        repo_root=repo_root,
                        project_name=project_name,
                        env_file=env_file,
                        compose_files=composed_files,
                        api_service=implementation.api_service,
                    )
                    wait_for_stack(
                        api_port=api_port,
                        payload_bytes=payload_bytes,
                        timeout_seconds=DEFAULT_TIMEOUT_SECONDS,
                    )

                    container_ids = compose_container_ids(
                        docker_bin=args.docker_bin,
                        repo_root=repo_root,
                        project_name=project_name,
                        env_file=env_file,
                        compose_files=composed_files,
                    )
                    if not container_ids:
                        raise RuntimeError(
                            f"No running containers detected for project {project_name}."
                        )

                    for repeat_index in range(1, args.repeats + 1):
                        for concurrency in concurrency_levels:
                            run_basename = f"{implementation_name}-{scenario}-c{concurrency}-r{repeat_index}"
                            load_output = raw_dir / f"{run_basename}-load.json"
                            run_output = raw_dir / f"{run_basename}.json"
                            base_url = f"http://127.0.0.1:{api_port}"

                            sampler = DockerStatsSampler(
                                docker_bin=args.docker_bin,
                                container_ids=container_ids,
                                interval_seconds=1.0,
                            )
                            sampler.start()
                            try:
                                load_report = run_load(
                                    script_path=repo_root
                                    / "benchmarks"
                                    / "load_optimize.py",
                                    base_url=base_url,
                                    implementation_label=implementation_name,
                                    concurrency=concurrency,
                                    warmup_seconds=args.warmup_seconds,
                                    duration_seconds=args.duration_seconds,
                                    output_path=load_output,
                                )
                            finally:
                                resource_usage = sampler.stop()

                            runs = load_report.get("runs", [])
                            if len(runs) != 1:
                                raise RuntimeError(
                                    f"Expected single run summary, got {len(runs)} in {load_output}"
                                )

                            run_summary = runs[0]
                            merged = {
                                "implementation": implementation_name,
                                "scenario": scenario,
                                "repeat": repeat_index,
                                "concurrency": concurrency,
                                "run_summary": run_summary,
                                "resource_usage": resource_usage,
                            }
                            run_output.write_text(
                                json.dumps(merged, indent=2) + "\n", encoding="utf-8"
                            )

                            scenario_entries.append(
                                {
                                    "concurrency": concurrency,
                                    "throughput_rps_total": run_summary.get(
                                        "throughput_rps_total"
                                    ),
                                    "throughput_rps_success": run_summary.get(
                                        "throughput_rps_success"
                                    ),
                                    "error_rate": run_summary.get("error_rate"),
                                    "success_latency_ms": run_summary.get(
                                        "success_latency_ms", {}
                                    ),
                                    "resource_usage": resource_usage,
                                }
                            )
                            print(
                                f"[{implementation_name}:{scenario}] repeat={repeat_index} concurrency={concurrency} done"
                            )
                finally:
                    compose_down(
                        docker_bin=args.docker_bin,
                        repo_root=repo_root,
                        project_name=project_name,
                        env_file=env_file,
                        compose_files=composed_files,
                    )

                aggregated_runs = aggregate_by_concurrency(scenario_entries)
                aggregated[implementation_name][scenario] = aggregated_runs

        aggregated_payload = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "python_ref": args.python_ref,
            "cpp_ref": args.cpp_ref,
            "benchmark": {
                "scenarios": scenarios,
                "concurrency_levels": concurrency_levels,
                "warmup_seconds": args.warmup_seconds,
                "duration_seconds": args.duration_seconds,
                "repeats": args.repeats,
                "map_url": args.map_url,
            },
            "implementations": {
                "python": aggregated["python"],
                "cpp": aggregated["cpp"],
            },
        }
        aggregated_path = output_dir / "aggregated.json"
        aggregated_path.write_text(
            json.dumps(aggregated_payload, indent=2) + "\n", encoding="utf-8"
        )

        comparison_by_scenario: dict[str, dict] = {}
        for scenario in scenarios:
            baseline_path = intermediate_dir / f"python-{scenario}.json"
            candidate_path = intermediate_dir / f"cpp-{scenario}.json"
            scenario_comparison_path = intermediate_dir / f"comparison-{scenario}.json"

            baseline_path.write_text(
                json.dumps(
                    {
                        "implementation": "python",
                        "scenario": scenario,
                        "runs": aggregated["python"].get(scenario, []),
                    },
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )
            candidate_path.write_text(
                json.dumps(
                    {
                        "implementation": "cpp",
                        "scenario": scenario,
                        "runs": aggregated["cpp"].get(scenario, []),
                    },
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )

            run_cmd(
                [
                    sys.executable,
                    str(repo_root / "benchmarks" / "compare_reports.py"),
                    "--baseline",
                    str(baseline_path),
                    "--candidate",
                    str(candidate_path),
                    "--scenario",
                    scenario,
                    "--output",
                    str(scenario_comparison_path),
                ],
                cwd=repo_root,
            )

            comparison_by_scenario[scenario] = json.loads(
                scenario_comparison_path.read_text(encoding="utf-8")
            )

        final_comparison = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "python_ref": args.python_ref,
            "cpp_ref": args.cpp_ref,
            "scenarios": comparison_by_scenario,
        }
        final_json_path = output_dir / "python-vs-cpp.json"
        final_json_path.write_text(
            json.dumps(final_comparison, indent=2) + "\n", encoding="utf-8"
        )

        final_md_path = output_dir / "python-vs-cpp.md"
        final_md_path.write_text(
            render_markdown_summary(final_comparison), encoding="utf-8"
        )

        print(f"wrote aggregated report: {aggregated_path}")
        print(f"wrote comparison json: {final_json_path}")
        print(f"wrote comparison markdown: {final_md_path}")

    finally:
        if not args.keep_worktrees:
            for worktree in worktrees.values():
                remove_worktree(repo_root, worktree)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
