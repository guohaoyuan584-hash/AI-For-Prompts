const STORAGE_KEY = "ai-for-prompt-sessions-v2";
const VOICE_LANGUAGE_KEY = "ai-for-prompt-voice-language-v1";
const MAX_RAW_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const VOICE_LANGUAGES = {
  en: { code: "en-US", label: "EN", title: "Switch voice language to Chinese" },
  zh: { code: "zh-CN", label: "ZH", title: "Switch voice language to English" },
};
const DEFAULT_ASSISTANT_MESSAGE =
  "Tell me the image idea in plain language. I will help you fill in the missing style, framing, scene, lighting, and mood details.";
const DEFAULT_RESULT = {
  summary:
    "Start a new session and describe an image idea. The AI will point out what is missing before building a fuller prompt.",
  finalPrompt: "No final prompt yet.",
  negativePrompt: "No negative prompt yet.",
  why: "The final explanation will appear here after the prompt is refined.",
};

const els = {
  newSessionBtn: document.getElementById("new-session-btn"),
  historyList: document.getElementById("history-list"),
  messageList: document.getElementById("message-list"),
  promptInput: document.getElementById("prompt-input"),
  workspaceCard: document.getElementById("workspace-card"),
  dropOverlay: document.getElementById("drop-overlay"),
  refineBtn: document.getElementById("refine-btn"),
  copyPromptBtn: document.getElementById("copy-prompt-btn"),
  refineAgainBtn: document.getElementById("refine-again-btn"),
  summaryText: document.getElementById("summary-text"),
  finalPromptText: document.getElementById("final-prompt-text"),
  negativePromptText: document.getElementById("negative-prompt-text"),
  whyText: document.getElementById("why-text"),
  voiceBtn: document.getElementById("voice-btn"),
  voiceLanguageBtn: document.getElementById("voice-language-btn"),
  attachBtn: document.getElementById("attach-btn"),
  fileInput: document.getElementById("file-input"),
  attachmentPreviewList: document.getElementById("attachment-preview-list"),
};

let sessions = [];
let activeSessionId = null;
let isRequestInFlight = false;
let speechRecognition = null;
let isListening = false;
let speechSupported = false;
let manualSpeechStop = false;
let speechBaseValue = "";
let voiceLanguage = getInitialVoiceLanguage();

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function getInitialVoiceLanguage() {
  try {
    const savedLanguage = localStorage.getItem(VOICE_LANGUAGE_KEY);
    if (savedLanguage === "zh" || savedLanguage === "en") {
      return savedLanguage;
    }
  } catch (error) {
    // Ignore localStorage read issues and fall back to browser language.
  }

  return /^zh/i.test(navigator.language || "") ? "zh" : "en";
}

function saveVoiceLanguagePreference() {
  try {
    localStorage.setItem(VOICE_LANGUAGE_KEY, voiceLanguage);
  } catch (error) {
    // Ignore localStorage write issues for this preference.
  }
}

function currentVoiceLanguageConfig() {
  return VOICE_LANGUAGES[voiceLanguage] || VOICE_LANGUAGES.en;
}

function isChineseVoiceLanguage() {
  return currentVoiceLanguageConfig().code.startsWith("zh");
}

function joinSpeechText(base, addition) {
  const trimmedBase = (base || "").trim();
  const trimmedAddition = (addition || "").trim();

  if (!trimmedAddition) {
    return trimmedBase;
  }

  if (!trimmedBase) {
    return trimmedAddition;
  }

  return isChineseVoiceLanguage()
    ? `${trimmedBase}${trimmedAddition}`
    : `${trimmedBase} ${trimmedAddition}`.trim();
}

function createSession() {
  return {
    id: uid(),
    title: "Untitled Session",
    createdAt: new Date().toISOString(),
    status: "draft",
    refinementCount: 0,
    pendingAttachments: [],
    result: { ...DEFAULT_RESULT },
    messages: [
      {
        role: "assistant",
        text: DEFAULT_ASSISTANT_MESSAGE,
      },
    ],
  };
}

