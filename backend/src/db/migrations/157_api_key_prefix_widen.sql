-- Display prefix is almaha_ plus 8 hex chars (15). Original VARCHAR(12) overflows on INSERT.
ALTER TABLE api_keys
  ALTER COLUMN key_prefix TYPE VARCHAR(32);
