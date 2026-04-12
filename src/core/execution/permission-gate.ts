// Permission gate — handles dangerous action confirmation with remember rules.
// Extracted from Agent to isolate permission UI interaction.

import { generatePermissionRule, savePermissionRule } from "../../tools/tools.js";
import { printConfirmation, printInfo, showMenu } from "../../ui/index.js";

export class PermissionGate {
  private confirmedPaths = new Set<string>();
  private confirmFn?: (toolName: string, input: Record<string, any>) => Promise<"allow" | "deny">;

  setConfirmFn(fn: (toolName: string, input: Record<string, any>) => Promise<"allow" | "deny">): void {
    this.confirmFn = fn;
  }

  /**
   * Returns true if allowed, false if denied.
   * Handles dedup via confirmedPaths so the same message is not asked twice per session.
   */
  async confirm(
    toolName: string,
    input: Record<string, any>,
    displayMessage: string,
  ): Promise<boolean> {
    if (this.confirmedPaths.has(displayMessage)) return true;

    printConfirmation(displayMessage);

    // Use external confirmFn if provided (REPL mode injects one with showMenu)
    if (this.confirmFn) {
      const result = await this.confirmFn(toolName, input);
      if (result === "allow") {
        this.confirmedPaths.add(displayMessage);
        return true;
      }
      return false;
    }

    // Fallback: interactive menu (one-shot mode, no REPL)
    const options = [
      { label: "Allow (this time only)", value: "allow" },
      { label: "Allow, and remember for this project", value: "allow-remember" },
      { label: "Deny (this time only)", value: "deny" },
      { label: "Deny, and always deny for this project", value: "deny-remember" },
    ];

    const choice = await showMenu("Allow this action? [up/down + Enter]", options);

    if (choice === "allow-remember") {
      const rule = generatePermissionRule(toolName, input);
      savePermissionRule(rule, "allow");
      printInfo(`Allowed & remembered: ${rule}`);
      this.confirmedPaths.add(displayMessage);
      return true;
    }
    if (choice === "deny-remember") {
      const rule = generatePermissionRule(toolName, input);
      savePermissionRule(rule, "deny");
      printInfo(`Denied & remembered: ${rule}`);
      return false;
    }
    if (choice === "allow") {
      this.confirmedPaths.add(displayMessage);
      return true;
    }
    return false;
  }
}
