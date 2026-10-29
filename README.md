# video-analysis

本地视频文案提取 MCP 服务，可独立使用，也可作为 Agent Plugin 加载。读取 [scraper](https://github.com/laoqiu/scraper) 下载的视频和导出的 manifest，通过 FFmpeg 提取音频，再调用火山语音服务转写，并将结果缓存到 SQLite。

当前已实现文案提取、配置管理和文案查询，进一步的内容分析工具尚未实现。插件消费本地文件，不依赖 scraper 的浏览器、Cookie 或运行状态。转写时会将提取的音频发送到配置的火山语音服务。

## 安装与运行

需要 Git、Node.js 22.12 或更高版本、npm。执行转写还需要本机可运行的 FFmpeg，以及可用于当前火山语音接口的 API Key。

```bash
git clone https://github.com/laoqiu/video-analysis.git
cd video-analysis
npm ci
npm run build
node dist/main.js --stdio
```

stdio 模式由 MCP 客户端启动并通过标准输入输出通信。直接运行后等待输入是正常状态。

FFmpeg 可以通过 PATH 查找，也可以在插件配置中指定可执行文件或其所在目录。本插件不会自动安装 FFmpeg。

## MCP 配置

将下列服务条目合并到客户端已有的 `mcpServers` 中。示例安装目录为 `C:/mcp-services/video-analysis`，请替换为实际绝对路径；数据目录可另行选择。

```json
{
  "mcpServers": {
    "video-analysis": {
      "command": "node",
      "args": [
        "C:/mcp-services/video-analysis/dist/main.js",
        "--stdio"
      ],
      "env": {
        "VIDEO_ANALYSIS_DATA_DIR": "C:/mcp-data/video-analysis"
      }
    }
  }
}
```

如果客户端找不到 `node`，将 `command` 改为 Node.js 可执行文件的绝对路径。Windows JSON 路径可使用正斜杠。

支持 MCP Apps 的客户端可以在 `args` 中追加 `"--ui"`，调用配置工具时显示配置页面。默认模式提供 MCP 工具，不启动独立 HTTP 页面。

按 Agent Plugins 格式安装时，可使用仓库中的 `plugin.json` 和 `mcp.json`。其中的插件根目录占位符由宿主展开，普通 MCP 客户端应使用上述绝对路径配置。分发时需包含完整 `dist/`、`skills/`、清单文件和生产依赖。

## 配置 FFmpeg 和语音服务

连接后先调用 `analysis.get_config`，参数为 `{}`。使用 `analysis.set_config` 保存配置，例如：

```json
{
  "ffmpegPath": "C:/ffmpeg/bin/ffmpeg.exe",
  "volcengineApiKey": "your-key"
}
```

`ffmpegPath` 也可传 `C:/ffmpeg/bin`；留空时从 PATH 查找 `ffmpeg`。`analysis.set_config` 支持只更新传入的字段。API Key 保存在本地数据库中，配置工具的返回值不包含密钥内容。

配置检查验证 API Key 已填写、FFmpeg 可执行；它不会在线验证密钥权限。真实转写结果以 `analysis.extract_transcript` 返回值为准。

## 工具

| 工具 | 用途 |
| --- | --- |
| `plugin_status` | 检查服务是否启动；参数 `{}` |
| `analysis.get_config` | 检查配置状态；参数 `{}` |
| `analysis.set_config` | 保存 FFmpeg 路径和火山语音 API Key |
| `analysis.extract_transcript` | 从 manifest 或本地视频数组提取文案 |
| `analysis.list_transcripts` | 查询缓存的文案记录；参数 `{}` |

## 从 scraper 提取文案

在 scraper 保存任务完成后，取得其导出的 manifest 文件路径，再调用 `analysis.extract_transcript`：

```json
{
  "manifestPath": "C:/mcp-data/scraper/video-manifests/videos_example.json"
}
```

manifest 的最小示例：

```json
{
  "kind": "video-manifest",
  "items": [
    {
      "id": "123",
      "localPath": "C:/mcp-data/scraper/videos/douyin/123.mp4",
      "title": "示例视频",
      "type": "video"
    }
  ]
}
```

也可以直接传入本地视频记录：

```json
{
  "videos": [
    {
      "id": "123",
      "localPath": "C:/videos/example.mp4",
      "title": "示例视频",
      "type": "video"
    }
  ]
}
```

同时提供两个参数时优先读取 `manifestPath`。仅导入 manifest 中含有非空 `localPath` 的记录；没有下载到本地的视频不会被自动下载。图文内容无法提取视频文案。

已有成功文案且视频 ID、本地路径均未变化时，会复用缓存。单条视频失败会记录错误并继续下一条，返回结果包含 `total`、`completed`、`skipped`、`failed` 和逐条结果 `items`。

当前工具会等待本批视频处理结束后返回。建议先用一个短视频完成配置验证，再尝试批量转写。

## 数据目录

通过 `VIDEO_ANALYSIS_DATA_DIR` 指定保存位置，目录中包含 `analysis.sqlite`，用于保存配置和文案。未指定时使用以下默认位置：

- Windows：`%APPDATA%/genagent-video-analysis`
- macOS：`~/Library/Application Support/genagent-video-analysis`
- Linux：`$XDG_DATA_HOME/genagent-video-analysis`，未设置时使用 `~/.local/share/genagent-video-analysis`

音频在系统临时目录中生成，每条视频处理结束后清理。项目的 Git 忽略规则排除本地数据、数据库、依赖和构建产物。

## 测试步骤

1. 执行 `npm run build`，确认 TypeScript 检查和前端构建通过。
2. 在 MCP 客户端连接服务，调用 `plugin_status`，确认返回 `status: "ready"`。
3. 调用 `analysis.get_config` 检查配置；尚未填写密钥时，返回 `valid: false` 是预期结果。
4. 使用 `analysis.set_config` 完成配置，传入一个本地短视频执行 `analysis.extract_transcript`。
5. 调用 `analysis.list_transcripts` 检查记录，再次提交同一视频验证缓存复用。

## 源码结构

- `main.ts`：stdio 入口和关闭清理。
- `server.ts`：MCP 工具和可选 MCP Apps 资源注册。
- `src/service.ts`：转写流程、缓存复用和逐条失败处理。
- `src/ffmpeg.ts`：FFmpeg 查找与音频提取。
- `src/volcengine.ts`：火山语音请求与识别结果查询。
- `src/store.ts`：SQLite 配置和文案持久化。
- `src/mcp-app.ts`、`mcp-app.html`：配置页面。
- `skills/video-analysis/SKILL.md`：插件工具使用指引。
