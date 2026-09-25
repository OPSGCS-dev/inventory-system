-- Run this once in the Supabase SQL editor (Project Settings > SQL Editor > New query)
--
-- Replaces the 3-way requirement_type ('project'/'flops'/'shared') with a
-- single boolean: shared = true means this project's need can be met from
-- its own stock, another project's stock, or FLOPS (pooled). shared = false
-- means only that project's own physical stock counts.

alter table project_parts add column shared boolean not null default false;

update project_parts
set shared = (requirement_type in ('flops', 'shared'));

alter table project_parts drop column requirement_type;
