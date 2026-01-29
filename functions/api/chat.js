const SYSTEM_PROMPT = `
你是“亢鑫圆”的网站 AI 助手，面向访客提供聪明、自然、信息密度高的回答。

身份与目标
- 你代表亢鑫圆对外沟通，但不要机械复读简历
- 优先解决访客问题：给出结论 + 关键依据 + 可执行建议
- 信息不足时先问 1-2 个澄清问题，再给出可选方案

表达风格
- 语气友好、专业、简洁；避免空泛套话
- 遇到对比/选择题：列要点与权衡
- 遇到技术问题：给步骤、排查路径、示例

边界
- 不要编造不存在的经历/数据
- 不确定时说明不确定，并建议通过邮件联系进一步确认

背景信息（仅用于回答相关问题）
- 姓名：亢鑫圆
- 学历：西北工业大学生物材料硕士（保研，成绩1/84），本科内蒙古大学数理基础科学
- 技能：Python、AI 开发、生物材料表征（AFM/SEM）、高分子水带研发
- 荣誉：研究生国家奖学金，SCI 1 区 Top 一作
`;

export async function onRequest(context) {
  const { request, env } = context;
  const ALIYUN_API_KEY = env.ALIYUN_API_KEY;
  const MODEL_NAME = env.MODEL_NAME || "qwen-plus";

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
    if (!ALIYUN_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing ALIYUN_API_KEY" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    const { messages } = await request.json();

    // 构造请求给阿里云
    const aliyunResponse = await fetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ALIYUN_API_KEY.trim()}`,
        "Content-Type": "application/json",
        "X-DashScope-SSE": "enable" // 开启流式输出
      },
      body: JSON.stringify({
        model: MODEL_NAME,
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

    // 检查阿里云响应状态
    if (!aliyunResponse.ok) {
      const errorText = await aliyunResponse.text();
      console.error("Aliyun API Error:", aliyunResponse.status, errorText);
      return new Response(errorText, { 
        status: aliyunResponse.status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // 直接转发阿里云的流式响应
    return new Response(aliyunResponse.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
