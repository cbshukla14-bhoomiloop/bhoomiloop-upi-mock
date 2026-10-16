import { migrate } from './index.js';

migrate()
  .then(() => {
    console.log('Migrations finished');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
