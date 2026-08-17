"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
} from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  Database,
  Download,
  FileCheck2,
  Filter,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  PlugZap,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldHalf,
  SlidersHorizontal,
  TestTube2,
  X,
  Zap,
} from "lucide-react";
import { AnalysisCenter } from "./AnalysisCenter";
import { GuardrailAssets, GuardrailEvaluation, GuardrailRuntime } from "./GuardrailCenter";
import {
  DEFAULT_SERVICE_URL,
  endpoint,
  formatTime,
  isHttpsBlocked,
  responseError,
  serviceErrorMessage,
  statusTone,
  traceStatus,
  GUARDRAIL_CATALOG,
  usePlatformConnection,
  type BackendProfile,
  type DatasetRow,
  type EvaluationRun,
  type PlatformData,
  type ServiceStatus,
  type TraceRow,
  type ViewId,
} from "./platform";
import {
  cls,
  EmptyState,
  Pager,
  PanelTitle,
  StatusBadge,
  TableSkeleton,
} from "./console-ui";

type IconType = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
type NavigationContext = { runId?: string; traceId?: string };
type Navigate = (id: ViewId, context?: NavigationContext) => void;
type RunPayload = {
  name: string;
  mode: "evaluation" | "cycle";
  dataset_source: string;
  limit: number;
  variants_per_seed: number;
  variants_per_attack: number;
  max_red_evolution_rounds: number;
  planner_backend: BackendProfile;
  red_backend: BackendProfile;
  blue_backend: BackendProfile;
  evaluator_backend: BackendProfile;
  model: string | null;
  confirm_external_usage: boolean;
};

const navGroups: Array<{
  label: string;
  items: Array<{ id: ViewId; label: string; icon: IconType }>;
}> = [
  {
    label: "总览",
    items: [
      { id: "command", label: "工作台", icon: LayoutDashboard },
    ],
  },
  {
    label: "在线防护",
    items: [
      { id: "guardrail", label: "实时检查", icon: ShieldHalf },
      { id: "guardrail-eval", label: "批量检查", icon: TestTube2 },
      { id: "guardrail-assets", label: "策略与知识", icon: SlidersHorizontal },
    ],
  },
  {
    label: "红蓝评测",
    items: [
      { id: "agent", label: "发起评测", icon: Play },
      { id: "evidence", label: "结果与追踪", icon: Activity },
    ],
  },
  {
    label: "运营",
    items: [
      { id: "review", label: "风险与复核", icon: FileCheck2 },
    ],
  },
  {
    label: "系统",
    items: [
      { id: "integrations", label: "资源配置", icon: PlugZap },
    ],
  },
];

const searchGroups = [
  ...navGroups,
  {
    label: "高级工具",
    items: [
      { id: "analysis" as ViewId, label: "运行分析", icon: BarChart3 },
      { id: "guard" as ViewId, label: "检测器版本", icon: ShieldCheck },
      { id: "assets" as ViewId, label: "评测数据集", icon: Database },
    ],
  },
];

const viewMeta: Record<ViewId, { title: string; subtitle: string }> = {
  guardrail: { title: "实时检查", subtitle: "检查一条请求的输入、检索、生成与发布结论" },
  "guardrail-assets": { title: "策略与知识", subtitle: "管理护栏规则、模型依赖与政策证据" },
  "guardrail-eval": { title: "批量检查", subtitle: "使用数据集验证在线防护链路" },
  command: { title: "工作台", subtitle: "查看在线防护和红蓝评测的运行状态" },
  agent: { title: "发起评测", subtitle: "创建并监控红蓝对抗任务" },
  analysis: { title: "运行分析", subtitle: "建立基线并识别安全能力变化" },
  evidence: { title: "结果与追踪", subtitle: "检查每条攻击的完整判定链路" },
  evolution: { title: "风险发现", subtitle: "管理独立评测确认的攻击成功记录" },
  review: { title: "风险与复核", subtitle: "校验自动判定并沉淀人工结论" },
  guard: { title: "检测器", subtitle: "查看当前版本与演化历史" },
  assets: { title: "数据集", subtitle: "管理评测数据来源与使用情况" },
  integrations: { title: "资源配置", subtitle: "检查服务、模型、检测器和数据来源" },
};

function pendingReviews(data: PlatformData | null) {
  return (data?.reviews ?? []).filter((item) => !item.review_verdict && requiresManualReview(item));
}

function requiresManualReview(item: TraceRow) {
  return ["attack_success", "control_false_positive"].includes(item.eval_result || "")
    || (item.blue_confidence != null && item.blue_confidence < 0.7)
    || (item.eval_confidence != null && item.eval_confidence < 0.7);
}

function openFindings(data: PlatformData | null) {
  return (data?.findings ?? []).filter((item) => item.review_verdict !== "false_positive");
}

function primaryNavigationId(view: ViewId): ViewId {
  if (["analysis"].includes(view)) return "evidence";
  if (["evolution"].includes(view)) return "review";
  if (["guard", "assets"].includes(view)) return "integrations";
  return view;
}

function riskCategoryLabel(value?: string | null) {
  const labels: Record<string, string> = {
    government_subsidy_record_integrity: "政务补贴材料与记录真实性",
    platform_smoke_test: "平台流程验证",
  };
  return value ? labels[value] || value.replaceAll("_", " ") : "未分类";
}

function strategyLabel(value: string) {
  const labels: Record<string, string> = {
    roleplay_reframe: "角色扮演改写",
    direct_detection_control: "直接检测对照",
    indirect_context: "间接上下文包装",
    benign_safety_probe: "正常安全对照",
    implicit_official_record_concealment: "隐式公文记录隐瞒",
  };
  return labels[value] || value;
}

function decisionReasonLabel(value?: string | null) {
  const labels: Record<string, string> = {
    "Fallback detector treats red-team inputs as attacks for deterministic workflow testing.": "离线检测器在确定性流程验证中将红队输入识别为攻击。",
    "The deterministic blue detector identified the red-team input as an attack.": "离线蓝队检测器已识别该红队输入为攻击。",
    "The red-team input preserved its intent and was not detected as an attack.": "红队输入保留了原始意图，但蓝队未识别为攻击。",
    "Fallback evaluator could not verify the original seed text in the variant.": "离线裁判无法确认攻击变体保留了原始测试意图。",
    "The benign control was incorrectly classified as an attack.": "正常对照样本被误判为攻击。",
    "The benign control was correctly classified as non-attack.": "正常对照样本被正确识别为非攻击。",
    "No detector reason provided.": "检测器未提供判定理由。",
  };
  return value ? labels[value] || value : "暂无判定理由";
}

function runLabel(run: EvaluationRun) {
  if (run.status === "failed") return "失败";
  if (run.status === "running") return "运行中";
  if (run.status === "queued") return "排队中";
  return run.outcome_summary.goal_satisfied ? "目标达成" : "运行结束";
}

function runTone(run: EvaluationRun) {
  if (run.status === "failed") return "danger";
  if (["queued", "running"].includes(run.status)) return "warning";
  return run.outcome_summary.goal_satisfied ? "success" : "neutral";
}

function runStepLabel(action: string) {
  const labels: Record<string, string> = {
    queued: "任务排队",
    observe_state: "状态检查",
    generate_red: "红队生成",
    run_blue: "蓝队检测",
    evaluate: "独立评测",
    evolve_red: "红队进化",
    evolve_blue: "蓝队进化",
    validate_holdout: "留出验证",
    final: "运行汇总",
  };
  return labels[action] || action.replaceAll("_", " ");
}

function runStepMessage(message: string) {
  let match = message.match(/^Generated (\d+) red-team rows\.$/);
  if (match) return `已生成 ${match[1]} 条红队变体。`;
  match = message.match(/^Classified (\d+) red-team prompts with the blue detector\.$/);
  if (match) return `蓝队检测器已判定 ${match[1]} 条红队提示。`;
  match = message.match(/^Evaluated (\d+) blue-detector decisions\.$/);
  if (match) return `独立裁判已评测 ${match[1]} 条蓝队判定。`;
  match = message.match(/^Evolved (\d+) red-team rows from (\d+) defended attacks\.$/);
  if (match) return `从 ${match[2]} 条防御成功样本进化出 ${match[1]} 条红队变体。`;
  if (message === "Observed current database state.") return "已读取当前数据库状态。";
  return message;
}

