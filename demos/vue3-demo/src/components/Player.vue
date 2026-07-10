<script lang="ts" setup>
import { EZUIKitPlayer } from "ezuikit-js"
import { onMounted, onBeforeUnmount, ref } from "vue"

interface IPlayer {
  play: Function;
  stop: Function;
  getOSDTime: Function;
  pause: Function;
  resume: Function;
  seekTo: Function;
  getSpeed: Function;
  setSpeed: Function;
  capturePicture: Function;
  openSound: Function;
  closeSound: Function;
  startSave: Function;
  stopSave: Function;
  startTalk: Function;
  stopTalk: Function;
  fullscreen: Function;
  destroy: Function;
  eventEmitter: any;
  on: any;
}

let player: IPlayer;

const accessToken = ref(
  "at.daz914gk2cnsdm748wt7r6im1ww50d8q-9o0d9tbx2h-0mefajp-pd25qljk"
);
const url = ref("ezopen://open.ys7.com/BC7799091/1.hd.live");
const staticPath = ref("");
const playbackUrl = ref("ezopen://open.ys7.com/BC7799091/1.rec?begin=20260710000000");
const template = ref("pcLive");
const isPlaybackMode = ref(false);
const currentPlaybackTime = ref("");
const playbackSpeed = ref(1);
const isPaused = ref(false);
const playbackTimeInput = ref("20260710000000");

// ── 全天录制（以天为单位，无分段）──
const isFullDayRecording = ref(false);
const recordingDate = ref("20260710");
const recordingProgress = ref("");
let dailyHeartbeat: ReturnType<typeof setInterval> | null = null;

// ── helpers ──

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

function formatHHMMSS(s: string): string {
  const parts = s.split(" ");
  return parts[parts.length - 1];
}

