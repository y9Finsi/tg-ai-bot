# Prompt snapshots

These `.txt` files are local snapshots of the active Prompt Store configuration.

Production uses the Prompt Store in PostgreSQL. Before editing or relying on a local prompt file, refresh the snapshots:

```bash
npm run prompts:pull
```

The command reads the configured `DATABASE_URL`, requires every active prompt section to exist in the Prompt Store, compares each prompt by SHA-256 hash, and updates only changed files. It never writes local changes back to the Prompt Store.

Admin Prompt Studio is the normal place to edit and publish prompts. Local prompt changes are not deployed automatically.
