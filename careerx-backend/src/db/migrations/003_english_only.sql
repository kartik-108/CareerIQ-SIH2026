-- Remove legacy multilingual storage from existing deployments.
alter table if exists knowledge_documents drop column if exists language;
