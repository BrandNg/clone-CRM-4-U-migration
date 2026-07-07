# MCP Server Recommendations (Customized for Telestar CRM)

MCP (Model Context Protocol) servers extend Claude's capabilities by connecting to external tools and services. Based on the Telestar CRM's tech stack (Next.js, Prisma, BullMQ, Redis, PostgreSQL), these are the most relevant MCP servers.

---

## 🚀 Recommended CRM Database & Queue Servers

### 1. Database / PostgreSQL MCP
*   **Best for**: Directly querying and inspecting the CRM's PostgreSQL schema and data.
*   **Recommend when**: Working on database-heavy tasks, verifying migration data backfills (e.g. `Account` or `Contact` schema migrations), or debugging lead sync states.
*   **Value**: Allows Claude to safely run SQL queries, view table relations, and verify DB constraints without manual exports.

### 2. Prisma Schema MCP
*   **Best for**: Inspecting and linting `prisma/schema.prisma` relations.
*   **Recommend when**: Adding columns, updating enums (e.g., adding a new `ActivityType` or `TaskType`), or refactoring relational mapping.

### 3. Redis / Queue Monitor MCP
*   **Best for**: Inspecting BullMQ jobs inside your Redis instance.
*   **Recommend when**: Debugging background sequence processing, import worker delays, or checking queue health states.
*   **Value**: Inspect queue depths, active jobs, stalled jobs, and error logs directly inside the terminal.

---

## 🎨 Browser & E2E Testing Servers

### 4. Playwright MCP (Pre-configured in `.playwright-mcp`)
*   **Best for**: Direct browser automation, route verification, and taking visual screenshots of the CRM UI.
*   **Recommend when**: Making changes to layouts, verifying role-based route permissions (e.g., SDR vs. Director dashboard views), or checking visual UI regressions.
*   **Value**: Connects Claude to local chromium instances to click, type, and verify page states programmatically.

---

## 📚 Documentation & Reference lookup

### 5. context7
*   **Best for**: Looking up modern framework documentations where API signatures change frequently.
*   **Recommend when**: Coding Next.js App Router endpoints, working with Prisma client updates, or implementing BullMQ connections.
*   **Value**: Pulls live API specs directly, preventing compilation errors caused by outdated LLM training data.
