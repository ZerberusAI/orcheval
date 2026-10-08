# Simple five-dimension evaluation

Use `simple-run` with a JSON manifest. An adapter exports `evaluate()` and returns one framework's evidence for reliability, security, performance, cost, and governance/scalability. Reliability and security must both pass before a framework is admissible; no weighted score can override them.

Create a new adapter by copying `adapters/simple/contract-baseline.ts`, replacing every `NOT_VALIDATED` result with captured evidence, and adding its path to the manifest. Results are written as JSON plus a board-readable Markdown table.
