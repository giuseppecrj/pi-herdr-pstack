import assert from "node:assert/strict";

/**
 * Content contracts for skill text: each rule is a pattern that must match the
 * text with its whitespace collapsed. They pin the wording that carries a rule;
 * they do not show that a live model follows it.
 */
export type Rule = [name: string, pattern: RegExp];

/** The text with every whitespace run collapsed, so a rule reads across wrapped lines. */
export const flat = (text: string) => text.replace(/\s+/g, " ");

/** Every missing rule, and every forbidden wording the text contains. */
export function contractProblems(
	text: string,
	rules: Rule[],
	forbidden: Rule[] = [],
): string[] {
	const collapsed = flat(text);
	return [
		...rules
			.filter(([, pattern]) => !pattern.test(collapsed))
			.map(([name]) => `missing ${name}`),
		...forbidden
			.filter(([, pattern]) => pattern.test(collapsed))
			.map(([name]) => `contains ${name}`),
	];
}

/**
 * The text with each match of a rule deleted. A rule that still passes after
 * its own text is gone is too loose to lock anything.
 */
export function without(text: string, pattern: RegExp): string {
	const collapsed = flat(text);
	const global = new RegExp(pattern.source, `${pattern.flags}g`);
	assert.ok(global.test(collapsed), `${pattern} matches nothing to delete`);
	return collapsed.replace(new RegExp(pattern.source, `${pattern.flags}g`), "");
}

/**
 * Asserts the text keeps every rule and no forbidden wording, that removing
 * any one rule's wording fails the contract, and that each forbidden sample
 * added to the text fails it.
 */
export function assertContract(
	text: string,
	rules: Rule[],
	forbidden: Array<[...Rule, sample: string]> = [],
) {
	const banned: Rule[] = forbidden.map(([name, pattern]) => [name, pattern]);
	assert.deepEqual(contractProblems(text, rules, banned), []);
	assert.equal(new Set(rules.map(([name]) => name)).size, rules.length);
	for (const [name, pattern] of rules)
		assert.ok(
			contractProblems(without(text, pattern), rules, banned).includes(
				`missing ${name}`,
			),
			`removing "${name}" did not fail the contract`,
		);
	for (const [name, , sample] of forbidden)
		assert.ok(
			contractProblems(`${text}\n\n${sample}\n`, rules, banned).includes(
				`contains ${name}`,
			),
			`adding ${name} did not fail the contract`,
		);
}
