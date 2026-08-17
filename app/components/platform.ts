"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ViewId =
  | "guardrail"
  | "guardrail-assets"
  | "guardrail-eval"
  | "command"
  | "agent"
  | "analysis"
  | "evidence"
  | "evolution"
  | "review"
  | "guard"
  | "assets"
  | "integrations";

export type ServiceStatus = "未检测" | "检测中" | "已连接" | "未连接";
export type BackendProfile = "fallback" | "api" | "model-services" | "local-transformers";

export type RunStep = {
  index: number;
  action: string;
  ok: boolean;
  message: string;
};

export type EvaluationRun = {
  run_id: string;
  name: string;
  mode: "evaluation" | "cycle";
  status: "queued" | "running" | "completed" | "failed";
  dataset_source: string;
  planner_backend: BackendProfile;
  red_backend: BackendProfile;
  blue_backend: BackendProfile;
  evaluator_backend: BackendProfile;
  limit_count: number;
  max_steps: number;
  started_at: string | null;
  completed_at: string | null;
  final_message: string | null;
  error_message: string | null;
  steps: RunStep[];
  outcome_summary: {
    goal_satisfied?: boolean;
    seed_count?: number;
    attack_count?: number;
    attack_success?: number;
    defense_success?: number;
    evolved_attack_success?: number;
    blue_evolution_success?: number;
    active_blue_detector_version?: string;
    case_evolution_complete?: boolean;
    missing_response?: number;
    missing_eval?: number;
    latest_generation?: number;
  };
  created_at: string;
  updated_at: string;
};

export type TraceRow = {
  data_id: string;
  run_id: string | null;
  source: string;
  source_id: string;
  seed_prompt: string;
  wrapped_prompt: string;
  strategy: string;
  response: string | null;
  generation: number;
  blue_is_attack: boolean | null;
  blue_category: string | null;
  blue_reason: string | null;
  blue_confidence: number | null;
  blue_detector_version_id?: string | null;
  eval_result: string | null;
  eval_reason: string | null;
  eval_confidence: number | null;
  intent_preserved: boolean | null;
  review_verdict: string | null;
  review_note?: string | null;
  reviewer?: string | null;
  reviewed_at?: string | null;
  updated_at: string;
};

export type DatasetRow = {
  name: string;
  type: string;
  path: string;
  seed_count: number;
  run_count: number;
  available: boolean;
  readiness_reason: string;
};

export type AnalyticsBreakdown = {
  total: number;
  attack_total?: number;
  attack_success: number;
  defense_success: number;
  invalid: number;
  control_pass: number;
  control_false_positive: number;
  pending: number;
};

export type RunAnalytics = {
  run_id: string;
  summary: AnalyticsBreakdown & { reviewed: number };
  outcomes: Array<{ key: string; count: number; rate: number }>;
  strategies: Array<AnalyticsBreakdown & { strategy: string; attack_rate: number }>;
  generations: Array<AnalyticsBreakdown & { generation: number }>;
};

export type DetectorRow = {
  version_id: string;
  generation: number;
  parent_version_id: string | null;
  evolution_reason: string;
  model: string;
  status: string;
  is_active: number;
  created_at: string;
};

export type Capabilities = {
  offline_fallback: boolean;
  external_api: {
    configured: boolean;
    base_url: string;
    model: string;
    api_key_env: string;
  };
  local_transformers: boolean;
  huggingface_datasets: boolean;
  datasets: string[];
  model_services: Record<string, {
    configured: boolean;
    base_url: string;
    model: string;
    api_key_env: string;
  }>;
};

export type ModelServiceStatus = {
  key: "target" | "evaluator" | string;
  label: string;
  purpose: string;
  model: string;
  base_url: string;
  api_key_env: string;
  api_key_required: boolean;
  configured: boolean;
  connected: boolean;
  latency_ms: number | null;
  served_models: string[];
  error: string | null;
};

export type ModelServices = {
  items: ModelServiceStatus[];
  pipeline_ready: boolean;
};

export type ProjectState = {
  database: string;
  snapshot: {
    seed_count: number;
    attack_count: number;
    missing_response: number;
    missing_eval: number;
    active_blue_detector_version: string;
  };
  attack_report: { total: number; success: number; rate: number | null };
  pending_reviews: number;
  runs: EvaluationRun[];
};

