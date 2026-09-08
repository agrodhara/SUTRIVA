# ADR 0001: GitHub-first build system

## Status
Accepted

## Context
The product cannot be built ad hoc across disconnected AI workspaces. GitHub must be the system of record for code, requirements, architecture, rules, tests and decision logs.

## Decision
Use GitHub as the source of truth. Claude Code and Codex may generate and review code, but all changes must land through Git commits, pull requests and tests.

## Consequences
- Every meaningful rule or architecture change has a trace
- AI-generated code is reviewable
- Product and engineering drift is reduced
