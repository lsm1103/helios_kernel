import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ErrorCodes } from "../../domain/common/error-codes";
import {
  InteractionAnswer,
  InteractionRequestRecord,
  InteractionRequestsRepository
} from "../../infrastructure/persistence/sqlite/repositories/interaction-requests.repository";
import { ToolSessionLinkService } from "./tool-session-link.service";
import { PtyRunManager } from "../../infrastructure/tool-runners/pty-run-manager";

interface CreateInteractionInput {
  collabSessionId: string;
  toolSessionId: string;
  runId: string;
  prompt: string;
  options?: string[];
  timeoutMinutes?: number;
}

interface LarkCallbackInput {
  eventId: string;
  idempotencyKey: string;
  interactionRequestId: string;
  answerType: "choice" | "text";
  answerValue: string;
  answeredBy: string;
  occurredAt?: string;
}

@Injectable()
export class InteractionRequestService {
  constructor(
    private readonly repo: InteractionRequestsRepository,
    private readonly toolSessionService: ToolSessionLinkService,
    private readonly runManager: PtyRunManager
  ) {}

  create(input: CreateInteractionInput): InteractionRequestRecord {
    const now = new Date();
    const timeoutMinutes = input.timeoutMinutes ?? 15;

    return this.repo.create({
      interactionRequestId: randomUUID(),
      collabSessionId: input.collabSessionId,
      toolSessionId: input.toolSessionId,
      runId: input.runId,
      prompt: input.prompt,
      status: "PENDING",
      options: input.options ?? [],
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + timeoutMinutes * 60_000).toISOString()
    });
  }

  listPending(filters?: {
    collabSessionId?: string;
    toolSessionId?: string;
    runId?: string;
  }): InteractionRequestRecord[] {
    return this.repo.listPending(filters);
  }

  handleLarkCallback(input: LarkCallbackInput): {
    status: "ACCEPTED" | "NOOP_IDEMPOTENT";
    interactionRequestId: string;
    runId: string;
    writtenBytes: number;
    processedAt: string;
  } {
    const idemKey = input.idempotencyKey || input.eventId;
    if (this.repo.hasIdempotencyKey(idemKey)) {
      const existing = this.repo.getById(input.interactionRequestId);
      return {
        status: "NOOP_IDEMPOTENT",
        interactionRequestId: input.interactionRequestId,
        runId: existing?.runId ?? "unknown",
        writtenBytes: 0,
        processedAt: new Date().toISOString()
      };
    }

    const request = this.repo.getById(input.interactionRequestId);
    if (!request) {
      throw new NotFoundException(ErrorCodes.InteractionNotFound);
    }

    if (request.status !== "PENDING") {
      throw new UnprocessableEntityException(ErrorCodes.InteractionNotPending);
    }

    if (new Date(request.expiresAt).getTime() < Date.now()) {
      throw new UnprocessableEntityException(ErrorCodes.InteractionExpired);
    }

    const run = this.runManager.getRun(request.runId);
    if (!run || run.status !== "ACTIVE") {
      throw new UnprocessableEntityException(ErrorCodes.RunNotActive);
    }

    if (run.toolSessionId !== request.toolSessionId) {
      throw new BadRequestException(ErrorCodes.BindingMismatch);
    }

    const stdinText = `${input.answerValue}\n`;
    const write = this.runManager.writeStdin(request.runId, stdinText);
    if (!write) {
      throw new UnprocessableEntityException(ErrorCodes.RunNotActive);
    }

    const answer: InteractionAnswer = {
      answerType: input.answerType,
      answerValue: input.answerValue
    };
    this.repo.markResolved(request.interactionRequestId, answer);
    this.repo.consumeIdempotencyKey(idemKey);

    this.toolSessionService.appendSummary(
      request.toolSessionId,
      `HITL resolved by ${input.answeredBy}: ${input.answerValue}`
    );

    return {
      status: "ACCEPTED",
      interactionRequestId: request.interactionRequestId,
      runId: request.runId,
      writtenBytes: Buffer.byteLength(stdinText, "utf8"),
      processedAt: new Date().toISOString()
    };
  }

  writeToRunStdin(input: {
    runId: string;
    interactionRequestId: string;
    stdinText: string;
    idempotencyKey: string;
  }): {
    status: "ACCEPTED" | "NOOP_IDEMPOTENT";
    runId: string;
    interactionRequestId: string;
    writtenBytes: number;
    processedAt: string;
  } {
    if (this.repo.hasIdempotencyKey(input.idempotencyKey)) {
      return {
        status: "NOOP_IDEMPOTENT",
        runId: input.runId,
        interactionRequestId: input.interactionRequestId,
        writtenBytes: 0,
        processedAt: new Date().toISOString()
      };
    }

    const request = this.repo.getById(input.interactionRequestId);
    if (!request) {
      throw new NotFoundException(ErrorCodes.InteractionNotFound);
    }

    if (request.status !== "PENDING") {
      throw new UnprocessableEntityException(ErrorCodes.InteractionNotPending);
    }

    if (request.runId !== input.runId) {
      throw new BadRequestException(ErrorCodes.BindingMismatch);
    }

    const run = this.runManager.getRun(input.runId);
    if (!run || run.status !== "ACTIVE") {
      throw new UnprocessableEntityException(ErrorCodes.RunNotActive);
    }

    const write = this.runManager.writeStdin(input.runId, input.stdinText);
    if (!write) {
      throw new UnprocessableEntityException(ErrorCodes.RunNotActive);
    }

    this.repo.markResolved(input.interactionRequestId, {
      answerType: "text",
      answerValue: input.stdinText.trim()
    });
    this.repo.consumeIdempotencyKey(input.idempotencyKey);

    return {
      status: "ACCEPTED",
      runId: input.runId,
      interactionRequestId: input.interactionRequestId,
      writtenBytes: Buffer.byteLength(input.stdinText, "utf8"),
      processedAt: new Date().toISOString()
    };
  }
}
