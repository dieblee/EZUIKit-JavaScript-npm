<script lang="ts" setup>
import { EZUIKitPlayer } from "ezuikit-js"
import { onMounted, onBeforeUnmount, ref } from "vue"

interface IPlayer {
  play: Function; stop: Function; getOSDTime: Function;
  pause: Function; resume: Function; seekTo: Function;
  getSpeed: Function; setSpeed: Function;
  capturePicture: Function; openSound: Function; closeSound: Function;
  startSave: Function; stopSave: Function;
  startTalk: Function; stopTalk: Function; fullscreen: Function; destroy: Function;
  eventEmitter: any; on: any;
}

let player: IPlayer;

const accessToken = ref(
  "at.867lpo9f4tx55uko7lkqeyxi968tjggd-7lkowucs09-0e0ex6l-zpqoua5rs"
);
const url = ref("ezopen://open.ys7.com/BG9483344/1.hd.live");
const staticPath = ref("");

const recDate = ref("20260713");
const recStartTime = ref("00:00:00");
const recEndTime = ref("23:59:59");
const isRecording = ref(false);
const recordingProgress = ref("");
const seekInput = ref("20260713000000");
let isPlayingRec = false;
let recHeartbeat = null;

function pad2(n) { return n.toString().padStart(2, "0"); }
function formatHHMMSS(s) { var p = s.split(" "); return p[p.length - 1]; }
function timeToSeconds(t) { var x = t.split(":").map(Number); return x[0]*3600 + x[1]*60 + (x[2]||0); }
function timeStrToUrlParam(t) { return t.replace(/:/g, ""); }

const play = () => { if (player) player.play(); };
const stop = () => { if (player) player.stop(); };
const openSound = () => { if (player) player.openSound(); };
const closeSound = () => { if (player) player.closeSound(); };
const capturePicture = () => { if (player) player.capturePicture(String(Date.now())).then(function(d) { console.log(d); }); };
const startSave = () => { if (player) player.startSave(String(Date.now())).then(function(d) { console.log("startSave", d); }); };
const stopSave = () => { if (player) player.stopSave().then(function(d) { console.log("stopSave", d); }); };
const startTalk = () => { if (player) player.startTalk(); };
const stopTalk = () => { if (player) player.stopTalk(); };
const fullscreen = () => { if (player) player.fullscreen(); };
const destroy = () => { if (player) { player.destroy(); player = null; } };

const seekToTime = () => { if (player && isPlayingRec) { player.seekTo(seekInput.value); } };

function initLive() {
  isPlayingRec = false;
  if (player) { player.destroy(); player = null; }
  player = new EZUIKitPlayer({ id: "video-container", accessToken: accessToken.value, url: url.value, template: "pcLive", height: 400,
    handleError: function(err) { console.error("handleError", err); },
    staticPath: staticPath.value, scaleMode: 1, env: { domain: "https://open.ys7.com" },
    loggerOptions: { level: "INFO", name: "ezuikit", showTime: true }, streamInfoCBType: 1
  });
  player.on(EZUIKitPlayer.EVENTS.videoInfo, function(info) { console.warn("videoInfo", info); });
  player.on(EZUIKitPlayer.EVENTS.audioInfo, function(info) { console.warn("audioInfo", info); });
  player.on(EZUIKitPlayer.EVENTS.firstFrameDisplay, function() { console.warn("firstFrameDisplay"); });
  window.player = player;
}

const startDailyRecording = function() {
  if (isRecording.value) return;
  var date = recDate.value;
  var startParam = timeStrToUrlParam(recStartTime.value);
  if (!/^\d{8}$/.test(date)) { recordingProgress.value = "日期格式错误"; return; }
  isRecording.value = true;
  isPlayingRec = true;
  var recUrl = "ezopen://open.ys7.com/BG9483344/1.rec?begin=" + date + startParam;
  url.value = recUrl;
  if (player) { player.destroy(); player = null; }
  recordingProgress.value = "初始化回放...";
  player = new EZUIKitPlayer({
    id: "video-container", accessToken: accessToken.value, url: recUrl, template: "pcRec", height: 400,
    handleSuccess: function() {
      var d = date.slice(0,4)+"-"+date.slice(4,6)+"-"+date.slice(6,8);
      player.startSave(date+"_recording").then(function() {
        recordingProgress.value = "录制中 "+d;
        startHeartbeat(date);
      }).catch(function() { recordingProgress.value = "录制失败"; isRecording.value = false; });
    },
    handleError: function(err) {
      var code = (err&&err.data&&err.data.nErrorCode)||(err&&err.nErrorCode);
      if (code === 395701) { stopDailyRecordingInternal("播放结束"); }
    },
    staticPath: staticPath.value, scaleMode: 1, env: { domain: "https://open.ys7.com" },
    loggerOptions: { level: "WARN", name: "ezuikit", showTime: true }, streamInfoCBType: 1
  });
  player.on(EZUIKitPlayer.EVENTS.firstFrameDisplay, function() {});
  window.player = player;
};

const stopDailyRecording = function() {
  if (!isRecording.value) return;
  stopDailyRecordingInternal("已停止");
};
function stopDailyRecordingInternal(msg) {
  isRecording.value = false; isPlayingRec = false;
  recordingProgress.value = msg;
  if (recHeartbeat) { clearInterval(recHeartbeat); recHeartbeat = null; }
  if (player) { player.stopSave().then(function() { console.log("done"); }).catch(function() {}); }
  setTimeout(function() { initLive(); }, 1500);
}

