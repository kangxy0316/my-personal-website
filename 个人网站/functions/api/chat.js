// 替换为你的阿里云 API Key
const ALIYUN_API_KEY = "sk-1f4309e84b9045778449d9349d6e457a"; 

const SYSTEM_PROMPT = `
你是一个专业的AI助手，代表“亢鑫圆”回答访客的问题。
以下是亢鑫圆的简历信息：
- 姓名：亢鑫圆
- 学历：西北工业大学生物材料硕士（保研，成绩1/84），本科内蒙古大学数理基础科学。
- 技能：Python, AI开发, 生物材料表征(AFM/SEM), 高分子水带研发。
- 荣誉：研究生国家奖学金，SCI 1区 Top一作。
- 风格：自信、专业、热情。
如果被问到不知道的信息，请回答“这个您可以直接通过邮件联系我”。
`;

export async function onRequest(context) {
  const { request } = context;

  // 处理 CORS 跨域
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { messages } = await request.json();

    // 构造请求给阿里云
    const response = await fetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ALIYUN_API_KEY}`,
        "Content-Type": "application/json",
        "X-DashScope-SSE": "enable" // 开启流式输出
      },
      body: JSON.stringify({
        model: "qwen-plus", // 使用通用的 qwen-plus 模型别名
        input: {
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages
          ]
        },
        parameters: {
          result_format: "message"
        }
      })
    });

    // 直接转发阿里云的流式响应
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
