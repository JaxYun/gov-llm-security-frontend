"use client";

import { ChevronLeft, ChevronRight, CircleDashed } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

type IconType = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

export function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function StatusBadge({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode;
  tone?: string;
  dot?: boolean;
}) {
  return (
    <span className={cls("status-badge", tone)}>
      {dot && <i aria-hidden="true" />}
      {children}
    </span>
  );
}

export function PanelTitle({
  title,
  subtitle,
  meta,
  action,
}: {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="panel-heading">
      <div>
        <div className="panel-title-row">
          <h2>{title}</h2>
          {meta}
        </div>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && <div className="panel-actions">{action}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon = CircleDashed,
  title,
  text,
  action,
}: {
  icon?: IconType;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={22} /></span>
      <strong>{title}</strong>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="pager" aria-label="分页">
      <span>{start}–{end} / {total}</span>
      <div>
        <button
          type="button"
          aria-label="上一页"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <span>{page} / {pages}</span>
        <button
          type="button"
          aria-label="下一页"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export function TableSkeleton({ columns = 5, rows = 4 }: { columns?: number; rows?: number }) {
  return (
    <div className="table-skeleton" aria-label="正在加载" aria-busy="true">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((__, column) => <i key={column} />)}
        </div>
      ))}
    </div>
  );
}