function startHeartbeat(date) {
  if (recHeartbeat) clearInterval(recHeartbeat);
  recHeartbeat = setInterval(function() {
    if (!isRecording.value || !player) return;
    player.getOSDTime().then(function(data) {
      var time = data && data.data && data.data.time;
      if (!time) return;
      var hms = time.split(" ").pop();
      var d = date.slice(0,4)+"-"+date.slice(4,6)+"-"+date.slice(6,8);
      recordingProgress.value = "录制中 "+d+" — "+hms;
      var p = recEndTime.value.split(":").map(Number);
      var endSec = p[0]*3600+p[1]*60+(p[2]||0);
      var cp = hms.split(":").map(Number);
      if (cp[0]*3600+cp[1]*60+(cp[2]||0) >= endSec-60) { stopDailyRecordingInternal("完成"); }
    }).catch(function() {});
  }, 3000);
}

onBeforeUnmount(function() {
  if (recHeartbeat) clearInterval(recHeartbeat);
  isRecording.value = false;
});
onMounted(function() { initLive(); });
</script>

<template>
  <div class="player-wrapper">
    <div id="video-container" style="height: 400px"></div>
    <div class="config-panel">
      <label> accessToken: <input v-model="accessToken" type="text" placeholder="请输入 accessToken" /> </label>
      <label> 直播 url: <input v-model="url" type="text" placeholder="请输入直播播放地址" /> </label>
      <label> staticPath: <input v-model="staticPath" type="text" placeholder="请输入 staticPath" /> </label>
    </div>
    <div class="button-panel">
      <button @click="initLive">init</button>
      <button @click="stop">stop</button>
      <button @click="play">play</button>
      <button @click="openSound">openSound</button>
      <button @click="closeSound">closeSound</button>
      <button @click="startSave">startSave</button>
      <button @click="stopSave">stopSave</button>
      <button @click="capturePicture">截图</button>
      <button @click="fullscreen">全屏</button>
      <button @click="startTalk">startTalk</button>
      <button @click="stopTalk">stopTalk</button>
      <button @click="destroy">destroy</button>
    </div>
    <div class="daily-section">
      <fieldset>
        <legend>📅 全天回放录制</legend>
        <p class="desc">指定日期和时间范围，自动回放并录制成录像文件。</p>
        <div class="daily-row">
          <label>日期: <input v-model="recDate" type="text" placeholder="20260713" :disabled="isRecording" /></label>
          <label>开始: <input v-model="recStartTime" type="text" placeholder="00:00:00" :disabled="isRecording" class="ti" /></label>
          <label>结束: <input v-model="recEndTime" type="text" placeholder="23:59:59" :disabled="isRecording" class="ti" /></label>
        </div>
        <div class="daily-row">
          <button :disabled="isRecording" @click="startDailyRecording" class="bp">开始录制</button>
          <button :disabled="!isRecording" @click="stopDailyRecording" class="br">停止录制</button>
          <div v-if="recordingProgress" class="pg">{{ recordingProgress }}</div>
        </div>
      </fieldset>
      <fieldset>
        <legend>⏩ 时间跳转</legend>
        <label>目标 (yyyyMMddhhmmss): <input v-model="seekInput" type="text" placeholder="20260713000000" class="ti" /></label>
        <button @click="seekToTime" :disabled="!isPlayingRec">跳转</button>
        <span v-if="!isPlayingRec">仅回放时可用</span>
      </fieldset>
    </div>
  </div>
</template>

<style scoped>
.player-wrapper { font-family: "PingFang SC","Microsoft YaHei",sans-serif; max-width: 920px; margin: 0 auto; padding: 16px; }
.config-panel { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; font-size: 14px; }
.config-panel label { display: flex; align-items: center; gap: 8px; }
.config-panel input { flex: 1; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px; }
.button-panel { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.button-panel button { padding: 6px 14px; border: 1px solid #dcdfe6; background: #fff; color: #333; border-radius: 4px; cursor: pointer; font-size: 13px; }
.button-panel button:hover { border-color: #407aff; color: #407aff; }
.daily-section { margin-top: 12px; display: flex; flex-direction: column; gap: 12px; }
.daily-section fieldset { border: 1px solid #ddd; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.daily-section legend { font-size: 13px; font-weight: 600; padding: 0 6px; color: #407aff; }
.daily-section button { padding: 6px 14px; border: 1px solid #407aff; background: #fff; color: #407aff; border-radius: 4px; cursor: pointer; font-size: 13px; align-self: flex-start; }
.daily-section button:hover { background: #407aff; color: #fff; }
.daily-section button:disabled { opacity: .5; cursor: not-allowed; border-color: #aaa; color: #aaa; }
.bp { border-color: #22a559 !important; color: #22a559 !important; }
.bp:hover:not(:disabled) { background: #22a559 !important; color: #fff !important; }
.br { border-color: #e24a4a !important; color: #e24a4a !important; }
.br:hover:not(:disabled) { background: #e24a4a !important; color: #fff !important; }
.desc { font-size: 12px; color: #888; margin: 0; }
.daily-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.daily-row label { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #333; }
.ti { width: 140px; padding: 5px 8px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px; }
.daily-section input { width: 180px; padding: 5px 8px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px; }
.pg { font-size: 13px; color: #22a559; background: #eafaf1; padding: 6px 12px; border-radius: 4px; width: 100%; }
</style>