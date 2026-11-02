-- Add pest_agronomist role
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'pest_agronomist', 'worker'));
