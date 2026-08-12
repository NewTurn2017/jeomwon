export type VerifyCommand = {
	document: string;
	shell: string;
	cwd: "repo";
	argv: string[];
};
export type VerifyResult = VerifyCommand & {
	exit: number | null;
	signal: NodeJS.Signals | null;
	error: string | null;
	stdout: string;
	stderr: string;
};
export function collectDocuments(root: string): string[];
export function parseVerifyFences(
	markdown: string,
	document: string,
): VerifyCommand[];
export function executeVerifyCommands(
	commands: VerifyCommand[],
	root: string,
): VerifyResult[];
export function validateDocumentLinks(
	documents: Record<string, string>,
	root: string,
): number;
export function documentAnchors(
	source: string,
	extension?: string,
): Set<string>;
export function headingSlug(value: string): string;
