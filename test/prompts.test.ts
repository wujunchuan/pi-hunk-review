import assert from "node:assert/strict";
import test from "node:test";
import {
	buildFixPrompt,
	buildReviewPrompt,
	parsePromptArgs,
} from "../src/prompts.ts";

test("review prompt targets the repo and requests inline comments without edits", () => {
	const prompt = buildReviewPrompt({ cwd: "/tmp/example" });

	assert.match(prompt, /live Hunk session.*\/tmp\/example/);
	assert.match(prompt, /inline agent comment/);
	assert.match(prompt, /Do not modify project files/);
	assert.doesNotMatch(prompt, /Additional user instructions/);
});

test("fix prompt requests comments, edits, and validation without clearing notes", () => {
	const prompt = buildFixPrompt({ cwd: "/tmp/example" });

	assert.match(prompt, /List all current Hunk comments/);
	assert.match(prompt, /apply the fixes/);
	assert.match(prompt, /run focused tests or checks/);
	assert.match(prompt, /Do not remove or clear Hunk comments automatically/);
});

test("extra instructions are trimmed and appended", () => {
	const prompt = buildReviewPrompt({
		cwd: "/tmp/example",
		extraInstructions: "  Review only src/auth.ts.  ",
	});

	assert.match(
		prompt,
		/Additional user instructions:\nReview only src\/auth\.ts\.$/,
	);
});

test("language codes are parsed from the first argument", () => {
	assert.deepEqual(parsePromptArgs("zh"), {
		outputLanguage: "Simplified Chinese",
		extraInstructions: undefined,
	});
	assert.deepEqual(parsePromptArgs(" ZH-TW  Focus on auth. "), {
		outputLanguage: "Traditional Chinese",
		extraInstructions: "Focus on auth.",
	});
});

test("unrecognized first arguments remain additional instructions", () => {
	assert.deepEqual(parsePromptArgs("security only"), {
		extraInstructions: "security only",
	});
});

test("output language applies after potentially conflicting extra instructions", () => {
	const prompt = buildReviewPrompt({
		cwd: "/tmp/example",
		outputLanguage: "Simplified Chinese",
		extraInstructions: "Respond in English.",
	});

	assert.match(prompt, /Hunk comment summaries and rationales/);
	assert.match(prompt, /final report/);
	assert.ok(
		prompt.indexOf("Additional user instructions:\nRespond in English.") <
			prompt.indexOf("Output language: Simplified Chinese"),
	);
	assert.match(prompt, /quoted command output unchanged\.$/);
});
