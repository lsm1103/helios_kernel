const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { randomUUID } = require("node:crypto");

require("reflect-metadata");

const { NestFactory } = require("@nestjs/core");
const { AppModule } = require("../dist/app.module");
const { OrchestratorLlmController } = require("../dist/interfaces/http/controllers/orchestrator-llm.controller");
const { SessionController } = require("../dist/interfaces/http/controllers/session.controller");
const { CollabFeedController } = require("../dist/interfaces/http/controllers/collab-feed.controller");
const { ToolSessionController } = require("../dist/interfaces/http/controllers/tool-session.controller");
const { OrchestratorLlmService } = require("../dist/application/orchestrator/orchestrator-llm.service");
const { InteractionRequestService } = require("../dist/application/tooling/interaction-request.service");
const { PtyRunManager } = require("../dist/infrastructure/tool-runners/pty-run-manager");
const { CodexAdapter } = require("../dist/infrastructure/tool-runners/codex.adapter");
const { OpenAiProvider } = require("../dist/infrastructure/llm/providers/openai.provider");
const { AnthropicProvider } = require("../dist/infrastructure/llm/providers/anthropic.provider");
const { VolcengineArkProvider } = require("../dist/infrastructure/llm/providers/volcengine-ark.provider");

function mockResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
    async json() {
      return body;
    }
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check, timeoutMs = 5000, intervalMs = 50) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await check();
    if (result) {
      return result;
    }
    await sleep(intervalMs);
  }
  throw new Error("waitFor timeout");
}

