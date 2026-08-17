"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Download,
  GitCompareArrows,
} from "lucide-react";
import {
  endpoint,
  responseError,
  type EvaluationRun,
  type PlatformData,
  type RunAnalytics,
  type ServiceStatus,
} from "./platform";
import { cls, EmptyState, PanelTitle, StatusBadge, TableSkeleton } from "./console-ui";

type AnalysisCenterProps = {
  data: PlatformData | null;
  status: ServiceStatus;
  serviceUrl: string;
  selectedRunId: string;
  onSelectRun: (runId: string) => void;
  onOpenEvidence: (runId: string) => void;
  notify: (message: string) => void;
};

const outcomeLabels: Record<string, string> = {
  defense_success: "防御成功",
  attack_success: "攻击成功",
  invalid: "无效攻击",
  control_pass: "良性对照通过",
  control_false_positive: "良性对照误报",
  pending: "待评测",
};

function percent(value: number) {
  return `${(value * 100).toFixed(value > 0 && value < 0.01 ? 1 : 0)}%`;
}

function runName(run: EvaluationRun | undefined) {
  return run?.name || run?.run_id || "—";
}

function summaryRate(analytics: RunAnalytics | undefined, key: "attack_success" | "defense_success") {
  const denominator = analytics?.summary.attack_total ?? analytics?.summary.total ?? 0;
  if (!denominator) return 0;
  return (analytics?.summary[key] ?? 0) / denominator;
}

