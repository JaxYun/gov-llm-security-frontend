import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = protocol + "://" + host;

  return {
    metadataBase: new URL(origin),
    title: {
      default: "政务安全 · 政务大模型安全平台",
      template: "%s · 政务安全",
    },
    description: "集输入护栏、输出脱敏、政策事实核查、批量安全评测与红蓝对抗于一体的政务大模型安全平台。",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "政务安全 · 政务大模型安全平台",
      description: "在线护栏、政策事实核查、批量评测与红蓝对抗一体化平台。",
      images: [{ url: origin + "/og-v13.png", width: 1200, height: 630, alt: "政务安全双模型安全评测平台" }],
      locale: "zh_CN",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "政务安全 · 政务大模型安全平台",
      description: "在线护栏、政策事实核查、批量评测与红蓝对抗一体化平台。",
      images: [origin + "/og-v13.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <head><link rel="icon" href="/favicon.svg" type="image/svg+xml" /></head>
      <body>{children}</body>
    </html>
  );
}
