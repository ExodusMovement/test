# Jest repo tests

A small subtree of the upstream Jest repo, snapshotted from:

<https://github.com/jestjs/jest/tree/21cce70205025decc778f4aac2ec76051f589fd7>

When updating, use the same commit or update the link and incorporate the changes

## package.json

Do not change, it's needed to make this subtree operate in CJS mode, which jest uses

## TypeScript tests

Tests depending on TypeScript are in `tests/jest-superset`, as Jest is not configured with
TypeScript yet.