export function AnalysisCenter({
  data,
  status,
  serviceUrl,
  selectedRunId,
  onSelectRun,
  onOpenEvidence,
  notify,
}: AnalysisCenterProps) {
  const runs = useMemo(
    () => (data?.runs ?? []).filter((run) => run.status === "completed"),
    [data?.runs],
  );
  const [candidateChoice, setCandidateChoice] = useState("");
  const [baselineChoice, setBaselineChoice] = useState("");
  const [analyticsByRun, setAnalyticsByRun] = useState<Record<string, RunAnalytics>>({});
  const candidateId = candidateChoice || selectedRunId || runs[0]?.run_id || "";
  const baselineId = baselineChoice || runs.find((run) => run.run_id !== candidateId)?.run_id || candidateId;
  const candidate = analyticsByRun[candidateId];
  const baseline = analyticsByRun[baselineId];
  const candidateRun = runs.find((run) => run.run_id === candidateId);
  const baselineRun = runs.find((run) => run.run_id === baselineId);

  useEffect(() => {
    if (status !== "已连接") return;
    const ids = [...new Set([candidateId, baselineId].filter(Boolean))];
    const missing = ids.filter((id) => !analyticsByRun[id]);
    if (!missing.length) return;
    const controller = new AbortController();
    async function load() {
      try {
        const responses = await Promise.all(
          missing.map((id) => fetch(endpoint(serviceUrl, `/api/runs/${id}/analytics`), { signal: controller.signal })),
        );
        const failed = responses.find((response) => !response.ok);
        if (failed) throw new Error(await responseError(failed));
        const payloads = await Promise.all(responses.map((response) => response.json() as Promise<RunAnalytics>));
        setAnalyticsByRun((current) => ({
          ...current,
          ...Object.fromEntries(payloads.map((item) => [item.run_id, item])),
        }));
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          notify(error instanceof Error ? error.message : "运行分析加载失败");
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [analyticsByRun, baselineId, candidateId, notify, serviceUrl, status]);

  const metrics = [
    {
      label: "Trace",
      baseline: baseline?.summary.total ?? 0,
      candidate: candidate?.summary.total ?? 0,
      format: (value: number) => String(value),
      risk: false,
    },
    {
      label: "攻击成功率",
      baseline: summaryRate(baseline, "attack_success"),
      candidate: summaryRate(candidate, "attack_success"),
      format: percent,
      risk: true,
    },
    {
      label: "防御成功率",
      baseline: summaryRate(baseline, "defense_success"),
      candidate: summaryRate(candidate, "defense_success"),
      format: percent,
      risk: false,
    },
    {
      label: "人工复核",
      baseline: baseline?.summary.reviewed ?? 0,
      candidate: candidate?.summary.reviewed ?? 0,
      format: (value: number) => String(value),
      risk: false,
    },
  ];

  const strategies = useMemo(() => {
    const names = new Set([
      ...(baseline?.strategies ?? []).map((item) => item.strategy),
      ...(candidate?.strategies ?? []).map((item) => item.strategy),
    ]);
    return [...names].map((strategy) => ({
      strategy,
      baseline: baseline?.strategies.find((item) => item.strategy === strategy),
      candidate: candidate?.strategies.find((item) => item.strategy === strategy),
    })).sort((a, b) => (b.candidate?.total ?? b.baseline?.total ?? 0) - (a.candidate?.total ?? a.baseline?.total ?? 0));
  }, [baseline, candidate]);

  if (!runs.length && status !== "检测中") {
    return (
      <div className="view-stack">
        <section className="panel">
          <EmptyState
            icon={BarChart3}
            title={status === "已连接" ? "暂无可分析运行" : "等待连接"}
            text={status === "已连接" ? "完成一项评测后即可建立基线并比较结果。" : "连接本地任务服务后读取实际运行。"}
          />
        </section>
      </div>
    );
  }

  return (
    <div className="view-stack">
      <section className="panel analysis-control">
        <PanelTitle
          title="运行对比"
          subtitle="同一数据口径下比较基线与候选运行"
          meta={<StatusBadge tone={candidate && baseline ? "success" : "warning"} dot>{candidate && baseline ? "数据已就绪" : "正在加载"}</StatusBadge>}
        />
        <div className="compare-picker">
          <label>
            <span>基线运行</span>
            <select value={baselineId} onChange={(event) => setBaselineChoice(event.target.value)}>
              {runs.map((run) => <option value={run.run_id} key={run.run_id}>{run.name} · {run.run_id}</option>)}
            </select>
          </label>
          <span className="compare-direction"><GitCompareArrows size={18} /></span>
          <label>
            <span>候选运行</span>
            <select value={candidateId} onChange={(event) => { setCandidateChoice(event.target.value); onSelectRun(event.target.value); }}>
              {runs.map((run) => <option value={run.run_id} key={run.run_id}>{run.name} · {run.run_id}</option>)}
            </select>
          </label>
          <div className="compare-actions">
            <button type="button" className="secondary-button" onClick={() => onOpenEvidence(candidateId)} disabled={!candidateId}><Activity size={15} />查看 Trace</button>
            <a className="secondary-button" href={endpoint(serviceUrl, `/api/runs/${candidateId}/export?format=json`)} download><Download size={15} />导出结果</a>
          </div>
        </div>
      </section>

      {status === "检测中" || !candidate || !baseline ? (
        <section className="panel"><TableSkeleton columns={4} rows={5} /></section>
      ) : (
        <>
          <section className="comparison-metrics" aria-label="对比摘要">
            {metrics.map((metric) => {
              const delta = metric.candidate - metric.baseline;
              const tone = delta === 0 ? "neutral" : (metric.risk ? delta < 0 : delta > 0) ? "success" : "danger";
              return <article className="panel" key={metric.label}><span>{metric.label}</span><div><strong>{metric.format(metric.candidate)}</strong><small>基线 {metric.format(metric.baseline)}</small></div><StatusBadge tone={tone}>{delta === 0 ? "持平" : `${delta > 0 ? "+" : ""}${metric.format(delta)}`}</StatusBadge></article>;
            })}
          </section>

          <section className="analysis-grid">
            <div className="panel outcome-panel">
              <PanelTitle title="判定分布" subtitle="占该运行全部 Trace 的比例" />
              <div className="run-legend"><span><i className="baseline" />{runName(baselineRun)}</span><span><i className="candidate" />{runName(candidateRun)}</span></div>
              <div className="outcome-bars">
                {Object.keys(outcomeLabels).map((key) => {
                  const baselineOutcome = baseline.outcomes.find((item) => item.key === key);
                  const candidateOutcome = candidate.outcomes.find((item) => item.key === key);
                  return <div className="outcome-row" key={key}><div><strong>{outcomeLabels[key]}</strong><span>{candidateOutcome?.count ?? 0} 条</span></div><div className="bar-pair"><span><i className="baseline" style={{ width: `${(baselineOutcome?.rate ?? 0) * 100}%` }} /></span><span><i className={cls("candidate", key === "attack_success" && "danger")} style={{ width: `${(candidateOutcome?.rate ?? 0) * 100}%` }} /></span></div><b>{percent(candidateOutcome?.rate ?? 0)}</b></div>;
                })}
              </div>
            </div>

            <div className="panel generation-panel">
              <PanelTitle title="代次覆盖" subtitle="候选运行的攻击演化分布" />
              <div className="generation-list">
                {candidate.generations.map((item) => <div key={item.generation}><span>G{item.generation}</span><div><i style={{ width: `${candidate.summary.total ? item.total / candidate.summary.total * 100 : 0}%` }} /></div><strong>{item.total}</strong><small>{item.attack_success} 个成功</small></div>)}
                {!candidate.generations.length && <EmptyState title="暂无代次数据" text="该运行没有可用 Trace。" />}
              </div>
            </div>
          </section>

          <section className="panel strategy-analysis">
            <PanelTitle title="策略表现" subtitle={`${strategies.length} 种攻击策略`} />
            <div className="table-scroll">
              <table className="data-table strategy-table">
                <thead><tr><th>策略</th><th>基线 Trace</th><th>候选 Trace</th><th>基线攻击成功率</th><th>候选攻击成功率</th><th>变化</th></tr></thead>
                <tbody>{strategies.map((item) => {
                  const before = item.baseline?.attack_rate ?? 0;
                  const after = item.candidate?.attack_rate ?? 0;
                  const delta = after - before;
                  return <tr key={item.strategy}><td><code>{item.strategy}</code></td><td className="numeric">{item.baseline?.total ?? 0}</td><td className="numeric">{item.candidate?.total ?? 0}</td><td className="numeric">{percent(before)}</td><td className="numeric">{percent(after)}</td><td><StatusBadge tone={delta === 0 ? "neutral" : delta < 0 ? "success" : "danger"}>{delta === 0 ? "持平" : `${delta > 0 ? "+" : ""}${percent(delta)}`}</StatusBadge></td></tr>;
                })}</tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