test("orchestrator settings should mask api key", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "helios-orchestrator-"));
  const dbPath = join(tempDir, `helios-${randomUUID()}.db`);
  const previousDbPath = process.env.HELIOS_DB_PATH;
  process.env.HELIOS_DB_PATH = dbPath;

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const controller = app.get(OrchestratorLlmController);

  try {
    const updated = await controller.updateSettings({
      primary_provider: "openai",
      fallback_providers: ["anthropic"],
      model: "gpt-4o-mini",
      base_url: "http://localhost/mock",
      api_key: "sk-test-123456789",
      timeout_ms: 15000,
      temperature: 0.3,
      max_tokens: 512,
      actor: "test"
    });

    assert.equal(updated.primary_provider, "openai");
    assert.equal(updated.api_key_masked.includes("***"), true);

    const fetched = await controller.settings();
    assert.equal(fetched.configured, true);
    assert.equal(fetched.api_key_masked.includes("***"), true);
    assert.equal(fetched.api_key_masked.includes("123456789"), false);
  } finally {
    await app.close();
    if (previousDbPath) {
      process.env.HELIOS_DB_PATH = previousDbPath;
    } else {
      delete process.env.HELIOS_DB_PATH;
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("provider contracts should parse response payloads", async () => {
  const previousFetch = global.fetch;
  global.fetch = async (_url, init) => {
    const payload = JSON.parse(String(init?.body ?? "{}"));
    const headers = init?.headers ?? {};

    const hasXApiKey = typeof headers === "object" && headers !== null && "x-api-key" in headers;
    if (hasXApiKey) {
      return mockResponse(200, { content: [{ type: "text", text: `anthropic:${payload.model}` }] });
    }

    return mockResponse(200, {
      choices: [{ message: { content: `openai_like:${payload.model}` } }]
    });
  };

  try {
    const openai = new OpenAiProvider();
    const anthropic = new AnthropicProvider();
    const ark = new VolcengineArkProvider();

    const openaiResult = await openai.generate({
      model: "gpt-4o-mini",
      apiKey: "x",
      baseUrl: "https://mock.local/openai",
      temperature: 0,
      maxTokens: 8,
      timeoutMs: 5000,
      messages: [{ role: "user", content: "ping" }]
    });
    assert.equal(openaiResult.text, "openai_like:gpt-4o-mini");

    const anthropicResult = await anthropic.generate({
      model: "claude-3-5-sonnet",
      apiKey: "x",
      baseUrl: "https://mock.local/anthropic",
      temperature: 0,
      maxTokens: 8,
      timeoutMs: 5000,
      messages: [{ role: "user", content: "ping" }]
    });
    assert.equal(anthropicResult.text, "anthropic:claude-3-5-sonnet");

    const arkResult = await ark.generate({
      model: "doubao-seed",
      apiKey: "x",
      baseUrl: "https://mock.local/ark",
      temperature: 0,
      maxTokens: 8,
      timeoutMs: 5000,
      messages: [{ role: "user", content: "ping" }]
    });
    assert.equal(arkResult.text, "openai_like:doubao-seed");
  } finally {
    global.fetch = previousFetch;
  }
});

test("volcengine ark provider should normalize base url to chat completions path", async () => {
  const previousFetch = global.fetch;
  let capturedUrl = "";
  global.fetch = async (url, _init) => {
    capturedUrl = String(url);
    return mockResponse(200, {
      choices: [{ message: { content: "ark ok" } }]
    });
  };

  try {
    const ark = new VolcengineArkProvider();
    await ark.generate({
      model: "doubao-seed",
      apiKey: "x",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      temperature: 0,
      maxTokens: 8,
      timeoutMs: 5000,
      messages: [{ role: "user", content: "ping" }]
    });

    assert.equal(capturedUrl, "https://ark.cn-beijing.volces.com/api/v3/chat/completions");
  } finally {
    global.fetch = previousFetch;
  }
});

test("orchestrator should fallback to secondary provider", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "helios-orchestrator-fallback-"));
  const dbPath = join(tempDir, `helios-${randomUUID()}.db`);
  const previousDbPath = process.env.HELIOS_DB_PATH;
  process.env.HELIOS_DB_PATH = dbPath;

  const previousFetch = global.fetch;
  global.fetch = async (_url, init) => {
    const headers = init?.headers ?? {};
    const hasAuth = typeof headers === "object" && headers !== null && "authorization" in headers;
    const hasXApiKey = typeof headers === "object" && headers !== null && "x-api-key" in headers;

    if (hasAuth) {
      return mockResponse(500, { error: "primary down" });
    }
    if (hasXApiKey) {
      return mockResponse(200, { content: [{ type: "text", text: "fallback ok" }] });
    }
    return mockResponse(400, { error: "bad headers" });
  };

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const orchestrator = app.get(OrchestratorLlmService);

  try {
    orchestrator.updateSettings({
      primary_provider: "openai",
      fallback_providers: ["anthropic"],
      model: "test-model",
      base_url: "https://mock.local/fallback",
      api_key: "key-any",
      timeout_ms: 5000,
      temperature: 0,
      max_tokens: 32,
      actor: "test"
    });

    const result = await orchestrator.summarizeProgress({
      runId: "run_1",
      chunk: "some output"
    });

    assert.equal(result.text, "fallback ok");
    assert.equal(result.provider, "anthropic");
    assert.equal(result.fallbackUsed, true);
  } finally {
    await app.close();
    global.fetch = previousFetch;
    if (previousDbPath) {
      process.env.HELIOS_DB_PATH = previousDbPath;
    } else {
      delete process.env.HELIOS_DB_PATH;
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("HITL create should persist raw/user prompt and stdin relay still works", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "helios-orchestrator-hitl-"));
  const dbPath = join(tempDir, `helios-${randomUUID()}.db`);
  const previousDbPath = process.env.HELIOS_DB_PATH;
  process.env.HELIOS_DB_PATH = dbPath;

  const previousFetch = global.fetch;
  global.fetch = async (_url, _init) => {
    return mockResponse(200, {
      choices: [{ message: { content: "请确认是否继续执行？" } }]
    });
  };

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const orchestrator = app.get(OrchestratorLlmService);
  const interactionService = app.get(InteractionRequestService);
  const runManager = app.get(PtyRunManager);

  try {
    orchestrator.updateSettings({
      primary_provider: "openai",
      fallback_providers: [],
      model: "gpt-4o-mini",
      base_url: "https://mock.local/openai",
      api_key: "mock-key",
      timeout_ms: 5000,
      temperature: 0,
      max_tokens: 32,
      actor: "test"
    });

    const run = runManager.startRun({
      runId: "run_hitl_test",
      taskId: "task_hitl_test",
      toolSessionId: "toolsess_hitl_test",
      provider: "codex",
      command: "cat",
      args: []
    });

    const created = await interactionService.create({
      collabSessionId: "collab_hitl_test",
      toolSessionId: "toolsess_hitl_test",
      runId: run.runId,
      prompt: "raw technical prompt",
      options: ["继续", "暂停"],
      timeoutMinutes: 5
    });

    assert.equal(created.rawPrompt, "raw technical prompt");
    assert.equal(created.userPrompt, "请确认是否继续执行？");
    assert.equal(created.orchestratorDegraded, false);

    const relay = interactionService.writeToRunStdin({
      runId: run.runId,
      interactionRequestId: created.interactionRequestId,
      stdinText: "继续\n",
      idempotencyKey: `idem_${Date.now()}`
    });
    assert.equal(relay.status, "ACCEPTED");

    runManager.endRun(run.runId);
  } finally {
    await app.close();
    global.fetch = previousFetch;
    if (previousDbPath) {
      process.env.HELIOS_DB_PATH = previousDbPath;
    } else {
      delete process.env.HELIOS_DB_PATH;
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("orchestrator e2e flow should cover analyze -> run -> hitl -> completion -> archive", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "helios-orchestrator-e2e-"));
  const dbPath = join(tempDir, `helios-${randomUUID()}.db`);
  const previousDbPath = process.env.HELIOS_DB_PATH;
  process.env.HELIOS_DB_PATH = dbPath;

  const previousFetch = global.fetch;
  global.fetch = async (_url, init) => {
    const payload = JSON.parse(String(init?.body ?? "{}"));
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const systemPrompt = String(messages.find((msg) => msg.role === "system")?.content ?? "");

    if (systemPrompt.includes("需求分析助手")) {
      return mockResponse(200, { choices: [{ message: { content: "需求摘要：实现自动化开发协作流程" } }] });
    }
    if (systemPrompt.includes("工具选择助手")) {
      return mockResponse(200, { choices: [{ message: { content: "建议工具：codex；需确认是否允许修改生产配置" } }] });
    }
    if (systemPrompt.includes("用户沟通助手")) {
      return mockResponse(200, { choices: [{ message: { content: "请确认是否继续执行当前步骤？" } }] });
    }
    if (systemPrompt.includes("执行进度摘要助手")) {
      return mockResponse(200, { choices: [{ message: { content: "进度摘要：工具正在处理并等待用户确认。" } }] });
    }
    if (systemPrompt.includes("任务完成汇报助手")) {
      return mockResponse(200, { choices: [{ message: { content: "完成汇报：本轮执行已结束，可继续下一步。" } }] });
    }
    if (systemPrompt.includes("会话归档助手")) {
      return mockResponse(200, { choices: [{ message: { content: "归档摘要：需求分析、执行与交互已完成。" } }] });
    }

    return mockResponse(200, { choices: [{ message: { content: "ok" } }] });
  };

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const orchestrator = app.get(OrchestratorLlmService);
  const sessionController = app.get(SessionController);
  const feedController = app.get(CollabFeedController);
  const toolSessionController = app.get(ToolSessionController);
  const codexAdapter = app.get(CodexAdapter);

  const originalBuildCommand = codexAdapter.buildCommand.bind(codexAdapter);
  codexAdapter.buildCommand = () => ({ cmd: "cat", args: [] });

  try {
    orchestrator.updateSettings({
      primary_provider: "openai",
      fallback_providers: ["anthropic"],
      model: "gpt-4o-mini",
      base_url: "https://mock.local/openai",
      api_key: "mock-key",
      timeout_ms: 5000,
      temperature: 0,
      max_tokens: 128,
      actor: "test"
    });

    const created = await sessionController.create({
      name: "E2E Flow Session",
      description: "validate orchestrator full workflow"
    });
    const collabSessionId = created.collabSessionId;

    await toolSessionController.createToolSession({
      collab_session_id: collabSessionId,
      task_id: "task_e2e_flow",
      provider: "codex",
      source: "COLLAB",
      tool_session_id: "toolsess_e2e_flow",
      summary_150: "e2e linked"
    });

    const run = await toolSessionController.startRun({
      collab_session_id: collabSessionId,
      task_id: "task_e2e_flow",
      tool_session_id: "toolsess_e2e_flow",
      provider: "codex",
      prompt: "run e2e",
      run_id: "run_e2e_flow"
    });

    await toolSessionController.writeRawStdin(run.runId, {
      stdin_text: "build step output\n"
    });
    await toolSessionController.writeRawStdin(run.runId, {
      stdin_text:
        'NEED_USER_INPUT {"prompt":"raw ask","options":["继续","暂停"],"timeout_minutes":5}\n'
    });

    const pending = await waitFor(async () => {
      const rows = toolSessionController.listPendingInteractions(undefined, undefined, run.runId);
      return rows.length > 0 ? rows : undefined;
    });
    assert.equal(pending.length > 0, true);
    assert.equal(pending[0].rawPrompt, "raw ask");
    assert.equal(pending[0].userPrompt, "请确认是否继续执行当前步骤？");

    const relay = await toolSessionController.writeStdin(run.runId, {
      interaction_request_id: pending[0].interactionRequestId,
      stdin_text: "继续",
      idempotency_key: `idem_e2e_${Date.now()}`
    });
    assert.equal(relay.status, "ACCEPTED");

    await toolSessionController.stopRun(run.runId);

    await waitFor(async () => {
      const feed = await feedController.feed(collabSessionId, undefined, 200);
      const hasCompletion = feed.items.some(
        (item) =>
          item.kind === "text" &&
          item.content.includes("完成汇报：本轮执行已结束，可继续下一步。")
      );
      const hasRunStatus = feed.items.some(
        (item) =>
          item.kind === "card" &&
          item.card.card_type === "status_event" &&
          item.card.payload.event_type === "RUN_PAUSED"
      );
      return hasCompletion && hasRunStatus;
    });

    await sessionController.archive(collabSessionId, { actor: "test", reason: "done" });

    const finalFeed = await waitFor(async () => {
      const feed = await feedController.feed(collabSessionId, undefined, 300);
      const textItems = feed.items.filter((item) => item.kind === "text").map((item) => item.content);
      const hasArchiveSummary = textItems.some((content) =>
        content.includes("归档摘要：需求分析、执行与交互已完成。")
      );
      return hasArchiveSummary ? feed : undefined;
    });

    const textItems = finalFeed.items.filter((item) => item.kind === "text").map((item) => item.content);
    assert.equal(
      textItems.some((content) => content.includes("需求摘要：实现自动化开发协作流程")),
      true
    );
    assert.equal(
      textItems.some((content) => content.includes("建议工具：codex；需确认是否允许修改生产配置")),
      true
    );
    assert.equal(
      textItems.some((content) => content.includes("进度摘要：工具正在处理并等待用户确认。")),
      true
    );
    assert.equal(
      textItems.some((content) => content.includes("完成汇报：本轮执行已结束，可继续下一步。")),
      true
    );
    assert.equal(
      textItems.some((content) => content.includes("归档摘要：需求分析、执行与交互已完成。")),
      true
    );
  } finally {
    codexAdapter.buildCommand = originalBuildCommand;
    await app.close();
    global.fetch = previousFetch;
    if (previousDbPath) {
      process.env.HELIOS_DB_PATH = previousDbPath;
    } else {
      delete process.env.HELIOS_DB_PATH;
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
});
