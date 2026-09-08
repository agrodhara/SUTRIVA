from __future__ import annotations

import ast
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional


class UnsafeExpressionError(ValueError):
    pass


ALLOWED_AST_NODES = (
    ast.Expression,
    ast.BoolOp,
    ast.BinOp,
    ast.UnaryOp,
    ast.Compare,
    ast.Name,
    ast.Load,
    ast.Constant,
    ast.And,
    ast.Or,
    ast.Not,
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.Mod,
    ast.Pow,
    ast.USub,
    ast.Eq,
    ast.NotEq,
    ast.Lt,
    ast.LtE,
    ast.Gt,
    ast.GtE,
)


@dataclass(frozen=True)
class DecisionResult:
    policy_version: str
    decision: str
    reason_codes: List[str]
    fired_rules: List[str]
    explanation: str
    inputs_used: Dict[str, Any]


class SafeExpressionEvaluator:
    """Small safe expression evaluator for numeric/boolean rule conditions.

    This intentionally supports only arithmetic, comparisons and boolean operations.
    It does not allow function calls, attributes, indexing, imports or comprehensions.
    """

    def __init__(self, variables: Dict[str, Any]):
        self.variables = variables

    def validate(self, expression: str) -> ast.Expression:
        tree = ast.parse(expression, mode="eval")
        for node in ast.walk(tree):
            if not isinstance(node, ALLOWED_AST_NODES):
                raise UnsafeExpressionError(f"Unsupported expression element: {type(node).__name__}")
            if isinstance(node, ast.Name) and node.id not in self.variables:
                raise UnsafeExpressionError(f"Unknown variable in rule expression: {node.id}")
        return tree

    def evaluate(self, expression: str) -> bool:
        tree = self.validate(expression)
        compiled = compile(tree, "<rule_expression>", "eval")
        return bool(eval(compiled, {"__builtins__": {}}, dict(self.variables)))


class DecisionEngine:
    def __init__(self, policy: Dict[str, Any]):
        self.policy = policy
        self.policy_version = str(policy["policy_version"])
        self.rules = list(policy.get("rules", []))

    @classmethod
    def from_json_file(cls, path: str | Path) -> "DecisionEngine":
        return cls(json.loads(Path(path).read_text()))

    def evaluate(self, inputs: Dict[str, Any]) -> DecisionResult:
        evaluator = SafeExpressionEvaluator(inputs)
        fired_rules: List[str] = []
        reason_codes: List[str] = []
        decisions: List[str] = []
        explanations: List[str] = []

        for rule in self.rules:
            if evaluator.evaluate(rule["condition"]):
                fired_rules.append(rule["rule_id"])
                reason_codes.append(rule["reason_code"])
                decisions.append(rule["outcome"])
                explanations.append(rule.get("explanation", rule["reason_code"]))

        final_decision = self._resolve_decision(decisions)
        explanation = " | ".join(explanations) if explanations else self.policy.get(
            "default_explanation", "No risk or affordability constraint triggered."
        )

        return DecisionResult(
            policy_version=self.policy_version,
            decision=final_decision,
            reason_codes=reason_codes,
            fired_rules=fired_rules,
            explanation=explanation,
            inputs_used=inputs,
        )

    def _resolve_decision(self, decisions: List[str]) -> str:
        priority = self.policy.get("decision_priority", ["DECLINE", "REDUCE", "CAUTION", "OK"])
        if not decisions:
            return self.policy.get("default_decision", "OK")
        priority_index = {decision: idx for idx, decision in enumerate(priority)}
        return sorted(decisions, key=lambda d: priority_index.get(d, 999))[0]
