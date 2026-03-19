const CHAT_HISTORY_LIMIT = 12;
const CHAT_FALLBACK_ERROR = "抱歉，这次请求没有成功，你可以直接重试，或者换一个更具体的问题。";

document.addEventListener("DOMContentLoaded", () => {
    initSiteChrome();
    initChat();
    initNotesApp();
});

function initSiteChrome() {
    const header = document.querySelector(".site-header");
    const nav = document.querySelector(".nav");
    const navToggle = document.querySelector(".nav-toggle");
    const yearEl = document.getElementById("copyrightYear");

    const syncHeader = () => {
        if (!header) return;
        header.classList.toggle("is-scrolled", window.scrollY > 24);
    };

    syncHeader();
    window.addEventListener("scroll", syncHeader, { passive: true });

    if (yearEl) {
        yearEl.textContent = String(new Date().getFullYear());
    }

    if (navToggle && nav) {
        navToggle.addEventListener("click", () => {
            nav.classList.toggle("active");
        });

        document.querySelectorAll(".nav-link").forEach((link) => {
            link.addEventListener("click", () => {
                nav.classList.remove("active");
            });
        });
    }

    const revealTargets = document.querySelectorAll("[data-reveal]");
    if (revealTargets.length) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.16, rootMargin: "0px 0px -40px 0px" });

        revealTargets.forEach((target) => observer.observe(target));
    }
}

