const FALLBACK_ALIYUN_API_KEY = "sk-1f4309e84b9045778449d9349d6e457a";
const SYSTEM_PROMPT = `
你是“亢鑫圆”个人网站上的 AI 助手，也是他的数字分身说明员。你的任务是帮助访客快速理解他的背景、项目、研究方向、技能结构和合作价值。

回答原则
- 默认直接回答，不要把常见泛问题反问回去。
- 对“你是谁”“你能做什么”“介绍一下你自己”这类问题，必须直接用清晰的一段话或一个简短结构回答。
- 优先给结论，再补 2 到 4 条关键信息，必要时再给建议下一步。
- 语气友好、专业、简洁，不要空泛，不要营销腔。
- 如果问题确实模糊且会影响回答，可以只追问 1 个必要澄清问题；但常见介绍类问题不要追问。

边界
- 只能基于已知网站信息作答，不要编造论文题目、公司经历、获奖细节或不存在的联系方式。
- 如果某个细节网站资料里没有明确写出，请直接说明“网站资料里没有更具体的信息”。
- 不要伪装成真人在线聊天，不要说自己刚刚做了某件线下真实行为。

已知背景
- 姓名：亢鑫圆
- 当前定位：科研与 AI 交叉型开发者，擅长把科研逻辑转成可落地工具
- 教育背景：西北工业大学生物材料硕士（保研，成绩 1/84）；本科为内蒙古大学数理基础科学
- 核心能力：Python、AI 开发、实验装置设计、图像与数据分析、生物材料相关研究
- 科研与项目关键词：无人机灭火高分子水带、冷冻测试加压装置、专业色彩量化分析平台、超冷相变抑制材料
- 成果与标签：研究生国家奖学金、SCI 1 区 Top 一作、4+ 科研项目
- 联系方式：GitHub 为 kangxy0316，邮箱为 Kangx0316@gmail.com

输出风格建议
- 如果访客问合作、岗位或方向匹配：明确说他更适合解决哪些问题、承担什么角色。
- 如果访客问项目：强调问题场景、做了什么、体现了什么能力。
- 如果访客问“你能做什么”：可以概括为“介绍亢鑫圆”“解释项目和研究方向”“帮助判断合作切入点”。
`;

function withCors(headers = {}) {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        ...headers
    };
}

function jsonResponse(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: withCors({
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
        })
    });
}

function normalizeMessages(messages) {
    if (!Array.isArray(messages)) return [];
    return messages
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
            role: typeof item.role === "string" ? item.role : "user",
            content: typeof item.content === "string" ? item.content.trim() : ""
        }))
        .filter((item) => item.content)
        .slice(-12);
}

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === "OPTIONS") {
        return new Response(null, { headers: withCors() });
    }

    if (request.method !== "POST") {
        return jsonResponse({ error: "Method Not Allowed" }, 405);
    }

    const apiKey = String(env.ALIYUN_API_KEY || FALLBACK_ALIYUN_API_KEY || "").trim();
    const modelName = String(env.MODEL_NAME || "qwen-plus").trim();

    if (!apiKey) {
        return jsonResponse({ error: "Missing ALIYUN_API_KEY" }, 500);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const messages = normalizeMessages(body?.messages);
    if (!messages.length) {
        return jsonResponse({ error: "messages is required" }, 400);
    }

    try {
        const aliyunResponse = await fetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "X-DashScope-SSE": "enable"
            },
            body: JSON.stringify({
                model: modelName,
                input: {
                    messages: [
                        { role: "system", content: SYSTEM_PROMPT },
                        ...messages
                    ]
                },
                parameters: {
                    result_format: "message",
                    temperature: 0.7,
                    top_p: 0.9,
                    max_tokens: 800
                }
            })
        });

        if (!aliyunResponse.ok) {
            const errorText = await aliyunResponse.text();
            console.error("Aliyun API Error:", aliyunResponse.status, errorText);
            return new Response(errorText, {
                status: aliyunResponse.status,
                headers: withCors({
                    "Content-Type": "application/json; charset=utf-8",
                    "Cache-Control": "no-store"
                })
            });
        }

        return new Response(aliyunResponse.body, {
            headers: withCors({
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-store",
                Connection: "keep-alive"
            })
        });
    } catch (error) {
        console.error("Chat endpoint error:", error);
        return jsonResponse({ error: error.message || "Internal Server Error" }, 500);
    }
}