function normalizeSession(session) {
  return {
    ...createSession(),
    ...session,
    pendingAttachments: Array.isArray(session?.pendingAttachments)
      ? session.pendingAttachments
      : [],
    messages: Array.isArray(session?.messages)
      ? session.messages.map((message) => ({
          ...message,
          attachments: Array.isArray(message.attachments)
            ? message.attachments
            : [],
        }))
      : createSession().messages,
    result: {
      ...DEFAULT_RESULT,
      ...(session?.result || {}),
    },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      sessions = [createSession()];
      activeSessionId = sessions[0].id;
      saveState();
      return;
    }

    const parsed = JSON.parse(raw);
    sessions =
      Array.isArray(parsed.sessions) && parsed.sessions.length
        ? parsed.sessions.map(normalizeSession)
        : [createSession()];
    activeSessionId = parsed.activeSessionId || sessions[0].id;
    if (!sessions.some((session) => session.id === activeSessionId)) {
      activeSessionId = sessions[0].id;
    }
  } catch (error) {
    sessions = [createSession()];
    activeSessionId = sessions[0].id;
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ sessions, activeSessionId })
  );
}

function activeSession() {
  const session = sessions.find((item) => item.id === activeSessionId);
  if (!session) return null;
  if (!Array.isArray(session.pendingAttachments)) {
    session.pendingAttachments = [];
  }
  return session;
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function nlToBr(text) {
  return escapeHtml(text).replace(/\n/g, "<br />");
}

function cleanIdea(text) {
  return text
    .trim()
    .replace(
      /^i\s+(want|need|would like)\s+(to\s+create|to\s+make|to\s+generate)?\s*/i,
      ""
    )
    .replace(/^make\s+me\s+/i, "")
    .replace(/^create\s+/i, "")
    .replace(/^generate\s+/i, "")
    .trim();
}

function titleFromMessages(session) {
  const firstUserMessage = session.messages.find(
    (message) => message.role === "user"
  );
  if (!firstUserMessage) {
    return "Untitled Session";
  }

  const compact = cleanIdea(firstUserMessage.text).replace(/\s+/g, " ").trim();
  return compact ? compact.slice(0, 38) : "Untitled Session";
}

function renderMessages(session) {
  els.messageList.innerHTML = session.messages
    .map((message) => {
      const isUser = message.role === "user";
      const attachmentsHtml = (message.attachments || [])
        .map(
          (attachment) => `
            <div class="mt-3">
              <img
                src="${attachment.dataUrl}"
                alt="${escapeHtml(attachment.name || "reference image")}"
                class="max-h-40 rounded-lg border border-outline-variant/10 object-cover"
              />
            </div>
          `
        )
        .join("");
      return `
        <div class="max-w-[88%] ${isUser ? "ml-auto" : ""}">
          <p class="text-[10px] font-bold text-primary uppercase tracking-widest opacity-40 ${isUser ? "text-right" : ""}">
            ${isUser ? "You" : "Assistant"}
          </p>
          <div class="mt-2 ${
            isUser
              ? "bg-[#f6f6f6] border border-outline-variant/10"
              : "bg-surface-container-low"
          } p-4 rounded-lg">
            <p class="text-sm leading-6 text-on-surface">${nlToBr(
              message.text
            )}</p>
            ${attachmentsHtml}
          </div>
        </div>
      `;
    })
    .join("");

  els.messageList.scrollTop = els.messageList.scrollHeight;
}

function renderResults(session) {
  els.summaryText.textContent = session.result.summary;
  els.finalPromptText.textContent = session.result.finalPrompt;
  els.negativePromptText.textContent = session.result.negativePrompt;
  els.whyText.textContent = session.result.why;
}

function renderHistory() {
  const ordered = [...sessions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  els.historyList.innerHTML = ordered
    .map((session, index) => {
      const active = session.id === activeSessionId;
      return `
        <div class="group relative">
          <button
            data-session-id="${session.id}"
            class="history-session-btn w-full rounded-lg px-3 py-3 pr-10 text-left transition-colors ${
              active ? "bg-[#e2e2e2]" : "bg-white hover:bg-[#f7f7f7]"
            }"
          >
            <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Session ${String(ordered.length - index).padStart(2, "0")}
            </p>
            <p class="mt-1 text-sm leading-5 text-neutral-700">
              ${escapeHtml(session.title)}
            </p>
          </button>
          <button
            data-delete-session-id="${session.id}"
            class="delete-session-btn absolute right-2 top-1/2 -translate-y-1/2 hidden h-7 w-7 items-center justify-center rounded-full text-neutral-400 transition hover:bg-white hover:text-black group-hover:flex"
            title="Delete session"
          >
            <span class="material-symbols-outlined" style="font-size:18px;">delete</span>
          </button>
        </div>
      `;
    })
    .join("");

  document.querySelectorAll(".history-session-btn").forEach((button) => {
    button.addEventListener("click", () => {
      if (isRequestInFlight) return;
      activeSessionId = button.dataset.sessionId;
      saveState();
      render();
    });
  });

  document.querySelectorAll(".delete-session-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (isRequestInFlight) return;
      const targetSessionId = button.dataset.deleteSessionId;
      const targetSession = sessions.find((session) => session.id === targetSessionId);
      if (!targetSession) return;
      const confirmed = window.confirm(
        `Delete "${targetSession.title}"? This cannot be undone.`
      );
      if (!confirmed) return;

      sessions = sessions.filter((session) => session.id !== targetSessionId);
      if (!sessions.length) {
        const freshSession = createSession();
        sessions = [freshSession];
        activeSessionId = freshSession.id;
      } else if (activeSessionId === targetSessionId) {
        activeSessionId = sessions[0].id;
      }

      saveState();
      render();
    });
  });
}

