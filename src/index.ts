import { access } from "node:fs/promises";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { buildFixPrompt, buildReviewPrompt } from "./prompts.ts";

const COMMAND_TIMEOUT_MS = 5_000;
const STATUS_KEY = "pi-hunk-review";

export type ProbeResult =
	| { state: "connected"; detail: string }
	| { state: "missing"; detail: string }
	| { state: "no-session"; detail: string }
	| { state: "error"; detail: string };

function hunkBinary(): string {
	return process.env.HUNK_BIN?.trim() || "hunk";
}

function firstUsefulLine(...values: string[]): string {
	for (const value of values) {
		const line = value
			.split("\n")
			.map((part) => part.trim())
			.find(Boolean);
		if (line) return line;
	}
	return "Unknown Hunk error";
}

export async function discoverHunkSkill(pi: ExtensionAPI): Promise<string | undefined> {
	try {
		const result = await pi.exec(hunkBinary(), ["skill", "path"], {
			timeout: COMMAND_TIMEOUT_MS,
		});
		if (result.code !== 0) return undefined;

		const skillPath = result.stdout.trim();
		if (!skillPath) return undefined;
		await access(skillPath);
		return skillPath;
	} catch {
		return undefined;
	}
}

export async function probeHunkSession(pi: ExtensionAPI, cwd: string): Promise<ProbeResult> {
	try {
		const result = await pi.exec(
			hunkBinary(),
			["session", "get", "--repo", cwd, "--json"],
			{ cwd, timeout: COMMAND_TIMEOUT_MS },
		);

		if (result.code === 0) {
			return {
				state: "connected",
				detail: `Connected to the live Hunk session for ${cwd}`,
			};
		}

		const detail = firstUsefulLine(result.stderr, result.stdout);
		if (/not found|enoent|unknown command/i.test(detail) || result.code === 127) {
			return {
				state: "missing",
				detail: `Hunk is unavailable (${detail}). Install it with \`brew install hunk\` or \`npm i -g hunkdiff\`.`,
			};
		}
		if (/no active (?:hunk )?sessions?|no session/i.test(detail)) {
			return {
				state: "no-session",
				detail: `No live Hunk session matches ${cwd}. Start one in another terminal with \`hunk diff --watch\`.`,
			};
		}
		return { state: "error", detail };
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		if (/not found|enoent/i.test(detail)) {
			return {
				state: "missing",
				detail: "Hunk is not installed or is not on PATH. Install it with `brew install hunk` or `npm i -g hunkdiff`.",
			};
		}
		return { state: "error", detail };
	}
}

function updateStatus(ctx: ExtensionContext, probe: ProbeResult): void {
	const label = {
		connected: "hunk: connected",
		missing: "hunk: missing",
		"no-session": "hunk: no session",
		error: "hunk: error",
	}[probe.state];
	ctx.ui.setStatus(STATUS_KEY, label);
}

async function requireLiveSession(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
): Promise<boolean> {
	const probe = await probeHunkSession(pi, ctx.cwd);
	updateStatus(ctx, probe);
	if (probe.state === "connected") return true;
	ctx.ui.notify(probe.detail, probe.state === "error" ? "error" : "warning");
	return false;
}

export function sendAgentTask(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	prompt: string,
): void {
	if (ctx.isIdle()) {
		pi.sendUserMessage(prompt);
		return;
	}
	pi.sendUserMessage(prompt, { deliverAs: "followUp" });
	ctx.ui.notify("Queued the Hunk task as a follow-up", "info");
}

export default function hunkReviewExtension(pi: ExtensionAPI) {
	pi.on("resources_discover", async () => {
		const skillPath = await discoverHunkSkill(pi);
		return skillPath ? { skillPaths: [skillPath] } : undefined;
	});

	pi.on("session_start", async (_event, ctx) => {
		const probe = await probeHunkSession(pi, ctx.cwd);
		updateStatus(ctx, probe);
	});

	pi.on("session_shutdown", (_event, ctx) => {
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});

	pi.registerCommand("hunk-status", {
		description: "Check whether this repository has a live Hunk session",
		handler: async (_args, ctx) => {
			const probe = await probeHunkSession(pi, ctx.cwd);
			updateStatus(ctx, probe);
			ctx.ui.notify(
				probe.detail,
				probe.state === "connected"
					? "info"
					: probe.state === "error"
						? "error"
						: "warning",
			);
		},
	});

	pi.registerCommand("hunk-review", {
		description: "Review the live Hunk diff and publish findings as inline comments",
		handler: async (args, ctx) => {
			if (!(await requireLiveSession(pi, ctx))) return;
			sendAgentTask(
				pi,
				ctx,
				buildReviewPrompt({ cwd: ctx.cwd, extraInstructions: args }),
			);
		},
	});

	pi.registerCommand("hunk-fix", {
		description: "Read Hunk comments, apply valid fixes, and run focused checks",
		handler: async (args, ctx) => {
			if (!(await requireLiveSession(pi, ctx))) return;
			sendAgentTask(
				pi,
				ctx,
				buildFixPrompt({ cwd: ctx.cwd, extraInstructions: args }),
			);
		},
	});
}
