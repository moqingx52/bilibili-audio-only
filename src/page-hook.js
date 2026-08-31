(() => {
  "use strict";

  const MODE_KEY = "bilibili_audio_only_enabled_v1";
  const INSTALL_KEY = "__BILIBILI_AUDIO_ONLY_INSTALLED_V1__";
  const CORE_KEY = "__BILIBILI_AUDIO_ONLY_CORE_V1__";
  const core = globalThis[CORE_KEY];
  delete globalThis[CORE_KEY];

  if (!core || globalThis[INSTALL_KEY]) {
    return;
  }
  Object.defineProperty(globalThis, INSTALL_KEY, { configurable: false, value: true });

  let enabled = false;
  try {
    enabled = localStorage.getItem(MODE_KEY) === "1";
  } catch {
    // Storage can be unavailable under unusual privacy policies; default to normal playback.
  }

  const log = (...args) => console.debug("[Bilibili Audio Only]", ...args);

  function transformObject(value) {
    if (!enabled || !value || typeof value !== "object") {
      return value;
    }
    if (core.stripVideo(value)) {
      log("removed DASH video tracks");
    }
    return value;
  }

  function transformText(value) {
    return enabled ? core.rewriteText(value) : value;
  }

  function copyResponseMetadata(target, source) {
    for (const key of ["url", "redirected", "type"]) {
      try {
        Object.defineProperty(target, key, { configurable: true, value: source[key] });
      } catch {
        // These are diagnostic fields only; playback does not depend on them.
      }
    }
  }

  function rewriteLiveFetchInput(input) {
    if (!enabled || !core.isLivePlayInfoUrl(input)) {
      return input;
    }

    const url = core.enableLiveAudioOnlyUrl(input, location.href);
    if (typeof Request === "function" && input instanceof Request) {
      return new Request(url, {
        cache: input.cache,
        credentials: input.credentials,
        headers: input.headers,
        integrity: input.integrity,
        keepalive: input.keepalive,
        method: input.method,
        mode: input.mode,
        redirect: input.redirect,
        referrer: input.referrer,
        referrerPolicy: input.referrerPolicy,
        signal: input.signal
      });
    }
    return typeof URL === "function" && input instanceof URL ? new URL(url) : url;
  }

  const nativeFetch = globalThis.fetch;
  if (typeof nativeFetch === "function") {
    globalThis.fetch = async function audioOnlyFetch(input) {
      const args = Array.from(arguments);
      try {
        args[0] = rewriteLiveFetchInput(input);
      } catch (error) {
        log("live audio-only request rewrite failed", error);
      }
      const response = await Reflect.apply(nativeFetch, this, args);
      if (!enabled || !core.isPlayurlUrl(input)) {
        return response;
      }

      try {
        const originalText = await response.clone().text();
        const rewrittenText = transformText(originalText);
        if (rewrittenText === originalText) {
          return response;
        }

        const headers = new Headers(response.headers);
        headers.delete("content-length");
        headers.delete("content-encoding");
        const rewritten = new Response(rewrittenText, {
          headers,
          status: response.status,
          statusText: response.statusText
        });
        copyResponseMetadata(rewritten, response);
        return rewritten;
      } catch (error) {
        log("fetch response rewrite failed", error);
        return response;
      }
    };
  }

  const XHR = globalThis.XMLHttpRequest;
  if (XHR?.prototype) {
    const proto = XHR.prototype;
    const nativeOpen = proto.open;
    const responseDescriptor = Object.getOwnPropertyDescriptor(proto, "response");
    const responseTextDescriptor = Object.getOwnPropertyDescriptor(proto, "responseText");
    const requestUrls = new WeakMap();
    const cachedResponses = new WeakMap();

    proto.open = function audioOnlyOpen(method, url) {
      const args = Array.from(arguments);
      if (enabled && core.isLivePlayInfoUrl(url)) {
        try {
          args[1] = core.enableLiveAudioOnlyUrl(url, location.href);
        } catch (error) {
          log("live XHR audio-only request rewrite failed", error);
        }
      }
      requestUrls.set(this, args[1]);
      cachedResponses.delete(this);
      return Reflect.apply(nativeOpen, this, args);
    };

    function shouldRewrite(xhr) {
      return enabled && xhr.readyState === 4 && core.isPlayurlUrl(requestUrls.get(xhr));
    }

    function rewriteXhrResponse(xhr, original) {
      if (!shouldRewrite(xhr)) {
        return original;
      }
      const cached = cachedResponses.get(xhr);
      if (cached && cached.original === original) {
        return cached.value;
      }

      let value = original;
      try {
        if (xhr.responseType === "json") {
          value = transformObject(original);
        } else if (xhr.responseType === "arraybuffer" && original instanceof ArrayBuffer) {
          const text = new TextDecoder().decode(original);
          const rewrittenText = transformText(text);
          value = rewrittenText === text ? original : new TextEncoder().encode(rewrittenText).buffer;
        } else if (xhr.responseType === "" || xhr.responseType === "text") {
          value = transformText(original);
        }
      } catch (error) {
        log("XHR response rewrite failed", error);
        value = original;
      }

      cachedResponses.set(xhr, { original, value });
      return value;
    }

    if (responseDescriptor?.get && responseDescriptor.configurable) {
      Object.defineProperty(proto, "response", {
        configurable: true,
        enumerable: responseDescriptor.enumerable,
        get() {
          return rewriteXhrResponse(this, Reflect.apply(responseDescriptor.get, this, []));
        }
      });
    }

    if (responseTextDescriptor?.get && responseTextDescriptor.configurable) {
      Object.defineProperty(proto, "responseText", {
        configurable: true,
        enumerable: responseTextDescriptor.enumerable,
        get() {
          try {
            const original = Reflect.apply(responseTextDescriptor.get, this, []);
            return shouldRewrite(this) ? transformText(original) : original;
          } catch (error) {
            if (shouldRewrite(this) && this.responseType === "arraybuffer" && responseDescriptor?.get) {
              const buffer = Reflect.apply(responseDescriptor.get, this, []);
              return transformText(new TextDecoder().decode(buffer));
            }
            throw error;
          }
        }
      });
    }
  }

  function interceptInitialPlayinfo() {
    let current;
    const existing = Object.getOwnPropertyDescriptor(globalThis, "__playinfo__");
    try {
      current = globalThis.__playinfo__;
      transformObject(current);
    } catch {
      current = undefined;
    }

    if (existing && !existing.configurable) {
      return;
    }

    try {
      Object.defineProperty(globalThis, "__playinfo__", {
        configurable: true,
        enumerable: existing?.enumerable ?? true,
        get() {
          return current;
        },
        set(value) {
          current = transformObject(value);
        }
      });
    } catch (error) {
      log("initial __playinfo__ interception failed", error);
    }
  }

  function interceptLiveBootstrap() {
    const key = "__NEPTUNE_IS_MY_WAIFU__";
    const existing = Object.getOwnPropertyDescriptor(globalThis, key);
    let current;
    try {
      current = globalThis[key];
      if (enabled) {
        core.disableLiveBootstrapVideo(current);
      }
    } catch {
      current = undefined;
    }

    if (existing && !existing.configurable) {
      return;
    }

    try {
      Object.defineProperty(globalThis, key, {
        configurable: true,
        enumerable: existing?.enumerable ?? true,
        get() {
          return current;
        },
        set(value) {
          if (enabled && core.disableLiveBootstrapVideo(value)) {
            log("disabled embedded live video URL; player will request the server audio stream");
          }
          current = value;
        }
      });
    } catch (error) {
      log("live bootstrap interception failed", error);
    }
  }

  function monitorLiveAudioTrack() {
    setInterval(() => {
      const media = document.querySelector("#live-player video, video");
      if (!media || media.readyState < 2 || media.currentTime <= 0) {
        return;
      }

      if (media.videoWidth === 0 && media.videoHeight === 0) {
        document.documentElement?.classList.add("bao-live-audio-verified");
        document.documentElement?.classList.remove("bao-live-audio-failed");
        return;
      }

      document.documentElement?.classList.add("bao-live-audio-failed");
      document.documentElement?.classList.remove("bao-live-audio-verified");
      try {
        if (typeof globalThis.livePlayer?.stopPlayback === "function") {
          globalThis.livePlayer.stopPlayback();
        } else {
          media.pause();
          media.removeAttribute("src");
          media.load();
        }
      } catch (error) {
        log("failed to stop a non-audio live fallback", error);
      }
    }, 1500);
  }

  function markLiveAudioMode() {
    if (!document.documentElement) {
      setTimeout(markLiveAudioMode, 0);
      return;
    }
    document.documentElement.classList.add("bao-live-audio-only");
  }

  if (location.hostname === "live.bilibili.com") {
    // Install the SSR setter before doing any DOM work: at document_start the
    // <html> element may not exist yet, but Bilibili's inline play info follows soon.
    interceptLiveBootstrap();
    if (enabled) {
      markLiveAudioMode();
      monitorLiveAudioTrack();
    }
  } else {
    interceptInitialPlayinfo();
  }
})();
