-- Work orders: the operator may add application rows and mixture rows while filling in
-- an issued order (e.g. the issued pesticide ran short). Those rows are marked so the
-- pest agronomist can check them, and only they may be removed by the operator.

ALTER TABLE spray_work_order_items
  ADD COLUMN IF NOT EXISTS added_by_operator BOOLEAN NOT NULL DEFAULT false;
