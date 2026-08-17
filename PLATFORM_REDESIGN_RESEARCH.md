# 国际大模型平台前端模式调研与落地记录

本轮重构不复制任何平台的品牌、页面或源码，只提取经过成熟产品验证的信息架构和交互模式，并按本项目的真实数据边界落地。

## 1. LangSmith：用 Project → Trace → Run 组织可观测数据

- 官方资料：https://docs.langchain.com/langsmith/observability-concepts
- 优点：用稳定的对象层级表达复杂 Agent 执行，列表负责筛选和比较，详情面板负责展示输入、输出、工具调用、反馈和元数据。
- 本项目落地：将“案例与证据”改造为“运行追踪”，建立 Trace 列表与详情面板，逐步展示 Seed、Red Team、Target Model、Blue Team 和 Evaluator。

## 2. Langfuse：把观测、评测、数据集和人工标注连成闭环

- 官方资料：https://langfuse.com/docs
- 标注队列：https://langfuse.com/docs/evaluation/evaluation-methods/annotation-queues
- 优点：自动分数不是终点；低分、异常或有争议的 Trace 可进入领域专家队列，复核结果又能回流为数据集和评测器校准信号。
- 本项目落地：新增“人工复核”一级对象，将蓝队判定与独立评测并排展示，提供复核结论、备注和任务进度。在后端接口完成前明确标记为会话内状态。

## 3. Arize Phoenix：从单条 Trace 调试进入可复现实验

- 官方资料：https://arize.com/docs/phoenix
- 优点：追踪、自动评测、提示词试验、数据集和实验对比使用同一套数据对象；修改前后可以在相同输入上重跑并比较。
- 本项目落地：“评测运行”改为数据选择、执行配置、运行追踪、评测复核四步骤；工作台以运行表格作为主要入口。

## 4. Promptfoo：安全产品需要 Findings 与 Remediation，不只是 ASR 仪表盘

- 官方红队指南：https://www.promptfoo.dev/docs/red-team/quickstart/
- 发现与报告：https://www.promptfoo.dev/docs/enterprise/findings/
- 优点：将攻击结果聚合成漏洞，按严重级别、目标、风险类别、状态和策略筛选；每个发现可下钻到原始探针、输出、评分理由和修复建议。
- 本项目落地：将“红蓝演化”改造为“风险发现”，新增风险台账、严重级别筛选、修复待办和来源数据隔离；抽象闭环图改为可追踪产物清单。

## 5. Microsoft Foundry：先看汇总指标，再定位最差样本

- 官方资料：https://learn.microsoft.com/en-us/azure/ai-studio/how-to/evaluate-flow-results
- 优点：评测页先展示汇总指标，再以可排序、可筛选、可配置列的表格展示逐样本结果；支持对比运行、人工反馈和日志下钻。
- 本项目落地：工作台的首要内容改为可追溯指标、最近运行、复核队列和能力覆盖，不再用宣传型卡片解释项目。

## 6. Google Vertex AI 与 Amazon Bedrock：Agent 评测与 Guardrail 都要版本化

- Google Agent Evaluation：https://docs.cloud.google.com/vertex-ai/generative-ai/docs/agent-engine/evaluate
- Amazon Bedrock Evaluation：https://docs.aws.amazon.com/bedrock/latest/userguide/evaluation.html
- Amazon Bedrock Guardrails：https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-how.html
- 优点：Agent 不只评价最终回答，还评价工具使用、幻觉和安全；Guardrail 同时检查输入与输出，工作草稿、已发布版本和回归测试分开。
- 本项目落地：保留输入/输出双通道护栏，将护栏改为“防御策略”管理对象；运行中明确保留工具步骤、评测器和最终复核环节。

## 统一产品原则

1. 导航围绕用户要管理的对象，不围绕技术演示流程。
2. 工作台只展示当前空间内可核验的指标；研究报告数字单独分层。
3. 表格负责比较和筛选，详情面板负责解释和下钻。
4. 自动评测结果需要人工复核、评定修正和备注的完整出口。
5. 数据集、运行配置、防御策略和评测器都应支持版本化与回归对比。
6. 未接入的能力明确标记边界，不用虚构数据或可点击的假操作填充页面。
