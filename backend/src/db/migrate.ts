import { query } from './connection.js';

export async function runMigrations() {
  console.log('Running migrations...');

  // Create tasks table
  await query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(500) NOT NULL,
      description TEXT DEFAULT '',
      column VARCHAR(20) NOT NULL CHECK (column IN ('todo', 'in_progress', 'done')),
      position VARCHAR(50) NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Create index for efficient column + position queries
  await query(`
    CREATE INDEX IF NOT EXISTS idx_tasks_column_position
    ON tasks (column, position)
  `);

  // Create index for efficient lookups by id
  await query(`
    CREATE INDEX IF NOT EXISTS idx_tasks_id
    ON tasks (id)
  `);

  // Create function for updating updated_at
  await query(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ language 'plpgsql'
  `);

  // Create trigger for auto-updating updated_at
  await query(`
    DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks
  `);

  await query(`
    CREATE TRIGGER update_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  console.log('Migrations completed successfully!');
}

// Run directly if executed as script
if (process.argv[1]?.includes('migrate')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
