import assert from "node:assert/strict";
import test from "node:test";
import { buildFixPrompt, buildReviewPrompt } from "../src/prompts.ts";

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
