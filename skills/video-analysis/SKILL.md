---
name: video-analysis
description: 视频文案提取与内容分析规则。只处理已有视频或标准化采集结果，不负责抖音、小红书、快手采集。
---

# 视频文案与分析规则

当前可调用 `analysis.get_config`、`analysis.set_config`、`analysis.extract_transcript` 和 `analysis.list_transcripts`。

后续实现时遵守：

- `analysis.extract_transcript` 优先接收采集插件生成的 `manifestPath`；也可以直接接收 `videos` 数组，数组记录必须包含 `id` 和本地 `localPath`；
- 不要把抖音、快手或小红书播放 URL 当作分析输入，采集插件保存时会先下载视频；
- 文案提取结果按视频 ID 去重，已有成功结果且本地路径未变化时不重复识别；
- 单条失败继续处理其他条目，并返回成功/失败摘要；
- `analysis.set_config` 的 `ffmpegPath` 传可执行文件路径或包含 ffmpeg 的目录；火山 API Key 不要回显给用户；
- 内容分析必须区分“基于标题、数据和文案的分析”和“基于视频画面的分析”；
- 没有视频帧或多模态输入时，不臆造画面、人物、镜头和动作；
- 批量分析先按互动数据分层，再输出共性钩子、结构、选题和转化方式；
- 工具描述只说明用途、参数、示例和返回摘要，不描述内部实现过程。