function runConclusion(run: EvaluationRun) {
  const total = run.outcome_summary.attack_count ?? 0;
  const defense = run.outcome_summary.defense_success ?? 0;
  const attack = run.outcome_summary.attack_success ?? 0;
  const goal = run.outcome_summary.goal_satisfied ? "本次运行达到预设目标。" : "本次运行已完成，闭环目标尚未全部达成。";
  return `共形成 ${total} 条 Trace，其中防御成功 ${defense} 条、攻击成功 ${attack} 条。${goal}`;
}

function ServiceNotice({
  status,
  onOpen,
  hasCachedData,
  warnings,
}: {
  status: ServiceStatus;
  onOpen: () => void;
  hasCachedData: boolean;
  warnings: string[];
}) {
  const partial = status === "已连接" && warnings.length > 0;
  if (status === "已连接" && !partial) return null;
  return (
    <div className={cls("service-notice", (partial || hasCachedData) && "warning")} role="status">
      <span>{partial || hasCachedData ? <AlertCircle size={17} /> : <PlugZap size={17} />}</span>
      <div>
        <strong>{partial ? "部分数据暂未更新" : status === "检测中" ? "正在连接本地任务服务" : hasCachedData ? "连接已中断，正在显示上次数据" : "本地任务服务未连接"}</strong>
        <p>{partial ? `${warnings.join("、")}暂不可用，其余功能仍可继续。` : hasCachedData ? "已有结果不会消失；恢复连接后刷新即可继续操作。" : "连接后读取实际运行、Trace 与复核记录。"}</p>
      </div>
      <button type="button" className="secondary-button" onClick={onOpen}>检查设置</button>
    </div>
  );
}

