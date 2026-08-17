import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html", host: "localhost" },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the government LLM security agent console", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /政务安全/);
  assert.match(html, /工作台/);
  assert.match(html, /系统工作流/);
  assert.match(html, /两类任务独立运行/);
  assert.match(html, /实时检查/);
  assert.match(html, /批量检查/);
  assert.match(html, /策略与知识/);
  assert.match(html, /发起评测/);
  assert.match(html, /结果与追踪/);
  assert.match(html, /风险与复核/);
  assert.match(html, /资源配置/);
  assert.match(html, /政策检索/);
  assert.match(html, /独立评测与进化/);
  assert.doesNotMatch(html, /可信问答|验收报告|能力覆盖|研究基线|W3—W26|缺失内容保持空缺/);
  assert.doesNotMatch(html, /护栏调试|项目设置/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview|react-loading-skeleton/);
});

test("ships browser safety and immutable asset headers", async () => {
  const headers = await readFile(new URL("../dist/client/_headers", import.meta.url), "utf8");
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /Referrer-Policy: strict-origin-when-cross-origin/);
  assert.match(headers, /Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\)/);
  assert.match(headers, /Cache-Control: public, max-age=31536000, immutable/);
});
