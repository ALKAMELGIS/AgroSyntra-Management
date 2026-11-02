const { Pool } = require('pg');

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/set-ceo.js <email>');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.query("UPDATE users SET role = 'ceo' WHERE email = $1", [email.toLowerCase()])
  .then(r => {
    if (r.rowCount > 0) {
      console.log(`✓ Updated ${email} to CEO role`);
    } else {
      console.log(`✗ No user found with email: ${email}`);
    }
  })
  .catch(e => console.error('Error:', e.message))
  .finally(() => pool.end());
