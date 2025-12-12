import { supabase } from './supabase.js';
import fs from 'fs/promises';
import path from 'path';

const GAMES_DIR = './games';

async function migrateGames() {
    console.log('Starting migration...');

    try {
        const files = await fs.readdir(GAMES_DIR);
        const jsonFiles = files.filter(file => file.endsWith('.json'));

        for (const file of jsonFiles) {
            const filePath = path.join(GAMES_DIR, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const gameData = JSON.parse(content);

            const id = path.basename(file, '.json');
            const title = gameData.title || 'Untitled Game';
            const summary = gameData.summary || '';
            const image = gameData.image || '';

            console.log(`Migrating ${file} as ID: ${id}...`);

            const { error } = await supabase
                .from('games')
                .upsert({
                    id,
                    title,
                    summary,
                    image,
                    data: gameData
                });

            if (error) {
                console.error(`Error migrating ${file}:`, error);
            } else {
                console.log(`Successfully migrated ${file}`);
            }
        }

        console.log('Migration complete!');
    } catch (err) {
        console.error('Migration failed:', err);
    }
}

migrateGames();
