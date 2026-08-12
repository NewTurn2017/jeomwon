import { existsSync, lstatSync, realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { DocContractError } from "./doc-contract-structured.mjs";

export function resolveDocumentTarget(root, target, detail) {
	const lexicalRoot = resolve(root);
	const lexicalTarget = resolve(target);
	const relativeTarget = relative(lexicalRoot, lexicalTarget);
	if (!contained(relativeTarget) || !existsSync(lexicalTarget))
		fail("local_link_missing", detail);

	let component = lexicalRoot;
	for (const segment of relativeTarget.split(sep)) {
		component = resolve(component, segment);
		if (!existsSync(component)) fail("local_link_missing", detail);
		if (lstatSync(component).isSymbolicLink())
			fail("local_link_symlink", detail);
	}

	let realRoot;
	let realTarget;
	try {
		realRoot = realpathSync(lexicalRoot);
		realTarget = realpathSync(lexicalTarget);
	} catch {
		return fail("local_link_missing", detail);
	}
	if (!contained(relative(realRoot, realTarget)))
		fail("local_link_symlink", detail);
	if (!lstatSync(realTarget).isFile()) fail("local_link_missing", detail);
	return realTarget;
}

function contained(relativePath) {
	return relativePath !== ".." && !relativePath.startsWith(`..${sep}`);
}

function fail(code, detail) {
	throw new DocContractError(`${code}: ${detail}`);
}
