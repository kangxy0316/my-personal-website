document.addEventListener('DOMContentLoaded', () => {
    // 导航栏滚动效果
    const header = document.querySelector('.site-header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.style.background = 'rgba(15, 23, 42, 0.9)';
            header.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)';
        } else {
            header.style.background = 'rgba(15, 23, 42, 0.7)';
            header.style.boxShadow = 'none';
        }
    });

    // 滚动显现动画 (Scroll Reveal)
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in-up');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // 为主要部分添加动画类
    const animatedElements = document.querySelectorAll('.project-card, .timeline-item, .skill-card, .curry-item');
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });

    // 注入动画CSS类
    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
        .fade-in-up {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    `;
    document.head.appendChild(styleSheet);

    // 移动端导航栏切换
    const navToggle = document.querySelector('.nav-toggle');
    const nav = document.querySelector('.nav');
    
    if (navToggle) {
        navToggle.addEventListener('click', () => {
            nav.classList.toggle('active');
            // 切换汉堡菜单图标动画状态（可选）
            navToggle.classList.toggle('is-active');
        });

        // 点击链接自动关闭菜单
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('active');
                navToggle.classList.remove('is-active');
            });
        });
    }
});

// Chat Widget Logic
document.addEventListener('DOMContentLoaded', () => {
    const chatToggle = document.querySelector('.chat-toggle');
    const chatContainer = document.querySelector('.chat-container');
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');

    let isChatOpen = false;
    const conversation = [];

    // Toggle Chat
    chatToggle.addEventListener('click', () => {
        isChatOpen = !isChatOpen;
        chatContainer.classList.toggle('active');
        const icon = chatToggle.querySelector('i');
        icon.className = isChatOpen ? 'fa-solid fa-xmark' : 'fa-solid fa-robot';
        if (isChatOpen) {
            setTimeout(() => chatInput.focus(), 300);
        }
    });

    // Send Message
    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        // Add User Message
        addMessage(text, 'user');
        conversation.push({ role: "user", content: text });
        chatInput.value = '';
        chatInput.disabled = true;
        sendBtn.disabled = true;

        // Add Loading Indicator
        const loadingId = addLoadingIndicator();

        try {
            // In a real deployment, this URL should be your Vercel/Cloudflare endpoint
            // For local development, we'll try to hit the local server or show a mock response
            // if the backend isn't running.
            
            const messages = conversation.slice(-16);

            // Use relative path assuming the API is served from the same domain
            // Note: For Cloudflare Pages Functions, the path is /api/chat
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages })
            });

            removeMessage(loadingId);

            if (!response.ok) {
                // 尝试读取后端返回的具体错误信息
                const errorDetails = await response.text();
                try {
                    const parsed = JSON.parse(errorDetails);
                    const code = parsed?.code ?? parsed?.error;
                    const message = parsed?.message ?? parsed?.error_description ?? parsed?.error;
                    if (code && message) {
                        throw new Error(`${code}: ${message}`);
                    }
                    if (message) {
                        throw new Error(String(message));
                    }
                } catch (_) {
                }
                throw new Error(errorDetails || `API request failed with status ${response.status}`);
            }

            // Create AI Message Bubble
            const aiMessageDiv = document.createElement('div');
            aiMessageDiv.className = 'message ai';
            chatMessages.appendChild(aiMessageDiv);
            
            // Handle Stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let aiText = '';
            let sseBuffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                sseBuffer += chunk;
                const lines = sseBuffer.split(/\r?\n/);
                sseBuffer = lines.pop() ?? '';

                for (const line of lines) {
                    if (!line.startsWith('data:')) continue;

                    const payload = line.slice(5).trim();
                    if (!payload || payload === '[DONE]') continue;

                    try {
                        const data = JSON.parse(payload);
                        const nextText =
                            data?.output?.choices?.[0]?.message?.content ??
                            data?.output?.text;

                        if (typeof nextText === 'string') {
                            if (nextText.startsWith(aiText)) {
                                aiText = nextText;
                            } else {
                                aiText += nextText;
                            }
                            aiMessageDiv.textContent = aiText;
                            scrollToBottom();
                        }
                    } catch (e) {
                        console.error('Error parsing SSE:', e);
                    }
                } 
            }

            if (!aiText) {
                aiMessageDiv.textContent = '抱歉，我刚才没有收到有效回复，请再试一次。';
            }
            conversation.push({ role: "assistant", content: aiText || aiMessageDiv.textContent || "" });

        } catch (error) {
            console.error('Chat Error:', error);
            removeMessage(loadingId);
            // 显示具体的错误信息给用户，方便调试
            const errorMessage = error.message.length < 100 ? error.message : '抱歉，系统暂时繁忙，请稍后再试。';
            addMessage(`出错了：${errorMessage}`, 'ai');
        } finally {
            chatInput.disabled = false;
            sendBtn.disabled = false;
            chatInput.focus();
            scrollToBottom();
        }
    }

    // Helper: Add Message
    function addMessage(text, sender) {
        const div = document.createElement('div');
        div.className = `message ${sender}`;
        div.textContent = text;
        chatMessages.appendChild(div);
        scrollToBottom();
    }

    // Helper: Add Loading
    function addLoadingIndicator() {
        const id = 'loading-' + Date.now();
        const div = document.createElement('div');
        div.className = 'typing-indicator';
        div.id = id;
        div.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        `;
        chatMessages.appendChild(div);
        scrollToBottom();
        return id;
    }

    // Helper: Remove Message
    function removeMessage(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    // Helper: Scroll to Bottom
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Event Listeners
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
});

