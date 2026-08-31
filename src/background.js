"use strict";

const MODE_KEY = "bilibili_audio_only_enabled_v1";
const SUPPORTED_URL = /^https:\/\/(?:live\.bilibili\.com\/|www\.bilibili\.com\/(?:video\/|list\/|bangumi\/play\/))/;

function badgeFor(tabId, enabled) {
  chrome.action.setBadgeText({ tabId, text: enabled ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ tabId, color: enabled ? "#00AEEC" : "#777777" });
  chrome.action.setTitle({
    tabId,
    title: enabled
      ? "Bilibili Audio Only：已开启，点击恢复正常视频"
      : "Bilibili Audio Only：已关闭，点击开启仅音频"
  });
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "audio-only-state" && sender.tab?.id != null) {
    badgeFor(sender.tab.id, Boolean(message.enabled));
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id == null || !SUPPORTED_URL.test(tab.url ?? "")) {
    if (tab.id != null) {
      chrome.action.setTitle({ tabId: tab.id, title: "请先打开 Bilibili 直播、视频、合集或番剧播放页" });
    }
    return;
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: (key) => {
        const nextEnabled = localStorage.getItem(key) !== "1";
        if (nextEnabled) {
          localStorage.setItem(key, "1");
        } else {
          localStorage.removeItem(key);
        }

        let seconds = 0;
        try {
          const media = document.querySelector(
            ".bpx-player-video-wrap video, #bilibili-player video, .bilibili-player-video video, video"
          );
          seconds = Math.max(0, Math.floor(media?.currentTime || 0));
        } catch {
          // Reloading without a timestamp is still a valid mode switch.
        }

        const nextUrl = new URL(location.href);
        if (seconds > 0) {
          nextUrl.searchParams.set("t", String(seconds));
        }
        location.replace(nextUrl.href);
        return { enabled: nextEnabled, seconds };
      },
      args: [MODE_KEY]
    });

    const state = results[0]?.result;
    if (state) {
      badgeFor(tab.id, state.enabled);
    }
  } catch (error) {
    console.warn("Bilibili Audio Only toggle failed", error);
  }
});

async function syncBadge(tabId, url) {
  if (!SUPPORTED_URL.test(url ?? "")) {
    chrome.action.setBadgeText({ tabId, text: "" });
    return;
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (key) => localStorage.getItem(key) === "1",
      args: [MODE_KEY]
    });
    badgeFor(tabId, Boolean(results[0]?.result));
  } catch {
    // The document-start bridge will sync the badge once the page is ready.
  }
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await syncBadge(tabId, tab.url);
  } catch {
    // Tabs can disappear while an activation event is being handled.
  }
});
