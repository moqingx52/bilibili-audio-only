(() => {
  "use strict";

  const API_NAME = "__BILIBILI_AUDIO_ONLY_CORE_V1__";

  function isPlayurlUrl(input) {
    let value = "";
    try {
      value = typeof input === "string" ? input : input?.url ?? String(input ?? "");
    } catch {
      return false;
    }

    return /\/(?:x\/player\/(?:wbi\/)?playurl|pgc\/player\/(?:web\/(?:v2\/)?|api\/)playurl|pugv\/player\/web\/playurl|ogv\/player\/playview)(?:[/?#]|$)/.test(value);
  }

  function isLivePlayInfoUrl(input) {
    let value = "";
    try {
      value = typeof input === "string" ? input : input?.url ?? String(input ?? "");
    } catch {
      return false;
    }

    return /\/(?:xlive\/web-room\/v2\/index\/getRoomPlayInfo|xlive\/web-room\/v1\/playUrl\/playUrl|room\/v1\/Room\/playUrl)(?:[/?#]|$)/.test(value);
  }

  function enableLiveAudioOnlyUrl(input, baseUrl = "https://live.bilibili.com/") {
    const value = typeof input === "string" ? input : input?.url ?? String(input ?? "");
    if (!isLivePlayInfoUrl(value)) {
      return value;
    }
    const url = new URL(value, baseUrl);
    url.searchParams.set("only_audio", "1");
    // Bilibili currently strips video only from transcoded FLV streams.
    // qn=0/original HLS can silently ignore only_audio and keep downloading video.
    url.searchParams.set("protocol", "0");
    url.searchParams.set("format", "0");
    url.searchParams.set("codec", "0");
    url.searchParams.set("qn", "250");
    return url.href;
  }

  function disableLiveBootstrapVideo(payload) {
    const roomInit = payload?.roomInitRes?.data;
    if (!roomInit?.playurl_info) {
      return false;
    }
    roomInit.playurl_info = null;
    return true;
  }

  function stripVideo(payload) {
    if (!payload || typeof payload !== "object") {
      return false;
    }

    const seen = new WeakSet();
    let changed = false;

    function visit(value, depth) {
      if (!value || typeof value !== "object" || depth > 8 || seen.has(value)) {
        return;
      }
      seen.add(value);

      if (!Array.isArray(value) && value.dash && typeof value.dash === "object") {
        const dash = value.dash;
        const hasAudio =
          (Array.isArray(dash.audio) && dash.audio.length > 0) ||
          (Array.isArray(dash.dolby?.audio) && dash.dolby.audio.length > 0) ||
          (Array.isArray(dash.flac?.audio) && dash.flac.audio.length > 0);
        if (hasAudio && Array.isArray(dash.video) && dash.video.length > 0) {
          dash.video = [];
          if (Array.isArray(value.durl)) {
            value.durl = [];
          }
          changed = true;
        }
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          visit(item, depth + 1);
        }
        return;
      }

      for (const key of Object.keys(value)) {
        if (key === "video" || key === "audio") {
          continue;
        }
        visit(value[key], depth + 1);
      }
    }

    visit(payload, 0);
    return changed;
  }

  function rewriteText(text) {
    if (typeof text !== "string" || text.length === 0) {
      return text;
    }
    try {
      const payload = JSON.parse(text);
      return stripVideo(payload) ? JSON.stringify(payload) : text;
    } catch {
      return text;
    }
  }

  Object.defineProperty(globalThis, API_NAME, {
    configurable: true,
    value: Object.freeze({
      disableLiveBootstrapVideo,
      enableLiveAudioOnlyUrl,
      isLivePlayInfoUrl,
      isPlayurlUrl,
      rewriteText,
      stripVideo
    })
  });
})();
