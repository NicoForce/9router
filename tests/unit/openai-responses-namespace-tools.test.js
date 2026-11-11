import { describe, expect, it } from "vitest";
import { openaiResponsesToOpenAIRequest } from "../../open-sse/translator/request/openai-responses.js";
import { openaiToOpenAIResponsesResponse } from "../../open-sse/translator/response/openai-responses.js";
import { initState } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const NS_TOOL = {
  type: "namespace",
  name: "mcp__fx",
  description: "fx server",
  tools: [
    { type: "function", name: "echo", description: "Echo", parameters: { type: "object", properties: { m: { type: "string" } } } },
    { type: "function", name: "add", description: "Add", parameters: { type: "object", properties: { a: { type: "number" } } } },
  ],
};

describe("Responses namespace tools → OpenAI Chat", () => {
  it("flattens nested namespace tools into named functions and records the map", () => {
    const out = openaiResponsesToOpenAIRequest("m", {
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }],
      tools: [NS_TOOL],
    }, true, null);

    expect(out.tools.map((t) => t.function.name)).toEqual(["mcp__fx__echo", "mcp__fx__add"]);
    expect(out._namespaceToolMap).toEqual({
      mcp__fx__echo: { namespace: "mcp__fx", name: "echo" },
      mcp__fx__add: { namespace: "mcp__fx", name: "add" },
    });
  });

  it("re-flattens namespaced function_call history", () => {
    const out = openaiResponsesToOpenAIRequest("m", {
      input: [
        { type: "function_call", call_id: "c1", namespace: "mcp__fx", name: "echo", arguments: "{}" },
        { type: "function_call_output", call_id: "c1", output: "ok" },
      ],
      tools: [NS_TOOL],
    }, true, null);
    const assistant = out.messages.find((m) => m.role === "assistant");
    expect(assistant.tool_calls[0].function.name).toBe("mcp__fx__echo");
  });

  it("restores namespace + name on streamed function_call items", () => {
    const state = { ...initState(FORMATS.OPENAI_RESPONSES), namespaceToolMap: { mcp__fx__echo: { namespace: "mcp__fx", name: "echo" } } };
    const events = [
      ...(openaiToOpenAIResponsesResponse({ id: "x", model: "m", choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "mcp__fx__echo", arguments: "{}" } }] } }] }, state) || []),
      ...(openaiToOpenAIResponsesResponse({ id: "x", model: "m", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] }, state) || []),
    ];
    const done = events.find((e) => e.event === "response.output_item.done" && e.data.item.type === "function_call");
    expect(done.data.item).toMatchObject({ name: "echo", namespace: "mcp__fx" });
  });
});
