-- Canonical Ollama Mentor RAG contract.
create extension if not exists vector;

alter table if exists public.knowledge_chunks
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists embedding vector(768),
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists page_number integer,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_knowledge_chunks_user_document on public.knowledge_chunks(user_id, document_id);
create index if not exists idx_knowledge_chunks_embedding_ollama
  on public.knowledge_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

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