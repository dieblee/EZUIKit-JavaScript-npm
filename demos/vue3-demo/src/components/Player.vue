<script lang="ts" setup>
import { EZUIKitPlayer } from "ezuikit-js"
import { onMounted, onBeforeUnmount, ref } from "vue"

interface IPlayer {
  play: Function; stop: Function; getOSDTime: Function;
  pause: Function; resume: Function; seekTo: Function;
  capturePicture: Function; openSound: Function; closeSound: Function;
  startSave: Function; stopSave: Function;
  startTalk: Function; stopTalk: Function; fullscreen: Function; destroy: Function;
  eventEmitter: any; on: any;
}

let player: IPlayer;

// TODO: appKey and appSecret from EZVIZ Open Platform
const appKey = "a0660b84cb974a26bf3c3ba432f799f3";
const appSecret = "ea59fc7f896e1794d842a49f1fae9503";
const accessToken = ref("");
const tokenExpireTime = ref("");
const url = ref("ezopen://open.ys7.com/BG9483344/1.hd.live");
const playbackUrl = ref("ezopen://open.ys7.com/BG9483344/1.rec?begin=20260713000000");
const staticPath = ref("");
const template = ref("pcLive");
const isPlaybackMode = ref(false);

const recDate = ref("20260713");
const recStartTime = ref("00:00:00");
const recEndTime = ref("23:59:59");
const isRecording = ref(false);
const recordingProgress = ref("");
const seekInput = ref("20260713000000");
let recHeartbeat: ReturnType<typeof setInterval> | null = null;
let isPlayingRec = false;
var scheduleInterval = null;
var scheduleEnabled = ref(false);

// MinIO upload
const enableMinioUpload = ref(false);
const minioEndpoint = ref("http://localhost:9000");
const minioBucket = ref("recordings");
const minioAccessKey = ref("minioadmin");
const minioSecretKey = ref("minioadmin");
const uploadStatus = ref("");

function pad2(n: number): string { return n.toString().padStart(2, "0"); }
function toSec(t: string): number { const a = t.split(":").map(Number); return a[0] * 3600 + a[1] * 60 + (a[2] || 0); }
function fmtHMS(s: string): string { return s.split(" ").pop() || ""; }

function play() { if (player) player.play(); }
function stop() { if (player) player.stop(); }
function openSound() { if (player) player.openSound(); }
function closeSound() { if (player) player.closeSound(); }
function capturePicture() { if (player) player.capturePicture(String(Date.now())); }
function startSave() { if (player) player.startSave(String(Date.now())); }
function stopSave() { if (player) player.stopSave(); }
function startTalk() { if (player) player.startTalk(); }
function stopTalk() { if (player) player.stopTalk(); }
function fullscreen() { if (player) player.fullscreen(); }
function destroyF() { if (player) { player.destroy(); player = null!; } }
function seekToTime() { if (player && isPlayingRec) player.seekTo(seekInput.value); }



function loadToken() {
  function pad2(n){return("0"+n).slice(-2)}
  var t = localStorage.getItem('ez_token');
  var e = localStorage.getItem('ez_expire');
  if (!t || !e) return false;
  var now = new Date();
  var today = now.getFullYear()+'-'+('0'+(now.getMonth()+1)).slice(-2)+'-'+('0'+now.getDate()).slice(-2);
  var ed = e.split(' ')[0];
    var ed = new Date(parseInt(e));
  var n = new Date();
  // Use cache only when expire date is AFTER today (at least tomorrow)
  // If expire is today or earlier, re-fetch
  var edNorm = new Date(ed.getFullYear(),ed.getMonth(),ed.getDate());
  var todayNorm = new Date(n.getFullYear(),n.getMonth(),n.getDate());
  if (edNorm > todayNorm) {
    accessToken.value = t;
    tokenExpireTime.value = e;
    console.log("use cached token, expires: "+ed.getFullYear()+"-"+pad2(ed.getMonth()+1)+"-"+pad2(ed.getDate())+" > today, valid");
    return true;
  }
  console.log("token expired or expires today, re-fetching");
  localStorage.removeItem('ez_token'); localStorage.removeItem('ez_expire');
  return false;
}
function saveToken(t,e) {
  localStorage.setItem('ez_token',t); localStorage.setItem('ez_expire',e);
    var ed2 = new Date(parseInt(e));
  console.log("token saved, expires: "+ed2.getFullYear()+"-"+("0"+(ed2.getMonth()+1)).slice(-2)+"-"+("0"+ed2.getDate()).slice(-2));
}