document.addEventListener('DOMContentLoaded', () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    const notesApp = document.getElementById('notesApp');
    if (!notesApp) return;

    const tokenInput = document.getElementById('notesTokenInput');
    const saveTokenBtn = document.getElementById('notesSaveTokenBtn');
    const syncBtn = document.getElementById('notesSyncBtn');
    const statusEl = document.getElementById('notesStatus');
    const itemsEl = document.getElementById('notesItems');
    const newBtn = document.getElementById('notesNewBtn');
    const deleteBtn = document.getElementById('notesDeleteBtn');
    const saveLocalBtn = document.getElementById('notesSaveLocalBtn');
    const saveRemoteBtn = document.getElementById('notesSaveRemoteBtn');
    const titleEl = document.getElementById('notesTitle');
    const contentEl = document.getElementById('notesContent');

    const lockScreen = document.getElementById('notesLockScreen');
    const mainContent = document.getElementById('notesMainContent');
    const lockBtn = document.getElementById('notesLockBtn');

    const STORAGE_KEY = 'kxy-notes-v1';
    const TOKEN_KEY = 'kxy-notes-passphrase-v1';

    function nowIso() {
        return new Date().toISOString();
    }

    function safeParseJson(text, fallback) {
        try {
            return JSON.parse(text);
        } catch {
            return fallback;
        }
    }

    function getToken() {
        return (localStorage.getItem(TOKEN_KEY) || '').trim();
    }

    function setToken(value) {
        if (!value) {
            localStorage.removeItem(TOKEN_KEY);
        } else {
            localStorage.setItem(TOKEN_KEY, String(value || '').trim());
        }
    }

    function checkLockState() {
        const token = getToken();
        if (token) {
            lockScreen.classList.add('hidden');
            mainContent.classList.remove('hidden');
            render();
            syncAll().catch(() => {}); // Auto sync on unlock
        } else {
            lockScreen.classList.remove('hidden');
            mainContent.classList.add('hidden');
            tokenInput.value = '';
        }
    }

    function loadState() {
        const raw = localStorage.getItem(STORAGE_KEY);
        const state = raw ? safeParseJson(raw, null) : null;
        const notes = Array.isArray(state?.notes) ? state.notes : [];
        const selectedId = typeof state?.selectedId === 'string' ? state.selectedId : '';
        return { notes, selectedId };
    }

    function saveState(state) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function formatTime(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleString();
    }

    function setStatus(text) {
        if (statusEl) statusEl.textContent = text;
    }

    function sortNotes(notes) {
        return [...notes].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    }

    function ensureNoteShape(note) {
        const id = typeof note?.id === 'string' ? note.id : '';
        const title = typeof note?.title === 'string' ? note.title : '';
        const content = typeof note?.content === 'string' ? note.content : '';
        const createdAt = typeof note?.createdAt === 'string' ? note.createdAt : nowIso();
        const updatedAt = typeof note?.updatedAt === 'string' ? note.updatedAt : createdAt;
        const dirty = Boolean(note?.dirty);
        return { id, title, content, createdAt, updatedAt, dirty };
    }

    function makeId() {
        return (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`).toString();
    }

    function pickTitle(note) {
        const title = (note.title || '').trim();
        if (title) return title;
        const firstLine = (note.content || '').split('\n')[0].trim();
        return firstLine ? firstLine.slice(0, 20) : '未命名';
    }

    function render() {
        const state = loadState();
        const notes = sortNotes(state.notes.map(ensureNoteShape));
        const selectedId = state.selectedId && notes.some(n => n.id === state.selectedId) ? state.selectedId : (notes[0]?.id || '');

        if (selectedId !== state.selectedId) {
            saveState({ notes, selectedId });
        }

        itemsEl.innerHTML = '';
        for (const note of notes) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `notes-item${note.id === selectedId ? ' active' : ''}`;
            const title = document.createElement('div');
            title.className = 'notes-item-title';
            title.textContent = pickTitle(note);
            const meta = document.createElement('div');
            meta.className = 'notes-item-meta';
            meta.textContent = `${formatTime(note.updatedAt)}${note.dirty ? ' · 未同步' : ''}`;
            btn.appendChild(title);
            btn.appendChild(meta);
            btn.addEventListener('click', () => {
                const next = loadState();
                saveState({ notes: next.notes, selectedId: note.id });
                render();
            });
            itemsEl.appendChild(btn);
        }

        const current = notes.find(n => n.id === selectedId) || null;
        titleEl.value = current?.title || '';
        contentEl.value = current?.content || '';
    }

    function updateCurrent(mutator) {
        const state = loadState();
        const notes = state.notes.map(ensureNoteShape);
        const idx = notes.findIndex(n => n.id === state.selectedId);
        if (idx < 0) return;
        const next = mutator({ ...notes[idx] });
        notes[idx] = ensureNoteShape(next);
        saveState({ notes, selectedId: state.selectedId });
    }

    function debounce(fn, waitMs) {
        let t = null;
        return (...args) => {
            if (t) clearTimeout(t);
            t = setTimeout(() => fn(...args), waitMs);
        };
    }

    async function apiJson(path, init = {}) {
        const token = getToken();
        const headers = new Headers(init.headers || {});
        headers.set('Content-Type', 'application/json');
        if (token) headers.set('Authorization', `Bearer ${token}`);

        const res = await fetch(path, { ...init, headers });
        if (res.status === 204) return null;
        const text = await res.text();
        const data = text ? safeParseJson(text, { error: text }) : null;
        if (!res.ok) {
            const msg = typeof data?.error === 'string' ? data.error : `请求失败（${res.status}）`;
            throw new Error(msg);
        }
        return data;
    }

    async function pushNote(note) {
        const payload = {
            title: note.title || '',
            content: note.content || '',
            createdAt: note.createdAt || nowIso()
        };
        const data = await apiJson(`/api/notes/${encodeURIComponent(note.id)}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        return ensureNoteShape(data?.note);
    }

    async function deleteNoteRemote(noteId) {
        await apiJson(`/api/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' });
    }

    async function syncAll() {
        const token = getToken();
        if (!token) return;

        setStatus('同步中...');
        const state = loadState();
        const localNotes = state.notes.map(ensureNoteShape);
        const localById = new Map(localNotes.map(n => [n.id, n]));

        try {
            const remote = await apiJson('/api/notes', { method: 'GET' });
            const remoteNotes = Array.isArray(remote?.notes) ? remote.notes.map(ensureNoteShape) : [];
            const remoteById = new Map(remoteNotes.map(n => [n.id, n]));

            const merged = new Map();

            for (const remoteNote of remoteNotes) {
                const localNote = localById.get(remoteNote.id);
                if (!localNote) {
                    merged.set(remoteNote.id, { ...remoteNote, dirty: false });
                    continue;
                }

                const localTime = Date.parse(localNote.updatedAt || '');
                const remoteTime = Date.parse(remoteNote.updatedAt || '');

                if (Number.isFinite(localTime) && Number.isFinite(remoteTime) && localTime > remoteTime) {
                    const pushed = await pushNote(localNote);
                    merged.set(pushed.id, { ...pushed, dirty: false });
                } else {
                    merged.set(remoteNote.id, { ...remoteNote, dirty: false });
                }
            }

            for (const localNote of localNotes) {
                if (!localNote.id) continue;
                if (remoteById.has(localNote.id)) continue;
                const pushed = await pushNote(localNote);
                merged.set(pushed.id, { ...pushed, dirty: false });
            }

            const nextNotes = sortNotes(Array.from(merged.values()));
            const selectedId = state.selectedId && merged.has(state.selectedId) ? state.selectedId : (nextNotes[0]?.id || '');
            saveState({ notes: nextNotes, selectedId });
            render();
            setStatus(`已同步：${nextNotes.length} 条`);
        } catch (e) {
            if (e.message.includes('Unauthorized')) {
                setToken(null);
                checkLockState();
                alert('口令无效或已过期，请重新登录');
            } else {
                setStatus(`同步失败：${e.message}`);
                throw e;
            }
        }
    }

    const persistDraft = debounce(() => {
        saveState(loadState());
        render();
    }, 300);

    titleEl.addEventListener('input', () => {
        updateCurrent((note) => {
            note.title = titleEl.value;
            note.updatedAt = nowIso();
            note.dirty = true;
            return note;
        });
        persistDraft();
    });

    contentEl.addEventListener('input', () => {
        updateCurrent((note) => {
            note.content = contentEl.value;
            note.updatedAt = nowIso();
            note.dirty = true;
            return note;
        });
        persistDraft();
    });

    saveTokenBtn.addEventListener('click', () => {
        const value = (tokenInput.value || '').trim();
        if (!value) {
            alert('请输入同步口令');
            return;
        }
        setToken(value);
        checkLockState();
    });

    tokenInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveTokenBtn.click();
        }
    });

    if (lockBtn) {
        lockBtn.addEventListener('click', () => {
            setToken(null);
            checkLockState();
        });
    }

    syncBtn.addEventListener('click', () => {
        syncAll().catch((e) => {});
    });

    newBtn.addEventListener('click', () => {
        const state = loadState();
        const note = {
            id: makeId(),
            title: '',
            content: '',
            createdAt: nowIso(),
            updatedAt: nowIso(),
            dirty: true
        };
        const notes = [note, ...state.notes.map(ensureNoteShape)];
        saveState({ notes, selectedId: note.id });
        render();
        setStatus('已新建（未同步）');
    });

    deleteBtn.addEventListener('click', () => {
        const state = loadState();
        const notes = state.notes.map(ensureNoteShape);
        const current = notes.find(n => n.id === state.selectedId);
        if (!current) return;
        const ok = window.confirm(`确定删除「${pickTitle(current)}」？`);
        if (!ok) return;

        const nextNotes = notes.filter(n => n.id !== current.id);
        const nextSelectedId = nextNotes[0]?.id || '';
        saveState({ notes: nextNotes, selectedId: nextSelectedId });
        render();
        setStatus('已删除（本地）');

        deleteNoteRemote(current.id).catch(() => {});
    });

    saveLocalBtn.addEventListener('click', () => {
        saveState(loadState());
        render();
        setStatus('已本地保存');
    });

    saveRemoteBtn.addEventListener('click', () => {
        const state = loadState();
        const notes = state.notes.map(ensureNoteShape);
        const current = notes.find(n => n.id === state.selectedId);
        if (!current) return;

        setStatus('保存并同步中...');
        pushNote(current).then((saved) => {
            const nextNotes = notes.map(n => n.id === saved.id ? { ...saved, dirty: false } : n);
            saveState({ notes: nextNotes, selectedId: saved.id });
            render();
            setStatus('已保存并同步');
        }).catch((e) => {
            setStatus(`同步失败：${e.message}`);
        });
    });

    checkLockState();
});
