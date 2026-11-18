import { supabase } from "../../config/supabase.js";

export async function listConversations(userId) {
  const { data, error } = await supabase
    .from("mentor_conversations")
    .select("id,title,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data || [];
}

export async function getConversation(userId, id) {
  const { data: conversation, error } = await supabase
    .from("mentor_conversations")
    .select("id,title,created_at")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error) throw error;

  const { data: messages, error: messageError } = await supabase
    .from("mentor_messages")
    .select("id,role,content,citations,created_at")
    .eq("conversation_id", id)
    .order("created_at");

  if (messageError) throw messageError;

  return {
    ...conversation,
    messages: messages || [],
  };
}

export async function createConversation(
  userId,
  title = "New career conversation"
) {
  const { data, error } = await supabase
    .from("mentor_conversations")
    .insert({
      user_id: userId,
      title,
    })
    .select("id,title,created_at")
    .single();

  if (error) throw error;

  return data;
}

export async function saveMessage(
  conversationId,
  role,
  content,
  citations = []
) {
  const { data, error } = await supabase
    .from("mentor_messages")
    .insert({
      conversation_id: conversationId,
      role,
      content,
      citations,
    })
    .select("id,role,content,citations,created_at")
    .single();

  if (error) throw error;

  return data;
}

export async function renameConversation(userId, id, title) {
  const { data, error } = await supabase
    .from("mentor_conversations")
    .update({
      title: String(title).trim().slice(0, 120),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id,title")
    .single();

  if (error) throw error;

  return data;
}

export async function deleteConversation(userId, id) {
  const { error } = await supabase
    .from("mentor_conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
}

/* =========================
   Mentor RAG Documents
========================= */

export async function listDocuments(userId) {
  const { data, error } = await supabase
    .from("knowledge_chunks")
    .select("id,document_id,file_name,mime_type,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const documents = new Map();
  for (const doc of data || []) {
    const documentId = doc.document_id;
    const current = documents.get(documentId);
    if (current) {
      current.chunk_count += 1;
      continue;
    }
    documents.set(documentId, {
      id: documentId,
      document_id: documentId,
      file_name: doc.file_name || "Knowledge Document",
      mime_type: doc.mime_type || "application/octet-stream",
      created_at: doc.created_at,
      chunk_count: 1,
    });
  }
  return [...documents.values()];
}

export async function deleteDocument(userId, id) {
  const { data: chunk, error: lookupError } = await supabase
    .from("knowledge_chunks")
    .select("id")
    .eq("document_id", id)
    .eq("user_id", userId)
    .single();

  if (lookupError) throw lookupError;

  const { data: document, error: documentError } = await supabase
    .from("knowledge_documents")
    .select("file_path")
    .eq("id", id)
    .single();

  if (documentError) throw documentError;

  const { error } = await supabase
    .from("knowledge_chunks")
    .delete()
    .eq("user_id", userId)
    .eq("document_id", id);

  if (error) throw error;

  const { error: deleteDocumentError } = await supabase
    .from("knowledge_documents")
    .delete()
    .eq("id", id);
  if (deleteDocumentError) throw deleteDocumentError;

  if (chunk && document?.file_path) {
    const { error: storageError } = await supabase.storage
      .from("resumes")
      .remove([document.file_path]);
    if (storageError) throw storageError;
  }
}