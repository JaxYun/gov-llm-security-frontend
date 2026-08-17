import type { Metadata } from "next";
import { RedBlueConsole } from "./components/RedBlueConsole";

export const metadata: Metadata = {
  title: "政务安全 · 政务大模型安全评测平台",
  description: "用于红蓝对抗运行、追踪、风险发现、人工复核与检测器管理的政务大模型安全评测平台。",
};

export default function Home() {
  return <RedBlueConsole />;
}