async function fetchToken() {
  if (!appKey || !appSecret) { console.warn("appKey/appSecret not set"); return false; }
  console.log("fetching token...");
  try {
    var p = new URLSearchParams();
    p.append("appKey", appKey);
    p.append("appSecret", appSecret);
    var r = await fetch("/api/lapp/token/get", { method: "POST", body: p });
    var j = await r.json();
    if (j.code === "200" && j.data && j.data.accessToken) {
      accessToken.value = j.data.accessToken;
      tokenExpireTime.value = j.data.expireTime || "";
      saveToken(j.data.accessToken, j.data.expireTime || "");
      console.log("=== Access Token ===");
      console.log(j.data.accessToken);
      console.log("Expires: " + new Date(parseInt(tokenExpireTime.value)).toLocaleString());
      console.log("====================");
      return true;
    } else {
      console.error("token error:", j);
      return false;
    }
  } catch(e) {
    console.error("fetch error:", e);
    return false;
  }
}

async function fetchAndInit() {
  if (loadToken()) { initPlayer(); return; }
  var ok = await fetchToken();
  if (ok) initPlayer();
}

function initPlayer() {
  if (player) { player.destroy(); player = null!; }
  const playUrl = isPlaybackMode.value ? playbackUrl.value : url.value;
  player = new EZUIKitPlayer({
    id: "video-container", accessToken: accessToken.value, url: playUrl,
    template: template.value, height: 400,
    decoderType: "v3",
    handleError: (err: any) => { console.error("handleError", err); },
    staticPath: staticPath.value, scaleMode: 1,
    env: { domain: "https://open.ys7.com" },
    loggerOptions: { level: "INFO", name: "ezuikit", showTime: true },
    streamInfoCBType: 1,
  });
  player.on(EZUIKitPlayer.EVENTS.videoInfo, (i: any) => console.warn(i));
  player.on(EZUIKitPlayer.EVENTS.audioInfo, (i: any) => console.warn(i));
  player.on(EZUIKitPlayer.EVENTS.firstFrameDisplay, () => {});
  player.on(EZUIKitPlayer.EVENTS.stopSave, handleStopSave);
  window.player = player;
}

async function handleStopSave(eventData) {
  const data = (eventData && eventData.data) || eventData;
  if (!data || !data.url) return;
  if (!enableMinioUpload.value) return;
  uploadStatus.value = "fetching blob...";
  try {
    var resp = await fetch(data.url);
    var blob = await resp.blob();
    var fileName = (data.file && data.file.name) || "recording_" + Date.now() + ".webm";
    uploadStatus.value = "uploading " + fileName;
    var url = minioEndpoint.value.replace(/\/+$/, "") + "/" + minioBucket.value + "/" + encodeURIComponent(fileName);
    var uploadResp = await fetch(url, { method: "PUT", headers: { "Content-Type": blob.type || "video/webm" }, body: blob });
    if (uploadResp.ok) { uploadStatus.value = "uploaded: " + fileName; }
    else { uploadStatus.value = "upload fail: " + uploadResp.status; }
  } catch (e) { uploadStatus.value = "upload error: " + e.message; }
}

function switchToLive() {
  if (isRecording.value) return;
  clearHb(); isPlaybackMode.value = false;
  template.value = "pcLive"; initPlayer();
}

function switchToPlayback() {
  if (isRecording.value) return;
  clearHb(); isPlaybackMode.value = true;
  isPlayingRec = true; template.value = "pcRec"; initPlayer();
}



function clearHb() { if (recHeartbeat) { clearInterval(recHeartbeat); recHeartbeat = null; } }

