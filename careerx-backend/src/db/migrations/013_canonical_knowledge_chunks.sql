-- Repair databases that already ran an older 010 migration.
alter table if exists public.knowledge_chunks
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists embedding vector(768),
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists page_number integer,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if to_regclass('public.knowledge_embeddings') is not null then
    update public.knowledge_chunks kc
    set embedding = ke.embedding
    from public.knowledge_embeddings ke
    where ke.chunk_id = kc.id and kc.embedding is null;
  end if;
end $$;

alter table if exists public.knowledge_chunks
  drop column if exists source_id,
  drop column if exists source_type,
  drop column if exists chunk_text,
  drop column if exists metadata,
  drop column if exists token_count;

drop function if exists public.match_knowledge_chunks(vector, integer, double precision, uuid);
create or replace function public.match_knowledge_chunks(
  query_embedding vector(768), match_count integer,
  similarity_threshold double precision, filter_user_id uuid
) returns table (
  id uuid, document_id uuid, file_name text, page_number integer,
  content text, score double precision
) language sql stable as $$
  select kc.id, kc.document_id, kc.file_name, kc.page_number, kc.content,
    (1 - (kc.embedding <=> query_embedding))::double precision
  from public.knowledge_chunks kc
  where kc.embedding is not null
    and (kc.user_id is null or kc.user_id = filter_user_id)
    and 1 - (kc.embedding <=> query_embedding) >= similarity_threshold
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;

notify pgrst, 'reload schema';