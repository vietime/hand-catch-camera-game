const video = document.querySelector("#camera");
const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const panel = document.querySelector("#panel");
const startButton = document.querySelector("#startButton");
const switchButton = document.querySelector("#switchButton");
const statusEl = document.querySelector("#status");
const scoreEl = document.querySelector("#score");
const timeEl = document.querySelector("#time");
const bestEl = document.querySelector("#best");

const GAME_SECONDS = 60;
const FALLER_COUNT = 6;
const CATCH_RADIUS = 58;

let handLandmarker;
let mediaPipeVision;
let stream;
let cameraFacing = "user";
let started = false;
let score = 0;
let best = Number(localStorage.getItem("handCatchBest") || 0);
let timeLeft = GAME_SECONDS;
let lastVideoTime = -1;
let lastFrame = performance.now();
let gameEndsAt = 0;
let hand = null;
let touchControl = null;
let fallers = [];
let audioContext = null;
let audioEnabled = false;

bestEl.textContent = best;

function setStatus(message) {
  statusEl.textContent = message;
}

function initAudio() {
  if (audioEnabled) return;
  var AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  audioContext = audioContext || new AudioContextClass();
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  audioEnabled = true;
}

function playTone(frequency, duration, type, volume, whenOffset) {
  if (!audioEnabled || !audioContext) return;
  var startAt = audioContext.currentTime + (whenOffset || 0);
  var oscillator = audioContext.createOscillator();
  var gain = audioContext.createGain();
  oscillator.type = type || "sine";
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume || 0.08, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.03);
}

function playStartSound() {
  playTone(392, 0.11, "triangle", 0.07, 0);
  playTone(523, 0.13, "triangle", 0.08, 0.09);
  playTone(659, 0.16, "triangle", 0.08, 0.18);
}

function playCatchSound() {
  playTone(740, 0.07, "square", 0.045, 0);
  playTone(988, 0.09, "triangle", 0.05, 0.045);
}

function playEndSound() {
  playTone(523, 0.14, "sawtooth", 0.055, 0);
  playTone(392, 0.18, "sawtooth", 0.055, 0.12);
  playTone(262, 0.24, "sine", 0.06, 0.28);
}

function playSwitchSound() {
  playTone(330, 0.07, "triangle", 0.045, 0);
  playTone(440, 0.08, "triangle", 0.045, 0.06);
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => registrations.forEach((registration) => registration.unregister()))
    .catch(() => {});
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function randomFaller(width, height, resetAbove = true) {
  const size = 18 + Math.random() * 22;
  return {
    x: size + Math.random() * Math.max(1, width - size * 2),
    y: resetAbove ? -size - Math.random() * height : Math.random() * height,
    size,
    speed: 120 + Math.random() * 210,
    hue: 38 + Math.random() * 70,
  };
}

function resetGame() {
  score = 0;
  timeLeft = GAME_SECONDS;
  gameEndsAt = performance.now() + GAME_SECONDS * 1000;
  fallers = Array.from({ length: FALLER_COUNT }, () =>
    randomFaller(canvas.clientWidth, canvas.clientHeight, false),
  );
  scoreEl.textContent = score;
  timeEl.textContent = timeLeft;
}

async function initHandLandmarker() {
  if (handLandmarker) return;
  setStatus("Đang tải model nhận diện tay...");

  if (!mediaPipeVision) {
    mediaPipeVision = await loadMediaPipeVision();
  }

  const vision = await mediaPipeVision.FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
  );
  handLandmarker = await mediaPipeVision.HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
    },
    runningMode: "VIDEO",
    numHands: 1,
  });
}

function loadMediaPipeVision() {
  return new Promise(function (resolve, reject) {
    var moduleScript = document.createElement("script");
    var callbackName = "__handCatchMediaPipeReady";
    moduleScript.type = "module";
    moduleScript.textContent =
      "import * as vision from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs'; window." +
      callbackName +
      "(vision);";
    window[callbackName] = function (vision) {
      delete window[callbackName];
      resolve(vision);
    };
    moduleScript.onerror = function () {
      delete window[callbackName];
      reject(new Error("Không tải được MediaPipe"));
    };
    document.head.appendChild(moduleScript);
  });
}

async function startCamera() {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: cameraFacing,
      width: { ideal: 960 },
      height: { ideal: 1280 },
    },
  });
  video.srcObject = stream;
  await video.play();
}

function updateHand() {
  if (!handLandmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    hand = touchControl;
    return;
  }
  if (video.currentTime === lastVideoTime) return;

  lastVideoTime = video.currentTime;
  let result;
  try {
    result = handLandmarker.detectForVideo(video, performance.now());
  } catch {
    result = handLandmarker.detectForVideo(video);
  }
  const landmarks = result.landmarks && result.landmarks[0];
  if (!landmarks) {
    hand = touchControl;
    return;
  }

  const palm = landmarks[9];
  const x = (1 - palm.x) * canvas.clientWidth;
  const y = palm.y * canvas.clientHeight;
  hand = { x, y };
}