export type GuardrailModule = {
  key: string;
  name: string;
  ready: boolean;
  mode: string;
  scope: string;
};

export type GuardrailModel = {
  name: string;
  model: string;
  purpose: string;
  path: string;
  ready: boolean;
  configured?: boolean;
  service_key?: string | null;
  endpoint?: string | null;
};

export type GuardrailDataset = {
  name: string;
  path: string;
  records: number;
  purpose: string;
  ready: boolean;
};

export type GuardrailPolicy = {
  id: string;
  title: string;
  content: string;
  source: string;
  domain: string;
  keywords: string[];
  production_ready: boolean;
  url?: string;
  issuing_authority?: string;
  legal_level?: string;
  status?: string;
};

export type GuardrailStage = {
  action: string;
  final_prompt?: string;
  final_response?: string;
  raw_response?: string;
  blocked_response?: string;
  verdict?: string;
  initial_verdict?: string;
  initial_reason?: string;
  repair_mode?: string;
  reason?: string;
  model?: string;
  source?: string;
  conclusion?: "P" | "S" | "R";
  label?: string;
  grounding?: {
    mode: "policy_evidence" | "no_evidence" | string;
    evidence_count: number;
    evidence_ids: string[];
    quality_tier?: string;
    retrieval_backend?: string;
    corrective_attempted?: boolean;
    corrective_improved?: boolean;
  };
  claims?: Array<{
    id: string;
    text: string;
    claim_type: string;
    critical: boolean;
    evidence_required: boolean;
  }>;
  evidence?: Array<{
    id: string;
    title: string;
    content: string;
    source: string;
    domain: string;
    score: number;
    url?: string;
    issuing_authority?: string;
    legal_level?: string;
    status?: string;
    vector_score?: number | null;
    rank?: number | null;
    score_type?: "rrf" | "similarity" | string;
    production_ready?: boolean;
  }>;
  details?: {
    risk_score?: number;
    risk_types?: string[];
    latency_ms?: number;
    flags?: string[];
    pii_found?: Array<{ subtype: string; text: string }>;
    judge?: {
      support_ratio?: number;
      critical_support_ratio?: number;
      required_claim_count?: number;
      advisory_claim_count?: number;
      claim_coverage?: Array<{
        claim_id: string;
        supported: boolean;
        best_evidence_id: string;
      }>;
    };
    rag?: {
      engine?: string;
      mode?: string;
      retrieval_backend?: string;
      quality_tier?: "strong" | "acceptable" | "weak" | "no_evidence" | string;
      quality_score?: number;
      coverage_status?: string;
      corrective_attempted?: boolean;
      corrective_improved?: boolean;
      gate_score?: number;
      gate_threshold?: number;
      final_status?: string;
      deliverable?: boolean;
      requires_human_review?: boolean;
      fallback_applied?: boolean;
      judge_backend?: string;
      llm_judge_available?: boolean;
      llm_judge_invoked?: boolean;
      llm_judge_reason?: string;
      topic_alignment?: {
        matched: boolean;
        topic: string;
        longest_span: number;
        required_span: number;
      };
      latency_ms?: number;
    };
  };
};

export type GuardrailCheckResult = {
  audit_id: string;
  created_at: string;
  action: string;
  final_response: string;
  requires_model: boolean;
  release_ready?: boolean;
  stages: {
    input: GuardrailStage;
    model: GuardrailStage | null;
    output: GuardrailStage | null;
    judge: GuardrailStage | null;
    fact: GuardrailStage | null;
  };
};

export type GuardrailAudit = {
  audit_id: string;
  prompt: string;
  draft_response: string;
  action: string;
  final_response: string;
  input_action: string;
  output_action: string | null;
  fact_action: string | null;
  fact_verdict: string | null;
  response_source: string;
  model_action: string | null;
  judge_action: string | null;
  release_ready: boolean;
  required_claim_count: number | null;
  supported_claim_count: number;
  support_ratio: number | null;
  critical_support_ratio: number | null;
  evidence_count: number;
  created_at: string;
  details: GuardrailCheckResult;
};

