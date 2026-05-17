import { pgTable, text, timestamp, jsonb, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id:         text('id').primaryKey(), // Clerk user ID (starts with user_)
  email:      text('email').notNull(),
  plan:       text('plan').default('free'),
  createdAt:  timestamp('created_at').defaultNow(),
})

export const resumes = pgTable('resumes', {
  id:         uuid('id').primaryKey().defaultRandom(),
  userId:     text('user_id').notNull().references(() => users.id),
  name:       text('name').notNull(),   // e.g. "Software Engineer Resume"
  baseJson:   jsonb('base_json').notNull(), // NEVER mutate after creation
  createdAt:  timestamp('created_at').defaultNow(),
})

export const tailorRuns = pgTable('tailor_runs', {
  id:           uuid('id').primaryKey().defaultRandom(),
  resumeId:     uuid('resume_id').notNull().references(() => resumes.id),
  userId:       text('user_id').notNull().references(() => users.id),
  jobTitle:     text('job_title'),
  company:      text('company'),
  jdText:       text('jd_text').notNull(),
  tailoredJson: jsonb('tailored_json'),   // snapshot after user accepts
  aiEditsJson:  jsonb('ai_edits_json'),  // raw AI output
  acceptedIds:  text('accepted_ids').array(), // bullet IDs user accepted
  modelUsed:    text('model_used'),
  status:       text('status').default('applied'), // V2 tracker
  downloadedAt: timestamp('downloaded_at'),
  createdAt:    timestamp('created_at').defaultNow(),
})