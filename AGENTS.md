# Repository Guidelines

## Project Structure & Module Organization

Start Engineer is a Windows application launcher built with Electron, React, TypeScript, and a C# helper.

- `src/main/`: Electron services, persistence, process control, and IPC handlers.
- `src/preload/`: restricted renderer-to-main bridge.
- `src/renderer/`: React views, interaction logic, and CSS.
- `src/shared/`: shared types and contracts.
- `native/window-focus-helper/`: Windows-specific .NET helper.
- `scripts/`: build, packaging, validation, and smoke tests.
- `public/` and `build/`: static assets and packaging icons.
- `docs/`: troubleshooting, release guidance, and drafts. Read `PROJECT_OPTIMIZATION.md` before architectural changes.

## Build, Test, and Development Commands

Use Windows 10/11 x64, Node.js 22.12+, and .NET SDK 8.

- `npm ci`: install locked dependencies and Electron.
- `npm run dev`: start local development.
- `npm run typecheck`: check renderer and Electron TypeScript.
- `npm test`: run all Vitest tests.
- `npm run build`: compile helper, frontend, and main process; verify output.
- `npm run smoke`: check production startup with isolated configuration.
- `npm run release:prepare`: verify, package installer/portable EXEs, and generate SHA-256 checksums.

Packaging preparation includes an application-closing prehook. Prefer asking the user to close Start Engineer, then run `npm run release:verify`, `npm run package:win:artifacts`, and `npm run release:checksums` separately.

## Coding Style & Naming Conventions

Follow `.editorconfig`: UTF-8, LF, two-space indentation, and a final newline. Match existing double quotes and semicolons. Use kebab-case module filenames, PascalCase React components/types, and camelCase functions/variables. TypeScript is strict; renderer APIs must remain compatible with ES2020. No standalone ESLint or Prettier configuration is currently provided.

## Testing Guidelines

Colocate `*.test.ts` files with their modules; Vitest discovers `src/**/*.test.ts`. Example: `npm test -- src/main/group-service.test.ts`. Add regression tests for changed behavior, persistence, and failure paths. No numeric coverage threshold is configured. Run full tests, typechecking, build, and smoke checks before release; document manual Windows checks separately.

## Commit & Pull Request Guidelines

Use short imperative subjects, following history: `Fix group management` or `Document verified prerelease`. Keep commits focused. PRs should explain the problem, solution, verification commands, related issues, and screenshots for UI changes. Include risk analysis for permissions, downloads, process control, or data changes.

## Safety & Delivery

Update `PROJECT_OPTIMIZATION.md` with changes. Repackage functional updates directly into `release/`; do not create per-fix output directories. Never commit generated builds or personal configuration. Preserve ordinary GUI privileges, restricted IPC, download checksums, and path validation. Never terminate unrelated applications. Push, tag, or publish only when explicitly requested.
