# Workspace Rules

- **Package Manager**: ALWAYS use `pnpm` (never `npm` or `yarn`) for installing dependencies, running scripts, and managing Node.js/TypeScript packages.
- **Production Libraries & Real Implementations**: Do NOT use hand-rolled dummy/mock classes or fake interfaces. Always use real production packages and drivers (e.g. `ioredis`, `better-sqlite3`, `lru-cache`, etc.) for building system design patterns and implementations.
