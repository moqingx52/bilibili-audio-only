import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(path.resolve("src/transform.js"), "utf8");
const context = vm.createContext({ URL });
vm.runInContext(source, context);
const core = context.__BILIBILI_AUDIO_ONLY_CORE_V1__;

test("recognizes ordinary, WBI, and bangumi playurl endpoints", () => {
  assert.equal(core.isPlayurlUrl("https://api.bilibili.com/x/player/playurl?avid=1"), true);
  assert.equal(core.isPlayurlUrl("https://api.bilibili.com/x/player/wbi/playurl?bvid=1"), true);
  assert.equal(core.isPlayurlUrl("https://api.bilibili.com/pgc/player/web/v2/playurl?ep_id=1"), true);
  assert.equal(core.isPlayurlUrl("https://api.bilibili.com/pgc/player/api/playurl?ep_id=1"), true);
  assert.equal(core.isPlayurlUrl("https://api.bilibili.com/pugv/player/web/playurl?ep_id=1"), true);
  assert.equal(core.isPlayurlUrl("https://api.bilibili.com/x/web-interface/view?bvid=1"), false);
});

test("removes DASH video while preserving audio", () => {
  const payload = {
    code: 0,
    data: {
      dash: {
        video: [{ id: 80, baseUrl: "video.m4s" }],
        audio: [{ id: 30280, baseUrl: "audio.m4s" }]
      }
    }
  };
  assert.equal(core.stripVideo(payload), true);
  assert.equal(payload.data.dash.video.length, 0);
  assert.equal(payload.data.dash.audio.length, 1);
});

test("handles nested bangumi video_info and removes mixed fallback", () => {
  const payload = {
    result: {
      video_info: {
        durl: [{ url: "mixed.mp4" }],
        dash: { video: [{ id: 64 }], audio: [{ id: 30232 }] }
      }
    }
  };
  assert.equal(core.stripVideo(payload), true);
  assert.equal(payload.result.video_info.dash.video.length, 0);
  assert.equal(payload.result.video_info.durl.length, 0);
});

test("does not damage non-DASH or malformed responses", () => {
  const durlOnly = { data: { durl: [{ url: "mixed.mp4" }] } };
  assert.equal(core.stripVideo(durlOnly), false);
  assert.deepEqual(durlOnly.data.durl, [{ url: "mixed.mp4" }]);
  assert.equal(core.rewriteText("not json"), "not json");
});

test("recognizes nested Dolby and FLAC audio tracks", () => {
  for (const codec of ["dolby", "flac"]) {
    const payload = { data: { dash: { video: [{ id: 80 }], [codec]: { audio: [{ id: 30250 }] } } } };
    assert.equal(core.stripVideo(payload), true);
    assert.equal(payload.data.dash.video.length, 0);
  }
});

test("recognizes live playback APIs and adds only_audio exactly once", () => {
  const input = "https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=1&only_audio=0";
  assert.equal(core.isLivePlayInfoUrl(input), true);
  const rewritten = new URL(core.enableLiveAudioOnlyUrl(input));
  assert.equal(rewritten.searchParams.get("room_id"), "1");
  assert.equal(rewritten.searchParams.get("only_audio"), "1");
  assert.equal(rewritten.searchParams.get("protocol"), "0");
  assert.equal(rewritten.searchParams.get("format"), "0");
  assert.equal(rewritten.searchParams.get("codec"), "0");
  assert.equal(rewritten.searchParams.get("qn"), "250");
  assert.equal(rewritten.searchParams.getAll("only_audio").length, 1);
  assert.equal(core.isLivePlayInfoUrl("https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom"), false);
});

test("removes embedded live video URLs so the player refetches audio-only data", () => {
  const payload = { roomInitRes: { code: 0, data: { room_id: 1, playurl_info: { playurl: { stream: [1] } } } } };
  assert.equal(core.disableLiveBootstrapVideo(payload), true);
  assert.equal(payload.roomInitRes.data.playurl_info, null);
  assert.equal(payload.roomInitRes.data.room_id, 1);
});
