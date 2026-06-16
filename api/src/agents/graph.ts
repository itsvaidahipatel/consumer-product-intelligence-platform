/**
 * Multi-agent coordinator (LangGraph-style linear graph).
 * Nodes map to spec agents; orchestrated by analyze-orchestrator.ts.
 */
export type AgentState = {
  phase:
    | "extraction"
    | "research"
    | "regulatory"
    | "risk"
    | "recommendation"
    | "fact_check"
    | "done";
};

export const AGENT_PIPELINE: AgentState["phase"][] = [
  "extraction",
  "research",
  "regulatory",
  "risk",
  "recommendation",
  "fact_check",
  "done",
];
