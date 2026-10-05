import { createOpenAI } from '@ai-sdk/openai';
import {
  convertToCoreMessages,
  generateId,
  streamText,
  type CoreMessage,
  type Message,
} from 'ai';
import { SYSTEM_PROMPT } from './prompt';
import {
  PORTFOLIO_TOOLS,
  runPortfolioTool,
  tools,
  type PortfolioTool,
} from './tools';

export const maxDuration = 30;

// OPENAI_BASE_URL (optional) points at an OpenAI-compatible API, like the health check does.
const openai = createOpenAI({ baseURL: process.env.OPENAI_BASE_URL });

function errorHandler(error: unknown) {
  if (error == null) {
    return 'Unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return JSON.stringify(error);
}

// A slash command is its tool, run for sure: the tool's result goes into the conversation as
// if the AI had called it, and the AI only writes the reply (the chat shows the card itself).
function withCommandTool(
  messages: CoreMessage[],
  command: PortfolioTool
): CoreMessage[] {
  const toolCallId = `cmd-${generateId()}`;
  return [
    ...messages,
    {
      role: 'assistant',
      content: [{ type: 'tool-call', toolCallId, toolName: command, args: {} }],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId,
          toolName: command,
          result: runPortfolioTool(command),
        },
      ],
    },
  ];
}

export async function POST(req: Request) {
  try {
    const body: { messages: Message[]; command?: string } = await req.json();
    const command = PORTFOLIO_TOOLS.find((name) => name === body.command);
    const history = convertToCoreMessages(body.messages, { tools });

    const result = streamText({
      model: openai('gpt-4o-mini'),
      system: SYSTEM_PROMPT.content,
      messages: command ? withCommandTool(history, command) : history,
      tools,
      toolCallStreaming: true,
      // A command's tool has already run: just the reply. Otherwise the AI may call one tool
      // (shown as its card), then writes the reply.
      toolChoice: command ? 'none' : 'auto',
      maxSteps: command ? 1 : 2,
    });

    return result.toDataStreamResponse({
      getErrorMessage: errorHandler,
    });
  } catch (err) {
    console.error('Global error:', err);
    const errorMessage = errorHandler(err);
    return new Response(errorMessage, { status: 500 });
  }
}
