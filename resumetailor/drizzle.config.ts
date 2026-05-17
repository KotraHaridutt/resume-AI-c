import type { Config } from 'drizzle-kit'

export default {
  dialect: 'postgresql',
  schema: './src/DB/schema.ts',
  out:    './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config