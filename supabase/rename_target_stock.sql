-- Run this once in the Supabase SQL editor.
--
-- "Min Stock" becomes "Target Stock". Reorder Qty is removed as a stored
-- column entirely — once Stock on Hand exists (a later phase), reorder
-- quantity will simply be computed as Target Stock minus Stock on Hand,
-- excluding shared parts from that calculation (shared stock is pooled
-- across sites, so a single project doesn't reorder for it).

alter table project_parts rename column min_stock to target_stock;
alter table project_parts drop column reorder_qty;