function timeToSeconds(t: string): number {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

// ── 基础方法 ──

const play = () => { if (player) player.play() };

const playback = () => {
  isPlaybackMode.value = true;
  template.value = "pcRec";
  url.value = playbackUrl.value;
  init();
};

const liveMode = () => {
  stopDailyRecording();
  isPlaybackMode.value = false;
  template.value = "pcLive";
  init();
};

const stop = () => { if (player) player.stop() };

const getOSDTime = () => {
  if (player)
    player.getOSDTime().then((data: any) => {
      currentPlaybackTime.value = data?.data?.time || JSON.stringify(data);
    });
};

const pausePlayback = () => { if (player) { player.pause(); isPaused.value = true } };
const resumePlayback = () => { if (player) { player.resume(); isPaused.value = false } };
const seekToTime = () => { if (player) player.seekTo(playbackTimeInput.value) };
const changeSpeed = () => { if (player) player.setSpeed(playbackSpeed.value) };
const getPlaybackSpeed = () => { if (player) player.getSpeed().then((s: any) => console.log("getSpeed", s)) };

const capturePicture = () => {
  if (player) player.capturePicture(`${new Date().getTime()}`).then((d: any) => console.log(d));
};

const openSound = () => { if (player) player.openSound() };
const closeSound = () => { if (player) player.closeSound() };

const startSave = () => {
  if (player) player.startSave(`${new Date().getTime()}`).then((d: any) => console.log("startSave", d));
};

const stopSave = () => {
  if (player) player.stopSave().then((d: any) => console.log("stopSave", d));
};

const startTalk = () => { if (player) player.startTalk() };
const stopTalk = () => { if (player) player.stopTalk() };
const fullscreen = () => { if (player) player.fullscreen() };

const destroy = () => {
  if (player) {
    player.destroy().then((d: any) => console.log("destroy", d));
    player = null!;
  }
};

// ── 全天回放录制 ──

const startDailyRecording = () => {
  if (isFullDayRecording.value) return;

  const date = recordingDate.value;
  isPlaybackMode.value = true;
  isFullDayRecording.value = true;

  // 从 00:00 开始播放当天录像
  url.value = `ezopen://open.ys7.com/BC7799091/1.rec?begin=${date}000000`;
  template.value = "pcRec";
  if (player) { player.destroy(); player = null! }

  recordingProgress.value = "初始化播放器...";

  player = new EZUIKitPlayer({
    id: "video-container",
    accessToken: accessToken.value,
    url: url.value,
    template: "pcRec",
    height: 400,
    handleSuccess: () => {
      const dateDisplay = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
      player.startSave(`${date}_full_recording`).then(() => {
        recordingProgress.value = `正在录制 ${dateDisplay} 的录像`;
        startHeartbeat(dateDisplay, date);
      }).catch(() => {
        recordingProgress.value = "录制启动失败";
      });
    },
    handleError: (err: any) => {
      console.error("录制错误", err);
      const code = err?.data?.nErrorCode ?? err?.nErrorCode;
      if (isFullDayRecording.value) {
        recordingProgress.value = `播放异常 (${code || "未知"})`;
      }
    },
    staticPath: staticPath.value,
    scaleMode: 1,
    env: { domain: "https://open.ys7.com" },
    loggerOptions: { level: "WARN", name: "ezuikit", showTime: true },
    streamInfoCBType: 1,
  });

  player.on(EZUIKitPlayer.EVENTS.firstFrameDisplay, () => {
    console.warn("firstFrameDisplay");
  });

  window.player = player;
};

function startHeartbeat(dateDisplay: string, date: string) {
  if (dailyHeartbeat) clearInterval(dailyHeartbeat);
  dailyHeartbeat = setInterval(() => {
    if (!isFullDayRecording.value || !player) return;

    player.getOSDTime().then((data: any) => {
      const time = data?.data?.time;
      if (!time) return;
      currentPlaybackTime.value = time;

      const hms = formatHHMMSS(time);
      recordingProgress.value = `正在录制 ${dateDisplay} 的录像 — ${hms}`;

      // 到 23:59 自动收尾
      if (timeToSeconds(hms) >= 23 * 3600 + 59 * 60) {
        finishDailyRecording(`全天录制完成 (${dateDisplay})`);
      }
    }).catch(() => {});
  }, 3000);
}

const stopDailyRecording = () => {
  if (!isFullDayRecording.value) return;
  finishDailyRecording("录制已手动停止");
};

function finishDailyRecording(msg: string) {
  isFullDayRecording.value = false;
  recordingProgress.value = msg;
  if (dailyHeartbeat) { clearInterval(dailyHeartbeat); dailyHeartbeat = null }
  if (player) { player.stopSave().catch(() => {}) }
}

// ── 生命周期 ──

onBeforeUnmount(() => {
  if (dailyHeartbeat) clearInterval(dailyHeartbeat);
  isFullDayRecording.value = false;
});

// ── init ──

const init = () => {
  if (player) { destroy() }
  player = new EZUIKitPlayer({
    id: "video-container",
    accessToken: accessToken.value,
    url: url.value,
    template: template.value,
    height: 400,
    handleError: (err: any) => { console.error("handleError", err) },
    staticPath: staticPath.value, scaleMode: 1,
    env: { domain: "https://open.ys7.com" },
    loggerOptions: { level: "INFO", name: "ezuikit", showTime: true },
    streamInfoCBType: 1,
  });
  player.on(EZUIKitPlayer.EVENTS.videoInfo, (info: any) => console.warn("videoInfo", info));
  player.on(EZUIKitPlayer.EVENTS.audioInfo, (info: any) => console.warn("audioInfo", info));
  player.on(EZUIKitPlayer.EVENTS.firstFrameDisplay, () => console.warn("firstFrameDisplay"));
  player.on(EZUIKitPlayer.EVENTS.streamInfoCB, (info: any) => console.warn("streamInfoCB", info));
  window.player = player;
};

onMounted(() => { init() });
</script>

<template>
  <div class="player-wrapper">
    <div class="mode-switch">
      <button :class="{ active: !isPlaybackMode }" @click="liveMode">直播模式</button>
      <button :class="{ active: isPlaybackMode }" @click="playback">回放模式</button>
    </div>

    <div id="video-container" style="height: 400px"></div>

    <div class="config-panel">
      <label> accessToken: <input v-model="accessToken" type="text" placeholder="请输入 accessToken" /> </label>
      <label v-if="!isPlaybackMode"> 直播 url: <input v-model="url" type="text" placeholder="请输入直播播放地址" /> </label>
      <label v-if="isPlaybackMode"> 回放 url: <input v-model="playbackUrl" type="text" placeholder="ezopen://...rec?begin=yyyyMMddhhmmss" /> </label>
      <label> staticPath: <input v-model="staticPath" type="text" placeholder="请输入 staticPath" /> </label>
    </div>

    <div class="button-panel">
      <button @click="init">init</button>
      <button @click="stop">stop</button>
      <button @click="play">play</button>
      <button @click="openSound">openSound</button>
      <button @click="closeSound">closeSound</button>
      <button @click="startSave">startSave</button>
      <button @click="stopSave">stopSave</button>
      <button @click="capturePicture">capturePicture</button>
      <button @click="fullscreen">fullscreen</button>
      <button @click="getOSDTime">getOSDTime</button>
      <button @click="startTalk">startTalk</button>
      <button @click="stopTalk">stopTalk</button>
      <button @click="destroy">destroy</button>
    </div>

    <div class="playback-panel" v-if="isPlaybackMode">
      <fieldset>
        <legend>回放控制</legend>
        <button @click="pausePlayback">{{ isPaused ? "已暂停" : "暂停" }}</button>
        <button @click="resumePlayback">恢复</button>
        <button @click="getOSDTime">获取当前回放时间</button>
        <span class="tag" v-if="currentPlaybackTime">{{ currentPlaybackTime }}</span>
      </fieldset>
      <fieldset>
        <legend>跳转 / 倍速</legend>
        <label>目标时间 (yyyyMMddhhmmss): <input v-model="playbackTimeInput" type="text" placeholder="20260710000000" /></label>
        <button @click="seekToTime">跳转</button>
        <label>倍速: <select v-model.number="playbackSpeed" @change="changeSpeed">
          <option :value="0.5">0.5x</option>
          <option :value="1">1x</option>
          <option :value="2">2x</option>
          <option :value="4">4x</option>
        </select></label>
      </fieldset>
      <fieldset>
        <legend>📅 全天回放录制</legend>
        <p class="desc">从 00:00 播到 23:59，录制成一份完整的录像文件。</p>
        <label>日期 (YYYYMMDD): <input v-model="recordingDate" type="text" placeholder="20260710" :disabled="isFullDayRecording" /></label>
        <div class="daily-actions">
          <button :disabled="isFullDayRecording" @click="startDailyRecording" class="btn-primary">开始录制全天</button>
          <button :disabled="!isFullDayRecording" @click="stopDailyRecording" class="btn-danger">停止录制</button>
          <div v-if="recordingProgress" class="progress">{{ recordingProgress }}</div>
        </div>
      </fieldset>
    </div>
  </div>
</template>

<style scoped>
.player-wrapper { font-family: "PingFang SC","Microsoft YaHei",sans-serif; max-width: 920px; margin: 0 auto; padding: 16px; }
.mode-switch { display: flex; gap: 8px; margin-bottom: 12px; }
.mode-switch button { flex: 1; padding: 8px 16px; border: 1px solid #407aff; background: #fff; color: #407aff; border-radius: 4px; cursor: pointer; font-size: 14px; }
.mode-switch button.active { background: #407aff; color: #fff; }
.config-panel { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; font-size: 14px; }
.config-panel label { display: flex; align-items: center; gap: 8px; }
.config-panel input { flex: 1; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px; }
.button-panel { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.button-panel button { padding: 6px 14px; border: 1px solid #dcdfe6; background: #fff; color: #333; border-radius: 4px; cursor: pointer; font-size: 13px; }
.button-panel button:hover { border-color: #407aff; color: #407aff; }
.playback-panel { margin-top: 12px; display: flex; flex-direction: column; gap: 12px; }
.playback-panel fieldset { border: 1px solid #ddd; border-radius: 6px; padding: 12px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.playback-panel legend { font-size: 13px; font-weight: 600; padding: 0 6px; color: #407aff; }
.playback-panel button { padding: 6px 14px; border: 1px solid #407aff; background: #fff; color: #407aff; border-radius: 4px; cursor: pointer; font-size: 13px; }
.playback-panel button:hover { background: #407aff; color: #fff; }
.playback-panel button:disabled { opacity: .5; cursor: not-allowed; border-color: #aaa; color: #aaa; }
.playback-panel button:disabled:hover { background: #fff; color: #aaa; }
.btn-primary { border-color: #22a559 !important; color: #22a559 !important; }
.btn-primary:hover:not(:disabled) { background: #22a559 !important; color: #fff !important; }
.btn-danger { border-color: #e24a4a !important; color: #e24a4a !important; }
.btn-danger:hover:not(:disabled) { background: #e24a4a !important; color: #fff !important; }
.tag { font-size: 13px; color: #333; background: #f5f7fa; padding: 2px 10px; border-radius: 4px; }
.daily-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; width: 100%; }
.desc { font-size: 12px; color: #888; width: 100%; margin: 0; }
.progress { font-size: 13px; color: #22a559; background: #eafaf1; padding: 6px 12px; border-radius: 4px; width: 100%; }
.playback-panel label { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #333; }
.playback-panel input { width: 180px; padding: 5px 8px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px; }
.playback-panel select { padding: 5px 8px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px; background: #fff; }
</style>