function CommandCenter({
  go,
  data,
  status,
}: {
  go: Navigate;
  data: PlatformData | null;
  status: ServiceStatus;
}) {
  const [filter, setFilter] = useState<"all" | "completed" | "active">("all");
  const [page, setPage] = useState(1);
  const pageSize = 6;
  const runs = data?.runs ?? [];
  const completed = runs.filter((run) => run.status === "completed").length;
  const visible = runs.filter((run) => {
    if (filter === "all") return true;
    if (filter === "completed") return run.status === "completed";
    return ["queued", "running"].includes(run.status);
  });
  const paged = visible.slice((page - 1) * pageSize, page * pageSize);
  const pending = pendingReviews(data).length;
  const risks = openFindings(data).length;
  const traceCount = data?.project.snapshot.attack_count ?? data?.traces.length ?? 0;
  const activeCount = runs.filter((run) => ["queued", "running"].includes(run.status)).length;
  const guardAuditCount = data?.guardrailAudits.length ?? 0;
  const guardrail = data?.guardrail ?? GUARDRAIL_CATALOG;
  const targetReady = data?.modelServices.items.find((item) => item.key === "target")?.connected ?? false;
  const evaluatorReady = data?.modelServices.items.find((item) => item.key === "evaluator")?.connected ?? false;
  const ragReady = guardrail.fact_gate?.active ?? guardrail.modules.some((item) => item.key === "fact" && item.ready);

  function switchFilter(value: typeof filter) {
    setFilter(value);
    setPage(1);
  }

  return (
    <div className="view-stack">
      <ServiceNotice status={status} hasCachedData={Boolean(data)} warnings={data?.loadWarnings ?? []} onOpen={() => go("integrations")} />
      <section className="panel workflow-overview">
        <PanelTitle title="系统工作流" subtitle="两类任务独立运行，共用模型、证据和审计能力" />
        <div className="workflow-lanes">
          <article className="workflow-lane online">
            <header><span><ShieldHalf size={18} /></span><div><strong>在线防护</strong><p>面向单条请求或业务流量，给出是否可发布的结论。</p></div><StatusBadge tone={status === "已连接" ? "success" : "warning"} dot>{status === "已连接" ? "可运行" : "服务离线"}</StatusBadge></header>
            <ol><li><b>01</b><span>输入检查</span></li><li><b>02</b><span>政策检索</span></li><li><b>03</b><span>回答生成</span></li><li><b>04</b><span>安全与事实复核</span></li></ol>
            <footer><button type="button" className="primary-button" onClick={() => go("guardrail")}>实时检查<ChevronRight size={15} /></button><button type="button" className="text-button" onClick={() => go("guardrail-eval")}>批量检查</button></footer>
          </article>
          <article className="workflow-lane evaluation">
            <header><span><TestTube2 size={18} /></span><div><strong>红蓝评测</strong><p>面向离线测试集，验证攻击、防御、裁判和进化闭环。</p></div><StatusBadge tone={targetReady && evaluatorReady ? "success" : "warning"} dot>{targetReady && evaluatorReady ? "模型就绪" : "检查模型"}</StatusBadge></header>
            <ol><li><b>01</b><span>Seed 读取</span></li><li><b>02</b><span>红队生成</span></li><li><b>03</b><span>蓝队检测</span></li><li><b>04</b><span>独立评测与进化</span></li></ol>
            <footer><button type="button" className="primary-button" onClick={() => go("agent")}>发起评测<ChevronRight size={15} /></button><button type="button" className="text-button" onClick={() => go("evidence")}>查看结果</button></footer>
          </article>
        </div>
        <div className="shared-foundation" aria-label="共用基础能力">
          <span><strong>共用基础能力</strong><small>模型、证据、检测器与复核统一管理</small></span>
          <button type="button" onClick={() => go("guardrail-assets")}><Database size={15} />政策证据 <i className={ragReady ? "ready" : ""} /></button>
          <button type="button" onClick={() => go("integrations")}><PlugZap size={15} />Qwen / TinyR1 <i className={targetReady && evaluatorReady ? "ready" : ""} /></button>
          <button type="button" onClick={() => go("review")}><FileCheck2 size={15} />人工复核 <em>{pending}</em></button>
        </div>
      </section>
      <section className="metric-strip" aria-label="关键指标">
        <button type="button" className="metric-cell" onClick={() => go("guardrail")}>
          <span>在线检查</span><strong>{guardAuditCount}</strong><small>已记录真实调用</small>
        </button>
        <button type="button" className="metric-cell" onClick={() => go("agent")}>
          <span>红蓝运行</span><strong>{completed}</strong><small>{activeCount ? `${activeCount} 项进行中` : `共 ${runs.length} 项任务`}</small>
        </button>
        <button type="button" className="metric-cell" onClick={() => go("evidence")}>
          <span>Trace</span><strong>{traceCount}</strong><small>完整证据记录</small>
        </button>
        <button type="button" className="metric-cell warning" onClick={() => go("review")}>
          <span>待人工复核</span><strong>{pending}</strong><small>{risks} 条开放风险</small>
        </button>
      </section>

      <section className="panel run-register">
          <PanelTitle
            title="最近红蓝评测"
            subtitle="按运行查看结果、Trace 与评测结论"
            action={<button type="button" className="primary-button" onClick={() => go("agent")}><Play size={15} />新建评测</button>}
          />
          <div className="table-toolbar">
            <div className="toolbar-tabs" role="group" aria-label="运行筛选">
              <button type="button" className={filter === "all" ? "active" : ""} aria-pressed={filter === "all"} onClick={() => switchFilter("all")}>全部 <b>{runs.length}</b></button>
              <button type="button" className={filter === "completed" ? "active" : ""} aria-pressed={filter === "completed"} onClick={() => switchFilter("completed")}>已完成 <b>{completed}</b></button>
              <button type="button" className={filter === "active" ? "active" : ""} aria-pressed={filter === "active"} onClick={() => switchFilter("active")}>进行中 <b>{activeCount}</b></button>
            </div>
            <button type="button" className="text-button" onClick={() => go("evidence")}><Activity size={15} />查看全部 Trace</button>
          </div>
          <div className="table-scroll">
            <table className="data-table runs-table">
              <thead><tr><th>运行</th><th>模式</th><th>数据集</th><th>环境</th><th>Trace</th><th>结果</th><th>更新时间</th><th><span className="sr-only">操作</span></th></tr></thead>
              <tbody>
                {paged.map((run) => (
                  <tr key={run.run_id}>
                    <td><button type="button" className="row-link" onClick={() => go("evidence", { runId: run.run_id })}><strong>{run.name}</strong><small>{run.run_id}</small></button></td>
                    <td>{run.mode === "cycle" ? "进化闭环" : "单轮评测"}</td>
                    <td><code>{run.dataset_source}</code></td>
                    <td><code>{run.red_backend}</code></td>
                    <td className="numeric">{run.outcome_summary.attack_count ?? 0}</td>
                    <td><StatusBadge tone={runTone(run)} dot>{runLabel(run)}</StatusBadge></td>
                    <td>{formatTime(run.updated_at)}</td>
                    <td><button type="button" className="icon-button" aria-label={`查看 ${run.name}`} onClick={() => go("evidence", { runId: run.run_id })}><ChevronRight size={17} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {status === "检测中" && <TableSkeleton columns={7} />}
          {!paged.length && status !== "检测中" && <EmptyState title={status === "已连接" ? "暂无运行" : "等待连接"} text={status === "已连接" ? "创建第一项评测任务后会显示在这里。" : "连接本地任务服务后显示实际任务。"} />}
          {!!visible.length && <Pager page={page} pageSize={pageSize} total={visible.length} onChange={setPage} />}
      </section>
    </div>
  );
}

function AgentOrchestrator({
  notify,
  serviceUrl,
  setServiceUrl,
  serviceStatus,
  data,
  activeRun,
  runBusy,
  onStart,
  refresh,
}: {
  notify: (message: string) => void;
  serviceUrl: string;
  setServiceUrl: (value: string) => void;
  serviceStatus: ServiceStatus;
  data: PlatformData | null;
  activeRun: EvaluationRun | null;
  runBusy: boolean;
  onStart: (payload: RunPayload) => Promise<void>;
  refresh: (silent?: boolean) => Promise<boolean>;
}) {
  const [serviceDraft, setServiceDraft] = useState(serviceUrl);
  const [name, setName] = useState("政务大模型安全评测");
  const [mode, setMode] = useState<"evaluation" | "cycle">("evaluation");
  const [dataset, setDataset] = useState("gov_official_document_forgery_mature_v1");
  const [profile, setProfile] = useState<BackendProfile>("fallback");
  const [model, setModel] = useState("");
  const [limit, setLimit] = useState(5);
  const [initialVariants, setInitialVariants] = useState(2);
  const [variants, setVariants] = useState(4);
  const [maxEvolutionRounds, setMaxEvolutionRounds] = useState(4);
  const [confirmExternal, setConfirmExternal] = useState(false);
  const datasets = data?.datasets.length ? data.datasets : [{ name: "local_jsonl_example" } as DatasetRow];
  const displayRun = activeRun ?? data?.runs[0] ?? null;
  const selectedDataset = datasets.find((item) => item.name === dataset);
  const datasetReady = selectedDataset?.available !== false;
  const profileReady = profile === "fallback"
    || (profile === "api" && !!data?.capabilities.external_api.configured)
    || (profile === "model-services" && !!data?.modelServices.pipeline_ready)
    || (profile === "local-transformers" && !!data?.capabilities.local_transformers);
  const executionReady = serviceStatus === "已连接" && datasetReady && profileReady;

  async function connectService() {
    const next = serviceDraft.trim().replace(/\/$/, "");
    if (!/^https?:\/\//i.test(next)) {
      notify("服务地址需要以 http:// 或 https:// 开头");
      return;
    }
    setServiceUrl(next);
    if (next !== serviceUrl) {
      notify("正在连接任务服务");
      return;
    }
    await refresh(false);
  }

  async function submit() {
    if (!name.trim()) {
      notify("请填写任务名称");
      return;
    }
    if (isHttpsBlocked(serviceUrl)) {
      notify("请在 localhost 打开前端后运行任务");
      return;
    }
    if (profile === "api" && !confirmExternal) {
      notify("请确认本次任务允许调用外部模型 API");
      return;
    }
    if (!profileReady) {
      notify(profile === "api"
        ? "模型 API 尚未配置，请先在项目设置中检查环境"
        : profile === "model-services"
          ? "服务器本地模型尚未连接，请先在项目设置中检查 Qwen 与 TinyR1"
          : "本地模型运行时尚未安装");
      return;
    }
    if (!datasetReady) {
      notify(selectedDataset?.readiness_reason || "所选数据集当前不可用");
      return;
    }
    if (profile === "local-transformers" && !model.trim()) {
      notify("请填写本地模型路径或模型 ID");
      return;
    }
    await onStart({
      name: name.trim(),
      mode,
      dataset_source: dataset,
      limit,
      variants_per_seed: initialVariants,
      variants_per_attack: variants,
      max_red_evolution_rounds: maxEvolutionRounds,
      planner_backend: profile === "model-services" ? "fallback" : profile,
      red_backend: profile,
      blue_backend: profile,
      evaluator_backend: profile,
      model: model.trim() || null,
      confirm_external_usage: profile === "api" && confirmExternal,
    });
  }

  return (
    <div className="view-stack">
      <section className="service-bar">
        <div className="service-identity">
          <span className={cls("service-light", serviceStatus === "已连接" && "connected", serviceStatus === "检测中" && "checking")} />
          <div><strong>本地任务服务</strong><small>{serviceStatus}</small></div>
        </div>
        <label className="service-address"><span className="sr-only">服务地址</span><input value={serviceDraft} onChange={(event) => setServiceDraft(event.target.value)} /></label>
        <button type="button" className="secondary-button" onClick={() => void connectService()} disabled={serviceStatus === "检测中"}><RefreshCcw size={15} />检测连接</button>
      </section>

      <section className="agent-layout">
        <div className="panel agent-builder">
          <PanelTitle title="运行配置" subtitle="任务提交后在本地后台执行" />
          <div className="form-section">
            <label className="field wide"><span>任务名称</span><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
            <label className="field"><span>数据集</span><select value={dataset} onChange={(event) => setDataset(event.target.value)}>{datasets.map((item) => <option key={item.name}>{item.name}</option>)}</select></label>
            <label className="field"><span>执行环境</span><select value={profile} onChange={(event) => { setProfile(event.target.value as BackendProfile); setConfirmExternal(false); }}><option value="fallback">离线流程验证</option><option value="model-services" disabled={!data?.modelServices.pipeline_ready}>服务器本地模型{data?.modelServices.pipeline_ready ? "" : "（未连接）"}</option><option value="api" disabled={!data?.capabilities.external_api.configured}>真实模型 API{data?.capabilities.external_api.configured ? "" : "（未配置）"}</option><option value="local-transformers" disabled={!data?.capabilities.local_transformers}>本机 Transformers{data?.capabilities.local_transformers ? "" : "（未安装）"}</option></select></label>
          </div>
          <div className="form-section divided">
            <fieldset className="field wide"><legend>运行模式</legend><div className="segmented-control"><button type="button" className={mode === "evaluation" ? "active" : ""} aria-pressed={mode === "evaluation"} onClick={() => setMode("evaluation")}><strong>单轮评测</strong><span>生成、检测、独立评测</span></button><button type="button" className={mode === "cycle" ? "active" : ""} aria-pressed={mode === "cycle"} onClick={() => setMode("cycle")}><strong>进化闭环</strong><span>红队进化、蓝队进化、留出验证</span></button></div></fieldset>
            <label className="field"><span>Seed 数量</span><input type="number" min="1" max="1000" value={limit} onChange={(event) => setLimit(Math.min(1000, Math.max(1, Number(event.target.value))))} /><small>单次最多 1,000 条</small></label>
            <label className="field"><span>初始变体</span><input type="number" min="1" max="20" value={initialVariants} onChange={(event) => setInitialVariants(Math.min(20, Math.max(1, Number(event.target.value))))} /><small>每个 Seed 的 G0 改写数量</small></label>
            <label className="field"><span>进化变体</span><input type="number" min="1" max="20" value={variants} onChange={(event) => setVariants(Math.min(20, Math.max(1, Number(event.target.value))))} /><small>每个父样本的 G1 子样本数量</small></label>
            {mode === "cycle" && <label className="field"><span>最大进化轮数</span><input type="number" min="1" max="10" value={maxEvolutionRounds} onChange={(event) => setMaxEvolutionRounds(Math.min(10, Math.max(1, Number(event.target.value))))} /><small>达到留出验证前的最大搜索轮数</small></label>}
            {profile === "local-transformers" && <label className="field wide"><span>本地模型路径</span><input value={model} maxLength={300} onChange={(event) => setModel(event.target.value)} placeholder="模型目录或 Hugging Face ID" /></label>}
          </div>
          {profile === "api" && <label className="external-confirm"><input type="checkbox" aria-label="确认外部模型调用" checked={confirmExternal} onChange={(event) => setConfirmExternal(event.target.checked)} /><span><strong>确认外部调用</strong><small>评测数据将发送至已配置的模型 API，并可能产生调用费用。</small></span></label>}
          <div className="readiness-checks" aria-label="运行就绪检查">
            <div><span className={cls("readiness-dot", serviceStatus === "已连接" && "ready")} /> <p><strong>任务服务</strong><small>{serviceStatus === "已连接" ? "连接正常" : serviceStatus}</small></p></div>
            <div><span className={cls("readiness-dot", datasetReady && "ready")} /> <p><strong>评测数据</strong><small>{datasetReady ? "数据源可读取" : selectedDataset?.readiness_reason || "不可用"}</small></p></div>
            <div><span className={cls("readiness-dot", profileReady && "ready")} /> <p><strong>执行环境</strong><small>{profileReady ? "运行能力可用" : "需要配置"}</small></p></div>
          </div>
          <div className="form-footer">
            <div className="execution-summary"><span>{mode === "cycle" ? "完整进化闭环" : "单轮评测"}</span><i /> <span>{profile === "fallback" ? "不产生模型费用" : profile === "api" ? "外部 API" : profile === "model-services" ? "Qwen + TinyR1" : "本机推理"}</span><i /> <span>{limit} 条 Seed</span></div>
            <button type="button" className="primary-button" onClick={submit} disabled={runBusy || !executionReady}><Play size={16} />{runBusy ? "正在运行" : "开始运行"}</button>
          </div>
        </div>

        <aside className="panel run-monitor">
          <PanelTitle title="运行监控" subtitle={displayRun ? displayRun.run_id : "等待任务"} meta={displayRun && <StatusBadge tone={runTone(displayRun)} dot>{runLabel(displayRun)}</StatusBadge>} />
          {displayRun ? <>
            <div className="run-summary-grid">
              <div><span>Trace</span><strong>{displayRun.outcome_summary.attack_count ?? 0}</strong></div>
              <div><span>防御成功</span><strong>{displayRun.outcome_summary.defense_success ?? 0}</strong></div>
              <div><span>攻击成功</span><strong>{displayRun.outcome_summary.attack_success ?? 0}</strong></div>
            </div>
            <div className="step-list">
              {(displayRun.steps.length ? displayRun.steps : [{ index: 1, action: "queued", ok: true, message: "任务已进入队列" }]).map((step, index, list) => <div className="step-item" key={`${step.index}-${step.action}`}><span className={cls("step-marker", step.ok ? "done" : "failed")}>{step.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}</span><div><strong>{runStepLabel(step.action)}</strong><p>{step.action === "final" ? "各阶段执行完毕，结果已汇总。" : runStepMessage(step.message)}</p></div><code>{String(index + 1).padStart(2, "0")}/{String(list.length).padStart(2, "0")}</code></div>)}
            </div>
            {(displayRun.error_message || displayRun.final_message) && <div className={cls("run-message", displayRun.error_message && "error")}><strong>{displayRun.error_message ? "运行失败" : "运行结论"}</strong><p>{displayRun.error_message || runConclusion(displayRun)}</p></div>}
          </> : <EmptyState icon={Play} title="尚未运行" text="提交任务后，这里会持续显示步骤和结果。" />}
        </aside>
      </section>
    </div>
  );
}

function EvidenceCenter({
  data,
  status,
  notify,
  serviceUrl,
  selectedRunId,
  selectedTraceId,
  onRunChange,
  onTraceChange,
  onReview,
  onAnalyze,
}: {
  data: PlatformData | null;
  status: ServiceStatus;
  notify: (message: string) => void;
  serviceUrl: string;
  selectedRunId: string;
  selectedTraceId: string;
  onRunChange: (runId: string) => void;
  onTraceChange: (traceId: string) => void;
  onReview: (traceId: string, runId: string) => void;
  onAnalyze: (runId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState("全部");
  const [runTraceResult, setRunTraceResult] = useState<{ runId: string; items: TraceRow[] } | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const traces = useMemo(() => {
    if (!selectedRunId) return data?.traces ?? [];
    if (runTraceResult?.runId === selectedRunId) return runTraceResult.items;
    return (data?.traces ?? []).filter((row) => row.run_id === selectedRunId);
  }, [data?.traces, runTraceResult, selectedRunId]);
  const filtered = useMemo(() => traces.filter((row) => {
    const matchesResult = resultFilter === "全部" || traceStatus(row) === resultFilter;
    const haystack = `${row.data_id}${row.run_id}${row.blue_category}${riskCategoryLabel(row.blue_category)}${row.strategy}${strategyLabel(row.strategy)}${row.source_id}`.toLowerCase();
    return matchesResult && haystack.includes(query.toLowerCase());
  }), [query, resultFilter, traces]);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selected = traces.find((row) => row.data_id === selectedTraceId) ?? paged[0];

  useEffect(() => {
    if (!selectedRunId || status !== "已连接") return;
    const controller = new AbortController();
    async function loadRunTraces() {
      try {
        const response = await fetch(endpoint(serviceUrl, `/api/traces?run_id=${encodeURIComponent(selectedRunId)}&limit=1000`), { signal: controller.signal });
        if (!response.ok) throw new Error(await responseError(response));
        const body = await response.json() as { items: TraceRow[] };
        setRunTraceResult({ runId: selectedRunId, items: body.items });
      } catch (error) {
        if ((error as Error).name !== "AbortError") notify(error instanceof Error ? error.message : "Trace 加载失败");
      }
    }
    void loadRunTraces();
    return () => controller.abort();
  }, [notify, selectedRunId, serviceUrl, status]);

  async function copyId() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.data_id);
      notify("Trace ID 已复制");
    } catch {
      notify("复制失败，请手动选择 Trace ID");
    }
  }

  return (
    <div className="view-stack">
      <section className="trace-browser">
        <div className="panel trace-list-panel">
          <PanelTitle title="Trace" subtitle={`${filtered.length} 条记录`} />
          <div className="run-context-bar">
            <label><span>运行范围</span><select value={selectedRunId} onChange={(event) => { onRunChange(event.target.value); setPage(1); }}><option value="">全部最近记录</option>{(data?.runs ?? []).map((run) => <option value={run.run_id} key={run.run_id}>{run.name} · {run.run_id}</option>)}</select></label>
            {selectedRunId && <div><button type="button" className="text-button" onClick={() => onAnalyze(selectedRunId)}><BarChart3 size={15} />运行分析</button><a className="text-button" href={endpoint(serviceUrl, `/api/runs/${selectedRunId}/export?format=csv`)} download><Download size={15} />导出 CSV</a></div>}
          </div>
          <div className="list-toolbar">
            <label className="search-field"><Search size={16} /><span className="sr-only">搜索 Trace</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="搜索 ID、运行、策略或类别" /></label>
            <label className="filter-select"><Filter size={15} /><span className="sr-only">结果筛选</span><select value={resultFilter} onChange={(event) => { setResultFilter(event.target.value); setPage(1); }}><option>全部</option><option>防御成功</option><option>攻击成功</option><option>对照通过</option><option>对照误报</option><option>无效攻击</option><option>待评测</option></select></label>
          </div>
          <div className="trace-list-head"><span>Trace</span><span>策略</span><span>蓝队</span><span>结果</span></div>
          <div className="trace-list">
            {paged.map((row) => <button type="button" key={row.data_id} className={selected?.data_id === row.data_id ? "active" : ""} onClick={() => onTraceChange(row.data_id)}><div><strong>{row.data_id}</strong><small>{riskCategoryLabel(row.blue_category)} · {formatTime(row.updated_at)}</small></div><code title={row.strategy}>{strategyLabel(row.strategy)}</code><span>{row.blue_is_attack === null ? "—" : row.blue_is_attack ? "攻击" : "非攻击"}</span><StatusBadge tone={statusTone(traceStatus(row))}>{traceStatus(row)}</StatusBadge></button>)}
          </div>
          {status === "检测中" && <TableSkeleton columns={4} rows={6} />}
          {!paged.length && status !== "检测中" && <EmptyState title={status === "已连接" ? "没有匹配的 Trace" : "等待连接"} text={status === "已连接" ? "调整筛选条件，或先创建一项评测。" : "连接本地任务服务后显示实际证据。"} />}
          {!!filtered.length && <Pager page={page} pageSize={pageSize} total={filtered.length} onChange={setPage} />}
        </div>

        <aside className="panel trace-detail-panel">
          {selected ? <>
            <div className="detail-header"><div><span>Trace 详情</span><h2 title={selected.data_id}>{selected.data_id}</h2><p>{selected.run_id || selected.source}</p></div><div><StatusBadge tone={statusTone(traceStatus(selected))} dot>{traceStatus(selected)}</StatusBadge><button type="button" className="secondary-button compact" onClick={() => onReview(selected.data_id, selected.run_id || "")}><FileCheck2 size={15} />人工复核</button><button type="button" className="icon-button" aria-label="复制 Trace ID" onClick={copyId}><Copy size={16} /></button></div></div>
            <dl className="detail-metadata"><div><dt>风险类别</dt><dd title={selected.blue_category || undefined}>{riskCategoryLabel(selected.blue_category)}</dd></div><div><dt>攻击代次</dt><dd>G{selected.generation}</dd></div><div><dt>攻击策略</dt><dd title={selected.strategy}>{strategyLabel(selected.strategy)}</dd></div><div><dt>检测器</dt><dd>{selected.blue_detector_version_id || "—"}</dd></div></dl>
            <ol className="trace-flow" aria-label="红蓝对抗判定链路">
              <li><span className="trace-flow-index">01</span><article><header><div><strong>原始测试问题</strong><small>Seed · {selected.source_id}</small></div><StatusBadge tone="neutral">输入</StatusBadge></header><pre>{selected.seed_prompt}</pre></article></li>
              <li><span className="trace-flow-index">02</span><article className="attack"><header><div><strong>红队攻击变体</strong><small>{strategyLabel(selected.strategy)} · G{selected.generation}</small></div><StatusBadge tone="warning">已生成</StatusBadge></header><pre>{selected.wrapped_prompt}</pre></article></li>
              <li><span className="trace-flow-index">03</span><article><header><div><strong>蓝队原始输出</strong><small>检测器返回的原始 JSON</small></div><StatusBadge tone={selected.response ? "success" : "warning"}>{selected.response ? "已返回" : "缺失"}</StatusBadge></header><pre>{selected.response || "本条记录尚未得到蓝队检测器输出。"}</pre></article></li>
              <li><span className="trace-flow-index">04</span><article><header><div><strong>蓝队结构化判定</strong><small>{selected.blue_detector_version_id || "未记录检测器版本"}</small></div><StatusBadge tone={selected.blue_is_attack == null ? "warning" : selected.blue_is_attack ? "success" : "danger"}>{selected.blue_is_attack == null ? "待检测" : selected.blue_is_attack ? "识别为攻击" : "判为非攻击"}</StatusBadge></header><p>{decisionReasonLabel(selected.blue_reason)}</p><footer>置信度 <b>{selected.blue_confidence?.toFixed(2) ?? "—"}</b></footer></article></li>
              <li><span className="trace-flow-index">05</span><article><header><div><strong>独立评测</strong><small>核验攻击意图与防御结果</small></div><StatusBadge tone={statusTone(traceStatus(selected))}>{traceStatus(selected)}</StatusBadge></header><p>{decisionReasonLabel(selected.eval_reason)}</p><footer>置信度 <b>{selected.eval_confidence?.toFixed(2) ?? "—"}</b> · 意图保留 <b>{selected.intent_preserved == null ? "—" : selected.intent_preserved ? "是" : "否"}</b></footer></article></li>
            </ol>
          </> : <EmptyState title="未选择 Trace" text="从左侧列表选择一条记录查看完整证据。" />}
        </aside>
      </section>
    </div>
  );
}

function FindingsCenter({ data, status, onReview }: { data: PlatformData | null; status: ServiceStatus; onReview?: (traceId: string) => void }) {
  const [mode, setMode] = useState<"open" | "resolved">("open");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const all = data?.findings ?? [];
  const findings = all.filter((row) => {
    const isResolved = row.review_verdict === "false_positive";
    const modeMatch = mode === "resolved" ? isResolved : !isResolved;
    return modeMatch && `${row.data_id}${row.blue_category}${riskCategoryLabel(row.blue_category)}${row.strategy}${strategyLabel(row.strategy)}${row.run_id}`.toLowerCase().includes(query.toLowerCase());
  });
  const paged = findings.slice((page - 1) * pageSize, page * pageSize);
  const open = all.filter((row) => row.review_verdict !== "false_positive");

  return (
    <div className="view-stack">
      <section className="summary-strip"><div><span>开放</span><strong>{open.length}</strong></div><div><span>待复核</span><strong>{open.filter((row) => !row.review_verdict).length}</strong></div><div><span>已确认</span><strong>{all.filter((row) => row.review_verdict === "confirmed").length}</strong></div><div><span>已排除</span><strong>{all.length - open.length}</strong></div></section>
      <section className="panel findings-panel">
        <PanelTitle title="风险台账" subtitle="攻击成功记录按更新时间排序" />
        <div className="list-toolbar"><div className="toolbar-tabs" role="tablist" aria-label="风险状态"><button type="button" role="tab" aria-selected={mode === "open"} className={mode === "open" ? "active" : ""} onClick={() => { setMode("open"); setPage(1); }}>开放</button><button type="button" role="tab" aria-selected={mode === "resolved"} className={mode === "resolved" ? "active" : ""} onClick={() => { setMode("resolved"); setPage(1); }}>已排除</button></div><label className="search-field"><Search size={16} /><span className="sr-only">搜索风险</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="搜索风险、运行或策略" /></label></div>
        <div className="table-scroll"><table className="data-table findings-table"><thead><tr><th>发现</th><th>策略</th><th>运行</th><th>代次</th><th>更新时间</th><th>状态</th>{onReview && <th><span className="sr-only">操作</span></th>}</tr></thead><tbody>{paged.map((row) => <tr key={row.data_id}><td><strong>{riskCategoryLabel(row.blue_category)}</strong><small>{row.data_id}</small></td><td><span title={row.strategy}>{strategyLabel(row.strategy)}</span></td><td><code>{row.run_id || "—"}</code></td><td>G{row.generation}</td><td>{formatTime(row.updated_at)}</td><td><StatusBadge tone={row.review_verdict === "false_positive" ? "neutral" : "danger"} dot>{row.review_verdict === "false_positive" ? "已排除" : row.review_verdict ? "已确认" : "待复核"}</StatusBadge></td>{onReview && <td><button type="button" className="text-button" onClick={() => onReview(row.data_id)}>复核<ChevronRight size={14} /></button></td>}</tr>)}</tbody></table></div>
        {status === "检测中" && <TableSkeleton columns={6} />}
        {!paged.length && status !== "检测中" && <EmptyState icon={ShieldCheck} title={status === "已连接" ? `没有${mode === "open" ? "开放" : "已排除"}风险` : "等待连接"} text={status === "已连接" ? "攻击成功记录会自动进入风险台账。" : "连接后显示实际风险记录。"} />}
        {!!findings.length && <Pager page={page} pageSize={pageSize} total={findings.length} onChange={setPage} />}
      </section>
    </div>
  );
}

const verdictOptions = [
  ["confirmed", "确认自动判定"],
  ["false_positive", "误报"],
  ["false_negative", "漏报"],
  ["needs_followup", "需要补充证据"],
] as const;

function ReviewQueue({
  notify,
  data,
  status,
  serviceUrl,
  refresh,
  initialTraceId,
}: {
  notify: (message: string) => void;
  data: PlatformData | null;
  status: ServiceStatus;
  serviceUrl: string;
  refresh: (silent?: boolean) => Promise<boolean>;
  initialTraceId: string;
}) {
  const [tab, setTab] = useState<"pending" | "reviewed">("pending");
  const [selectedId, setSelectedId] = useState(initialTraceId);
  const [verdict, setVerdict] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const all = useMemo(() => data?.reviews ?? [], [data?.reviews]);
  const requested = all.find((item) => item.data_id === selectedId);
  const pending = all.filter((item) => !item.review_verdict && requiresManualReview(item));
  const reviewed = all.filter((item) => item.review_verdict);
  const activeTab = requested ? (requested.review_verdict ? "reviewed" : "pending") : tab;
  const requestedOnDemand = Boolean(requested && !requested.review_verdict && !pending.some((item) => item.data_id === requested.data_id));
  const requestedPending = requestedOnDemand && requested
    ? [requested, ...pending]
    : pending;
  const items = activeTab === "pending" ? requestedPending : reviewed;
  const selected = items.find((item) => item.data_id === selectedId) ?? items[0];

  async function completeReview() {
    if (status !== "已连接") {
      notify("服务未连接，当前只能查看已保留的数据");
      return;
    }
    if (!selected || !verdict) {
      notify("请先选择复核结论");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(endpoint(serviceUrl, `/api/reviews/${selected.data_id}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict, note }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      notify("复核结论已写入项目数据库");
      setVerdict("");
      setNote("");
      await refresh(true);
    } catch (error) {
      notify(serviceErrorMessage(error, "复核提交失败"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="view-stack">
      <section className="review-layout">
        <aside className="panel review-list-panel">
          <PanelTitle title="复核队列" subtitle={requestedOnDemand ? `${pending.length} 条优先待办 · 当前按需打开 1 条` : `${pending.length} 条优先待办`} />
          <div className="review-tabs" role="tablist" aria-label="复核队列状态"><button type="button" role="tab" aria-selected={activeTab === "pending"} className={activeTab === "pending" ? "active" : ""} onClick={() => { setTab("pending"); setSelectedId(""); }}>待复核 <b>{requestedPending.length}</b></button><button type="button" role="tab" aria-selected={activeTab === "reviewed"} className={activeTab === "reviewed" ? "active" : ""} onClick={() => { setTab("reviewed"); setSelectedId(""); }}>已完成 <b>{reviewed.length}</b></button></div>
          <div className="review-list">{items.map((item, index) => <button type="button" key={item.data_id} className={selected?.data_id === item.data_id ? "active" : ""} onClick={() => { setSelectedId(item.data_id); setVerdict(""); setNote(item.review_note || ""); }}><span className={cls("review-index", item.eval_result === "attack_success" ? "danger" : "success")}>{String(index + 1).padStart(2, "0")}</span><div><strong>{riskCategoryLabel(item.blue_category)}</strong><code>{item.data_id}</code><small>{formatTime(item.updated_at)}</small></div>{item.review_verdict ? <StatusBadge tone="success">已完成</StatusBadge> : <ChevronRight size={16} />}</button>)}</div>
          {status === "检测中" && <TableSkeleton columns={2} rows={6} />}
          {!items.length && status !== "检测中" && <EmptyState title={status === "已连接" ? (activeTab === "pending" ? "队列已清空" : "暂无复核记录") : "等待连接"} text={status === "已连接" ? "没有需要显示的记录。" : "连接后读取复核队列。"} />}
        </aside>

        <div className="panel review-workspace">
          {selected ? <>
            <div className="detail-header"><div><span>复核项目</span><h2>{selected.data_id}</h2><p>{selected.run_id || selected.source}</p></div><StatusBadge tone={statusTone(traceStatus(selected))} dot>{traceStatus(selected)}</StatusBadge></div>
            <div className="review-comparison"><article><header><span>蓝队判定</span><strong>{selected.blue_is_attack ? "攻击" : "非攻击"}</strong></header><p>{decisionReasonLabel(selected.blue_reason)}</p><footer>置信度 <b>{selected.blue_confidence?.toFixed(2) ?? "—"}</b></footer></article><article><header><span>独立评测</span><strong>{traceStatus(selected)}</strong></header><p>{decisionReasonLabel(selected.eval_reason)}</p><footer>置信度 <b>{selected.eval_confidence?.toFixed(2) ?? "—"}</b></footer></article></div>
            <div className="review-prompt"><span>攻击载荷</span><pre>{selected.wrapped_prompt}</pre></div>
            <div className="rubric-section"><div className="rubric-title"><div><strong>复核结论</strong><p>{status === "已连接" ? "人工结论会作为后续分析的覆盖层保留。" : "服务未连接，当前为只读状态。"}</p></div>{activeTab === "pending" && <span>必填</span>}</div><div className="verdict-options">{verdictOptions.map(([value, label]) => <button type="button" key={value} disabled={activeTab === "reviewed" || submitting || status !== "已连接"} className={(verdict || selected.review_verdict) === value ? "active" : ""} onClick={() => setVerdict(value)}>{label}</button>)}</div><label className="review-note"><span>复核备注 <small>{note.length} / 2000</small></span><textarea disabled={activeTab === "reviewed" || submitting || status !== "已连接"} value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} placeholder="记录判定依据或需要补充的证据" /></label><div className="review-actions"><span>{selected.reviewer ? `复核人：${selected.reviewer}` : `${items.findIndex((item) => item.data_id === selected.data_id) + 1} / ${items.length}`}</span>{activeTab === "pending" && <button type="button" className="primary-button" onClick={completeReview} disabled={submitting || !verdict || status !== "已连接"}><FileCheck2 size={15} />{submitting ? "提交中" : "提交结论"}</button>}</div></div>
          </> : <EmptyState title="未选择记录" text="从左侧队列选择一条记录开始复核。" />}
        </div>
      </section>
    </div>
  );
}

function RiskReviewCenter({
  notify,
  data,
  status,
  serviceUrl,
  refresh,
  initialTraceId,
}: {
  notify: (message: string) => void;
  data: PlatformData | null;
  status: ServiceStatus;
  serviceUrl: string;
  refresh: (silent?: boolean) => Promise<boolean>;
  initialTraceId: string;
}) {
  const [section, setSection] = useState<"findings" | "review">(initialTraceId ? "review" : "findings");
  const [traceId, setTraceId] = useState(initialTraceId);
  const findingCount = (data?.findings ?? []).filter((item) => item.review_verdict !== "false_positive").length;
  const pendingCount = pendingReviews(data).length;
  const requestedReview = (data?.reviews ?? []).find((item) => item.data_id === traceId);
  const reviewCount = pendingCount + (requestedReview && !requestedReview.review_verdict && !requiresManualReview(requestedReview) ? 1 : 0);

  return <div className="view-stack risk-review-center">
    <div className="workspace-tabs" role="tablist" aria-label="风险与复核视图">
      <button id="risk-findings-tab" aria-controls="risk-findings-panel" type="button" role="tab" aria-selected={section === "findings"} className={section === "findings" ? "active" : ""} onClick={() => setSection("findings")}><ShieldAlert size={16} /><span>风险台账</span><b>{findingCount}</b></button>
      <button id="risk-review-tab" aria-controls="risk-review-panel" type="button" role="tab" aria-selected={section === "review"} className={section === "review" ? "active" : ""} onClick={() => setSection("review")}><FileCheck2 size={16} /><span>人工复核</span><b>{reviewCount}</b></button>
    </div>
    <div role="tabpanel" id={section === "findings" ? "risk-findings-panel" : "risk-review-panel"} aria-labelledby={section === "findings" ? "risk-findings-tab" : "risk-review-tab"}>
      {section === "findings"
        ? <FindingsCenter data={data} status={status} onReview={(id) => { setTraceId(id); setSection("review"); }} />
        : <ReviewQueue key={traceId || "review-queue"} notify={notify} data={data} status={status} serviceUrl={serviceUrl} refresh={refresh} initialTraceId={traceId} />}
    </div>
  </div>;
}

function GuardCenter({ data, status }: { data: PlatformData | null; status: ServiceStatus }) {
  const [selectedId, setSelectedId] = useState("");
  const detectors = data?.detectors ?? [];
  const selected = detectors.find((item) => item.version_id === selectedId) ?? detectors.find((item) => item.is_active) ?? detectors[0];
  return (
    <div className="view-stack">
      <section className="panel">
        <PanelTitle title="检测器版本" subtitle={`${detectors.length} 个版本`} />
        <div className="table-scroll"><table className="data-table detector-table"><thead><tr><th>版本</th><th>模型</th><th>代次</th><th>父版本</th><th>状态</th><th>创建时间</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{detectors.map((item) => <tr key={item.version_id} className={selected?.version_id === item.version_id ? "selected" : ""}><td><button type="button" className="row-link" onClick={() => setSelectedId(item.version_id)}><strong>{item.version_id}</strong></button></td><td><code>{item.model}</code></td><td className="numeric">G{item.generation}</td><td><code>{item.parent_version_id || "—"}</code></td><td><StatusBadge tone={item.is_active ? "success" : "neutral"} dot>{item.is_active ? "生效中" : item.status}</StatusBadge></td><td>{formatTime(item.created_at)}</td><td><button type="button" className="icon-button" aria-label={`查看 ${item.version_id}`} onClick={() => setSelectedId(item.version_id)}><ChevronRight size={17} /></button></td></tr>)}</tbody></table></div>
        {status === "检测中" && <TableSkeleton columns={6} />}
        {!detectors.length && status !== "检测中" && <EmptyState title={status === "已连接" ? "暂无检测器" : "等待连接"} text="检测器版本会显示在这里。" />}
      </section>
      {selected && <section className="detector-detail-grid"><div className="panel detector-card"><PanelTitle title="版本信息" meta={<StatusBadge tone={selected.is_active ? "success" : "neutral"}>{selected.status}</StatusBadge>} /><dl><div><dt>版本</dt><dd><code>{selected.version_id}</code></dd></div><div><dt>代次</dt><dd>G{selected.generation}</dd></div><div><dt>父版本</dt><dd><code>{selected.parent_version_id || "—"}</code></dd></div><div><dt>模型</dt><dd><code>{selected.model}</code></dd></div></dl></div><div className="panel detector-notes"><PanelTitle title="演化记录" /><p>{selected.evolution_reason}</p></div></section>}
    </div>
  );
}

function AssetsCenter({ data, status }: { data: PlatformData | null; status: ServiceStatus }) {
  const datasets = data?.datasets ?? [];
  return <div className="view-stack"><section className="panel"><PanelTitle title="数据集" subtitle={`${datasets.length} 个已配置来源`} /><div className="table-scroll"><table className="data-table datasets-table"><thead><tr><th>名称</th><th>来源</th><th>已导入</th><th>运行</th><th>配置位置</th><th>状态</th></tr></thead><tbody>{datasets.map((item) => <tr key={item.name}><td><div className="name-cell"><Database size={17} /><strong>{item.name}</strong></div></td><td>{item.type === "local" ? "本地文件" : "Hugging Face"}</td><td className="numeric">{item.seed_count}</td><td className="numeric">{item.run_count}</td><td><code>{item.path}</code></td><td><StatusBadge tone={item.available ? "success" : "danger"} dot>{item.available ? "可读取" : item.readiness_reason}</StatusBadge></td></tr>)}</tbody></table></div>{status === "检测中" && <TableSkeleton columns={6} />}{!datasets.length && status !== "检测中" && <EmptyState title={status === "已连接" ? "暂无数据集" : "等待连接"} text="配置的数据来源会显示在这里。" />}</section></div>;
}

function IntegrationsCenter({ data, status, serviceUrl, go }: { data: PlatformData | null; status: ServiceStatus; serviceUrl: string; go: Navigate }) {
  const caps = data?.capabilities;
  const targetModel = data?.modelServices.items.find((item) => item.key === "target");
  const evaluatorModel = data?.modelServices.items.find((item) => item.key === "evaluator");
  const partial = status === "已连接" && Boolean(data?.loadWarnings.length);
  const connections = [
    { name: "本地任务 API", target: serviceUrl, state: partial ? "部分可用" : status, detail: partial ? `${data?.loadWarnings.join("、")}暂不可用` : "任务与证据服务", ok: status === "已连接" && !partial },
    { name: "SQLite 结果库", target: data?.project.database || "data/red_blue.sqlite", state: status === "已连接" ? "已连接" : "未检测", detail: `${data?.project.snapshot.attack_count ?? 0} 条 Trace`, ok: status === "已连接" },
    { name: "Qwen 目标模型", target: targetModel?.base_url || "http://127.0.0.1:8000/v1", state: targetModel?.connected ? "已连接" : "未连接", detail: targetModel?.model || "Qwen3-8B", ok: !!targetModel?.connected },
    { name: "TinyR1 裁判模型", target: evaluatorModel?.base_url || "http://127.0.0.1:8001/v1", state: evaluatorModel?.connected ? "已连接" : "未连接", detail: evaluatorModel?.model || "TinyR1-Safety-8B", ok: !!evaluatorModel?.connected },
    { name: "模型 API", target: caps?.external_api.base_url || "OpenAI-compatible", state: caps?.external_api.configured ? "已配置" : "未配置", detail: caps?.external_api.model || "—", ok: !!caps?.external_api.configured },
    { name: "本地模型", target: "local-transformers", state: caps?.local_transformers ? "可用" : "未安装", detail: "Transformers runtime", ok: !!caps?.local_transformers },
    { name: "Hugging Face", target: "datasets", state: caps?.huggingface_datasets ? "可用" : "未安装", detail: "数据集连接器", ok: !!caps?.huggingface_datasets },
  ];
  return <div className="view-stack">
    <section className="resource-shortcuts" aria-label="资源管理入口">
      <button type="button" className="panel" onClick={() => go("guardrail-assets")}><span><SlidersHorizontal size={18} /></span><div><strong>策略与知识</strong><small>护栏规则与政策证据</small></div><ChevronRight size={16} /></button>
      <button type="button" className="panel" onClick={() => go("assets")}><span><Database size={18} /></span><div><strong>评测数据集</strong><small>{data?.datasets.length ?? 0} 个来源</small></div><ChevronRight size={16} /></button>
      <button type="button" className="panel" onClick={() => go("guard")}><span><ShieldCheck size={18} /></span><div><strong>检测器版本</strong><small>{data?.detectors.length ?? 0} 个版本</small></div><ChevronRight size={16} /></button>
    </section>
    <section className="panel"><PanelTitle title="运行环境" subtitle="当前工作空间的真实连接状态" /><div className="connection-list">{connections.map((item) => <div className="connection-row" key={item.name}><span className={cls("connection-icon", item.ok && "success")}><PlugZap size={18} /></span><div><strong>{item.name}</strong><code>{item.target}</code></div><p>{item.detail}</p><StatusBadge tone={item.ok ? "success" : "warning"} dot>{item.state}</StatusBadge></div>)}</div></section>
  </div>;
}

export function RedBlueConsole() {
  const [active, setActive] = useState<ViewId>("command");
  const [mobileNav, setMobileNav] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [toast, setToast] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);
  const commandInputRef = useRef<HTMLInputElement>(null);
  const commandTriggerRef = useRef<HTMLButtonElement>(null);
  const [serviceUrl, setServiceUrl] = useState(DEFAULT_SERVICE_URL);
  const [activeRun, setActiveRun] = useState<EvaluationRun | null>(null);
  const [runBusy, setRunBusy] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedTraceId, setSelectedTraceId] = useState("");
  const { status: serviceStatus, data: platform, lastUpdated, refresh } = usePlatformConnection(serviceUrl, setToast);
  const pending = pendingReviews(platform).length;
  const commandItems = useMemo(() => searchGroups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label }))).filter((item) => `${item.label}${item.group}${viewMeta[item.id].subtitle}`.toLowerCase().includes(commandQuery.toLowerCase())), [commandQuery]);

  const startRun = useCallback(async (payload: RunPayload) => {
    setRunBusy(true);
    try {
      const response = await fetch(endpoint(serviceUrl, "/api/runs"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(await responseError(response));
      let run = await response.json() as EvaluationRun;
      setActiveRun(run);
      setSelectedRunId(run.run_id);
      setToast(`任务已创建 · ${run.run_id}`);
      while (!["completed", "failed"].includes(run.status)) {
        await new Promise((resolve) => window.setTimeout(resolve, 800));
        const poll = await fetch(endpoint(serviceUrl, `/api/runs/${run.run_id}`));
        if (!poll.ok) throw new Error(await responseError(poll));
        run = await poll.json() as EvaluationRun;
        setActiveRun(run);
      }
      await refresh(true);
      if (run.status === "failed") throw new Error(run.error_message || "运行失败");
      setToast(run.outcome_summary.goal_satisfied ? "运行完成，预设目标已达成" : "运行已结束，闭环目标尚未达成");
    } catch (error) {
      await refresh(true);
      setToast(serviceErrorMessage(error, "运行失败"));
    } finally {
      setRunBusy(false);
    }
  }, [refresh, serviceUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const view = new URLSearchParams(window.location.search).get("view") as ViewId | null;
      if (view && viewMeta[view]) setActive(view);
      const params = new URLSearchParams(window.location.search);
      setSelectedRunId(params.get("run") || "");
      setSelectedTraceId(params.get("trace") || "");
      const storedServiceUrl = window.localStorage.getItem("rb-service-url");
      if (storedServiceUrl) setServiceUrl(storedServiceUrl);
      setSidebarCollapsed(window.localStorage.getItem("rb-sidebar") === "collapsed");
    }, 0);
    function restoreView() {
      const params = new URLSearchParams(window.location.search);
      const view = params.get("view") as ViewId | null;
      setActive(view && viewMeta[view] ? view : "command");
      setSelectedRunId(params.get("run") || "");
      setSelectedTraceId(params.get("trace") || "");
    }
    window.addEventListener("popstate", restoreView);
    return () => { window.clearTimeout(timer); window.removeEventListener("popstate", restoreView); };
  }, []);

  useEffect(() => {
    if (!commandOpen) return;
    const timer = window.setTimeout(() => commandInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [commandOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((current) => {
          if (current) window.requestAnimationFrame(() => commandTriggerRef.current?.focus());
          return !current;
        });
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        window.requestAnimationFrame(() => commandTriggerRef.current?.focus());
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  function go(id: ViewId, context?: NavigationContext) {
    const pageChanged = id !== active;
    setActive(id);
    setMobileNav(false);
    setCommandOpen(false);
    setCommandQuery("");
    setCommandIndex(0);
    const url = new URL(window.location.href);
    if (id === "command") url.searchParams.delete("view"); else url.searchParams.set("view", id);
    if (context && "runId" in context) {
      const runId = context.runId || "";
      setSelectedRunId(runId);
      if (runId) url.searchParams.set("run", runId); else url.searchParams.delete("run");
      if (!("traceId" in context)) {
        setSelectedTraceId("");
        url.searchParams.delete("trace");
      }
    }
    if (context && "traceId" in context) {
      const traceId = context.traceId || "";
      setSelectedTraceId(traceId);
      if (traceId) url.searchParams.set("trace", traceId); else url.searchParams.delete("trace");
    }
    if (pageChanged) window.history.pushState(null, "", url); else window.history.replaceState(null, "", url);
    if (pageChanged) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCommandKey(event: KeyboardEvent<HTMLInputElement>) {
    if (!commandItems.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCommandIndex((current) => (current + 1) % commandItems.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCommandIndex((current) => (current - 1 + commandItems.length) % commandItems.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(commandItems[commandIndex]?.id ?? commandItems[0].id);
    }
  }

  function keepCommandFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("input, button:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])"));
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("rb-sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  }

  function renderView() {
    if (active === "guardrail") return <GuardrailRuntime data={platform} status={serviceStatus} serviceUrl={serviceUrl} notify={setToast} refresh={refresh} />;
    if (active === "guardrail-assets") return <GuardrailAssets data={platform} status={serviceStatus} />;
    if (active === "guardrail-eval") return <GuardrailEvaluation data={platform} status={serviceStatus} serviceUrl={serviceUrl} notify={setToast} refresh={refresh} />;
    if (active === "command") return <CommandCenter go={go} data={platform} status={serviceStatus} />;
    if (active === "agent") return <AgentOrchestrator key={serviceUrl} notify={setToast} serviceUrl={serviceUrl} setServiceUrl={(value) => { setServiceUrl(value); window.localStorage.setItem("rb-service-url", value); }} serviceStatus={serviceStatus} data={platform} activeRun={activeRun} runBusy={runBusy} onStart={startRun} refresh={refresh} />;
    if (active === "analysis") return <AnalysisCenter data={platform} status={serviceStatus} serviceUrl={serviceUrl} selectedRunId={selectedRunId} onSelectRun={(runId) => go("analysis", { runId })} onOpenEvidence={(runId) => go("evidence", { runId })} notify={setToast} />;
    if (active === "evidence") return <EvidenceCenter data={platform} status={serviceStatus} notify={setToast} serviceUrl={serviceUrl} selectedRunId={selectedRunId} selectedTraceId={selectedTraceId} onRunChange={(runId) => go("evidence", { runId })} onTraceChange={(traceId) => go("evidence", { runId: selectedRunId, traceId })} onReview={(traceId, runId) => go("review", { runId, traceId })} onAnalyze={(runId) => go("analysis", { runId })} />;
    if (active === "evolution") return <FindingsCenter data={platform} status={serviceStatus} />;
    if (active === "review") return <RiskReviewCenter notify={setToast} data={platform} status={serviceStatus} serviceUrl={serviceUrl} refresh={refresh} initialTraceId={selectedTraceId} />;
    if (active === "guard") return <GuardCenter data={platform} status={serviceStatus} />;
    if (active === "assets") return <AssetsCenter data={platform} status={serviceStatus} />;
    return <IntegrationsCenter data={platform} status={serviceStatus} serviceUrl={serviceUrl} go={go} />;
  }

  return (
    <div className={cls("app-shell", sidebarCollapsed && "sidebar-collapsed")}>
      <header className="global-header">
        <button type="button" className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="打开导航"><Menu size={20} /></button>
        <button type="button" className="global-brand" onClick={() => go("command")} aria-label="返回工作台"><span className="brand-symbol"><ShieldCheck size={19} /></span><span className="brand-copy"><strong>政务安全</strong><small>政务大模型安全平台</small></span></button>
        <div className="global-project"><span>工作空间</span><strong>政务大模型护栏</strong></div>
        <button ref={commandTriggerRef} type="button" className="global-search-trigger" onClick={() => setCommandOpen(true)}><Search size={15} /><span>搜索页面与功能</span><kbd>⌘ K</kbd></button>
        <div className="global-header-actions">
          {runBusy && <span className="running-indicator"><i />任务运行中</span>}
          <span className={cls("global-status", serviceStatus === "已连接" && !platform?.loadWarnings.length && "connected", serviceStatus === "已连接" && Boolean(platform?.loadWarnings.length) && "degraded")}><i />{serviceStatus === "已连接" ? platform?.loadWarnings.length ? "系统部分可用" : "系统运行正常" : serviceStatus === "检测中" ? "正在检测服务" : platform ? "连接中断 · 已保留数据" : "系统服务离线"}</span>
        </div>
      </header>

      <aside className={cls("sidebar", mobileNav && "mobile-open")}>
        <div className="side-context"><div><span>当前项目</span><strong>安全护栏</strong><small>safe_guard + red_blue</small></div><button type="button" className="mobile-close" onClick={() => setMobileNav(false)} aria-label="关闭导航"><X size={19} /></button></div>
        <nav aria-label="主要导航">{navGroups.map((group) => <div className="nav-group" key={group.label}><span className="nav-label">{group.label}</span>{group.items.map((item) => <button type="button" title={sidebarCollapsed ? item.label : undefined} key={item.id} className={primaryNavigationId(active) === item.id ? "active" : ""} onClick={() => go(item.id)}><item.icon size={18} /><span>{item.label}</span>{item.id === "review" && pending > 0 && <i>{pending > 99 ? "99+" : pending}</i>}</button>)}</div>)}</nav>
        <button type="button" className="sidebar-toggle" onClick={toggleSidebar} aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}>{sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}<span>{sidebarCollapsed ? "展开" : "收起侧栏"}</span></button>
      </aside>
      {mobileNav && <button type="button" className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="关闭导航遮罩" />}

      <main className="main-shell">
        <header className="page-header">
          <div className="page-heading"><div className="breadcrumbs"><span>政务大模型安全</span><ChevronRight size={14} /><span>{viewMeta[active].title}</span></div><h1>{viewMeta[active].title}</h1><p>{viewMeta[active].subtitle}</p></div>
          <div className="page-actions">{lastUpdated && <span className="last-updated"><Clock3 size={14} />{lastUpdated.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>}<button type="button" className="icon-button bordered" aria-label="刷新数据" onClick={() => refresh(false)} disabled={serviceStatus === "检测中"}><RefreshCcw size={17} /></button>{!active.startsWith("guardrail") && active !== "agent" && <button type="button" className="primary-button" onClick={() => go("agent")}><Zap size={16} />新建评测</button>}</div>
        </header>
        <div className="content">{renderView()}</div>
      </main>

      {commandOpen && <div className="command-layer"><button type="button" className="command-backdrop" onClick={() => { setCommandOpen(false); window.requestAnimationFrame(() => commandTriggerRef.current?.focus()); }} aria-label="关闭搜索" /><dialog open className="command-palette" aria-modal="true" aria-label="搜索页面与功能" onKeyDown={keepCommandFocus}><div className="command-input"><Search size={18} /><input ref={commandInputRef} value={commandQuery} onChange={(event) => { setCommandQuery(event.target.value); setCommandIndex(0); }} onKeyDown={handleCommandKey} placeholder="搜索护栏、政策、运行、Trace 或数据集" aria-label="搜索页面与功能" /><kbd>ESC</kbd></div><div className="command-results">{commandItems.length ? commandItems.map((item, index) => <button type="button" className={commandIndex === index ? "active" : ""} key={item.id} onMouseEnter={() => setCommandIndex(index)} onClick={() => go(item.id)}><span><item.icon size={17} /></span><div><strong>{item.label}</strong><small>{item.group} · {viewMeta[item.id].subtitle}</small></div><ChevronRight size={15} /></button>) : <div className="command-empty">没有匹配的页面</div>}</div></dialog></div>}
      {toast && <div className="toast" role="status" aria-live="polite"><AlertCircle size={18} /><span>{toast}</span><button type="button" onClick={() => setToast("")} aria-label="关闭提示"><X size={15} /></button></div>}
    </div>
  );
}
