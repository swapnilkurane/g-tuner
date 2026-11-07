const strings = [
  { note: "E", octave: 2, frequency: 82.41, label: "Low E", number: 6 },
  { note: "A", octave: 2, frequency: 110.00, label: "A", number: 5 },
  { note: "D", octave: 3, frequency: 146.83, label: "D", number: 4 },
  { note: "G", octave: 3, frequency: 196.00, label: "G", number: 3 },
  { note: "B", octave: 3, frequency: 246.94, label: "B", number: 2 },
  { note: "E", octave: 4, frequency: 329.63, label: "High E", number: 1 }
];
const chromaticNotes = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const noteEl = document.querySelector("#note");
const octaveEl = document.querySelector("#octave");
const frequencyEl = document.querySelector("#frequency");
const statusEl = document.querySelector("#status");
const needleEl = document.querySelector("#needle");
const startButton = document.querySelector("#start-button");
const permissionHint = document.querySelector("#permission-hint");
const modeHint = document.querySelector("#mode-hint");
const stringGuideMode = document.querySelector("#string-guide-mode");
const autoModeButton = document.querySelector("#auto-mode");
const manualModeButton = document.querySelector("#manual-mode");
const installButton = document.querySelector("#install-button");
const stringButtons = [...document.querySelectorAll(".string")];

let selectedString = 0;
let tuningMode = "auto";
let audioContext;
let analyser;
let mediaStream;
let animationFrame;
let installPrompt;

function selectString(index) {
  selectedString = index;
  updateStringSelection();
  if (!analyser) {
    const target = strings[index];
    noteEl.textContent = target.note;
    octaveEl.textContent = target.octave;
    frequencyEl.innerHTML = `${target.frequency.toFixed(1)} <small>Hz target</small>`;
    statusEl.textContent = tuningMode === "manual"
      ? `Ready — pluck ${target.label} (${target.number})`
      : "Ready when you are";
    statusEl.className = "status";
    needleEl.style.left = "50%";
  }
}

function updateStringSelection() {
  stringButtons.forEach((button, index) => {
    const selected = index === selectedString;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
    button.disabled = tuningMode !== "manual";
  });
}

function setStatus(message, state = "") {
  const className = state ? `status ${state}` : "status";
  if (statusEl.textContent !== message) statusEl.textContent = message;
  if (statusEl.className !== className) statusEl.className = className;
}

function setTuningMode(mode) {
  tuningMode = mode;
  const isAuto = mode === "auto";
  autoModeButton.classList.toggle("active", isAuto);
  autoModeButton.setAttribute("aria-pressed", String(isAuto));
  manualModeButton.classList.toggle("active", !isAuto);
  manualModeButton.setAttribute("aria-pressed", String(!isAuto));
  modeHint.textContent = isAuto
    ? "Pluck any string — Fieldtone will find it"
    : "Choose a string below, then pluck it";
  stringGuideMode.textContent = isAuto ? "AUTO-DETECT" : "CHOOSE STRING";
  updateStringSelection();

  if (analyser) {
    setStatus(isAuto ? "Pluck any string and let it ring" : `Pluck ${strings[selectedString].label} (${strings[selectedString].number})`);
    needleEl.style.left = "50%";
  } else {
    selectString(selectedString);
  }
}

function detectString(frequency) {
  let closestIndex = 0;
  let closestCents = Infinity;
  strings.forEach((string, index) => {
    const cents = 1200 * Math.log2(frequency / string.frequency);
    if (Math.abs(cents) < Math.abs(closestCents)) {
      closestIndex = index;
      closestCents = cents;
    }
  });
  return Math.abs(closestCents) <= 200
    ? { index: closestIndex, cents: closestCents }
    : null;
}

function findPitch(buffer, sampleRate) {
  const size = buffer.length;
  let rms = 0;
  for (let i = 0; i < size; i += 1) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.008) return null;

  const minLag = Math.floor(sampleRate / 400);
  const maxLag = Math.min(Math.floor(sampleRate / 65), Math.floor(size / 2));
  let bestLag = -1;
  let bestCorrelation = 0;
  let cumulativeDifference = 0;
  const normalized = new Float32Array(maxLag + 1);

  for (let lag = 1; lag <= maxLag; lag += 1) {
    let difference = 0;
    for (let i = 0; i < size - maxLag; i += 1) {
      const delta = buffer[i] - buffer[i + lag];
      difference += delta * delta;
    }
    cumulativeDifference += difference;
    normalized[lag] = cumulativeDifference === 0 ? 1 : difference * lag / cumulativeDifference;

  }

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    if (normalized[lag] < 0.18 && normalized[lag] <= normalized[lag - 1]) {
      while (lag + 1 <= maxLag && normalized[lag + 1] < normalized[lag]) lag += 1;
      bestLag = lag;
      bestCorrelation = 1 - normalized[lag];
      break;
    }
  }

  if (bestLag < 0) {
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      const correlation = 1 - normalized[lag];
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestLag = lag;
      }
    }
  }
  if (bestLag < 0 || bestCorrelation < 0.72) return null;

  const left = normalized[Math.max(minLag, bestLag - 1)];
  const center = normalized[bestLag];
  const right = normalized[Math.min(maxLag, bestLag + 1)];
  const denominator = 2 * (2 * center - left - right);
  const shift = denominator === 0 ? 0 : (right - left) / denominator;
  return sampleRate / (bestLag + shift);
}

