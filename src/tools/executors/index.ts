import { readFile, writeFile, editFile } from "./file-ops.js";
import { listFiles, grepSearch } from "./search.js";
import { runShell } from "./shell.js";
import { taskCreate, taskUpdate, taskList } from "./tasks.js";
import { webSearch } from "./web-search.js";

export type ToolInput = Record<string, any>;

export type ToolHandler = (input: ToolInput) => string | Promise<string>;

export const handlers: Record<string, ToolHandler> = {
  read_file: (input) => readFile(input as { file_path: string }),
  write_file: (input) => writeFile(input as { file_path: string; content: string }),
  edit_file: (input) => editFile(input as { file_path: string; old_string: string; new_string: string }),
  list_files: (input) => listFiles(input as { pattern: string; path?: string }),
  grep_search: (input) => grepSearch(input as { pattern: string; path?: string; include?: string }),
  run_shell: (input) => runShell(input as { command: string; timeout?: number }),
  task_create: (input) => taskCreate(input as { subject: string; description: string; steps?: Array<{ title: string; description?: string }>; activeForm?: string }),
  task_update: (input) => taskUpdate(input as { taskId: string; status?: string; subject?: string; description?: string; steps?: Array<{ id?: string; title?: string; description?: string; status?: string }>; activeForm?: string }),
  task_list: () => taskList(),
  web_search: (input) => webSearch(input as { query: string; max_results?: number }),
};

export async function executeToolHandler(name: string, input: ToolInput): Promise<string> {
  const handler = handlers[name];
  if (!handler) return `Unknown tool: ${name}`;
  return Promise.resolve(handler(input));
}