function initChat() {
    const chatToggle = document.querySelector(".chat-toggle");
    const chatContainer = document.querySelector(".chat-container");
    const chatMessages = document.getElementById("chatMessages");
    const chatInput = document.getElementById("chatInput");
    const sendBtn = document.getElementById("sendBtn");
    const resetBtn = document.getElementById("chatResetBtn");

    if (!chatToggle || !chatContainer || !chatMessages || !chatInput || !sendBtn) return;

    const initialMarkup = chatMessages.innerHTML;
    const conversation = [];
    let isChatOpen = false;
    let isSending = false;

    const trimConversation = () => {
        if (conversation.length <= CHAT_HISTORY_LIMIT) return;
        conversation.splice(0, conversation.length - CHAT_HISTORY_LIMIT);
    };

    const scrollToBottom = () => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    };

    const setComposerState = (disabled) => {
        chatInput.disabled = disabled;
        sendBtn.disabled = disabled;
        if (!disabled) {
            requestAnimationFrame(() => chatInput.focus());
        }
    };

    const setChatOpen = (open) => {
        isChatOpen = open;
        chatContainer.classList.toggle("active", open);
        const icon = chatToggle.querySelector("i");
        if (icon) {
            icon.className = open ? "fa-solid fa-xmark" : "fa-solid fa-robot";
        }
        if (open) {
            requestAnimationFrame(() => chatInput.focus());
        }
    };

    const addMessage = (text, sender, options = {}) => {
        const div = document.createElement("div");
        div.className = `message ${sender}`;
        if (options.isError) {
            div.classList.add("is-error");
        }
        div.textContent = text;
        chatMessages.appendChild(div);
        scrollToBottom();
        return div;
    };

    const addTypingIndicator = () => {
        const id = `typing-${Date.now()}`;
        const div = document.createElement("div");
        div.className = "typing-indicator";
        div.id = id;
        div.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        `;
        chatMessages.appendChild(div);
        scrollToBottom();
        return id;
    };

    const removeElement = (id) => {
        const node = document.getElementById(id);
        if (node) node.remove();
    };

    const restoreInitialChat = () => {
        conversation.length = 0;
        chatMessages.innerHTML = initialMarkup;
        chatInput.value = "";
        scrollToBottom();
    };

    const extractAssistantText = (payloadText, currentText) => {
        const data = JSON.parse(payloadText);
        const nextText =
            data?.output?.choices?.[0]?.message?.content ??
            data?.output?.text;

        if (typeof nextText !== "string" || !nextText) return currentText;
        if (nextText.startsWith(currentText)) return nextText;
        return currentText + nextText;
    };

    const parseResponseError = async (response) => {
        const raw = await response.text();
        try {
            const parsed = JSON.parse(raw);
            return parsed?.message || parsed?.error || raw || `HTTP ${response.status}`;
        } catch {
            return raw || `HTTP ${response.status}`;
        }
    };

    async function sendMessage(prefilledText) {
        const text = String(prefilledText ?? chatInput.value ?? "").trim();
        if (!text || isSending) return;

        if (!isChatOpen) {
            setChatOpen(true);
        }

        addMessage(text, "user");
        conversation.push({ role: "user", content: text });
        trimConversation();

        chatInput.value = "";
        isSending = true;
        setComposerState(true);

        const loadingId = addTypingIndicator();
        let aiMessageEl = null;

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    messages: conversation.slice(-CHAT_HISTORY_LIMIT)
                })
            });

            if (!response.ok) {
                throw new Error(await parseResponseError(response));
            }

            if (!response.body) {
                throw new Error("没有收到可读取的流式响应。");
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let aiText = "";
            let eventBuffer = "";

            const ensureAiMessage = () => {
                if (aiMessageEl) return aiMessageEl;
                removeElement(loadingId);
                aiMessageEl = addMessage("", "ai");
                return aiMessageEl;
            };

            const handleEventBlock = (block) => {
                const dataLines = block
                    .split(/\r?\n/)
                    .filter((line) => line.startsWith("data:"))
                    .map((line) => line.slice(5).trim())
                    .filter(Boolean);

                if (!dataLines.length) return;

                dataLines.forEach((payloadText) => {
                    if (payloadText === "[DONE]") return;
                    try {
                        aiText = extractAssistantText(payloadText, aiText);
                        const el = ensureAiMessage();
                        el.textContent = aiText;
                        scrollToBottom();
                    } catch (error) {
                        console.error("SSE parse error:", error);
                    }
                });
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                eventBuffer += decoder.decode(value, { stream: true });

                let separatorIndex = eventBuffer.search(/\r?\n\r?\n/);
                while (separatorIndex !== -1) {
                    const block = eventBuffer.slice(0, separatorIndex);
                    const separatorLength = eventBuffer.slice(separatorIndex, separatorIndex + 2) === "\r\n" ? 4 : 2;
                    eventBuffer = eventBuffer.slice(separatorIndex + separatorLength);
                    handleEventBlock(block);
                    separatorIndex = eventBuffer.search(/\r?\n\r?\n/);
                }
            }

            if (eventBuffer.trim()) {
                handleEventBlock(eventBuffer);
            }

            if (!aiText.trim()) {
                removeElement(loadingId);
                aiMessageEl = addMessage("抱歉，我刚才没有收到有效回复。你可以再试一次，或者换个更具体的问题。", "ai", {
                    isError: true
                });
            }

            const finalText = (aiMessageEl?.textContent || aiText || "").trim();
            if (finalText) {
                conversation.push({ role: "assistant", content: finalText });
                trimConversation();
            }
        } catch (error) {
            console.error("Chat Error:", error);
            removeElement(loadingId);
            addMessage(`抱歉，这次请求没有成功：${error.message || CHAT_FALLBACK_ERROR}`, "ai", {
                isError: true
            });
        } finally {
            isSending = false;
            setComposerState(false);
            scrollToBottom();
        }
    }

    chatToggle.addEventListener("click", () => {
        setChatOpen(!isChatOpen);
    });

    sendBtn.addEventListener("click", () => {
        sendMessage();
    });

    chatInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        sendMessage();
    });

    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            restoreInitialChat();
        });
    }

    document.addEventListener("click", (event) => {
        const promptTrigger = event.target.closest("[data-chat-prompt]");
        if (promptTrigger) {
            const prompt = promptTrigger.getAttribute("data-chat-prompt");
            if (prompt) {
                setChatOpen(true);
                sendMessage(prompt);
            }
            return;
        }

        const openChatTrigger = event.target.closest(".js-open-chat");
        if (openChatTrigger) {
            setChatOpen(true);
        }
    });
}

function initNotesApp() {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js").catch(() => { });
    }

    const notesApp = document.getElementById("notesApp");
    if (!notesApp) return;

    const tokenInput = document.getElementById("notesTokenInput");
    const saveTokenBtn = document.getElementById("notesSaveTokenBtn");
    const syncBtn = document.getElementById("notesSyncBtn");
    const statusEl = document.getElementById("notesStatus");
    const itemsEl = document.getElementById("notesItems");
    const newBtn = document.getElementById("notesNewBtn");
    const deleteBtn = document.getElementById("notesDeleteBtn");
    const saveLocalBtn = document.getElementById("notesSaveLocalBtn");
    const saveRemoteBtn = document.getElementById("notesSaveRemoteBtn");
    const titleEl = document.getElementById("notesTitle");
    const contentEl = document.getElementById("notesContent");
    const lockScreen = document.getElementById("notesLockScreen");
    const mainContent = document.getElementById("notesMainContent");
    const lockBtn = document.getElementById("notesLockBtn");
    const attachBtn = document.getElementById("notesAttachBtn");
    const fileInput = document.getElementById("notesFileInput");
    const attachmentsEl = document.getElementById("notesAttachments");

    const STORAGE_KEY = "kxy-notes-v1";
    const TOKEN_KEY = "kxy-notes-passphrase-v1";

    let isSyncing = false;
    const pendingDeletes = new Set();
    const noteCache = new Map();

    const nowIso = () => new Date().toISOString();

    const safeParseJson = (text, fallback) => {
        try {
            return JSON.parse(text);
        } catch {
            return fallback;
        }
    };

    const getToken = () => (localStorage.getItem(TOKEN_KEY) || "").trim();

    const setToken = (value) => {
        if (!value) {
            localStorage.removeItem(TOKEN_KEY);
            return;
        }
        localStorage.setItem(TOKEN_KEY, String(value).trim());
    };

    const setStatus = (text) => {
        if (statusEl) statusEl.textContent = text;
    };

    const loadState = () => {
        const raw = localStorage.getItem(STORAGE_KEY);
        const state = raw ? safeParseJson(raw, null) : null;
        return {
            notes: Array.isArray(state?.notes) ? state.notes : [],
            selectedId: typeof state?.selectedId === "string" ? state.selectedId : ""
        };
    };

    const saveState = (state) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    };

    const sortNotes = (notes) => {
        return [...notes].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    };

    const formatTime = (iso) => {
        if (!iso) return "";
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return "";
        return date.toLocaleString();
    };

    const ensureNoteShape = (note) => {
        const id = typeof note?.id === "string" ? note.id : "";
        const title = typeof note?.title === "string" ? note.title : "";
        const content = typeof note?.content === "string" ? note.content : "";
        const attachments = Array.isArray(note?.attachments) ? note.attachments : [];
        const createdAt = typeof note?.createdAt === "string" ? note.createdAt : nowIso();
        const updatedAt = typeof note?.updatedAt === "string" ? note.updatedAt : createdAt;
        const dirty = Boolean(note?.dirty);
        return { id, title, content, attachments, createdAt, updatedAt, dirty };
    };

    const makeId = () => {
        return (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`).toString();
    };

    const pickTitle = (note) => {
        const title = (note.title || "").trim();
        if (title) return title;
        const firstLine = (note.content || "").split("\n")[0].trim();
        return firstLine ? firstLine.slice(0, 20) : "未命名";
    };

    const getIconForType = (type) => {
        if (type.startsWith("image/")) return "fa-image";
        if (type.startsWith("video/")) return "fa-file-video";
        if (type.includes("pdf")) return "fa-file-pdf";
        if (type.includes("word") || type.includes("document")) return "fa-file-word";
        return "fa-file";
    };

    const checkLockState = () => {
        const token = getToken();
        if (token) {
            lockScreen.classList.add("hidden");
            mainContent.classList.remove("hidden");
            render();
            setTimeout(() => {
                syncAll().catch(() => { });
            }, 100);
            return;
        }

        lockScreen.classList.remove("hidden");
        mainContent.classList.add("hidden");
        tokenInput.value = "";
    };

    const renderAttachments = (attachments) => {
        attachmentsEl.innerHTML = "";

        attachments.forEach((attachment, index) => {
            const chip = document.createElement("div");
            chip.className = "attachment-chip";
            chip.innerHTML = `
                <i class="fa-regular ${getIconForType(attachment.type)} attachment-icon"></i>
                <span class="attachment-name" title="${attachment.name}">${attachment.name}</span>
                <div class="attachment-remove" title="删除附件">
                    <i class="fa-solid fa-xmark"></i>
                </div>
            `;

            chip.querySelector(".attachment-remove").addEventListener("click", (event) => {
                event.stopPropagation();
                if (!window.confirm(`确认删除附件“${attachment.name}”？`)) return;

                updateCurrent((note) => {
                    const nextAttachments = [...note.attachments];
                    nextAttachments.splice(index, 1);
                    note.attachments = nextAttachments;
                    note.updatedAt = nowIso();
                    note.dirty = true;
                    return note;
                });

                render();
            });

            chip.addEventListener("click", () => {
                const win = window.open("", "_blank", "noopener");
                if (!win) return;
                win.document.write(`<iframe src="${attachment.data}" frameborder="0" style="border:0;width:100%;height:100%;" allowfullscreen></iframe>`);
            });

            attachmentsEl.appendChild(chip);
        });
    };

    const render = () => {
        const state = loadState();
        const notes = sortNotes(state.notes.map(ensureNoteShape));
        const selectedId = state.selectedId && notes.some((note) => note.id === state.selectedId)
            ? state.selectedId
            : (notes[0]?.id || "");

        if (selectedId !== state.selectedId) {
            saveState({ notes, selectedId });
        }

        itemsEl.innerHTML = "";
        notes.forEach((note) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = `notes-item${note.id === selectedId ? " active" : ""}`;

            const title = document.createElement("div");
            title.className = "notes-item-title";
            title.textContent = pickTitle(note);

            const meta = document.createElement("div");
            meta.className = "notes-item-meta";
            meta.textContent = `${formatTime(note.updatedAt)}${note.dirty ? " · 未同步" : ""}`;

            btn.appendChild(title);
            btn.appendChild(meta);
            btn.addEventListener("click", () => {
                const next = loadState();
                saveState({ notes: next.notes, selectedId: note.id });
                render();
            });

            itemsEl.appendChild(btn);
        });

        const current = notes.find((note) => note.id === selectedId) || null;
        if (!current) {
            titleEl.value = "";
            contentEl.value = "";
            titleEl.disabled = true;
            contentEl.disabled = true;
            attachmentsEl.innerHTML = "";
            return;
        }

        titleEl.disabled = false;
        contentEl.disabled = false;
        titleEl.value = current.title;
        contentEl.value = current.content;
        renderAttachments(current.attachments);
    };

    const updateCurrent = (mutator) => {
        const state = loadState();
        const notes = state.notes.map(ensureNoteShape);
        const index = notes.findIndex((note) => note.id === state.selectedId);
        if (index < 0) return;

        notes[index] = ensureNoteShape(mutator({ ...notes[index] }));
        saveState({ notes, selectedId: state.selectedId });
    };

    const debounce = (fn, waitMs) => {
        let timer = null;
        return (...args) => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => fn(...args), waitMs);
        };
    };

    const apiJson = async (path, init = {}) => {
        const headers = new Headers(init.headers || {});
        headers.set("Content-Type", "application/json");

        const token = getToken();
        if (token) {
            headers.set("Authorization", `Bearer ${token}`);
        }

        const response = await fetch(path, { ...init, headers });
        if (response.status === 204) return null;

        const text = await response.text();
        const data = text ? safeParseJson(text, { error: text }) : null;
        if (!response.ok) {
            const message = typeof data?.error === "string" ? data.error : `请求失败（${response.status}）`;
            throw new Error(message);
        }

        return data;
    };

    const pushNote = async (note) => {
        const payload = {
            title: note.title || "",
            content: note.content || "",
            attachments: note.attachments || [],
            createdAt: note.createdAt || nowIso()
        };

        const data = await apiJson(`/api/notes/${encodeURIComponent(note.id)}`, {
            method: "PUT",
            body: JSON.stringify(payload)
        });

        if (data?.note) {
            noteCache.set(data.note.id, ensureNoteShape(data.note));
        }

        return ensureNoteShape(data?.note);
    };

    const deleteNoteRemote = async (noteId) => {
        await apiJson(`/api/notes/${encodeURIComponent(noteId)}`, { method: "DELETE" });
        noteCache.delete(noteId);
    };

    const fetchNoteDetails = async (id) => {
        if (noteCache.has(id)) return noteCache.get(id);
        const data = await apiJson(`/api/notes/${encodeURIComponent(id)}`, { method: "GET" });
        if (!data?.note) return null;
        const note = ensureNoteShape(data.note);
        noteCache.set(id, note);
        return note;
    };

    async function syncAll() {
        const token = getToken();
        if (!token) return;
        if (isSyncing) return;

        isSyncing = true;
        setStatus("状态：同步中...");

        try {
            const state = loadState();
            const localNotes = state.notes.map(ensureNoteShape);
            const localById = new Map(localNotes.map((note) => [note.id, note]));

            const remoteMetadata = await apiJson("/api/notes", { method: "GET" }) || { notes: [] };
            const remoteList = Array.isArray(remoteMetadata.notes) ? remoteMetadata.notes : [];
            const remoteById = new Map(remoteList.map((note) => [note.id, note]));
            const merged = new Map();
            const fetchPromises = [];

            for (const remoteMeta of remoteList) {
                if (pendingDeletes.has(remoteMeta.id)) continue;

                const localNote = localById.get(remoteMeta.id);
                const fetchAndMerge = async () => {
                    try {
                        const fullRemote = await fetchNoteDetails(remoteMeta.id);
                        if (fullRemote) {
                            merged.set(fullRemote.id, { ...fullRemote, dirty: false });
                        }
                    } catch (error) {
                        console.error(`Failed to fetch note ${remoteMeta.id}`, error);
                    }
                };

                if (!localNote) {
                    fetchPromises.push(fetchAndMerge());
                    continue;
                }

                const localTime = Date.parse(localNote.updatedAt || "");
                const remoteTime = Date.parse(remoteMeta.updatedAt || "");

                if (Number.isFinite(localTime) && Number.isFinite(remoteTime) && localTime > remoteTime) {
                    const pushed = await pushNote(localNote);
                    merged.set(pushed.id, { ...pushed, dirty: false });
                } else if (localTime < remoteTime) {
                    fetchPromises.push(fetchAndMerge());
                } else if (!localNote.content && !localNote.attachments.length && (remoteMeta.title || remoteMeta.id)) {
                    fetchPromises.push(fetchAndMerge());
                } else {
                    merged.set(remoteMeta.id, { ...localNote, dirty: false });
                }
            }

            await Promise.all(fetchPromises);

            const pushPromises = [];
            for (const localNote of localNotes) {
                if (merged.has(localNote.id) || remoteById.has(localNote.id) || pendingDeletes.has(localNote.id)) {
                    continue;
                }

                if (localNote.dirty) {
                    pushPromises.push((async () => {
                        try {
                            const pushed = await pushNote(localNote);
                            merged.set(pushed.id, { ...pushed, dirty: false });
                        } catch {
                            merged.set(localNote.id, localNote);
                        }
                    })());
                }
            }

            await Promise.all(pushPromises);

            const nextNotes = sortNotes(Array.from(merged.values()));
            const selectedId = state.selectedId && merged.has(state.selectedId)
                ? state.selectedId
                : (nextNotes[0]?.id || "");

            saveState({ notes: nextNotes, selectedId });
            render();
            setStatus(`状态：已同步 ${nextNotes.length} 条`);
        } catch (error) {
            if (error.message.includes("Unauthorized")) {
                setToken(null);
                checkLockState();
                window.alert("口令无效或已过期，请重新输入。");
            } else {
                setStatus(`状态：同步失败 - ${error.message}`);
                console.error("Sync error:", error);
            }
        } finally {
            isSyncing = false;
        }
    }

    const persistDraft = debounce(() => {
        saveState(loadState());
        render();
    }, 300);

    titleEl.addEventListener("input", () => {
        updateCurrent((note) => {
            note.title = titleEl.value;
            note.updatedAt = nowIso();
            note.dirty = true;
            return note;
        });
        persistDraft();
    });

    contentEl.addEventListener("input", () => {
        updateCurrent((note) => {
            note.content = contentEl.value;
            note.updatedAt = nowIso();
            note.dirty = true;
            return note;
        });
        persistDraft();
    });

    if (attachBtn && fileInput) {
        attachBtn.addEventListener("click", () => {
            fileInput.click();
        });

        fileInput.addEventListener("change", async () => {
            if (!fileInput.files || !fileInput.files.length) return;

            const files = Array.from(fileInput.files);
            const maxSize = 2 * 1024 * 1024;

            for (const file of files) {
                if (file.size > maxSize) {
                    window.alert(`文件“${file.name}”超过 2MB，暂时无法添加。`);
                    continue;
                }

                try {
                    const dataUrl = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });

                    updateCurrent((note) => {
                        note.attachments.push({
                            id: makeId(),
                            name: file.name,
                            type: file.type,
                            data: dataUrl,
                            size: file.size
                        });
                        note.updatedAt = nowIso();
                        note.dirty = true;
                        return note;
                    });
                } catch (error) {
                    console.error("File read error:", error);
                    window.alert("读取文件失败，请稍后重试。");
                }
            }

            fileInput.value = "";
            render();
        });
    }

    saveTokenBtn.addEventListener("click", () => {
        const value = (tokenInput.value || "").trim();
        if (!value) {
            window.alert("请输入同步口令。");
            return;
        }
        setToken(value);
        checkLockState();
    });

    tokenInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            saveTokenBtn.click();
        }
    });

    if (lockBtn) {
        lockBtn.addEventListener("click", () => {
            setToken(null);
            checkLockState();
        });
    }

    syncBtn.addEventListener("click", () => {
        syncAll().catch(() => { });
    });

    newBtn.addEventListener("click", async () => {
        const state = loadState();
        const note = {
            id: makeId(),
            title: "",
            content: "",
            attachments: [],
            createdAt: nowIso(),
            updatedAt: nowIso(),
            dirty: true
        };

        const notes = [note, ...state.notes.map(ensureNoteShape)];
        saveState({ notes, selectedId: note.id });
        render();
        setStatus("状态：新建中...");

        try {
            const pushed = await pushNote(note);
            const updatedNotes = notes.map((item) => item.id === note.id ? { ...pushed, dirty: false } : item);
            saveState({ notes: updatedNotes, selectedId: pushed.id });
            render();
            setStatus("状态：已新建并同步");
        } catch (error) {
            console.error("Create note failed:", error);
            setStatus("状态：已新建，等待同步");
        }
    });

    deleteBtn.addEventListener("click", async () => {
        const state = loadState();
        const notes = state.notes.map(ensureNoteShape);
        const current = notes.find((note) => note.id === state.selectedId);
        if (!current) return;

        const shouldDelete = window.confirm(`确认删除“${pickTitle(current)}”？`);
        if (!shouldDelete) return;

        pendingDeletes.add(current.id);

        const nextNotes = notes.filter((note) => note.id !== current.id);
        const nextSelectedId = nextNotes[0]?.id || "";
        saveState({ notes: nextNotes, selectedId: nextSelectedId });
        render();
        setStatus("状态：删除中...");

        try {
            await deleteNoteRemote(current.id);
            setStatus("状态：已删除");
        } catch (error) {
            console.error("Delete note failed:", error);
            setStatus(`状态：删除失败 - ${error.message}`);
        } finally {
            pendingDeletes.delete(current.id);
        }
    });

    saveLocalBtn.addEventListener("click", () => {
        saveState(loadState());
        render();
        setStatus("状态：已保存到本地");
    });

    saveRemoteBtn.addEventListener("click", () => {
        const state = loadState();
        const notes = state.notes.map(ensureNoteShape);
        const current = notes.find((note) => note.id === state.selectedId);
        if (!current) return;

        setStatus("状态：上传并同步中...");
        pushNote(current)
            .then((saved) => {
                const nextNotes = notes.map((note) => note.id === saved.id ? { ...saved, dirty: false } : note);
                saveState({ notes: nextNotes, selectedId: saved.id });
                render();
                setStatus("状态：已上传并同步");
            })
            .catch((error) => {
                setStatus(`状态：同步失败 - ${error.message}`);
            });
    });

    checkLockState();

    setInterval(() => {
        const token = getToken();
        if (token && !document.hidden) {
            syncAll().catch(() => { });
        }
    }, 5000);

    window.addEventListener("blur", () => {
        const token = getToken();
        if (token) {
            syncAll().catch(() => { });
        }
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden && getToken()) {
            syncAll().catch(() => { });
        }
    });

    window.addEventListener("focus", () => {
        const token = getToken();
        if (token) {
            syncAll().catch(() => { });
        }
    });
}
