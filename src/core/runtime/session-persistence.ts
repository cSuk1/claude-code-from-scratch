// Session persistence — save and restore conversation state.
// Extracted from Agent to isolate persistence concerns.

import { saveSession } from "../../storage/session.js";
import { printInfo } from "../../ui/index.js";
import type { MessageHandler } from "../../backend/index.js";

export class SessionPersistence {
  constructor(
    private sessionId: string,
    private sessionStartTime: string,
    private getModel: () => string,
    private backend: MessageHandler,
  ) {}

  restoreSession(data: { anthropicMessages?: unknown[]; openaiMessages?: unknown[] }): void {
    const type = this.backend.getBackendType();
    if (type === "openai" && data.openaiMessages) {
      this.backend.setMessages(data.openaiMessages);
    } else if (type === "anthropic" && data.anthropicMessages) {
      this.backend.setMessages(data.anthropicMessages);
    }
    printInfo(`Session restored (${this.backend.getMessages().length} messages).`);
  }

  autoSave(): void {
    try {
      const type = this.backend.getBackendType();
      const msgs = this.backend.getMessages();
      saveSession(this.sessionId, {
        metadata: {
          id: this.sessionId,
          model: this.getModel(),
          cwd: process.cwd(),
          startTime: this.sessionStartTime,
          messageCount: msgs.length,
        },
        anthropicMessages: type === "anthropic" ? msgs : undefined,
        openaiMessages: type === "openai" ? msgs : undefined,
      });
    } catch { }
  }
}