function startRecording() {
  if (isRecording.value) return;
  const date = recDate.value;
  if (!/^\d{8}$/.test(date)) { recordingProgress.value = "date error"; return; }
  isRecording.value = true;

  if (isPlaybackMode.value) {
    isPlayingRec = true;
    const begin = recStartTime.value.replace(/:/g, "");
    const recUrl = "ezopen://open.ys7.com/BC7799091/1.rec?begin=" + date + begin;
    playbackUrl.value = recUrl;
    if (player) { player.destroy(); player = null!; }
    recordingProgress.value = "initializing...";
    player = new EZUIKitPlayer({
      id: "video-container", accessToken: accessToken.value, url: recUrl,
      template: "pcRec", height: 400,
      decoderType: "v3",
      handleSuccess: () => {
        player.startSave(date + "_rec").then(() => {
          recordingProgress.value = "recording"; pbHb(date);
        }).catch(() => { recordingProgress.value = "fail"; isRecording.value = false; });
      },
      handleError: (err: any) => {
        const code = (err && err.data && err.data.nErrorCode) || (err && err.nErrorCode);
        if (code === 395701) stopRec("playback done");
      },
      staticPath: staticPath.value, scaleMode: 1, env: { domain: "https://open.ys7.com" },
      loggerOptions: { level: "WARN", name: "ezuikit", showTime: true }, streamInfoCBType: 1,
    });
    player.on(EZUIKitPlayer.EVENTS.firstFrameDisplay, () => {});
    player.on(EZUIKitPlayer.EVENTS.stopSave, handleStopSave);
    window.player = player;
  } else {
    recordingProgress.value = "recording live...";
    player.startSave(date + "_live").then(() => { wcHb(); })
      .catch(() => { recordingProgress.value = "fail"; isRecording.value = false; });
  }
}

function pbHb(date: string) {
  clearHb();
  recHeartbeat = setInterval(() => {
    if (!isRecording.value || !player) return;
    player.getOSDTime().then((data: any) => {
      const time = data && data.data && data.data.time;
      if (!time) return;
      const hms = fmtHMS(time);
      recordingProgress.value = date.slice(0,4) + "-" + date.slice(4,6) + "-" + date.slice(6,8) + " " + hms;
      if (toSec(hms) >= toSec(recEndTime.value)) stopRec("done");
    }).catch(() => {});
  }, 3000);
}

function wcHb() {
  clearHb();
  recHeartbeat = setInterval(() => {
    if (!isRecording.value) return;
    const d = new Date();
    const n = pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
    recordingProgress.value = "recording " + n;
    if (toSec(n) >= toSec(recEndTime.value)) stopRec("done");
  }, 3000);
}

function stopRec(msg: string) {
  isRecording.value = false; isPlayingRec = false;
  recordingProgress.value = msg; clearHb();
  if (player) { player.stopSave().catch(() => {}); }
}

function stopRecording() { if (!isRecording.value) return; stopRec("stopped"); }

onBeforeUnmount(() => { clearHb(); isRecording.value = false; });
function startSched() {
  if (scheduleInterval) return;
  var lastDate = "";
  scheduleInterval = setInterval(function() {
    if (!scheduleEnabled.value) return;
    var d = new Date();
    var now = d.getHours()*3600 + d.getMinutes()*60 + d.getSeconds();
    var today = d.getFullYear() + "-" + ("0"+(d.getMonth()+1)).slice(-2) + "-" + ("0"+d.getDate()).slice(-2);
    var ss = toSec(recStartTime.value);
    var es = toSec(recEndTime.value);
    if (lastDate && lastDate !== today && isRecording.value) {
      console.log("date changed, stop"); stopRec("date change"); lastDate = today; return;
    }
    lastDate = today;
    if (!isRecording.value && now >= ss && now < es) {
      console.log("auto-start at " + ("0"+d.getHours()).slice(-2) + ":" + ("0"+d.getMinutes()).slice(-2));
      startRecording();
    }
    if (isRecording.value && now >= es) {
      console.log("auto-stop at " + ("0"+d.getHours()).slice(-2) + ":" + ("0"+d.getMinutes()).slice(-2));
      stopRec("auto");
    }
  }, 30000);
}

onMounted(function() { initPlayer(); startSched(); if (appKey && appSecret) fetchAndInit(); });
</script>