function render() {
  const session = activeSession();
  if (!session) return;
  session.title = titleFromMessages(session);
  renderHistory();
  renderMessages(session);
  renderResults(session);
  renderPendingAttachments(session);
}

function setRequestState(nextValue) {
  isRequestInFlight = nextValue;
  els.refineBtn.disabled = nextValue;
  els.refineAgainBtn.disabled = nextValue;
  els.newSessionBtn.disabled = nextValue;
  els.promptInput.disabled = nextValue;
  els.fileInput.disabled = nextValue;

  const disabledClass = nextValue ? "opacity-60 cursor-not-allowed" : "";
  [
    els.refineBtn,
    els.refineAgainBtn,
    els.newSessionBtn,
    els.voiceBtn,
    els.voiceLanguageBtn,
    els.attachBtn,
  ].forEach((button) => {
    if (!button) return;
    button.classList.toggle("opacity-60", nextValue);
    button.classList.toggle("cursor-not-allowed", nextValue);
  });

  els.refineBtn.textContent = nextValue ? "Thinking..." : "Refine Prompt";
  renderVoiceLanguageButton();
  if (nextValue && isListening) {
    stopVoiceInput();
  }
}

async function requestRefine(payload) {
  const response = await fetch("/api/refine", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "The server request failed.");
  }

  return data;
}

function applyAssistantPayload(session, payload) {
  session.status = payload.status || session.status;
  session.result = {
    ...DEFAULT_RESULT,
    ...(payload.result || {}),
  };

  if (payload.assistantMessage) {
    session.messages.push({
      role: "assistant",
      text: payload.assistantMessage,
    });
  }
}

function appendErrorMessage(session, error) {
  session.messages.push({
    role: "assistant",
    text: `I could not reach the live model just now.\n\n${error.message}`,
  });
}

