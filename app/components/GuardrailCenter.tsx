"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Download,
  ExternalLink,
  FileSearch,
  Fingerprint,
  History,
  LoaderCircle,
  LockKeyhole,
  Play,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  ShieldX,
  Square,
} from "lucide-react";
import { EmptyState, PanelTitle, StatusBadge, cls } from "./console-ui";
import {
  endpoint,
  formatTime,
  GUARDRAIL_CATALOG,
  responseError,
  serviceErrorMessage,
  type GuardrailAudit,
  type GuardrailBatchRun,
  type GuardrailCheckResult,
  type PlatformData,
  type ServiceStatus,
} from "./platform";

type SharedProps = {
  data: PlatformData | null;
  status: ServiceStatus;
};

const BATCH_ACTIVE_STATUSES: GuardrailBatchRun["status"][] = ["queued", "running", "cancel_requested"];

function actionLabel(action?: string | null) {
  const labels: Record<string, string> = {
    allow: "放行",
    rewrite: "已改写",
    block: "已阻断",
    pass: "通过",
    regenerate: "已修正",
    review: "隔离待复核",
    supported: "证据支持",
    contradicted: "存在冲突",
    insufficient: "证据不足",
    not_covered: "未覆盖",
    generated: "已生成",
    provided: "已提供",
    unavailable: "未连接",
    safe: "安全",
    unsafe: "有风险",
    not_run: "未执行",
    error: "执行失败",
  };
  return action ? labels[action] || action : "未执行";
}

function responseSourceLabel(source?: string | null) {
  if (source === "qwen") return "Qwen 自动生成";
  if (source === "provided") return "人工响应草稿";
  if (source === "unavailable") return "模型未连接";
  return "前序阶段阻断";
}

function evidenceCoverage(item: GuardrailAudit) {
  if (item.fact_verdict == null) return "未执行";
  if (item.required_claim_count === 0) return "无需核查";
  if (item.support_ratio == null) return "未计算";
  return `${Math.round(item.support_ratio * 100)}% · ${item.supported_claim_count}/${item.required_claim_count ?? 0}`;
}

function actionTone(action?: string | null) {
  if (["allow", "pass", "supported"].includes(action || "")) return "success";
  if (["block", "contradicted", "unsafe", "error"].includes(action || "")) return "danger";
  if (["generated", "provided", "safe"].includes(action || "")) return "success";
  if (["rewrite", "regenerate", "review", "insufficient"].includes(action || "")) return "warning";
  return "neutral";
}

function batchStatusLabel(status: GuardrailBatchRun["status"]) {
  const labels: Record<GuardrailBatchRun["status"], string> = {
    queued: "排队中",
    running: "运行中",
    cancel_requested: "正在停止",
    cancelled: "已停止",
    completed: "已完成",
    failed: "失败",
  };
  return labels[status];
}

function batchStatusTone(status: GuardrailBatchRun["status"]) {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (["queued", "running", "cancel_requested"].includes(status)) return "warning";
  return "neutral";
}

function percent(value?: number | null) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function evidenceQualityLabel(tier?: string | null) {
  const labels: Record<string, string> = {
    strong: "证据质量强",
    acceptable: "证据质量可用",
    weak: "证据质量弱",
    no_evidence: "未检索到证据",
  };
  return tier ? labels[tier] || tier : "未评级";
}

function claimTypeLabel(type: string) {
  const labels: Record<string, string> = {
    factual_statement: "事实陈述",
    policy_statement: "政策陈述",
    numeric_claim: "数字信息",
    eligibility_claim: "资格条件",
    procedural_claim: "办理流程",
    deadline_claim: "办理时限",
  };
  return labels[type] || "可核验声明";
}

type EvidenceItem = NonNullable<NonNullable<GuardrailCheckResult["stages"]["fact"]>["evidence"]>[number];

function evidenceRankLabel(item: EvidenceItem) {
  if (item.vector_score != null) return `语义相关 ${Math.round(item.vector_score * 100)}%`;
  if (item.score_type === "rrf") return item.rank ? `混合检索第 ${item.rank} 位` : "混合检索证据";
  return `匹配度 ${Math.round(item.score * 100)}%`;
}

function judgeSummary(stage: GuardrailCheckResult["stages"]["judge"]) {
  if (!stage) return "前序阶段未通过，未执行裁判。";
  const reason = stage.reason || stage.label || "";
  const chineseChars = reason.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const latinChars = reason.match(/[A-Za-z]/g)?.length ?? 0;
  if (chineseChars >= 8 && chineseChars >= latinChars * 0.2) return reason;
  if (["safe", "pass", "allow"].includes(stage.action)) return "裁判未发现需要阻断的安全风险。";
  if (stage.action === "unsafe") return "裁判发现高风险内容，响应已进入阻断处置。";
  return "裁判已完成安全判定。";
}

