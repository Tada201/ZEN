# Codegraph Database Navigation

The workspace contains a pre-built, AST-parsed codegraph database inside the `.codegraph/` folder at `.codegraph/codegraph.db`. This is a standard SQLite 3 database that indexes all code symbols (nodes), their syntax-level relationships (edges), and indexed source files.

Whenever you need to perform deep code research, architectural analysis, impact analysis, or dependency tracing, you can query this database directly using Python or the SQLite CLI.

Prefer the MCP tools when they are available. They are the intended fast path for agents and avoid manual SQL for common tasks:

| Task | Preferred tool |
|---|---|
| Broad feature or architecture context | `codegraph_context` first |
| Related source for several symbols/files | `codegraph_explore` |
| Symbol lookup by name | `codegraph_search` |
| Callers or callees | `codegraph_callers` / `codegraph_callees` |
| Impact radius | `codegraph_impact` |
| File tree from the index | `codegraph_files` |
| Index health and freshness | `codegraph_status` |

Rules:

1. For "how does X work", architecture, feature, and bug-context questions, use `codegraph_context` before grep/read.
2. Do not spawn a separate file-reading exploration task when CodeGraph can answer the structural question directly.
3. Trust CodeGraph for symbol relationships unless the tool reports stale files. If stale files are listed, read only those files directly.
4. Use grep/read for literal text searches, generated assets, or exact file content after CodeGraph has narrowed the target.
5. Use `codegraph_explore` instead of repeated `codegraph_node` calls when inspecting several related symbols.

---

## Database Schema

### 1. `nodes` Table
Stores AST-extracted code symbols.
```sql
CREATE TABLE nodes (
    id TEXT PRIMARY KEY,               -- Unique identifier (e.g., file_path:symbol_path)
    kind TEXT NOT NULL,                -- 'class', 'constant', 'enum', 'enum_member', 'file', 'function', 'interface', 'method', 'struct', 'trait', 'type_alias', 'variable'
    name TEXT NOT NULL,                -- Unqualified name of the symbol
    qualified_name TEXT NOT NULL,      -- Full path/namespace qualified name
    file_path TEXT NOT NULL,           -- Path relative to workspace root
    language TEXT NOT NULL,            -- Programming language (typescript, rust, python, etc.)
    start_line INTEGER NOT NULL,       -- 1-based start line
    end_line INTEGER NOT NULL,         -- 1-based end line
    start_column INTEGER NOT NULL,     -- Column offset
    end_column INTEGER NOT NULL,       -- Column offset
    docstring TEXT,                    -- Attached comments/documentation
    signature TEXT,                    -- Full signature string
    visibility TEXT,                   -- 'public', 'private', etc.
    is_exported INTEGER DEFAULT 0,     -- 1 if exported, 0 otherwise
    is_async INTEGER DEFAULT 0,        -- 1 if async, 0 otherwise
    is_static INTEGER DEFAULT 0,       -- 1 if static/associated, 0 otherwise
    is_abstract INTEGER DEFAULT 0,     -- 1 if abstract, 0 otherwise
    decorators TEXT,                   -- JSON array of decorators
    type_parameters TEXT,              -- JSON array of type parameters
    updated_at INTEGER NOT NULL
);
```

### 2. `edges` Table
Stores directional syntax-level relationships between symbols.
```sql
CREATE TABLE edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,              -- Source node ID
    target TEXT NOT NULL,              -- Target node ID
    kind TEXT NOT NULL,                -- 'calls', 'contains', 'implements', 'imports', 'instantiates', 'references'
    metadata TEXT,                     -- JSON object for extra details
    line INTEGER,                      -- Line number where relationship occurs
    col INTEGER,                       -- Column number where relationship occurs
    provenance TEXT DEFAULT NULL,
    FOREIGN KEY (source) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target) REFERENCES nodes(id) ON DELETE CASCADE
);
```

### 3. `files` Table
Tracks status of indexed workspace files.
```sql
CREATE TABLE files (
    path TEXT PRIMARY KEY,             -- File path relative to workspace root
    content_hash TEXT NOT NULL,        -- MD5/SHA hash of file contents
    language TEXT NOT NULL,            -- Language name
    size INTEGER NOT NULL,             -- File size in bytes
    modified_at INTEGER NOT NULL,      -- File modification timestamp
    indexed_at INTEGER NOT NULL,       -- Timestamp when indexed
    node_count INTEGER DEFAULT 0,      -- Number of symbols extracted from file
    errors TEXT                        -- JSON array of indexing warnings or errors
);
```

---

## Example Queries

Below are standard SQL queries you can execute via Python or the SQLite CLI to navigate the codebase efficiently:

### A. Find the Definition of a Symbol
```sql
SELECT file_path, start_line, end_line, kind, signature, docstring
FROM nodes
WHERE name = 'useUIStore' OR qualified_name = 'useUIStore';
```

### B. Find All Callers of a Function/Method
```sql
SELECT n_src.name AS caller_name, n_src.file_path AS caller_file, e.line AS call_line
FROM edges e
JOIN nodes n_src ON e.source = n_src.id
JOIN nodes n_tgt ON e.target = n_tgt.id
WHERE n_tgt.name = 'invoke' AND e.kind = 'calls';
```

### C. Find All Symbols Contained in a File
```sql
SELECT name, kind, start_line, end_line, is_exported
FROM nodes
WHERE file_path = 'src/components/workbench/Terminal.tsx'
  AND kind != 'import'
ORDER BY start_line;
```

### D. Find All Exports in a Specific Language
```sql
SELECT name, kind, file_path
FROM nodes
WHERE is_exported = 1 AND language = 'rust'
LIMIT 20;
```

### E. Trace Outgoing Dependencies of a File
```sql
SELECT n_tgt.file_path AS depends_on_file, COUNT(*) AS reference_count
FROM edges e
JOIN nodes n_src ON e.source = n_src.id
JOIN nodes n_tgt ON e.target = n_tgt.id
WHERE n_src.file_path = 'src-tauri/src/lib.rs'
  AND n_tgt.file_path != 'src-tauri/src/lib.rs'
GROUP BY n_tgt.file_path;
```

---

## Guidelines for Agents
1. **Prefer SQL queries over Grep** when searching for structural symbols, interface implementations, and cross-reference analysis. It is significantly faster and more accurate.
2. **Execute queries using python scripts** or standard sqlite command lines. For example:
   ```bash
   python -c "import sqlite3; conn = sqlite3.connect('.codegraph/codegraph.db'); ... "
   ```
3. **Verify paths**: Ensure the query paths match standard workspace relative pathing (e.g. `src/lib.rs` instead of absolute paths).