function updatePitch() {
  if (!analyser) return;
  const buffer = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buffer);
  const frequency = findPitch(buffer, audioContext.sampleRate);
  if (frequency) {
    const detectedString = tuningMode === "auto" ? detectString(frequency) : null;
    const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
    const noteIndex = ((midi % 12) + 12) % 12;
    const octave = Math.floor(midi / 12) - 1;
    frequencyEl.innerHTML = `${frequency.toFixed(1)} <small>Hz</small>`;
    const targetIndex = tuningMode === "auto" ? detectedString?.index : selectedString;
    if (targetIndex !== undefined) {
      selectedString = targetIndex;
      updateStringSelection();
      const target = strings[targetIndex];
      const cents = tuningMode === "auto"
        ? detectedString.cents
        : 1200 * Math.log2(frequency / target.frequency);
      if (Math.abs(cents) > 200) {
        noteEl.textContent = chromaticNotes[noteIndex];
        octaveEl.textContent = octave;
        needleEl.style.left = "50%";
        needleEl.style.backgroundColor = "#8d9388";
        setStatus(tuningMode === "manual"
          ? `Pluck the selected ${target.label} (${target.number}) string`
          : "Not near a standard guitar string");
        animationFrame = requestAnimationFrame(updatePitch);
        return;
      }

      const inTune = Math.abs(cents) <= 5;
      noteEl.textContent = target.note;
      octaveEl.textContent = target.octave;
      needleEl.style.left = `${50 + Math.max(-50, Math.min(50, cents))}%`;
      needleEl.style.backgroundColor = inTune ? "#d3f36b" : (cents < 0 ? "#e6a46c" : "#b7df57");
      setStatus(inTune
        ? `Yes — ${target.label} (${target.number}) is in tune`
        : `Tune ${cents < 0 ? "up" : "down"} ${Math.abs(Math.round(cents))} cents`,
      inTune ? "in-tune" : "");
    } else {
      noteEl.textContent = chromaticNotes[noteIndex];
      octaveEl.textContent = octave;
      needleEl.style.left = "50%";
      needleEl.style.backgroundColor = "#8d9388";
      setStatus("Not near a standard guitar string");
    }

  } else {
    setStatus(tuningMode === "auto"
      ? "Pluck any string and let it ring"
      : `Pluck ${strings[selectedString].label} (${strings[selectedString].number}) and let it ring`);
  }
  animationFrame = requestAnimationFrame(updatePitch);
}

async function startTuning() {
  if (analyser) {
    stopTuning();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("Microphone needs a secure connection", "error");
    permissionHint.textContent = "Open this app on HTTPS or localhost";
    return;
  }

  startButton.disabled = true;
  permissionHint.textContent = "Requesting microphone access…";
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0;
    audioContext.createMediaStreamSource(mediaStream).connect(analyser);
    startButton.querySelector("span").textContent = "Stop tuning";
    startButton.classList.add("active");
    permissionHint.textContent = "Use a quiet space for the most accurate reading";
    updatePitch();
  } catch (error) {
    if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
    if (audioContext) await audioContext.close();
    mediaStream = undefined;
    audioContext = undefined;
    analyser = undefined;
    console.error("Could not start guitar tuner:", error);
    setStatus(error.name === "NotAllowedError"
      ? "Microphone access was not allowed"
      : error.name === "NotFoundError"
        ? "No microphone was found"
        : "Could not start the microphone", "error");
    permissionHint.textContent = "Check your browser’s microphone permission";
  } finally {
    startButton.disabled = false;
  }
}

function stopTuning() {
  cancelAnimationFrame(animationFrame);
  if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
  if (audioContext) audioContext.close();
  mediaStream = undefined;
  audioContext = undefined;
  analyser = undefined;
  startButton.querySelector("span").textContent = "Start tuning";
  startButton.classList.remove("active");
  permissionHint.textContent = "Allow microphone access when asked";
  selectString(selectedString);
}

stringButtons.forEach(button => button.addEventListener("click", () => selectString(Number(button.dataset.index))));
autoModeButton.addEventListener("click", () => setTuningMode("auto"));
manualModeButton.addEventListener("click", () => setTuningMode("manual"));
startButton.addEventListener("click", startTuning);

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = undefined;
  installButton.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(error => {
    console.error("Offline support could not be enabled:", error);
  }));
}

setTuningMode("auto");
