import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import fs from "node:fs/promises";
import { registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { analysisStore } from "./src/store.js";
import { transcriptService } from "./src/service.js";
import { CONFIG_RESOURCE_URI, configurationResource } from "./src/app-resource.js";
import type { AnalysisVideoInput } from "./src/types.js";

type ServerOptions = { ui?: boolean };

const videoInput = z.object({
  id: z.string().trim().min(1).describe("视频唯一 ID"),
  localPath: z.string().trim().min(1).describe("本地视频文件绝对路径"),
  title: z.string().optional().describe("视频标题"),
  author: z.string().optional().describe("作者"),
  type: z.enum(["video", "image-text"]).optional().describe("内容类型"),
  durationMs: z.coerce.number().optional().describe("时长，单位毫秒"),
  sourceUrl: z.string().optional().describe("来源地址"),
}).strict();

function manifestVideos(value: unknown): AnalysisVideoInput[] {
  if (!value || typeof value !== "object") return [];
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.localPath !== "string" || !record.localPath.trim()) return [];
    return [{
      id: record.id,
      localPath: record.localPath,
      title: typeof record.title === "string" ? record.title : undefined,
      author: typeof record.author === "string" ? record.author : undefined,
      type: record.type === "image-text" ? "image-text" : "video",
      durationMs: typeof record.durationMs === "number" ? record.durationMs : undefined,
      sourceUrl: typeof record.sourceUrl === "string" ? record.sourceUrl : undefined,
    }];
  });
}

export function createServer(options: ServerOptions = {}): McpServer {
  const server = new McpServer({
    name: "GenAgent Video Analysis",
    version: "0.1.0",
  });

  if (options.ui) {
    registerAppResource(server, "视频分析配置", CONFIG_RESOURCE_URI, {
      description: "配置 FFmpeg 和火山语音模型",
    }, configurationResource);
  }

  const getConfig = {
    title: "读取视频分析配置",
    description: "读取 FFmpeg 和火山语音配置状态。无参数，示例：{}。不会返回 API Key 内容。",
    inputSchema: z.object({}).strict(),
    ...(options.ui ? { _meta: { ui: { resourceUri: CONFIG_RESOURCE_URI } } } : {}),
  };
  const getConfigHandler = async () => {
    const config = analysisStore.getConfig();
    const checked = await transcriptService.checkConfig(config);
    return { content: [{ type: "text", text: checked.valid ? "视频分析配置有效。" : `视频分析配置未就绪：${checked.error}` }], structuredContent: { kind: "analysis-config", valid: checked.valid, ffmpegConfigured: Boolean(config.ffmpegPath.trim()), volcengineConfigured: Boolean(config.volcengineApiKey.trim()), error: checked.error } };
  };
  if (options.ui) registerAppTool(server, "analysis.get_config", getConfig as never, getConfigHandler as never);
  else server.registerTool("analysis.get_config", getConfig as never, getConfigHandler as never);

  const setConfig = {
    title: "保存视频分析配置",
    description: "保存视频分析配置。参数：ffmpegPath 为 FFmpeg 可执行文件或目录；volcengineApiKey 为火山语音 API Key。示例：{\"ffmpegPath\":\"C:/ffmpeg/bin\",\"volcengineApiKey\":\"your-key\"}。",
    inputSchema: z.object({ ffmpegPath: z.string().optional().describe("FFmpeg 可执行文件或目录"), volcengineApiKey: z.string().optional().describe("火山语音 API Key") }).strict(),
    ...(options.ui ? { _meta: { ui: { resourceUri: CONFIG_RESOURCE_URI } } } : {}),
  };
  const setConfigHandler = async (args: { ffmpegPath?: string; volcengineApiKey?: string }) => {
    const config = analysisStore.setConfig(args);
    const checked = await transcriptService.checkConfig(config);
    return { content: [{ type: "text", text: checked.valid ? "视频分析配置已保存且有效。" : `配置已保存，但尚未就绪：${checked.error}` }], structuredContent: { kind: "analysis-config", valid: checked.valid, ffmpegConfigured: Boolean(config.ffmpegPath.trim()), volcengineConfigured: Boolean(config.volcengineApiKey.trim()), error: checked.error } };
  };
  if (options.ui) registerAppTool(server, "analysis.set_config", setConfig as never, setConfigHandler as never);
  else server.registerTool("analysis.set_config", setConfig as never, setConfigHandler as never);

  server.registerTool("analysis.extract_transcript", {
    title: "提取本地视频文案",
    description: "从本地视频文件提取文案。参数：videos 为包含 id、localPath 的数组，或 manifestPath 为采集插件生成的本地 manifest 文件；优先传 manifestPath。示例：{\"manifestPath\":\"C:/data/video-manifests/videos_1.json\"}。重复视频 ID 会复用已完成结果。",
    inputSchema: z.object({ manifestPath: z.string().trim().optional().describe("采集插件生成的本地 manifest 路径"), videos: z.array(videoInput).default([]).describe("本地视频记录数组") }).strict(),
  }, async ({ manifestPath, videos }: { manifestPath?: string; videos: AnalysisVideoInput[] }) => {
    try {
      let input = videos as AnalysisVideoInput[];
      if (manifestPath) input = manifestVideos(JSON.parse(await fs.readFile(manifestPath, "utf8")));
      if (!input.length) return { content: [{ type: "text", text: "没有可处理的本地视频。" }], structuredContent: { kind: "transcript-summary", total: 0, completed: 0, skipped: 0, failed: 0 } };
      const result = await transcriptService.run(input);
      const failedText = result.items.filter((item) => item.status === "error").slice(0, 10).map((item, index) => `${index + 1}.${item.title || item.id}：${item.error}`).join("\n");
      const text = [`文案提取完成：共 ${result.total} 条，成功 ${result.completed} 条，复用 ${result.skipped} 条，失败 ${result.failed} 条。`, failedText ? `\n失败摘要：\n${failedText}` : ""].join("");
      return { content: [{ type: "text", text }], structuredContent: { kind: "transcript-summary", total: result.total, completed: result.completed, skipped: result.skipped, failed: result.failed, items: result.items } };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] };
    }
  });

  server.registerTool("analysis.list_transcripts", {
    title: "查询已提取文案",
    description: "查询已保存的文案记录。无参数，示例：{}。",
    inputSchema: z.object({}).strict(),
  }, async () => {
    const items = analysisStore.listTranscripts();
    return { content: [{ type: "text", text: `当前共有 ${items.length} 条文案记录。` }], structuredContent: { kind: "transcripts", total: items.length, items } };
  });

  server.registerTool("plugin_status", {
    title: "查看视频分析插件状态",
    description: "查看视频分析插件状态。无参数，示例：{}。",
    inputSchema: z.object({}).strict(),
  }, async () => ({
    content: [{ type: "text", text: "视频分析插件已启动，可消费本地视频文件。" }],
    structuredContent: { plugin: "video-analysis", status: "ready", capabilities: ["local-transcript", "transcript-cache"] },
  }));

  return server;
}
