const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { randomUUID } = require("node:crypto");

require("reflect-metadata");

const { NestFactory } = require("@nestjs/core");
const { AppModule } = require("../dist/app.module");
const { SessionController } = require("../dist/interfaces/http/controllers/session.controller");
const { CollabFeedController } = require("../dist/interfaces/http/controllers/collab-feed.controller");
const { ToolSessionController } = require("../dist/interfaces/http/controllers/tool-session.controller");

test("collab feed and card actions", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "helios-collab-feed-"));
  const dbPath = join(tempDir, `helios-${randomUUID()}.db`);
  const previousDbPath = process.env.HELIOS_DB_PATH;
  process.env.HELIOS_DB_PATH = dbPath;

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const sessionController = app.get(SessionController);
  const feedController = app.get(CollabFeedController);
  const toolSessionController = app.get(ToolSessionController);

  try {
    const created = await sessionController.create({
      name: "Feed Test Session",
      description: "feed and card actions"
    });
    const collabSessionId = created.collabSessionId;

    const firstFeed = await feedController.feed(collabSessionId, undefined, 50);
    assert.equal(Array.isArray(firstFeed.items), true);
    const toolSelectCard = firstFeed.items.find(
      (item) =>
        item.kind === "card" &&
        item.card.card_type === "action_request" &&
        item.card.payload.action_kind === "tool_select"
    );
    assert.ok(toolSelectCard, "tool_select card should exist");

    await toolSessionController.createToolSession({
      collab_session_id: collabSessionId,
      task_id: "task_feed_test",
      provider: "codex",
      source: "COLLAB",
      tool_session_id: "toolsess_feed_test",
      summary_150: "tool session linked by test"
    });

    const feedAfterToolLink = await feedController.feed(collabSessionId, undefined, 100);
    assert.equal(
      feedAfterToolLink.items.some(
        (item) =>
          item.kind === "card" &&
          item.card.card_type === "status_event" &&
          item.card.payload.event_type === "TOOL_SESSION_LINKED"
      ),
      true
    );
    assert.equal(
      feedAfterToolLink.items.some(
        (item) =>
          item.kind === "card" &&
          item.card.card_type === "action_request" &&
          item.card.payload.action_kind === "tool_session"
      ),
      true
    );

    const appended = await feedController.appendText(collabSessionId, {
      role: "user",
      content: "hello feed"
    });
    assert.equal(appended.kind, "text");
    assert.equal(appended.content, "hello feed");

    const secondFeed = await feedController.feed(collabSessionId, undefined, 50);
    assert.equal(
      secondFeed.items.some((item) => item.kind === "text" && item.content === "hello feed"),
      true
    );

    const idem = `idem_${Date.now()}`;
    const actionResult = await feedController.cardAction(`action:tool_select:${collabSessionId}`, {
      action_id: "select_tool",
      params: { provider: "codex" },
      idempotency_key: idem
    });
    assert.equal(actionResult.ok, true);
    assert.equal(actionResult.card_status, "RESOLVED");

    const actionReplay = await feedController.cardAction(`action:tool_select:${collabSessionId}`, {
      action_id: "select_tool",
      params: { provider: "codex" },
      idempotency_key: idem
    });
    assert.equal(actionReplay.ok, true);
    assert.equal(actionReplay.card_status, "RESOLVED");

    const detail = await sessionController.detail(collabSessionId);
    assert.equal(detail.activeTool, "codex");

    const feedAfterToolSelect = await feedController.feed(collabSessionId, undefined, 100);
    assert.equal(
      feedAfterToolSelect.items.some(
        (item) =>
          item.kind === "card" &&
          item.card.card_type === "status_event" &&
          item.card.payload.event_type === "TOOL_SWITCHED"
      ),
      true
    );
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