export type GuardrailBatchResult = {
  index: number;
  source_id: string;
  category: string;
  risk_type: string;
  expected: "attack" | "benign";
  prompt: string;
  action: string;
  input_action: string;
  judge_action: string;
  judge_conclusion: "P" | "S" | "R" | null;
  fact_verdict: string | null;
  support_ratio: number | null;
  release_ready: boolean;
  passed: boolean;
  latency_ms: number;
  audit_id: string | null;
  final_response: string;
  error: string | null;
};

export type GuardrailBatchRun = {
  batch_id: string;
  dataset_name: string;
  limit_count: number;
  status: "queued" | "running" | "cancel_requested" | "cancelled" | "completed" | "failed";
  completed_count: number;
  progress: number;
  results: GuardrailBatchResult[];
  summary: {
    total?: number;
    processed?: number;
    passed?: number;
    failed?: number;
    errors?: number;
    pass_rate?: number;
    released?: number;
    release_rate?: number;
    attack_total?: number;
    attack_defended?: number;
    attack_defense_rate?: number | null;
    benign_total?: number;
    benign_passed?: number;
    benign_pass_rate?: number | null;
    false_positives?: number;
    false_positive_rate?: number | null;
    average_latency_ms?: number | null;
    actions?: Record<string, number>;
    facts?: Record<string, number>;
  };
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type GuardrailOverview = {
  framework: {
    name: string;
    root: string;
    available: boolean;
    output_artifacts: number;
  };
  modules: GuardrailModule[];
  models: GuardrailModel[];
  thresholds: {
    input_rewrite: number;
    input_block: number;
    output_vector: number;
  };
  datasets: GuardrailDataset[];
  policy_count: number;
  fact_gate?: {
    enabled: boolean;
    configured: boolean;
    active: boolean;
    mode: string;
    retrieval_backend: string;
    policy_count: number;
    retrieval_chunk_count: number;
    domain_count: number;
    official_policy_count: number;
    seed_policy_count: number;
    fallback_available: boolean;
    error: string;
  };
};

export const GUARDRAIL_CATALOG: GuardrailOverview = {
  framework: { name: "政务大模型安全护栏", root: "safe_guard", available: true, output_artifacts: 0 },
  modules: [
    { key: "input", name: "输入护栏", ready: true, mode: "规则、归一化、稀疏相似度与工具检查", scope: "提示注入、越狱、系统提示词泄露和高风险工具参数" },
    { key: "output", name: "输出护栏", ready: true, mode: "隐私正则实时启用，语义与模型层待部署", scope: "手机号、邮箱、身份证号和银行卡号脱敏" },
    { key: "fact", name: "政策事实核查", ready: true, mode: "声明提取、政策检索、冲突判定与保守回退", scope: "6 条示例/测试政策证据" },
    { key: "batch", name: "批量安全评测", ready: false, mode: "数据已到位，等待目标模型和裁判模型", scope: "推理、输出护栏、裁判评分和报告四阶段" },
  ],
  models: [
    { name: "目标模型", model: "Qwen3-8B", purpose: "自动生成政务答复", path: "safe_guard/models/Qwen3-8B", ready: false },
    { name: "裁判模型", model: "TinyR1-Safety-8B", purpose: "批量评测和安全评分", path: "safe_guard/models/TinyR1-Safety-8B", ready: false },
    { name: "输出安全模型", model: "Qwen3Guard-Gen-8B", purpose: "模型级输出分类", path: "safe_guard/models/Qwen3Guard-Gen-8B", ready: false },
    { name: "语义向量模型", model: "paraphrase-multilingual-MiniLM-L12-v2", purpose: "语义黑名单匹配", path: "safe_guard/models/paraphrase-multilingual-MiniLM-L12-v2", ready: false },
  ],
  thresholds: { input_rewrite: 0.20, input_block: 0.70, output_vector: 0.85 },
  datasets: [
    ["ChineseSimpleQA_3000", 3000, "通用中文事实问答"],
    ["ChineseSimpleQA_50", 50, "通用中文事实问答"],
    ["S-Eval_attack_zh_1000", 1000, "政务安全攻击评测"],
    ["S-Eval_attack_zh_5", 5, "政务安全攻击评测"],
    ["S-Eval_attack_zh_50", 50, "政务安全攻击评测"],
    ["S-Eval_attack_zh_500", 500, "政务安全攻击评测"],
    ["S-Eval_attack_zh_full_gov", 8598, "政务安全攻击评测"],
    ["gov_trustworthy_qa_eval_5000", 5000, "政务可信问答评测"],
    ["mixed_attack50_benign50", 100, "攻击/良性混合校验"],
  ].map(([name, records, purpose]) => ({ name: String(name), records: Number(records), purpose: String(purpose), path: `safe_guard/data/input/${name}.jsonl`, ready: true })),
  policy_count: 6,
};

export type PlatformData = {
  project: ProjectState;
  runs: EvaluationRun[];
  traces: TraceRow[];
  reviews: TraceRow[];
  findings: TraceRow[];
  datasets: DatasetRow[];
  detectors: DetectorRow[];
  capabilities: Capabilities;
  modelServices: ModelServices;
  guardrail: GuardrailOverview;
  guardrailAudits: GuardrailAudit[];
  guardrailBatchRuns: GuardrailBatchRun[];
  guardrailPolicies: GuardrailPolicy[];
  loadWarnings: string[];
};

export const DEFAULT_SERVICE_URL = "http://127.0.0.1:8788";

export function endpoint(serviceUrl: string, path: string) {
  return `${serviceUrl.trim().replace(/\/$/, "")}${path}`;
}

export function isHttpsBlocked(serviceUrl: string) {
  return (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    serviceUrl.startsWith("http:")
  );
}

export async function responseError(response: Response) {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string" && body.detail.trim()) return body.detail;
    if (Array.isArray(body.detail)) {
      const messages = body.detail
        .map((item) => (item && typeof item === "object" && "msg" in item ? String(item.msg) : ""))
        .filter(Boolean);
      if (messages.length) return messages.join("；");
    }
    return `请求失败（HTTP ${response.status}）`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export function serviceErrorMessage(error: unknown, fallback = "请求失败") {
  const message = error instanceof Error ? error.message.trim() : "";
  if (/load failed|failed to fetch|network ?error|network request failed/i.test(message)) {
    return "模型服务连接已中断，计算作业可能已到期，请重新连接后再试";
  }
  return message || fallback;
}

export function formatTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function traceStatus(row: TraceRow) {
  if (!row.eval_result) return "待评测";
  if (row.eval_result === "defense_success") return "防御成功";
  if (row.eval_result === "attack_success") return "攻击成功";
  if (row.eval_result === "control_pass") return "对照通过";
  if (row.eval_result === "control_false_positive") return "对照误报";
  return "无效攻击";
}

export function statusTone(value: string) {
  if (["completed", "防御成功", "对照通过", "生效中", "已连接", "confirmed"].includes(value)) {
    return "success";
  }
  if (["failed", "攻击成功", "对照误报", "false_negative"].includes(value)) return "danger";
  if (["queued", "running", "待评测", "needs_followup"].includes(value)) {
    return "warning";
  }
  return "neutral";
}

async function loadPlatform(serviceUrl: string, previous: PlatformData | null): Promise<PlatformData> {
  type Items<T> = { items: T[] };
  const paths = [
    "/api/project-state",
    "/api/runs",
    "/api/traces?limit=1000",
    "/api/reviews?status=all&limit=1000",
    "/api/findings",
    "/api/datasets",
    "/api/detectors",
    "/api/capabilities",
    "/api/models/status",
    "/api/guardrail/overview",
    "/api/guardrail/audits",
    "/api/guardrail/batch-runs?limit=10",
    "/api/guardrail/policies",
  ];
  const labels = ["项目状态", "运行列表", "Trace", "复核队列", "风险台账", "数据集", "检测器", "运行能力", "模型状态", "护栏概览", "护栏审计", "批量任务", "政策证据"];
  const settled = await Promise.allSettled(paths.map(async (path) => {
    const response = await fetch(endpoint(serviceUrl, path), { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`${path}：${await responseError(response)}`);
    return response.json() as Promise<unknown>;
  }));
  if (settled[0].status === "rejected") throw settled[0].reason;
  const valueAt = <T,>(index: number, fallback: T): T => settled[index].status === "fulfilled" ? settled[index].value as T : fallback;
  const itemsAt = <T,>(index: number, fallback: T[] = []): Items<T> => valueAt(index, { items: fallback });
  const project = valueAt<ProjectState>(0, {} as ProjectState);
  const runs = itemsAt<EvaluationRun>(1, previous?.runs);
  const traces = itemsAt<TraceRow>(2, previous?.traces);
  const reviews = itemsAt<TraceRow>(3, previous?.reviews);
  const findings = itemsAt<TraceRow>(4, previous?.findings);
  const datasets = itemsAt<DatasetRow>(5, previous?.datasets);
  const detectors = itemsAt<DetectorRow>(6, previous?.detectors);
  const capabilities = valueAt<Capabilities>(7, previous?.capabilities ?? {
    offline_fallback: false,
    external_api: { configured: false, base_url: "", model: "", api_key_env: "" },
    local_transformers: false,
    huggingface_datasets: false,
    datasets: [],
    model_services: {},
  });
  const modelServices = valueAt<ModelServices>(8, previous?.modelServices ?? { items: [], pipeline_ready: false });
  const guardrail = valueAt<GuardrailOverview>(9, previous?.guardrail ?? GUARDRAIL_CATALOG);
  const guardrailAudits = itemsAt<GuardrailAudit>(10, previous?.guardrailAudits);
  const guardrailBatchRuns = itemsAt<GuardrailBatchRun>(11, previous?.guardrailBatchRuns);
  const guardrailPolicies = itemsAt<GuardrailPolicy>(12, previous?.guardrailPolicies);
  return {
    project,
    runs: runs.items,
    traces: traces.items,
    reviews: reviews.items,
    findings: findings.items,
    datasets: datasets.items,
    detectors: detectors.items,
    capabilities,
    modelServices,
    guardrail,
    guardrailAudits: guardrailAudits.items,
    guardrailBatchRuns: guardrailBatchRuns.items,
    guardrailPolicies: guardrailPolicies.items,
    loadWarnings: settled.flatMap((result, index) => result.status === "rejected" ? [labels[index]] : []),
  };
}

export function usePlatformConnection(
  serviceUrl: string,
  notify: (message: string) => void,
) {
  const [status, setStatus] = useState<ServiceStatus>("未检测");
  const [data, setData] = useState<PlatformData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const dataRef = useRef<PlatformData | null>(null);
  const refreshGeneration = useRef(0);

  const refresh = useCallback(
    async (silent = false) => {
      if (isHttpsBlocked(serviceUrl)) {
        refreshGeneration.current += 1;
        setStatus("未连接");
        if (!silent) notify("发布站只展示界面；真实任务请在 localhost 运行");
        return false;
      }
      const requestId = ++refreshGeneration.current;
      if (!silent) setStatus("检测中");
      try {
        const next = await loadPlatform(serviceUrl, dataRef.current);
        if (requestId !== refreshGeneration.current) return false;
        dataRef.current = next;
        setData(next);
        setStatus("已连接");
        setLastUpdated(new Date());
        if (!silent) notify(next.loadWarnings.length ? `数据已刷新，${next.loadWarnings.length} 项暂不可用` : "数据已刷新");
        return true;
      } catch {
        if (requestId !== refreshGeneration.current) return false;
        if (!dataRef.current) setData(null);
        setStatus("未连接");
        if (!silent) notify(dataRef.current ? "连接已中断，页面保留上次成功数据" : "未找到本地任务服务，请先启动服务");
        return false;
      }
    },
    [notify, serviceUrl],
  );

  useEffect(() => {
    if (typeof window === "undefined" || window.location.protocol !== "http:") return;
    const initialCheck = window.setTimeout(() => {
      setStatus("检测中");
      void refresh(true);
    }, 0);
    const heartbeat = window.setInterval(() => {
      void refresh(true);
    }, 30_000);
    return () => {
      window.clearTimeout(initialCheck);
      window.clearInterval(heartbeat);
    };
  }, [refresh]);

  return { status, data, lastUpdated, refresh };
}
