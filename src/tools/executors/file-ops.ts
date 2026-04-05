import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { getMemoryDir } from "../../storage/memory.js";

const DEFAULT_READ_FILE_LINES = 80;
const MAX_READ_FILE_LINES = 200;
const FILE_PREVIEW_LINES = 30;

type ToolInput = Record<string, any>;

export function formatWithLineNumbers(content: string, startLine = 1, maxLines?: number): string {
    const lines = content.split("\n");
    const shown = typeof maxLines === "number" ? lines.slice(0, maxLines) : lines;
    return shown
        .map((line, i) => `${String(startLine + i).padStart(4)} | ${line}`)
        .join("\n");
}

export function clampPositiveInteger(value: unknown, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.max(1, Math.floor(value));
}

export function parseReadFileLimit(value: unknown): { unlimited: boolean; requestedLimit: number } {
    if (value === 0) {
        return { unlimited: true, requestedLimit: 0 };
    }

    const requestedLimit = clampPositiveInteger(value, DEFAULT_READ_FILE_LINES);
    return { unlimited: false, requestedLimit };
}

export function readFile(input: { file_path: string; offset?: number; limit?: number }): string {
    try {
        const content = readFileSync(input.file_path, "utf-8");
        const lines = content.split("\n");

        if (lines.length === 1 && lines[0] === "") {
            return `File is empty: ${input.file_path}`;
        }

        const startLine = clampPositiveInteger(input.offset, 1);
        const { unlimited, requestedLimit } = parseReadFileLimit(input.limit);
        const limit = unlimited ? lines.length - startLine + 1 : Math.min(requestedLimit, MAX_READ_FILE_LINES);

        if (startLine > lines.length) {
            return `Error reading file: line ${startLine} is out of range (file has ${lines.length} lines)`;
        }

        const startIndex = startLine - 1;
        const selected = lines.slice(startIndex, startIndex + limit);
        const preview = formatWithLineNumbers(selected.join("\n"), startLine);
        const endLine = startLine + selected.length - 1;
        const moreAbove = startLine > 1;
        const moreBelow = endLine < lines.length;
        const limitNote = unlimited
            ? " (all remaining content requested)"
            : requestedLimit > MAX_READ_FILE_LINES
                ? ` (requested ${requestedLimit}, capped at ${MAX_READ_FILE_LINES})`
                : "";

        const header = `Showing lines ${startLine}-${endLine} of ${lines.length} from ${input.file_path}${limitNote}`;
        const footer = !unlimited && (moreAbove || moreBelow)
            ? `\n\nUse read_file with offset and limit to read more.${moreAbove ? ` Earlier lines available before ${startLine}.` : ""}${moreBelow ? ` More lines available after ${endLine}.` : ""}`
            : "";

        return `${header}\n\n${preview}${footer}`;
    } catch (e: any) {
        return `Error reading file: ${e.message}`;
    }
}

export function writeFile(input: { file_path: string; content: string }): string {
    try {
        const dir = dirname(input.file_path);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(input.file_path, input.content);
        autoUpdateMemoryIndex(input.file_path);

        const lineCount = input.content.split("\n").length;
        const preview = formatWithLineNumbers(input.content, FILE_PREVIEW_LINES);
        const truncNote = lineCount > FILE_PREVIEW_LINES ? `\n  ... (${lineCount} lines total)` : "";
        return `Successfully wrote to ${input.file_path} (${lineCount} lines)\n\n${preview}${truncNote}`;
    } catch (e: any) {
        return `Error writing file: ${e.message}`;
    }
}

export function extractMemoryMetadata(content: string): { name: string; type: string; description: string } | null {
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    const typeMatch = content.match(/^type:\s*(.+)$/m);
    if (!nameMatch || !typeMatch) return null;

    const descMatch = content.match(/^description:\s*(.+)$/m);
    return {
        name: nameMatch[1].trim(),
        type: typeMatch[1].trim(),
        description: descMatch?.[1]?.trim() || "",
    };
}

export function autoUpdateMemoryIndex(filePath: string): void {
    try {
        const memDir = getMemoryDir();
        if (filePath.startsWith(memDir) && filePath.endsWith(".md") && !filePath.endsWith("MEMORY.md")) {
            const files = readdirSync(memDir).filter(
                (f: string) => f.endsWith(".md") && f !== "MEMORY.md"
            );
            const lines = ["# Memory Index", ""];
            for (const file of files) {
                try {
                    const raw = readFileSync(join(memDir, file), "utf-8");
                    const metadata = extractMemoryMetadata(raw);
                    if (!metadata) continue;
                    lines.push(`- **[${metadata.name}](${file})** (${metadata.type}) — ${metadata.description}`);
                } catch {
                    // skip invalid memory entries
                }
            }
            writeFileSync(join(memDir, "MEMORY.md"), lines.join("\n"));
        }
    } catch {
        // non-critical
    }
}

export function findActualString(fileContent: string, searchString: string): string | null {
    if (fileContent.includes(searchString)) return searchString;
    const normSearch = normalizeQuotes(searchString);
    const normFile = normalizeQuotes(fileContent);
    const idx = normFile.indexOf(normSearch);
    if (idx !== -1) return fileContent.substring(idx, idx + searchString.length);
    return null;
}

function normalizeQuotes(s: string): string {
    return s
        .replace(/[\u2018\u2019\u2032]/g, "'")
        .replace(/[\u201C\u201D\u2033]/g, '"');
}

export function generateDiff(oldContent: string, oldString: string, newString: string): string {
    const beforeChange = oldContent.split(oldString)[0];
    const lineNum = (beforeChange.match(/\n/g) || []).length + 1;
    const oldLines = oldString.split("\n");
    const newLines = newString.split("\n");

    const parts: string[] = [`@@ -${lineNum},${oldLines.length} +${lineNum},${newLines.length} @@`];
    for (const l of oldLines) parts.push(`- ${l}`);
    for (const l of newLines) parts.push(`+ ${l}`);

    return parts.join("\n");
}

export function editFile(input: {
    file_path: string;
    old_string: string;
    new_string: string;
}): string {
    try {
        const content = readFileSync(input.file_path, "utf-8");
        const actual = findActualString(content, input.old_string);
        if (!actual) {
            return `Error: old_string not found in ${input.file_path}`;
        }

        const count = content.split(actual).length - 1;
        if (count > 1) {
            return `Error: old_string found ${count} times in ${input.file_path}. Must be unique.`;
        }

        const newContent = content.split(actual).join(input.new_string);
        writeFileSync(input.file_path, newContent);

        const diff = generateDiff(content, actual, input.new_string);
        const quoteNote = actual !== input.old_string ? " (matched via quote normalization)" : "";
        return `Successfully edited ${input.file_path}${quoteNote}\n\n${diff}`;
    } catch (e: any) {
        return `Error editing file: ${e.message}`;
    }
}
