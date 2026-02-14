import { Injectable } from "@nestjs/common";

export interface ClaudeRunOptions {
  prompt: string;
  sessionId?: string;
}

@Injectable()
export class ClaudeAdapter {
  buildCommand(options: ClaudeRunOptions): { cmd: string; args: string[] } {
    if (options.sessionId) {
      return {
        cmd: "claude",
        args: ["--resume", options.sessionId, options.prompt]
      };
    }

    return {
      cmd: "claude",
      args: [options.prompt]
    };
  }
}
