import { supabase } from './supabase.js';

async function applyMigrations() {
    console.log('Applying migrations...');

    try {
        // 1. Add room_code column
        const { error: roomCodeError } = await supabase.rpc('run_sql', {
            sql: 'alter table sessions add column if not exists room_code text;'
        });
        // Note: 'run_sql' is not a standard exposed RPC unless we created it. 
        // Standard Supabase client doesn't allow running raw SQL DDL directly from the client 
        // unless we use the Postgres connection string or have a helper function.

        // Since we don't have a 'run_sql' RPC, we likely need to rely on the user running the SQL 
        // OR we can try to use the dashboard logic. But here, we are limited.

        // HOWEVER, I can create a migration via code by just trying to select/insert and seeing if it fails? 
        // No, DDL (Alter table) is not supported via the JS client directly.

        console.log('NOTE: The JS client cannot execute "ALTER TABLE" directly.');
        console.log('Please execute the following SQL in your Supabase Dashboard -> SQL Editor:');
        console.log(`
      -- Add room_code
      alter table sessions add column if not exists room_code text;
      
      -- Add last_activity
      alter table sessions add column if not exists last_activity timestamptz default now();
      
      -- Optional: Index
      create index if not exists idx_sessions_last_activity on sessions(last_activity);
    `);

    } catch (err) {
        console.error('Migration info failed:', err);
    }
}

applyMigrations();