function renderPendingAttachments(session) {
  const attachments = session.pendingAttachments || [];
  if (!attachments.length) {
    els.attachmentPreviewList.innerHTML = "";
    els.attachmentPreviewList.classList.add("hidden");
    return;
  }

  els.attachmentPreviewList.classList.remove("hidden");
  els.attachmentPreviewList.innerHTML = attachments
    .map(
      (attachment, index) => `
        <div class="relative">
          <img
            src="${attachment.dataUrl}"
            alt="${escapeHtml(attachment.name || "reference image")}"
            class="h-16 w-16 rounded-lg border border-outline-variant/10 object-cover"
          />
          <button
            data-attachment-index="${index}"
            class="remove-attachment-btn absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-black text-white"
            title="Remove image"
          >
            <span class="material-symbols-outlined" style="font-size:14px;">close</span>
          </button>
        </div>
      `
    )
    .join("");

  document.querySelectorAll(".remove-attachment-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const currentSession = activeSession();
      if (!currentSession) return;
      const index = Number(button.dataset.attachmentIndex);
      currentSession.pendingAttachments.splice(index, 1);
      saveState();
      renderPendingAttachments(currentSession);
    });
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function base64FromDataUrl(dataUrl) {
  return dataUrl.split(",")[1] || "";
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("The selected image could not be decoded."));
    image.src = dataUrl;
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(new Error("The compressed image could not be read."));
    reader.readAsDataURL(blob);
  });
}

async function compressImageFile(file) {
  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromDataUrl(originalDataUrl);
  const scale = Math.min(
    1,
    MAX_IMAGE_DIMENSION / Math.max(image.width, image.height)
  );
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);

  const outputMimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const quality = outputMimeType === "image/jpeg" ? 0.86 : undefined;

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (!result) {
          reject(new Error("The image could not be compressed."));
          return;
        }
        resolve(result);
      },
      outputMimeType,
      quality
    );
  });

  const dataUrl = await blobToDataUrl(blob);
  return {
    mimeType: outputMimeType,
    dataUrl,
    base64: base64FromDataUrl(dataUrl),
    size: blob.size,
  };
}

async function addAttachments(fileList) {
  const currentSession = activeSession();
  if (!currentSession || !fileList?.length) return;
  if (!Array.isArray(currentSession.pendingAttachments)) {
    currentSession.pendingAttachments = [];
  }

  const imageFiles = [...fileList].filter((file) =>
    file.type.startsWith("image/")
  );
  if (!imageFiles.length) {
    appendErrorMessage(currentSession, {
      message: "Only image files can be attached here.",
    });
    saveState();
    render();
    return;
  }

  const remainingSlots = Math.max(0, 4 - currentSession.pendingAttachments.length);
  const filesToRead = imageFiles.slice(0, remainingSlots);
  if (!filesToRead.length) {
    appendErrorMessage(currentSession, {
      message: "You can attach up to 4 reference images per message.",
    });
    saveState();
    render();
    return;
  }

  try {
    for (const file of filesToRead) {
      if (file.size > MAX_RAW_ATTACHMENT_SIZE) {
        appendErrorMessage(currentSession, {
          message: `${file.name} is larger than 10MB. Please use a smaller image.`,
        });
        continue;
      }

      const compressed = await compressImageFile(file);
      currentSession.pendingAttachments.push({
        id: uid(),
        name: file.name,
        mimeType: compressed.mimeType,
        dataUrl: compressed.dataUrl,
        base64: compressed.base64,
      });
    }
  } catch (error) {
    appendErrorMessage(currentSession, {
      message: error.message || "The selected image could not be loaded.",
    });
  }

  saveState();
  render();
}

function setVoiceButtonState(listening) {
  els.voiceBtn.classList.toggle("bg-black", listening);
  els.voiceBtn.classList.toggle("text-white", listening);
  els.voiceBtn.classList.toggle("text-neutral-400", !listening);
  els.voiceBtn.title = listening ? "Stop voice input" : "Start voice input";
}

