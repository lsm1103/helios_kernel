import { Injectable } from "@nestjs/common";

export interface CodexRunOptions {
  prompt: string;
  sessionId?: string;
  cwd?: string;
}

@Injectable()
export class CodexAdapter {
  buildCommand(options: CodexRunOptions): { cmd: string; args: string[] } {
    if (options.sessionId) {
      return {
        cmd: "codex",
        args: ["resume", options.sessionId, "--", options.prompt]
      };
    }

    return {
      cmd: "codex",
      args: ["exec", options.prompt]
    };
  }
}
