import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  baseURL: process.env.ANTHROPIC_BASE_URL || "https://api.lingyaai.cn",
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN || "",
});

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const SYSTEM_PROMPT =
  process.env.ANTHROPIC_SYSTEM_PROMPT ||
  "你是一个可靠的通用中文AI助手。请基于用户目标给出清晰、可执行、结构化的输出。";

// 统计中文字数（用于可选的最小字数控制）
function countChineseChars(text: string): number {
  return (text.match(/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g) || []).length;
}

// 流式生成一段内容
async function generateChunk(
  messages: Anthropic.MessageParam[],
  systemPrompt: string,
): Promise<string> {
  let result = "";

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      process.stdout.write(event.delta.text);
      result += event.delta.text;
    }
  }

  return result;
}

// 主流程：通用 agent 任务执行
async function runAgentTask(
  task: string,
  minWordCount?: number,
  systemPrompt: string = SYSTEM_PROMPT,
): Promise<string> {
  console.log(`\n🎯 任务：${task}`);
  if (typeof minWordCount === "number") {
    console.log(`📏 最低字数：${minWordCount} 字`);
  }
  console.log(`🤖 模型：${MODEL}\n`);
  console.log("─".repeat(60));

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: task,
    },
  ];

  let fullContent = await generateChunk(messages, systemPrompt);

  if (typeof minWordCount !== "number") {
    console.log(`\n\n${"─".repeat(60)}`);
    console.log("✅ 任务完成\n");
    return fullContent;
  }

  let currentCount = countChineseChars(fullContent);
  console.log(`\n\n${"─".repeat(60)}`);
  console.log(`✅ 当前字数：${currentCount} / ${minWordCount}`);
  let round = 1;
  while (currentCount < minWordCount) {
    const remaining = minWordCount - currentCount;
    console.log(`\n⚡ 字数不足，继续补写（还需约 ${remaining} 字）...\n`);
    console.log("─".repeat(60));

    messages.push({ role: "assistant", content: fullContent });
    messages.push({
      role: "user",
      content:
        `请基于上文继续补充输出，保持语义与风格一致，再补充约 ${remaining} 个汉字。` +
        "不要重复已经输出过的内容。",
    });

    const chunk = await generateChunk(messages, systemPrompt);
    fullContent += chunk;
    currentCount = countChineseChars(fullContent);

    console.log(`\n\n${"─".repeat(60)}`);
    console.log(`✅ 当前字数：${currentCount} / ${minWordCount}（第 ${++round} 轮）`);
  }

  console.log(`\n🎉 生成完成！最终字数：${currentCount} 字\n`);
  return fullContent;
}

function parseOptionalMinWordCount(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value <= 0) return undefined;
  return value;
}

// 入口：
// npm start -- "你的任务描述"
// npm start -- "你的任务描述" 1200
const task =
  process.argv[2] ||
  "请用简洁的结构说明如何从0到1搭建一个可复用的Node.js命令行AI Agent，并给出目录建议。";
const minWordCount = parseOptionalMinWordCount(process.argv[3]);

await runAgentTask(task, minWordCount);
