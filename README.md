# Bilibili Audio Only

一个干净、无第三方运行依赖的 Chrome Manifest V3 扩展，主要面向 Bilibili 直播，也支持普通视频。它保留 Bilibili 原生播放器，不创建第二个媒体元素，也不再猜测 `30216/30232/30280.m4s` 文件名。

直播模式下，扩展会让 `getRoomPlayInfo` 请求使用 `only_audio=1`、FLV 和转码档位，取得服务器生成的纯 AAC 直播流，避免下载视频轨。它也会移除首屏内嵌的普通直播地址，让播放器重新请求纯音频地址。

普通视频模式下，扩展会拦截 `fetch`、`XMLHttpRequest` 和首屏 `window.__playinfo__`，把 playurl 数据里的 `dash.video` 清空并保留 `dash.audio`。

## Windows 安装

推荐从 [Releases](https://github.com/moqingx52/bilibili-audio-only/releases) 下载 `bilibili-audio-only-windows.zip`：

1. 把 ZIP 解压到固定目录。
2. 打开 `chrome://extensions`。
3. 打开右上角“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择解压后直接包含 `manifest.json` 的目录。

如果从源码安装，请先运行 `npm run build`，然后选择生成的 `dist` 目录，不要选择 `src`。

打开 Bilibili 直播间、视频、合集或番剧播放页，点击工具栏上的扩展图标切换。徽标显示 `ON` 时为仅音频。切换会刷新一次页面；普通视频会尽量通过 URL 的 `t` 参数保持当前进度。

## 构建与检查

只需要 Node.js 18 或更高版本，不需要 `npm install`：

```bash
npm run check
```

也可以分别运行：

```bash
npm test
npm run build
```

最终加载目录始终是 `dist`。

## 手动验证

### 直播

1. 在直播间点击扩展图标，等待刷新，徽标应显示 `ON`。
2. DevTools → Network 搜索 `getRoomPlayInfo`，请求 URL 应包含 `only_audio=1`。
3. 媒体请求应切换为 `.flv`；其中应只有 AAC 音频轨，下载速率应明显低于普通模式。播放器右上角会显示“仅音频直播”。
4. 再点一次恢复 Normal，刷新后视频画面和完整码流应恢复。

### 普通视频

1. 在普通模式打开 Network，过滤 `m4s`，确认通常同时出现 video 和 audio 分段。
2. 开启扩展、刷新并清空 Network 记录。
3. 应有 audio m4s，不应持续出现 video m4s。
4. 检查 SPA 切视频、多 P、合集和番剧，再关闭模式确认视频恢复。

如果请求 URL 本身看不出轨道类型，可查看 playurl 响应：音频模式下 `dash.audio` 应保留、`dash.video` 应为空数组；也可比较媒体分段的 `Content-Type`、体积和编码信息。

## 已知边界

- 只有 DASH 播放信息能被安全拆成纯音频。仅返回 `durl` 混合 MP4 的老旧/特殊播放路径会保持原样，避免直接破坏播放，但这种路径无法保证节省视频带宽。
- 直播纯音频依赖 Bilibili 的 `only_audio=1` 服务端能力；若某些特殊直播、付费直播或互动直播不提供该流，可能回退失败或无法播放。
- 扩展会检查原生媒体元素是否仍出现视频尺寸；如果服务端回退成完整视频，会主动停止播放并显示红色错误提示，避免静默继续消耗视频带宽。
- DRM、地区限制、登录/大会员限制和 Bilibili 服务端拒绝不由扩展绕过。
- Bilibili 若更改 playurl 路径或响应结构，需要同步更新识别和转换逻辑。
- 点击切换必须刷新，因为已经初始化的原生播放器无法可靠地原地补回被删除的视频轨道。

## 隐私

扩展只在 `www.bilibili.com` 的指定播放页面运行，不发送遥测，不读取浏览历史。模式状态保存在 Bilibili 域名的 `localStorage` 中。
