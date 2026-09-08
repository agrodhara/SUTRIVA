from pydantic import BaseModel, Field
from typing import List, Literal, Optional


class DatasetSpec(BaseModel):
    name: str
    source_type: Literal["synthetic", "public", "partner", "internal"]
    contains_real_customer_data: bool = False
    allowed_for_ai_prompts: bool = False
    notes: str = ""


class ModelSpec(BaseModel):
    name: str
    family: Literal["aggregate", "embedding", "sequence", "hybrid", "graph"]
    target: str
    observation_window: str
    performance_window: str
    metrics: List[str] = Field(default_factory=lambda: ["auc", "ks", "gini", "calibration"])


class ExperimentConfig(BaseModel):
    experiment_id: str
    paper_alignment: str
    dataset: DatasetSpec
    model: ModelSpec
    leakage_controls: List[str]
    governance_notes: Optional[str] = None
