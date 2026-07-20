import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import hunkReviewExtension, {
	discoverHunkSkill,
	probeHunkSession,
	sendAgentTask,
} from "../src/index.ts";

function fakePiWithExec(
	exec: (...args: unknown[]) => Promise<{
		stdout: string;
		stderr: string;
		code: number;
		killed: boolean;
	}>,
): ExtensionAPI {
	return { exec } as unknown as ExtensionAPI;
}

test("discovers an existing Hunk skill path", async () => {
	const directory = await mkdtemp(join(tmpdir(), "pi-hunk-review-"));
	const skillPath = join(directory, "SKILL.md");
	await writeFile(skillPath, "---\nname: hunk-review\ndescription: test\n---\n");

	try {
		const pi = fakePiWithExec(async () => ({
			stdout: `${skillPath}\n`,
			stderr: "",
			code: 0,
			killed: false,
		}));
		assert.equal(await discoverHunkSkill(pi), skillPath);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("classifies a repo mismatch as no-session", async () => {
	const pi = fakePiWithExec(async () => ({
		stdout: "",
		stderr: "hunk: No active session matches repoRoot /tmp/example.",
		code: 1,
		killed: false,
	}));

	const result = await probeHunkSession(pi, "/tmp/example");
	assert.equal(result.state, "no-session");
	assert.match(result.detail, /hunk diff --watch/);
});

test("sendAgentTask sends immediately when idle and queues when busy", () => {
	const calls: Array<{ prompt: string; options?: { deliverAs: string } }> = [];
	const notifications: string[] = [];
	const pi = {
		sendUserMessage(prompt: string, options?: { deliverAs: string }) {
			calls.push({ prompt, options });
		},
	} as unknown as ExtensionAPI;
	const makeContext = (idle: boolean) =>
		({
			isIdle: () => idle,
			ui: { notify: (message: string) => notifications.push(message) },
		}) as unknown as ExtensionCommandContext;

	sendAgentTask(pi, makeContext(true), "review now");
	sendAgentTask(pi, makeContext(false), "fix later");

	assert.deepEqual(calls, [
		{ prompt: "review now", options: undefined },
		{ prompt: "fix later", options: { deliverAs: "followUp" } },
	]);
	assert.deepEqual(notifications, ["Queued the Hunk task as a follow-up"]);
});

test("hunk-review command probes the session and sends a constrained task", async () => {
	type CapturedCommand = {
		handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
	};
	const commands = new Map<string, CapturedCommand>();
	const sent: string[] = [];
	const statuses: string[] = [];
	const pi = {
		on: () => undefined,
		registerCommand: (name: string, command: CapturedCommand) => {
			commands.set(name, command);
		},
		exec: async () => ({ stdout: "{}", stderr: "", code: 0, killed: false }),
		sendUserMessage: (prompt: string) => sent.push(prompt),
	} as unknown as ExtensionAPI;
	const ctx = {
		cwd: "/tmp/example",
		isIdle: () => true,
		ui: {
			setStatus: (_key: string, text: string | undefined) => {
				if (text) statuses.push(text);
			},
			notify: () => undefined,
		},
	} as unknown as ExtensionCommandContext;

	hunkReviewExtension(pi);
	await commands.get("hunk-review")?.handler("zh Focus on auth.", ctx);

	assert.deepEqual([...commands.keys()], ["hunk-status", "hunk-review", "hunk-fix"]);
	assert.deepEqual(statuses, ["hunk: connected"]);
	assert.equal(sent.length, 1);
	assert.match(sent[0] ?? "", /Do not modify project files/);
	assert.match(sent[0] ?? "", /Output language: Simplified Chinese/);
	assert.match(sent[0] ?? "", /Additional user instructions:\nFocus on auth\./);
	assert.doesNotMatch(sent[0] ?? "", /Additional user instructions:\nzh/);
});
