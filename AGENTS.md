# AGENTS Instructions

## Prisma Migrations (Mandatory)

- Never write Prisma migrations by hand.
- Never create or edit `migration.sql` manually.
- Always generate migrations with Prisma CLI only.

Use this command pattern:

```bash
pnpm --filter backend prisma:migrate -- --name <migration_name>
```

If migration generation fails (DB unavailable, schema engine error, permissions, etc.):

- Stop and report the blocker.
- Do not create a manual migration as a workaround.

## Prisma Raw SQL Safety (Mandatory)

- Never use `this.prisma.$executeRaw`, `this.prisma.$queryRaw`, `this.prisma.$executeRawUnsafe`, or `this.prisma.$queryRawUnsafe` in application code.
- Prefer Prisma ORM methods (`findMany`, `update`, `updateMany`, `createMany`, etc.).
- If you think raw SQL is absolutely necessary, stop and ask for explicit approval first.
