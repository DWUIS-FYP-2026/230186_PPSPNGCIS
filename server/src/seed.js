require('dotenv').config();
const { seedIfEmpty } = require('./db-sync');

seedIfEmpty(true)
  .then((result) => {
    console.log(result.message);
    if (result.counts) console.log('Counts:', result.counts);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exit(1);
  });