function updateGame(dt, now) {
  if (!started) return;

  timeLeft = Math.max(0, Math.ceil((gameEndsAt - now) / 1000));
  timeEl.textContent = timeLeft;

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  for (const faller of fallers) {
    faller.y += faller.speed * dt;

    if (hand) {
      const dx = faller.x - hand.x;
      const dy = faller.y - hand.y;
      const hitDistance = CATCH_RADIUS + faller.size * 0.5;
      if (dx * dx + dy * dy < hitDistance * hitDistance) {
        score += 10;
        scoreEl.textContent = score;
        playCatchSound();
        Object.assign(faller, randomFaller(width, height));
      }
    }

    if (faller.y > height + faller.size) {
      Object.assign(faller, randomFaller(width, height));
    }
  }

  if (timeLeft <= 0) {
    started = false;
    panel.hidden = false;
    startButton.textContent = "Chơi lại";
    playEndSound();
    if (score > best) {
      best = score;
      localStorage.setItem("handCatchBest", String(best));
      bestEl.textContent = best;
    }
    setStatus(`Hết giờ. Điểm của bạn: ${score}`);
  } else {
    setStatus(hand ? "Đang theo dõi bàn tay" : "Đưa bàn tay vào khung hình");
  }
}

function draw() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);

  const vignette = ctx.createRadialGradient(width / 2, height / 2, 40, width / 2, height / 2, width);
  vignette.addColorStop(0, "rgba(16, 24, 32, 0)");
  vignette.addColorStop(1, "rgba(16, 24, 32, 0.42)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  for (const faller of fallers) {
    ctx.beginPath();
    ctx.arc(faller.x, faller.y, faller.size, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${faller.hue} 92% 61% / 0.95)`;
    ctx.shadowColor = `hsl(${faller.hue} 92% 61%)`;
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  if (hand) {
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, CATCH_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(57, 255, 174, 0.2)";
    ctx.strokeStyle = "rgba(57, 255, 174, 0.95)";
    ctx.lineWidth = 3;
    ctx.fill();
    ctx.stroke();
  }
}

function loop(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  updateHand();
  updateGame(dt, now);
  draw();
  requestAnimationFrame(loop);
}

async function startGame() {
  if (started) return;
  try {
    initAudio();
    startButton.disabled = true;
    setStatus("Đang xin quyền camera...");
    await startCamera();
    playStartSound();
    setStatus("Camera đã mở. Đang tải nhận diện tay...");
    resizeCanvas();
    resetGame();
    panel.hidden = true;
    started = true;
    setStatus("Đưa bàn tay vào khung hình. Nếu chạm màn hình, đó là chế độ dự phòng.");
    initHandLandmarker()
      .then(function () {
        setStatus("Nhận diện tay sẵn sàng");
      })
      .catch(function (error) {
        console.error(error);
        setStatus("Camera đã chạy. Model tay lỗi, tạm dùng chạm màn hình để test game.");
      });
  } catch (error) {
    console.error(error);
    const message = (error && error.message) || String(error);
    setStatus(`Lỗi khởi động: ${message.slice(0, 90)}`);
  } finally {
    startButton.disabled = false;
  }
}

async function switchCamera() {
  cameraFacing = cameraFacing === "user" ? "environment" : "user";
  if (stream || started) {
    try {
      await startCamera();
      playSwitchSound();
      setStatus(cameraFacing === "user" ? "Đang dùng camera trước" : "Đang dùng camera sau");
    } catch (error) {
      console.error(error);
      setStatus("Không đổi được camera trên thiết bị này");
    }
  }
}

function handleControlPoint(event) {
  var point = event.touches ? event.touches[0] : event;
  var rect = canvas.getBoundingClientRect();
  touchControl = {
    x: point.clientX - rect.left,
    y: point.clientY - rect.top,
  };
}

function bindButton(button, handler) {
  button.addEventListener("click", handler);
  button.addEventListener("touchend", function (event) {
    event.preventDefault();
    handler(event);
  });
}

window.startHandCatchGame = startGame;
window.switchHandCatchCamera = switchCamera;

bindButton(startButton, startGame);
bindButton(switchButton, switchCamera);
canvas.addEventListener("touchstart", handleControlPoint, { passive: true });
canvas.addEventListener("touchmove", handleControlPoint, { passive: true });
canvas.addEventListener("pointermove", handleControlPoint);
window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", () => setTimeout(resizeCanvas, 250));

resizeCanvas();
requestAnimationFrame(loop);
setStatus("Nhấn Bắt đầu để cấp quyền camera");
