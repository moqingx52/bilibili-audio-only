(() => {
  "use strict";

  const MODE_KEY = "bilibili_audio_only_enabled_v1";
  let enabled = false;
  try {
    enabled = localStorage.getItem(MODE_KEY) === "1";
  } catch {
    // Keep the default when origin storage is unavailable.
  }

  chrome.runtime.sendMessage({ type: "audio-only-state", enabled }).catch(() => {});
})();