function renderVoiceLanguageButton() {
  if (!els.voiceLanguageBtn) return;
  const config = currentVoiceLanguageConfig();
  els.voiceLanguageBtn.textContent = config.label;
  els.voiceLanguageBtn.title = config.title;
  els.voiceLanguageBtn.disabled = isRequestInFlight;
  els.voiceLanguageBtn.classList.toggle("opacity-60", isRequestInFlight);
  els.voiceLanguageBtn.classList.toggle("cursor-not-allowed", isRequestInFlight);
  els.voiceLanguageBtn.classList.toggle("bg-surface-container-high", voiceLanguage === "zh");
  els.voiceLanguageBtn.classList.toggle("text-black", voiceLanguage === "zh");
}

function appendTranscriptToInput(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const existing = els.promptInput.value.trim();
  els.promptInput.value = existing ? `${existing} ${trimmed}` : trimmed;
  els.promptInput.focus();
}

function createSpeechRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    speechSupported = false;
    return null;
  }

  speechSupported = true;
  const recognition = new SpeechRecognition();
  recognition.lang = currentVoiceLanguageConfig().code;
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    isListening = true;
    manualSpeechStop = false;
    speechBaseValue = els.promptInput.value.trim();
    setVoiceButtonState(true);
  };

  recognition.onresult = (event) => {
    let finalTranscript = "";
    let interimTranscript = "";

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript;
      if (event.results[index].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    if (finalTranscript) {
      speechBaseValue = joinSpeechText(speechBaseValue, finalTranscript);
      els.promptInput.value = speechBaseValue;
    } else if (interimTranscript) {
      const preview = interimTranscript.trim();
      if (preview) {
        els.promptInput.value = joinSpeechText(speechBaseValue, preview);
      }
    }
  };

  recognition.onerror = (event) => {
    const currentSession = activeSession();
    if (!currentSession) return;

    const messages = {
      "not-allowed":
        "Microphone permission was denied. Please allow microphone access in your browser.",
      "service-not-allowed":
        "Microphone access is blocked by the browser or system settings.",
      "no-speech":
        "No speech was detected. Please try again and speak a bit closer to the microphone.",
      "audio-capture":
        "No microphone was found. Please check your microphone connection.",
    };

    appendErrorMessage(currentSession, {
      message: messages[event.error] || "Voice input could not be started.",
    });
    saveState();
    render();
  };

  recognition.onend = () => {
    isListening = false;
    setVoiceButtonState(false);
    manualSpeechStop = false;
    speechBaseValue = "";
  };

  return recognition;
}

function startVoiceInput() {
  if (isRequestInFlight) return;
  if (!speechRecognition) {
    speechRecognition = createSpeechRecognition();
  }

  if (!speechSupported || !speechRecognition) {
    const currentSession = activeSession();
    if (currentSession) {
      appendErrorMessage(currentSession, {
        message:
          "Voice input is not supported in this browser. Please try Chrome or another browser with speech recognition support.",
      });
      saveState();
      render();
    }
    return;
  }

  try {
    speechRecognition.lang = currentVoiceLanguageConfig().code;
    speechRecognition.start();
  } catch (error) {
    const currentSession = activeSession();
    if (currentSession) {
      appendErrorMessage(currentSession, {
        message: "Voice input is already running or could not be started.",
      });
      saveState();
      render();
    }
  }
}

function toggleVoiceLanguage() {
  if (isRequestInFlight) return;
  if (isListening) {
    stopVoiceInput();
  }

  voiceLanguage = voiceLanguage === "zh" ? "en" : "zh";
  saveVoiceLanguagePreference();
  renderVoiceLanguageButton();

  if (speechRecognition) {
    speechRecognition.onstart = null;
    speechRecognition.onresult = null;
    speechRecognition.onerror = null;
    speechRecognition.onend = null;
  }
  speechRecognition = createSpeechRecognition();
}

function stopVoiceInput() {
  if (!speechRecognition || !isListening) return;
  manualSpeechStop = true;
  speechRecognition.stop();
}

