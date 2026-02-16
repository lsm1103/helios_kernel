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

test("collab session lifecycle api", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "helios-collab-api-"));
  const dbPath = join(tempDir, `helios-${randomUUID()}.db`);
  const previousDbPath = process.env.HELIOS_DB_PATH;
  process.env.HELIOS_DB_PATH = dbPath;

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const controller = app.get(SessionController);

  try {
    const created = await controller.create({
        name: "Session API Test",
        description: "create -> detail -> archive",
        workspace_path: "/tmp/project-a",
        metadata: { source: "test" }
    });
    assert.equal(created.status, "ACTIVE");
    const collabSessionId = created.collabSessionId;
    assert.ok(collabSessionId);

    const listActive = await controller.list(undefined);
    assert.equal(Array.isArray(listActive), true);
    assert.equal(listActive.length, 1);
    assert.equal(listActive[0].collabSessionId, collabSessionId);

    const detail = await controller.detail(collabSessionId);
    assert.equal(detail.name, "Session API Test");
    assert.equal(detail.workspacePath, "/tmp/project-a");
    assert.equal(detail.metadata.source, "test");

    const archived = await controller.archive(collabSessionId, { actor: "test_runner", reason: "done" });
    assert.equal(archived.status, "ARCHIVED");

    const listAfterArchive = await controller.list(undefined);
    assert.equal(listAfterArchive.length, 0);

    const listAll = await controller.list("1");
    assert.equal(listAll.length, 1);
    assert.equal(listAll[0].status, "ARCHIVED");
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
