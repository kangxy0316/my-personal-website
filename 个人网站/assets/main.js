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
        chatInput.value = '';
        chatInput.disabled = true;
        sendBtn.disabled = true;

        // Add Loading Indicator
        const loadingId = addLoadingIndicator();

        try {
            // In a real deployment, this URL should be your Vercel/Cloudflare endpoint
            // For local development, we'll try to hit the local server or show a mock response
            // if the backend isn't running.
            
            const messages = [
                { role: "user", content: text }
            ];

            // Use relative path assuming the API is served from the same domain
            // Note: For Cloudflare Pages Functions, the path is /api/chat
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages })
            });

            removeMessage(loadingId);

            if (!response.ok) {
                throw new Error('API request failed');
            }

            // Create AI Message Bubble
            const aiMessageDiv = document.createElement('div');
            aiMessageDiv.className = 'message ai';
            chatMessages.appendChild(aiMessageDiv);
            
            // Handle Stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let aiText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                // Parse SSE format (data: ...) from DashScope
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        try {
                            const data = JSON.parse(line.slice(5));
                            if (data.output && data.output.text) {
                                // For qwen-plus, the text is accumulated, so we just replace
                                // Or if it's delta, we append. DashScope usually returns full text or delta depending on params.
                                // With 'generation' API and default settings, it might return incremental updates.
                                // Let's assume it returns full text for simplicity or check documentation.
                                // Actually, standard SSE from DashScope 'text-generation' usually sends full text so far.
                                aiText = data.output.text; 
                                aiMessageDiv.textContent = aiText;
                                scrollToBottom();
                            }
                        } catch (e) {
                            console.error('Error parsing SSE:', e);
                        }
                    }
                }
            }

        } catch (error) {
            console.error('Chat Error:', error);
            removeMessage(loadingId);
            addMessage('抱歉，我现在无法连接到大脑。请稍后再试。', 'ai');
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