<template>
  <div class="pw">
    <div class="ms">
      <button :class="{ active: !isPlaybackMode }" @click="switchToLive" :disabled="isRecording">Live</button>
      <button :class="{ active: isPlaybackMode }" @click="switchToPlayback" :disabled="isRecording">Playback</button>
    </div>
    <div id="video-container" style="height: 400px"></div>
    <div class="cp">
      <label>accessToken: <input v-model="accessToken" type="text" readonly /></label>
      <label v-if="!isPlaybackMode">Live URL: <input v-model="url" type="text" /></label>
      <label v-if="isPlaybackMode">Playback URL: <input v-model="playbackUrl" type="text" /></label>
      <label>staticPath: <input v-model="staticPath" type="text" /></label>
    </div>
    <div class="bp">
      <button @click="fetchAndInit">fetch token + init</button>
      <button @click="stop">stop</button>
      <button @click="play">play</button>
      <button @click="openSound">sound+</button>
      <button @click="closeSound">sound-</button>
      <button @click="startSave">save+</button>
      <button @click="stopSave">save-</button>
      <button @click="capturePicture">capture</button>
      <button @click="fullscreen">fullscreen</button>
      <button @click="startTalk">talk+</button>
      <button @click="stopTalk">talk-</button>
      <button @click="destroyF">destroy</button>
    </div>
    <div class="ds">
      <fieldset>
        <legend>Daily Recording</legend>
        <label class="dr"><input v-model="scheduleEnabled" type="checkbox" /> Auto record (start at begin time, stop at end time, check every 30s)</label>
        <p class="desc">Record in current mode. Auto-stop at end time.</p>
        <div class="dr">
          <label>Date: <input v-model="recDate" type="text" :disabled="isRecording" class="ti" /></label>
          <label>Start: <input v-model="recStartTime" type="text" :disabled="isRecording" class="ti" /></label>
          <label>End: <input v-model="recEndTime" type="text" :disabled="isRecording" class="ti" /></label>
        </div>
        <div class="dr">
          <button :disabled="isRecording" @click="startRecording" class="green">Start</button>
          <button :disabled="!isRecording" @click="stopRecording" class="red">Stop</button>
          <span v-if="recordingProgress" class="pg">{{ recordingProgress }}</span>
        </div>
      </fieldset>
      <fieldset v-if="isPlaybackMode">
        <legend>Seek</legend>
        <label>Time (yyyyMMddhhmmss): <input v-model="seekInput" type="text" class="ti" /></label>
        <button @click="seekToTime">Seek</button>
      </fieldset>
      <fieldset>
        <legend>MinIO Upload</legend>
        <label class="dr"><input v-model="enableMinioUpload" type="checkbox" /> Enable auto-upload to MinIO</label>
        <div class="dr" v-if="enableMinioUpload">
          <label>Endpoint: <input v-model="minioEndpoint" type="text" class="ti" /></label>
          <label>Bucket: <input v-model="minioBucket" type="text" class="ti" /></label>
          <label>Access Key: <input v-model="minioAccessKey" type="text" class="ti" /></label>
          <label>Secret Key: <input v-model="minioSecretKey" type="password" class="ti" /></label>
        </div>
        <span v-if="uploadStatus" class="pg">{{ uploadStatus }}</span>
      </fieldset>
    </div>
  </div>
</template>

<style scoped>
.pw { font-family: "PingFang SC","Microsoft YaHei",sans-serif; max-width: 920px; margin: 0 auto; padding: 16px; }
.ms { display: flex; gap: 8px; margin-bottom: 12px; }
.ms button { flex: 1; padding: 8px; border: 1px solid #407aff; background: #fff; color: #407aff; border-radius: 4px; cursor: pointer; font-size: 14px; }
.ms button.active { background: #407aff; color: #fff; }
.cp { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; font-size: 14px; }
.cp label { display: flex; align-items: center; gap: 8px; }
.cp input { flex: 1; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px; }
.bp { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.bp button { padding: 6px 14px; border: 1px solid #dcdfe6; background: #fff; color: #333; border-radius: 4px; cursor: pointer; font-size: 13px; }
.bp button:hover { border-color: #407aff; color: #407aff; }
.ds { margin-top: 12px; display: flex; flex-direction: column; gap: 12px; }
.ds fieldset { border: 1px solid #ddd; border-radius: 6px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.ds legend { font-size: 13px; font-weight: 600; padding: 0 6px; color: #407aff; }
.ds button { padding: 6px 14px; border: 1px solid #407aff; background: #fff; color: #407aff; border-radius: 4px; cursor: pointer; font-size: 13px; align-self: flex-start; }
.ds button:hover { background: #407aff; color: #fff; }
.ds button:disabled { opacity: 0.5; cursor: not-allowed; border-color: #aaa; color: #aaa; }
.dr { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.dr label { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
.ti { width: 140px; padding: 5px 8px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px; }
.pg { font-size: 13px; color: #22a559; background: #eafaf1; padding: 6px 12px; border-radius: 4px; }
.green { border-color: #22a559 !important; color: #22a559 !important; }
.green:hover:not(:disabled) { background: #22a559 !important; color: #fff !important; }
.red { border-color: #e24a4a !important; color: #e24a4a !important; }
.red:hover:not(:disabled) { background: #e24a4a !important; color: #fff !important; }
.desc { font-size: 12px; color: #888; margin: 0; }
</style>