function AuditTable({ audits }: { audits: GuardrailAudit[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (!audits.length) {
    return <EmptyState icon={FileSearch} title="暂无护栏审计" text="首次执行后，这里会保留真实检查记录。" />;
  }
  return (
    <div className="table-scroll">
      <table className="data-table guard-audit-table">
        <thead><tr><th>时间</th><th>请求</th><th>回答来源</th><th>输入</th><th>输出</th><th>事实核查</th><th>证据覆盖</th><th>最终处置</th><th aria-label="详情" /></tr></thead>
        <tbody>{audits.slice(0, 12).map((item) => {
          const expanded = expandedId === item.audit_id;
          const stages = item.details?.stages;
          const checkedResponse = item.draft_response || stages?.output?.raw_response || item.final_response;
          return (
            <Fragment key={item.audit_id}>
              <tr className={expanded ? "expanded" : undefined}>
                <td className="nowrap">{formatTime(item.created_at)}</td>
                <td><strong className="clamp-line">{item.prompt}</strong><code>{item.audit_id}</code></td>
                <td><span className="audit-source">{responseSourceLabel(item.response_source)}</span></td>
                <td><StatusBadge tone={actionTone(item.input_action)}>{actionLabel(item.input_action)}</StatusBadge></td>
                <td><StatusBadge tone={actionTone(item.output_action)}>{actionLabel(item.output_action)}</StatusBadge></td>
                <td><StatusBadge tone={actionTone(item.fact_verdict)}>{actionLabel(item.fact_verdict)}</StatusBadge></td>
                <td><span className="coverage-value">{evidenceCoverage(item)}</span></td>
                <td><StatusBadge tone={actionTone(item.action)} dot>{actionLabel(item.action)}</StatusBadge></td>
                <td><button type="button" className="audit-detail-button" aria-label={expanded ? "收起审计详情" : "查看审计详情"} aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : item.audit_id)}>{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button></td>
              </tr>
              {expanded && <tr className="audit-detail-row"><td colSpan={9}>
                <div className="audit-detail-meta">
                  <span><small>回答来源</small><strong>{responseSourceLabel(item.response_source)}</strong></span>
                  <span><small>证据</small><strong>{item.evidence_count} 条</strong></span>
                  <span><small>关键证据覆盖</small><strong>{item.required_claim_count === 0 ? "无需核查" : item.critical_support_ratio == null ? "未计算" : `${Math.round(item.critical_support_ratio * 100)}%`}</strong></span>
                  <span><small>是否可发布</small><strong>{item.release_ready ? "可以" : "否，需复核"}</strong></span>
                </div>
                <div className="audit-response-compare">
                  <article><small>本次受检回答</small><p>{checkedResponse || "前序阶段已阻断，未生成回答。"}</p></article>
                  <article><small>系统最终响应</small><p>{item.final_response || "无返回内容"}</p></article>
                </div>
                {stages?.fact?.reason && <p className="audit-reason"><strong>判断原因：</strong>{stages.fact.initial_reason ? `初次核查：${stages.fact.initial_reason}；自动修正后：${stages.fact.reason}` : stages.fact.reason}</p>}
              </td></tr>}
            </Fragment>
          );
        })}</tbody>
      </table>
    </div>
  );
}

export function GuardrailRuntime({
  data,
  status,
  serviceUrl,
  notify,
  refresh,
}: SharedProps & {
  serviceUrl: string;
  notify: (message: string) => void;
  refresh: (silent?: boolean) => Promise<boolean>;
}) {
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<GuardrailCheckResult | null>(null);
  const overview = data?.guardrail ?? GUARDRAIL_CATALOG;
  const factGate = overview.fact_gate;
  const targetService = data?.modelServices.items.find((item) => item.key === "target");
  const evaluatorService = data?.modelServices.items.find((item) => item.key === "evaluator");
  const modelReady = targetService?.connected ?? false;
  const evaluatorReady = evaluatorService?.connected ?? false;
  const coreServiceReady = status === "已连接";
  const advancedRetrievalReady = Boolean(factGate?.active);
  const fallbackRetrievalReady = Boolean(factGate?.fallback_available && overview.policy_count > 0);
  const policyCount = advancedRetrievalReady ? factGate?.policy_count ?? 0 : overview.policy_count;

  async function runCheck() {
    if (!prompt.trim()) {
      notify("请先输入需要检查的用户请求");
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const response = await fetch(endpoint(serviceUrl, "/api/guardrail/check"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), draft_response: draft.trim() }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const next = await response.json() as GuardrailCheckResult;
      setResult(next);
      await refresh(true);
      notify(`护栏检查完成 · ${actionLabel(next.action)}`);
    } catch (error) {
      await refresh(true);
      notify(serviceErrorMessage(error, "护栏检查失败"));
    } finally {
      setRunning(false);
    }
  }

  const runtimeCapabilities = [
    { key: "rules", name: "输入与输出规则", detail: "风险识别、隐私脱敏", available: coreServiceReady, icon: ShieldCheck },
    { key: "retrieval", name: "政策检索", detail: advancedRetrievalReady ? `${factGate?.retrieval_chunk_count ?? 0} 个检索片段` : `${policyCount} 条轻量政策证据`, available: coreServiceReady && (advancedRetrievalReady || fallbackRetrievalReady), icon: BookOpenCheck },
    { key: "target", name: "回答模型", detail: targetService?.model || "Qwen3-8B", available: coreServiceReady && modelReady, icon: ServerCog },
    { key: "judge", name: "安全裁判", detail: evaluatorService?.model || "TinyR1-Safety-8B", available: coreServiceReady && evaluatorReady, icon: ShieldCheck },
  ];
  const availableCapabilityCount = runtimeCapabilities.filter((item) => item.available).length;
  const pipelineReady = availableCapabilityCount === runtimeCapabilities.length;
  const factStage = result?.stages.fact;
  const rag = factStage?.details?.rag;
  const evidence = factStage?.evidence ?? [];
  const claims = factStage?.claims ?? [];
  const claimCoverage = factStage?.details?.judge?.claim_coverage ?? [];
  const coverageByClaim = new Map(claimCoverage.map((item) => [item.claim_id, item]));
  const evidenceIndexById = new Map(evidence.map((item, index) => [item.id, index]));
  const retrievalCount = result?.stages.model?.grounding?.evidence_count ?? evidence.length;
  const supportRatio = factStage?.details?.judge?.support_ratio;
  const requiredClaimCount = factStage?.details?.judge?.required_claim_count;
  const retrievalBackend = rag?.retrieval_backend || result?.stages.model?.grounding?.retrieval_backend || factGate?.retrieval_backend || "规则检索";
  const retrievalAction = !result ? "not_run" : retrievalCount > 0 ? "supported" : factStage ? "insufficient" : "not_run";
  const traceSteps = result ? [
    {
      key: "input",
      name: "输入检查",
      actor: "护栏规则",
      icon: ShieldCheck,
      action: result.stages.input.action,
      detail: result.stages.input.details?.risk_types?.length ? result.stages.input.details.risk_types.join(" · ") : `风险分 ${result.stages.input.details?.risk_score?.toFixed(2) ?? "0.00"}`,
      latency: result.stages.input.details?.latency_ms,
    },
    {
      key: "retrieval",
      name: "生成前检索",
      actor: retrievalBackend,
      icon: Database,
      action: retrievalAction,
      detail: retrievalCount ? `回答生成采用 ${retrievalCount} 条证据 · ${evidenceQualityLabel(rag?.quality_tier || result.stages.model?.grounding?.quality_tier)}` : "没有检索到可用于回答的政策证据",
    },
    {
      key: "model",
      name: "回答生成",
      actor: result.stages.model?.model || targetService?.model || "Qwen3-8B",
      icon: ServerCog,
      action: result.stages.model?.action || "not_run",
      detail: result.stages.model ? responseSourceLabel(result.stages.model.source) : "输入阶段已结束流程，未调用模型",
    },
    {
      key: "output",
      name: "输出检查",
      actor: "隐私与内容规则",
      icon: LockKeyhole,
      action: result.stages.output?.action || "not_run",
      detail: result.stages.output ? `${result.stages.output.details?.pii_found?.length ?? 0} 项隐私命中 · ${result.stages.output.details?.flags?.join(" / ") || "无风险标记"}` : "未进入输出检查",
    },
    {
      key: "judge",
      name: "安全裁判",
      actor: result.stages.judge?.model || evaluatorService?.model || "TinyR1-Safety-8B",
      icon: ShieldCheck,
      action: result.stages.judge?.action || "not_run",
      detail: result.stages.judge ? `${judgeSummary(result.stages.judge)} · P/S/R ${result.stages.judge.conclusion || "—"}` : "前序阶段未通过，未执行裁判",
    },
    {
      key: "fact",
      name: "事实复核",
      actor: rag?.llm_judge_invoked ? "Qwen 事实裁判" : "规则与证据门控",
      icon: BookOpenCheck,
      action: factStage?.verdict || factStage?.action || "not_run",
      detail: factStage ? `${evidence.length} 条核查证据 · ${factStage.initial_reason ? "初次核查未通过，已根据证据自动修正" : factStage.reason}` : "前序阶段未通过，未执行事实核查",
      latency: rag?.latency_ms,
    },
  ] : [];

  return (
    <div className="view-stack">
      <section className="guard-runtime-grid">
        <div className="panel guard-composer">
          <PanelTitle
            title="检查请求"
            subtitle="输入请求；响应草稿留空时由 Qwen 自动生成"
            meta={<span className={cls("pipeline-health", pipelineReady && "ready")}>{pipelineReady ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}<span>{availableCapabilityCount} / {runtimeCapabilities.length} 个组件可用</span></span>}
          />
          <div className="guard-form">
            <label><span>用户请求 <em>必填</em><small>{prompt.length} / 4000</small></span><textarea value={prompt} maxLength={4000} onChange={(event) => setPrompt(event.target.value)} placeholder="输入准备发送给政务大模型的请求" rows={5} /></label>
            <label><span>响应草稿 <small>{modelReady ? "可选；留空将由 Qwen3-8B 自动生成" : "Qwen 未连接时可粘贴响应继续检查"} · {draft.length} / 30000</small></span><textarea value={draft} maxLength={30000} onChange={(event) => setDraft(event.target.value)} placeholder={modelReady ? "可选：用于复测一段已有回答" : "粘贴需要检查的模型响应"} rows={7} /></label>
            <div className="guard-form-footer"><p>{modelReady ? `生成：${targetService?.model}` : "Qwen3-8B 未连接"} · {evaluatorReady ? `裁判：${evaluatorService?.model}` : "TinyR1 未连接，将跳过模型裁判"}</p><button type="button" className="primary-button" onClick={runCheck} disabled={running || status !== "已连接" || !prompt.trim()}>{running ? <LoaderCircle size={16} className="spin" /> : <Play size={16} />}{running ? "检查中" : "执行检查"}</button></div>
          </div>
        </div>

        <aside className="panel guard-runtime-status">
          <PanelTitle title="本次调用组件" subtitle="仅显示实际参与运行的依赖" />
          <div className="guard-module-list">{runtimeCapabilities.map((item) => <div key={item.key}><span className={cls("module-state-icon", item.available && "ready")}>{item.available ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}</span><div><strong>{item.name}</strong><p>{item.detail}</p></div><StatusBadge tone={item.available ? "success" : "warning"}>{item.available ? "可用" : "离线"}</StatusBadge></div>)}</div>
          <div className="runtime-thresholds"><span><small>输入改写</small><strong>{overview.thresholds.input_rewrite}</strong></span><span><small>输入阻断</small><strong>{overview.thresholds.input_block}</strong></span><span><small>政策单元</small><strong>{policyCount}</strong></span></div>
        </aside>
      </section>

      {result && <section className="panel guard-result-panel">
        <PanelTitle title="运行结果" subtitle={result.audit_id} meta={<StatusBadge tone={actionTone(result.action)} dot>{actionLabel(result.action)}</StatusBadge>} />
        <div className="guard-result-summary">
          <div className={cls("decision-card", actionTone(result.action))}><span>{result.action === "block" ? <ShieldX size={22} /> : <Fingerprint size={22} />}</span><div><small>{result.action === "review" ? "隔离响应（尚未放行）" : result.action === "block" ? "拦截提示" : "最终响应"}</small><p>{result.final_response || (result.requires_model ? "输入检查已完成；需要目标模型生成响应后继续。" : "无返回内容")}</p><div className="decision-meta"><span>回答来源：{responseSourceLabel(result.stages.model?.source)}</span><span>政策证据：{evidence.length} 条</span><span>{result.release_ready === false ? "不可直接发布" : "可以发布"}</span></div></div></div>
        </div>
        <div className="guard-trace-layout">
          <section className="guard-trace" aria-label="本次调用链路">
            <header><div><strong>调用链路</strong><span>Trace</span></div><small>{traceSteps.length} 个步骤</small></header>
            <ol>{traceSteps.map((step, index) => <li key={step.key}>
              <span className={cls("trace-step-icon", actionTone(step.action))}><step.icon size={16} /></span>
              <div className="trace-step-copy"><span><b>{String(index + 1).padStart(2, "0")}</b>{step.name}<small>{step.actor}</small></span><p>{step.detail}</p></div>
              <div className="trace-step-state"><StatusBadge tone={actionTone(step.action)}>{actionLabel(step.action)}</StatusBadge>{step.latency != null && <small>{step.latency.toFixed(0)} ms</small>}</div>
            </li>)}</ol>
          </section>
          <aside className="rag-inspector">
            <header><div><strong>RAG 事实门控</strong><p>展示本次实际检索和核查结果</p></div><StatusBadge tone={actionTone(factStage?.verdict)}>{actionLabel(factStage?.verdict)}</StatusBadge></header>
            <dl className="rag-metrics">
              <div><dt>检索引擎</dt><dd>{retrievalBackend}</dd></div>
              <div><dt>核查证据</dt><dd>{evidence.length} 条</dd></div>
              <div><dt>声明覆盖</dt><dd>{requiredClaimCount === 0 ? "无需核查" : supportRatio == null ? "未计算" : `${Math.round(supportRatio * 100)}%`}</dd></div>
              <div><dt>质量门控</dt><dd>{evidenceQualityLabel(rag?.quality_tier)}</dd></div>
            </dl>
            <div className="rag-verdict"><strong>核查结论</strong><p>{factStage?.reason || "本次请求未进入事实核查。"}</p><small>{rag?.corrective_attempted ? `已执行纠错检索${rag.corrective_improved ? "，证据质量得到改善" : ""}` : "未触发纠错检索"} · {rag?.llm_judge_invoked ? "Qwen 事实裁判已复核" : rag?.llm_judge_available ? "规则已形成高置信结论" : "使用规则与证据门控"}</small></div>
            {!!claims.length && <div className="rag-claims"><div className="rag-evidence-heading"><strong>声明核查</strong><span>{claims.length} 条可核验声明</span></div><ol>{claims.map((claim, index) => { const coverage = coverageByClaim.get(claim.id); const evidenceIndex = coverage?.best_evidence_id ? evidenceIndexById.get(coverage.best_evidence_id) : undefined; return <li key={claim.id}><b>{String(index + 1).padStart(2, "0")}</b><div><p>{claim.text}</p><small>{claimTypeLabel(claim.claim_type)} · {claim.critical ? "关键声明" : "一般声明"}{evidenceIndex != null && <> · <a href={`#rag-evidence-${evidenceIndex}`}>{coverage?.supported ? "支持证据" : "最接近证据"} {String(evidenceIndex + 1).padStart(2, "0")}</a></>}</small></div><StatusBadge tone={!claim.evidence_required ? "neutral" : coverage?.supported ? "success" : "warning"}>{!claim.evidence_required ? "无需证据" : coverage?.supported ? "有依据" : "待补证"}</StatusBadge></li>; })}</ol></div>}
            <div className="rag-evidence"><div className="rag-evidence-heading"><strong>政策证据</strong><span>{evidence.length ? "按相关性排序，点击展开原文" : "未采用证据"}</span></div>
              {evidence.length ? evidence.map((item, index) => <details id={`rag-evidence-${index}`} key={item.id}><summary><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{item.title}</strong><small>{item.issuing_authority || item.source} · {evidenceRankLabel(item)}</small></span><StatusBadge tone={item.production_ready ? "success" : "neutral"}>{item.production_ready ? "正式来源" : item.domain}</StatusBadge></summary><p>{item.content}</p>{item.url && <a href={item.url} target="_blank" rel="noreferrer">打开政策来源<ExternalLink size={12} /></a>}</details>) : <div className="rag-evidence-empty"><FileSearch size={18} /><span>没有检索到与本次请求匹配的政策证据。</span></div>}
            </div>
          </aside>
        </div>
      </section>}

      <section className="panel"><PanelTitle title="护栏审计" subtitle="最近 12 次真实调用" /><AuditTable audits={data?.guardrailAudits ?? []} /></section>
    </div>
  );
}

export function GuardrailAssets({ data, status }: SharedProps) {
  const policies = data?.guardrailPolicies ?? [];
  const overview = data?.guardrail ?? GUARDRAIL_CATALOG;
  const models = overview.models;
  const serviceReady = (serviceKey?: string | null) => {
    if (!serviceKey) return undefined;
    return data?.modelServices.items.find((item) => item.key === serviceKey)?.connected ?? false;
  };
  const readyCount = models.filter((item) => serviceReady(item.service_key) ?? item.ready).length;
  const coreModels = models.filter((item) => item.service_key);
  const optionalModels = models.filter((item) => !item.service_key);
  const readyCoreCount = coreModels.filter((item) => serviceReady(item.service_key) ?? item.ready).length;
  const readyOptionalCount = optionalModels.filter((item) => item.ready).length;
  return <div className="view-stack">
    <section className="guard-readiness-strip">{overview.modules.map((module) => <div className="panel" key={module.key}><span className={cls("module-state-icon", module.ready && "ready")}>{module.ready ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}</span><div><strong>{module.name}</strong><p>{module.scope}</p></div><StatusBadge tone={module.ready ? "success" : "warning"} dot>{module.ready ? "可运行" : "待部署"}</StatusBadge></div>)}</section>
    <section className="panel"><PanelTitle title="模型与运行依赖" subtitle={`核心服务 ${readyCoreCount}/${coreModels.length} 在线 · 可选增强 ${readyOptionalCount}/${optionalModels.length} 启用`} meta={<StatusBadge tone={readyCoreCount === coreModels.length ? "success" : "warning"}>{readyCount} / {models.length} 可用</StatusBadge>} /><div className="table-scroll"><table className="data-table guard-model-table"><thead><tr><th>组件</th><th>模型</th><th>用途</th><th>接入位置</th><th>状态</th></tr></thead><tbody>{models.map((item) => { const connected = serviceReady(item.service_key); const ready = connected ?? item.ready; const optional = !item.service_key && !ready; return <tr key={item.model}><td><strong>{item.name}</strong></td><td><code>{item.model}</code></td><td>{item.purpose}</td><td><code>{item.endpoint || item.path}</code></td><td><StatusBadge tone={optional ? "neutral" : ready ? "success" : "warning"} dot>{connected === true ? "在线" : connected === false ? "离线" : ready ? "已启用" : "可选扩展"}</StatusBadge></td></tr>; })}</tbody></table></div></section>
    <section className="panel"><PanelTitle title="政策证据库" subtitle={`${policies.length} 条已接入记录`} meta={<StatusBadge tone={policies.some((item) => item.production_ready) ? "success" : "warning"}>{policies.some((item) => item.production_ready) ? "含正式来源" : "仅示例/测试"}</StatusBadge>} /><div className="table-scroll"><table className="data-table policy-table"><thead><tr><th>政策主题</th><th>领域</th><th>内容</th><th>来源</th><th>可用于生产</th></tr></thead><tbody>{policies.map((item) => <tr key={item.id}><td><strong>{item.title}</strong><code>{item.id}</code></td><td>{item.domain}</td><td><p>{item.content}</p></td><td>{item.source}</td><td><StatusBadge tone={item.production_ready ? "success" : "warning"}>{item.production_ready ? "是" : "否"}</StatusBadge></td></tr>)}</tbody></table></div>{!policies.length && status !== "检测中" && <EmptyState icon={BookOpenCheck} title="未找到政策库" text="接入政策 JSONL 后会显示在这里。" />}</section>
  </div>;
}

export function GuardrailEvaluation({
  data,
  status,
  serviceUrl,
  notify,
  refresh,
}: SharedProps & {
  serviceUrl: string;
  notify: (message: string) => void;
  refresh: (silent?: boolean) => Promise<boolean>;
}) {
  const overview = data?.guardrail ?? GUARDRAIL_CATALOG;
  const datasets = overview.datasets;
  const total = useMemo(() => datasets.reduce((sum, item) => sum + item.records, 0), [datasets]);
  const targetReady = data?.modelServices.items.find((item) => item.key === "target")?.connected ?? false;
  const evaluatorReady = data?.modelServices.items.find((item) => item.key === "evaluator")?.connected ?? false;
  const batchReady = targetReady && evaluatorReady;
  const [datasetName, setDatasetName] = useState("");
  const [limit, setLimit] = useState(5);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [liveRun, setLiveRun] = useState<GuardrailBatchRun | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const recommendedDataset = datasets.find((item) => item.name === "S-Eval_attack_zh_5") ?? datasets[0];
  const effectiveDatasetName = datasetName || recommendedDataset?.name || "";
  const selectedDataset = datasets.find((item) => item.name === effectiveDatasetName);
  const historyRuns = data?.guardrailBatchRuns ?? [];
  const run = liveRun ?? historyRuns[0] ?? null;
  const selectableRuns = liveRun && !historyRuns.some((item) => item.batch_id === liveRun.batch_id)
    ? [liveRun, ...historyRuns]
    : historyRuns;
  const runActive = !!run && BATCH_ACTIVE_STATUSES.includes(run.status);
  const anotherRunActive = historyRuns.some((item) => item.batch_id !== run?.batch_id && BATCH_ACTIVE_STATUSES.includes(item.status));
  const anyRunActive = runActive || anotherRunActive;
  const pollingBatchId = run?.batch_id;
  const pollingStatus = run?.status;

  useEffect(() => {
    if (!pollingBatchId || !pollingStatus || !BATCH_ACTIVE_STATUSES.includes(pollingStatus)) return;
    let disposed = false;
    let settled = false;
    async function poll() {
      try {
        const response = await fetch(endpoint(serviceUrl, `/api/guardrail/batch-runs/${pollingBatchId}`));
        if (!response.ok) throw new Error(await responseError(response));
        const next = await response.json() as GuardrailBatchRun;
        if (disposed) return;
        setLiveRun(next);
        if (!settled && ["completed", "failed", "cancelled"].includes(next.status)) {
          settled = true;
          await refresh(true);
          notify(next.status === "completed" ? `批量评测完成 · ${next.summary.passed ?? 0}/${next.completed_count} 条通过` : next.status === "cancelled" ? `批量评测已停止 · 已完成 ${next.completed_count} 条` : `批量评测失败 · ${next.error_message || "请查看任务详情"}`);
        }
      } catch (error) {
        if (!disposed && !settled) {
          settled = true;
          notify(serviceErrorMessage(error, "读取批量评测进度失败"));
        }
      }
    }
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 1200);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [notify, pollingBatchId, pollingStatus, refresh, serviceUrl]);

  async function startBatch(config?: { dataset: string; limit: number }) {
    const nextDataset = config?.dataset ?? effectiveDatasetName;
    const nextLimit = config?.limit ?? limit;
    if (!nextDataset || !batchReady || anyRunActive) return;
    setStarting(true);
    setExpandedIndex(null);
    if (config) {
      setDatasetName(config.dataset);
      setLimit(config.limit);
    }
    try {
      const response = await fetch(endpoint(serviceUrl, "/api/guardrail/batch-runs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataset: nextDataset, limit: nextLimit }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const next = await response.json() as GuardrailBatchRun;
      setLiveRun(next);
      notify(`已开始护栏批量评测 · ${nextDataset} · ${next.limit_count} 条`);
    } catch (error) {
      notify(serviceErrorMessage(error, "批量评测启动失败"));
    } finally {
      setStarting(false);
    }
  }

  async function cancelBatch() {
    if (!run || !runActive || cancelling) return;
    setCancelling(true);
    try {
      const response = await fetch(endpoint(serviceUrl, `/api/guardrail/batch-runs/${run.batch_id}/cancel`), { method: "POST" });
      if (!response.ok) throw new Error(await responseError(response));
      const next = await response.json() as GuardrailBatchRun;
      setLiveRun(next);
      notify("已提交停止请求，当前样本完成后停止");
    } catch (error) {
      notify(serviceErrorMessage(error, "停止批量评测失败"));
    } finally {
      setCancelling(false);
    }
  }

  function selectHistory(batchId: string) {
    const selected = selectableRuns.find((item) => item.batch_id === batchId);
    if (!selected) return;
    setLiveRun(selected);
    setDatasetName(selected.dataset_name);
    setLimit(selected.limit_count);
    setExpandedIndex(null);
  }

  const steps = [
    { index: "01", title: "输入与生成", text: "输入护栏检查后，由 Qwen3-8B 生成回答", ready: targetReady, state: targetReady ? "就绪" : "离线" },
    { index: "02", title: "输出护栏", text: "检查隐私、风险内容并执行必要改写", ready: true, state: "就绪" },
    { index: "03", title: "安全与事实裁判", text: "TinyR1 判定安全性，同时核查政策事实", ready: evaluatorReady, state: evaluatorReady ? "就绪" : "离线" },
    { index: "04", title: "结果报告", text: "汇总通过率、发布率、处置分布和逐条证据", ready: true, state: "自动生成" },
  ];
  const progress = Math.round((run?.progress ?? 0) * 100);
  const actionCounts = run?.summary.actions ?? {};
  const attackResults = run?.results.filter((item) => item.expected === "attack") ?? [];
  const benignResults = run?.results.filter((item) => item.expected === "benign") ?? [];
  const attackTotal = run?.summary.attack_total ?? attackResults.length;
  const attackDefended = run?.summary.attack_defended ?? attackResults.filter((item) => item.passed).length;
  const attackDefenseRate = run?.summary.attack_defense_rate
    ?? (attackTotal ? attackDefended / attackTotal : null);
  const benignTotal = run?.summary.benign_total ?? benignResults.length;
  const benignPassed = run?.summary.benign_passed ?? benignResults.filter((item) => item.passed).length;
  const benignPassRate = run?.summary.benign_pass_rate
    ?? (benignTotal ? benignPassed / benignTotal : null);
  const falsePositives = run?.summary.false_positives ?? benignResults.filter((item) => item.action === "block" || item.judge_action === "unsafe").length;
  const falsePositiveRate = run?.summary.false_positive_rate
    ?? (benignTotal ? falsePositives / benignTotal : null);
  const progressLabel = !run ? ""
    : run.status === "completed" ? "评测完成"
      : run.status === "failed" ? "任务失败"
        : run.status === "cancelled" ? "任务已停止"
          : run.status === "cancel_requested" ? "正在完成当前样本，随后停止"
            : run.status === "queued" ? "任务排队中"
              : `正在处理第 ${Math.min(run.completed_count + 1, run.limit_count)} 条`;
  const hasResults = (run?.results.length ?? 0) > 0;
  return <div className="view-stack">
    <section className="panel batch-launch-panel">
      <PanelTitle title="新建护栏批量评测" subtitle="对已有数据逐条执行在线防护全链路" meta={<StatusBadge tone={batchReady ? "success" : "warning"} dot>{batchReady ? "模型服务可用" : "等待模型服务"}</StatusBadge>} />
      <div className="batch-launch-form">
        <label><span>评测数据集</span><select value={effectiveDatasetName} onChange={(event) => { const name = event.target.value; const next = datasets.find((item) => item.name === name); setDatasetName(name); setLimit(Math.min(5, next?.records ?? 5)); }} disabled={anyRunActive}>{datasets.map((item) => <option value={item.name} key={item.name}>{item.name}</option>)}</select><small>{selectedDataset?.purpose || "选择需要批量检查的数据"} · {selectedDataset?.records.toLocaleString("zh-CN") ?? 0} 条</small></label>
        <label><span>本次抽取数量</span><input type="number" min={1} max={Math.min(50, selectedDataset?.records ?? 50)} value={limit} onChange={(event) => setLimit(Math.max(1, Math.min(Number(event.target.value) || 1, Math.min(50, selectedDataset?.records ?? 50))))} disabled={anyRunActive} /><small>单次最多 50 条，先小批验证后再扩大范围</small></label>
        <div className="batch-launch-status"><span className={cls("module-state-icon", targetReady && "ready")}>{targetReady ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}</span><div><strong>Qwen3-8B</strong><small>{targetReady ? "目标模型在线" : "目标模型离线"}</small></div><span className={cls("module-state-icon", evaluatorReady && "ready")}>{evaluatorReady ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}</span><div><strong>TinyR1-Safety-8B</strong><small>{evaluatorReady ? "裁判模型在线" : "裁判模型离线"}</small></div></div>
        <button type="button" className="primary-button batch-start-button" onClick={() => void startBatch()} disabled={!batchReady || status !== "已连接" || starting || anyRunActive || !effectiveDatasetName}>{starting || anyRunActive ? <LoaderCircle size={16} className="spin" /> : <Play size={16} />}{starting ? "正在创建" : anyRunActive ? "评测进行中" : "开始批量评测"}</button>
      </div>
    </section>

    {run ? <section className="panel batch-run-panel">
      <PanelTitle title="批量评测结果" subtitle={`${run.dataset_name} · ${run.batch_id}`} meta={<StatusBadge tone={batchStatusTone(run.status)} dot>{batchStatusLabel(run.status)}</StatusBadge>} />
      <div className="batch-run-toolbar">
        <label className="batch-history-picker"><History size={15} /><span>历史任务</span><select value={run.batch_id} onChange={(event) => selectHistory(event.target.value)} disabled={runActive}>{selectableRuns.map((item) => <option value={item.batch_id} key={item.batch_id}>{formatTime(item.created_at)} · {item.dataset_name} · {batchStatusLabel(item.status)}</option>)}</select></label>
        <div className="batch-result-actions">
          {runActive && <button type="button" className="secondary-button danger-button" onClick={() => void cancelBatch()} disabled={cancelling || run.status === "cancel_requested"}><Square size={14} />{cancelling || run.status === "cancel_requested" ? "正在停止" : "停止任务"}</button>}
          {!runActive && <button type="button" className="secondary-button" onClick={() => void startBatch({ dataset: run.dataset_name, limit: run.limit_count })} disabled={!batchReady || anyRunActive}><RotateCcw size={15} />重新运行</button>}
          {hasResults && <><a className="secondary-button" href={endpoint(serviceUrl, `/api/guardrail/batch-runs/${run.batch_id}/export?format=csv`)}><Download size={15} />CSV</a><a className="secondary-button" href={endpoint(serviceUrl, `/api/guardrail/batch-runs/${run.batch_id}/export?format=json`)}><Download size={15} />JSON</a></>}
        </div>
      </div>
      <div className="batch-progress-block"><div><strong>{progressLabel}</strong><span>{run.completed_count} / {run.limit_count} · {progress}%</span></div><div className="batch-progress-track"><i style={{ width: `${progress}%` }} /></div>{run.error_message && <p>{run.error_message}</p>}</div>
      <div className="batch-summary-grid">
        <article><small>综合通过</small><strong>{percent(run.summary.pass_rate)}</strong><span>{run.summary.passed ?? 0} / {run.completed_count} 条符合预期</span></article>
        <article><small>攻击防护率</small><strong>{percent(attackDefenseRate)}</strong><span>{attackDefended} / {attackTotal} 条攻击已防住</span></article>
        <article><small>正常放行率</small><strong>{percent(benignPassRate)}</strong><span>{benignPassed} / {benignTotal} 条正常请求通过</span></article>
        <article><small>正常误阻断率</small><strong>{percent(falsePositiveRate)}</strong><span>{falsePositives} 条正常请求被误拦</span></article>
        <article><small>可直接发布</small><strong>{percent(run.summary.release_rate)}</strong><span>{run.summary.released ?? 0} 条 · 阻断 {actionCounts.block ?? 0} 条 · 修正 {(actionCounts.rewrite ?? 0) + (actionCounts.regenerate ?? 0)} 条</span></article>
        <article><small>平均耗时</small><strong>{run.summary.average_latency_ms == null ? "—" : (run.summary.average_latency_ms / 1000).toFixed(1)}<em> 秒</em></strong><span>每条端到端</span></article>
      </div>
      {run.results.length ? <div className="table-scroll"><table className="data-table batch-result-table"><thead><tr><th>#</th><th>测试样本</th><th>输入处置</th><th>安全裁判</th><th>事实核查</th><th>最终结论</th><th>耗时</th><th aria-label="详情" /></tr></thead><tbody>{run.results.map((item) => { const expanded = expandedIndex === item.index; return <Fragment key={`${item.source_id}-${item.index}`}><tr className={expanded ? "expanded" : undefined}><td className="numeric">{item.index}</td><td><strong className="clamp-line">{item.prompt}</strong><span><StatusBadge tone={item.expected === "attack" ? "warning" : "neutral"}>{item.expected === "attack" ? "风险样本" : "正常样本"}</StatusBadge>{item.category}</span></td><td><StatusBadge tone={actionTone(item.input_action)}>{actionLabel(item.input_action)}</StatusBadge></td><td><StatusBadge tone={actionTone(item.judge_action)}>{item.judge_conclusion || actionLabel(item.judge_action)}</StatusBadge></td><td><StatusBadge tone={actionTone(item.fact_verdict)}>{actionLabel(item.fact_verdict)}</StatusBadge></td><td><StatusBadge tone={item.passed ? "success" : "danger"} dot>{item.passed ? "通过" : "未通过"}</StatusBadge></td><td className="nowrap">{(item.latency_ms / 1000).toFixed(1)} 秒</td><td><button type="button" className="audit-detail-button" aria-label={expanded ? "收起结果详情" : "查看结果详情"} aria-expanded={expanded} onClick={() => setExpandedIndex(expanded ? null : item.index)}>{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button></td></tr>{expanded && <tr className="audit-detail-row"><td colSpan={8}><div className="batch-result-detail"><div><small>数据标注</small><strong>{item.risk_type} · {item.source_id}</strong></div><div><small>最终处置</small><strong>{actionLabel(item.action)} · {item.release_ready ? "可以发布" : "不可直接发布"}</strong></div><article><small>系统最终响应</small><p>{item.error || item.final_response || "前序护栏已阻断，未生成回答。"}</p></article>{item.audit_id && <code>{item.audit_id}</code>}</div></td></tr>}</Fragment>; })}</tbody></table></div> : <div className="batch-waiting"><LoaderCircle size={20} className={runActive ? "spin" : undefined} /><span>{runActive ? "正在读取首条样本并执行检查" : run.status === "cancelled" ? "任务在首条结果产生前已停止" : "本次任务没有产生逐条结果"}</span></div>}
    </section> : <section className="panel empty-artifacts"><EmptyState icon={FileSearch} title="尚未运行护栏批量评测" text="选择数据集和抽取数量后，可在本页查看进度、结果与导出文件。" /></section>}

    <section className="panel"><PanelTitle title="评测流水线" subtitle="生成、检查、裁判与报告" /><div className="batch-pipeline">{steps.map((step) => <article key={step.index}><span>{step.index}</span><div><strong>{step.title}</strong><p>{step.text}</p></div><StatusBadge tone={step.ready ? "success" : "warning"}>{step.state}</StatusBadge></article>)}</div></section>
    <section className="panel"><PanelTitle title="评测数据" subtitle={`${datasets.length} 个文件 · ${total.toLocaleString("zh-CN")} 条记录`} /><div className="table-scroll"><table className="data-table"><thead><tr><th>数据文件</th><th>用途</th><th>记录数</th><th>位置</th><th>状态</th></tr></thead><tbody>{datasets.map((item) => <tr key={item.name}><td><div className="name-cell"><Database size={17} /><strong>{item.name}</strong></div></td><td>{item.purpose}</td><td className="numeric">{item.records.toLocaleString("zh-CN")}</td><td><code>{item.path}</code></td><td><StatusBadge tone="success" dot>可读取</StatusBadge></td></tr>)}</tbody></table></div></section>
  </div>;
}
