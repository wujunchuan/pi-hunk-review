export const OUTPUT_LANGUAGE_NAMES: Readonly<Record<string, string>> = {
	de: "German",
	en: "English",
	es: "Spanish",
	fr: "French",
	ja: "Japanese",
	ko: "Korean",
	pt: "Portuguese",
	ru: "Russian",
	zh: "Simplified Chinese",
	"zh-cn": "Simplified Chinese",
	"zh-tw": "Traditional Chinese",
};

export interface PromptOptions {
	cwd: string;
	extraInstructions?: string;
	outputLanguage?: string;
}

export interface ParsedPromptArgs {
	extraInstructions?: string;
	outputLanguage?: string;
}

export function parsePromptArgs(args: string): ParsedPromptArgs {
	const trimmed = args.trim();
	if (!trimmed) return {};

	const firstWhitespace = trimmed.search(/\s/);
	const firstArgument = firstWhitespace === -1 ? trimmed : trimmed.slice(0, firstWhitespace);
	const outputLanguage = OUTPUT_LANGUAGE_NAMES[firstArgument.toLowerCase()];
	if (!outputLanguage) return { extraInstructions: trimmed };

	const extraInstructions =
		firstWhitespace === -1 ? undefined : trimmed.slice(firstWhitespace).trim() || undefined;
	return { outputLanguage, extraInstructions };
}

function appendPromptOptions(
	prompt: string,
	{ extraInstructions, outputLanguage }: Pick<
		PromptOptions,
		"extraInstructions" | "outputLanguage"
	>,
): string {
	let result = prompt;
	const extra = extraInstructions?.trim();
	if (extra) result += `\n\nAdditional user instructions:\n${extra}`;

	if (outputLanguage) {
		result += `\n\nOutput language: ${outputLanguage}. Write all agent-authored user-facing text in ${outputLanguage}, including Hunk comment summaries and rationales, review narration, and the final report. Keep code, identifiers, file paths, and quoted command output unchanged.`;
	}
	return result;
}

export function buildReviewPrompt({
	cwd,
	extraInstructions,
	outputLanguage,
}: PromptOptions): string {
	const prompt = `Use the hunk-review skill to review the live Hunk session for this repository: ${cwd}

Review the current changes for concrete correctness, regression, security, and maintainability issues. Start with the compact review structure and inspect raw patch content only as needed. Send every worthwhile finding to the live Hunk session as a targeted inline agent comment, preferably in one comment-apply batch. Include a concise summary and actionable rationale for each finding.

Do not modify project files. Do not add comments for purely subjective style preferences. If there is no matching live Hunk session, explain how to start one with \`hunk diff --watch\`. Finish with a short summary of how many comments were added.`;
	return appendPromptOptions(prompt, { extraInstructions, outputLanguage });
}

export function buildFixPrompt({
	cwd,
	extraInstructions,
	outputLanguage,
}: PromptOptions): string {
	const prompt = `Use the hunk-review skill to inspect the live Hunk session for this repository: ${cwd}

List all current Hunk comments, including user and agent comments. Treat them as review input, inspect the relevant code, and apply the fixes that are correct and within scope. Use Pi's normal file-editing tools to modify the project, then run focused tests or checks. Do not blindly follow a comment when it is incorrect, stale, or requires an unapproved product or architecture decision; report those instead. Do not remove or clear Hunk comments automatically. The live Hunk window should refresh from the changed working tree.

Finish with a concise report covering addressed comments, skipped comments with reasons, changed files, and validation results.`;
	return appendPromptOptions(prompt, { extraInstructions, outputLanguage });
}
