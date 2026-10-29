import { App, type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/client";

type ConfigResult = {
  kind?: string;
  valid?: boolean;
  ffmpegConfigured?: boolean;
  volcengineConfigured?: boolean;
  error?: string;
};

const root = document.querySelector<HTMLDivElement>("#root");
if (!root) throw new Error("video-analysis app root was not found");

root.innerHTML = `
  <main class="page">
    <header class="header">
      <div>
        <div class="eyebrow">VIDEO ANALYSIS</div>
        <h1>配置管理</h1>
        <p>配置 FFmpeg 和火山语音模型后，才能开始提取视频文案。</p>
      </div>
    </header>
    <section class="card">
      <div class="status" id="status">正在读取配置…</div>
      <form id="config-form">
        <label>FFmpeg 安装路径<input id="ffmpeg-path" type="text" placeholder="例如：C:/ffmpeg/bin/ffmpeg.exe" required /></label>
        <label>火山语音模型 API Key<input id="volcengine-key" type="password" placeholder="请输入 API Key" /></label>
        <p class="error" id="error"></p>
        <button type="submit" id="submit">保存配置</button>
      </form>
    </section>
  </main>
`;

const form = document.querySelector<HTMLFormElement>("#config-form")!;
const status = document.querySelector<HTMLDivElement>("#status")!;
const error = document.querySelector<HTMLParagraphElement>("#error")!;
const submit = document.querySelector<HTMLButtonElement>("#submit")!;
const ffmpegPath = document.querySelector<HTMLInputElement>("#ffmpeg-path")!;
const volcengineKey = document.querySelector<HTMLInputElement>("#volcengine-key")!;

const app = new App({ name: "video-analysis", version: "0.1.0" }, {});

function readResult(result: CallToolResult): ConfigResult {
  const value = result.structuredContent;
  return value && typeof value === "object" ? value as ConfigResult : {};
}

function renderResult(result: CallToolResult): void {
  const value = readResult(result);
  const message = result.content?.find((item) => item.type === "text");
  const text = message?.type === "text" ? message.text : "";
  const valid = value.valid === true;
  status.textContent = valid ? "配置已就绪" : "配置未完成，请填写以下信息";
  status.className = `status ${valid ? "success" : "warning"}`;
  error.textContent = value.error || (result.isError ? text : "");
  if (value.ffmpegConfigured && !ffmpegPath.value) ffmpegPath.placeholder = "已配置，可重新填写";
  if (value.volcengineConfigured && !volcengineKey.value) volcengineKey.placeholder = "已配置，留空保持不变";
}

app.ontoolresult = (result) => renderResult(result);
app.onhostcontextchanged = (_context: McpUiHostContext) => undefined;
app.onerror = (cause) => {
  error.textContent = cause instanceof Error ? cause.message : String(cause);
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submit.disabled = true;
  error.textContent = "";
  try {
    const result = await app.callServerTool({
      name: "analysis.set_config",
      arguments: {
        ffmpegPath: ffmpegPath.value.trim(),
        volcengineApiKey: volcengineKey.value.trim() || undefined,
      },
    });
    renderResult(result);
    const config = readResult(result);
    if (config.valid) {
      await app.updateModelContext({
        content: [{ type: "text", text: "视频分析配置已完成，可以开始提取文案。" }],
        structuredContent: { kind: "analysis-config", valid: true },
      });
    }
  } catch (cause) {
    error.textContent = cause instanceof Error ? cause.message : String(cause);
  } finally {
    submit.disabled = false;
  }
});

const style = document.createElement("style");
style.textContent = `
  :root { color: #333; background: #fff; font-family: Inter, system-ui, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; min-width: 280px; }
  .page { width: 100%; max-width: 560px; margin: 0 auto; padding: 24px; }
  .header { margin-bottom: 20px; }
  .eyebrow { color: #8a8a8a; font-size: 12px; letter-spacing: .08em; }
  h1 { margin: 7px 0; font-size: 20px; }
  p { margin: 0; color: #666; font-size: 14px; line-height: 1.6; }
  .card { padding: 20px; border: 1px solid #e6e6e6; border-radius: 12px; background: #fff; box-shadow: 0 4px 18px rgb(0 0 0 / 5%); }
  .status { margin-bottom: 18px; font-size: 14px; font-weight: 600; }
  .status.success { color: #16803c; }
  .status.warning { color: #8a5a00; }
  form { display: flex; flex-direction: column; gap: 16px; }
  label { display: flex; flex-direction: column; gap: 7px; color: #555; font-size: 14px; }
  input { width: 100%; height: 38px; padding: 0 11px; border: 1px solid #dedede; border-radius: 8px; outline: 0; color: #333; background: #f7f7f7; font-size: 14px; }
  input:focus { border-color: #aaa; background: #fff; }
  button { height: 38px; border: 0; border-radius: 8px; color: #fff; background: #333; font-size: 14px; cursor: pointer; }
  button:disabled { opacity: .55; cursor: wait; }
  .error { min-height: 0; color: #c33; }
`;
document.head.append(style);

void app.connect();
