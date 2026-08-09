# PR Stack — Allocation Reduction Work

This branch (`feat/alloc-optimizations`) is the **source of truth** for the
allocation-reduction work. Its history is a linear stack of five coherent PRs.
Each PR branch points at one commit in this stack; open the PRs in order and use
the previous PR branch as the base (or retarget to `main` after the previous PR
merges).

## Branch map

| Order | Branch | Base for PR | Contents | Measured effect |
|---|---|---|---|---|
| 1 | `pr/1-bench-harness` | `main` | Allocation-counting benchmark harness (`bench/`, `DELIVERYOPTIMIZER_ENABLE_BENCHMARKS`) + test link-order fix | measurement tooling |
| 2 | `pr/2-request-log-parse` | `pr/1-bench-harness` | Reusable `thread_local` JSON reader, direct log-line rendering, one-time header/attribute key strings, OSRM path reserve | −16 allocs/parse, log 32→1, request context 12→6 |
| 3 | `pr/3-payload-text` | `pr/2-request-log-parse` | `BuildVroomInputText` direct text renderer; runner/coordinator payload interface becomes text; weather-adjusted text variant; lean spawn argv | 40 130→2 allocs, −3.04 MB, −95% time per payload |
| 4 | `pr/4-output-moves` | `pr/3-payload-text` | Move the vroom output tree end-to-end (`ToCoordinatedSolveResult&&`, `BuildOptimizeSuccessBody` by value, worker-loop move), id maps → vector lookup, drogon move overloads | to-coordinated −50%, success-body −55%, worker-flow −75% |
| 5 | `pr/5-endpoint-rework` | `pr/4-output-moves` | Per-request `SyncSolveContext` so every std::function capture is one 16-byte pointer (SBO), store raw request body for async jobs, response moves in the jobs endpoint | closures 5→0 allocs; one context per request |

`feat/alloc-optimizations` = `pr/5-endpoint-rework` + this doc and the final
report (`docs/allocation-optimizations.md`).

## How to open the PRs

For each branch, create a PR whose **base branch is the previous PR branch**
(not `main`):

```sh
gh pr create --base main --head pr/1-bench-harness
gh pr create --base pr/1-bench-harness --head pr/2-request-log-parse
gh pr create --base pr/2-request-log-parse --head pr/3-payload-text
gh pr create --base pr/3-payload-text --head pr/4-output-moves
gh pr create --base pr/4-output-moves --head pr/5-endpoint-rework
```

Merge in order 1 → 5. After each merge, retarget the next PR's base to `main`.
Alternatively merge the stack by merging `feat/alloc-optimizations` (squash) —
the history is already ordered so a normal merge of the five branches produces
the same tree.

## Why this order

1. **Harness first** — every later PR's numbers come from the benchmark.
2. **Cheap, isolated wins** — no interface changes, trivial to review.
3. **Payload as text** — the largest single allocation reduction; changes the
   runner/coordinator interfaces that later PRs build on.
4. **Move the output tree** — builds on the text interface (both endpoints and
   the worker already call the text builders) and changes result ownership.
5. **Endpoint request-scope rework** — touches only the endpoint files, so it
   is the natural final slice; also carries the PR-stack doc.

## Deliberately excluded

- P0-7 (lazy validation field names): implemented, then **scrapped** after
  measurement showed 0 allocations saved — libc++'s 22-byte SSO absorbs
  `"vehicles[12]"`/`"jobs[999]"` at the 10k/2k limits.
- `tests/CMakeLists.txt` link reorder is included in PR 1: the test binary
  could not link at all in this environment (boost's `unit_test_main` resolved
  `main` before gtest_main) — unrelated to allocations but required to run the
  suite.

## Verification

Each branch in the stack compiles and passes the unit suite:

```sh
cmake -S . -B build/build/Release -DDELIVERYOPTIMIZER_ENABLE_BENCHMARKS=ON
cmake --build build/build/Release --target deliveryoptimizer_tests deliveryoptimizer_alloc_bench
./build/build/Release/tests/deliveryoptimizer_tests
./build/build/Release/bench/deliveryoptimizer_alloc_bench
```

Final state also verified under ASAN+UBSAN (78/78 pass).
