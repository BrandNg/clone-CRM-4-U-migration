# Git & Development Hooks (Customized for Telestar CRM)

Hooks automatically execute commands in response to Claude Code events. They prevent compilation errors and ensure database/type check rules are strictly followed in the Telestar CRM.

---

## 🔒 Mandatory Safety Hooks

### 1. TypeScript Validation Hook (`npx tsc --noEmit`)
*   **Trigger**: `post-tool-use` when modifying any `.ts` or `.tsx` file.
*   **Action**: Runs typechecking.
*   **Value**: Prevents staging or committing code with hidden type errors (Next.js does not typecheck in `next dev`, which has previously led to compiler failures at build time).

### 2. Prisma Schema Validation Hook (`npx prisma validate`)
*   **Trigger**: `post-tool-use` when modifying `prisma/schema.prisma`.
*   **Action**: Validates Prisma schema formatting, relations, and syntax.
*   **Value**: Catches migration inconsistencies before database pushing or code generation.

---

## 🎨 Quality & Formatting Hooks

### 3. ESLint & Prettier Auto-Fix
*   **Trigger**: `post-tool-use` on file edits.
*   **Action**: Runs `npx eslint --fix` on modified files.
*   **Value**: Automatically reformats code to match ESLint styling guidelines before review.

### 4. Vitest Targeted Runner
*   **Trigger**: `post-tool-use` when a test or its source file is changed.
*   **Action**: Runs `npx vitest run path/to/modified.test.ts`.
*   **Value**: Instantly alerts you if a local change breaks unit test expectations.