async function submitPrompt() {
  const value = els.promptInput.value.trim();
  const session = activeSession();
  const attachments = [...(session?.pendingAttachments || [])];
  if ((!value && !attachments.length) || isRequestInFlight) return;

  session.messages.push({
    role: "user",
    text: value || "Please use this image as a style reference.",
    attachments,
  });
  session.pendingAttachments = [];
  session.title = titleFromMessages(session);
  els.promptInput.value = "";
  saveState();
  render();

  try {
    setRequestState(true);
    const payload = await requestRefine({
      mode: "continue",
      messages: session.messages,
      refinementCount: session.refinementCount,
    });
    applyAssistantPayload(session, payload);
  } catch (error) {
    appendErrorMessage(session, error);
  } finally {
    setRequestState(false);
    saveState();
    render();
  }
}

function startNewSession() {
  if (isRequestInFlight) return;
  const session = createSession();
  sessions.push(session);
  activeSessionId = session.id;
  saveState();
  render();
  els.promptInput.focus();
}

function copyText(text, button) {
  if (!text || text.startsWith("No ")) return;
  const showCopiedState = () => {
    const original = button.innerHTML;
    button.innerHTML = '<span class="material-symbols-outlined">check</span>Copied';
    setTimeout(() => {
      button.innerHTML = original;
    }, 1200);
  };

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(showCopiedState);
    return;
  }

  const temp = document.createElement("textarea");
  temp.value = text;
  temp.setAttribute("readonly", "");
  temp.style.position = "absolute";
  temp.style.left = "-9999px";
  document.body.appendChild(temp);
  temp.select();
  document.execCommand("copy");
  document.body.removeChild(temp);
  showCopiedState();
}

async function refineAgain() {
  const session = activeSession();
  if (isRequestInFlight) return;
  if (!session.messages.some((message) => message.role === "user")) return;

  const nextRefinementCount = session.refinementCount + 1;

  try {
    setRequestState(true);
    const payload = await requestRefine({
      mode: "refine_again",
      messages: session.messages,
      refinementCount: nextRefinementCount,
    });
    session.refinementCount = nextRefinementCount;
    applyAssistantPayload(session, payload);
  } catch (error) {
    appendErrorMessage(session, error);
  } finally {
    setRequestState(false);
    saveState();
    render();
  }
}

function bindEvents() {
  els.newSessionBtn.addEventListener("click", startNewSession);
  els.refineBtn.addEventListener("click", submitPrompt);
  els.copyPromptBtn.addEventListener("click", () =>
    copyText(els.finalPromptText.textContent, els.copyPromptBtn)
  );
  els.refineAgainBtn.addEventListener("click", refineAgain);
  els.promptInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitPrompt();
    }
  });
  els.voiceBtn.addEventListener("click", () => {
    if (isListening) {
      stopVoiceInput();
      return;
    }
    startVoiceInput();
  });
  els.voiceLanguageBtn.addEventListener("click", toggleVoiceLanguage);
  els.attachBtn.addEventListener("click", () => {
    if (isRequestInFlight) return;
    els.fileInput.click();
  });
  els.fileInput.addEventListener("change", async (event) => {
    await addAttachments(event.target.files);
    event.target.value = "";
  });
  let dragDepth = 0;
  ["dragenter", "dragover"].forEach((eventName) => {
    els.workspaceCard.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (isRequestInFlight) return;
      dragDepth += 1;
      els.dropOverlay.classList.remove("hidden");
    });
  });
  els.workspaceCard.addEventListener("dragleave", (event) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      els.dropOverlay.classList.add("hidden");
    }
  });
  els.workspaceCard.addEventListener("drop", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepth = 0;
    els.dropOverlay.classList.add("hidden");
    if (isRequestInFlight) return;
    await addAttachments(event.dataTransfer.files);
  });
  document.addEventListener("dragover", (event) => {
    if (els.workspaceCard.contains(event.target)) {
      event.preventDefault();
    }
  });
}

speechRecognition = createSpeechRecognition();
setVoiceButtonState(false);
renderVoiceLanguageButton();
loadState();
bindEvents();
render();
