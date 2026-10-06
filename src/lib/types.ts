export type Role = 'reader' | 'contributor' | 'moderator' | 'admin' | 'sponsor'
export type ItemType = 'document' | 'article' | 'prompt' | 'runbook'
export type ItemStatus = 'draft' | 'pending' | 'approved' | 'overdue' | 'archived'
export type Risk = 'R1' | 'R2' | 'R3'

export interface UserInfo { id: number; name: string; email: string; role: Role }
export interface Space { id: number; name: string; description?: string | null; owner_id?: number | null; default_sensitivity_level?: 'internal' | 'restricted' }
export interface Tag { id: number; name: string; description?: string | null; kind?: TagKind; origin?: 'manual' | 'ai'; uses?: number; source?: 'manual' | 'ai'; confidence?: number | null }
export interface VersionRef { id: number; number: number; edited_by: number; edited_at: string; change_note?: string | null }

export interface ItemRow {
  id: number; type: ItemType; title: string; summary?: string | null
  space?: { id: number; name: string }; owner?: { id: number; name: string }
  risk_level: Risk; sensitivity_level: 'internal' | 'restricted'; status: ItemStatus
  trust_label?: string; freshness?: 'overdue' | 'due_soon' | 'fresh'
  effective_date?: string; next_review_date?: string; tags?: Tag[]
  current_version?: VersionRef; updated_at?: string
}
export interface Attachment {
  id: number; filename: string; filetype: string; filesize: number; content_hash?: string
  kind?: 'image' | 'document' | 'text' | 'archive'; viewable_inline?: boolean; text_source?: 'parsed' | 'ai' | null
  ai_readable?: boolean; text_extracted?: boolean; has_text?: boolean
  ingest_status?: IngestStatus; page_count?: number | null; language?: string | null; doc_type?: string | null; text_review?: TextReview
}
export interface ItemDetail extends ItemRow {
  version?: VersionRef; content?: string | null; detail?: Record<string, any> | null; attachments?: Attachment[]
}
export interface PromptVar { name: string; type?: 'string' | 'number' | 'text' | 'boolean'; description?: string; example?: string }
export interface RunbookStep { action: string; expected: string; dangerous?: boolean }

export interface Incident {
  id: number; title: string; system: string; error_group: string; detected_at: string; resolved_at?: string | null
  runbook_id?: number | null; conclusion?: string | null; mttr_minutes?: number | null
}
export interface Notice { id: number; type: string; content: string; status: 'unread' | 'read'; created_at: string }
export interface TimeLog { id: number; log_date: string; work_type: string; hours: string | number; claude_supported: boolean; notes?: string | null }
export interface Cost { id: number; cost_item: string; amount: string | number; period: string; source: string; notes?: string | null }
export interface Benchmark { id: number; batch: string; task_code: string; performer_id: number; minutes: string | number; success: boolean; notes?: string | null; measured_at: string }
export interface AdminUser { id: number; name: string; email: string; role: Role; status: 'active' | 'locked'; totp_enabled?: boolean; created_at: string }
export interface Template { id: number; name: string; content?: string | null; created_by?: number; created_at?: string }
export interface Synonym { id: number; word: string; synonym_with: string }

// ---------- Agent cá nhân hóa ----------
export type KnowledgeMode = 'documents' | 'hybrid' | 'general'
export type SkillCategoryKey = 'role' | 'style' | 'reasoning' | 'format' | 'quality' | 'task'
export interface Skill {
  id: number; slug: string; name: string; category: SkillCategoryKey; category_label?: string; description?: string | null
  instruction?: string; exclusive_group?: string | null; is_system?: boolean; is_active?: boolean
}
export interface SkillCategory { key: SkillCategoryKey; label: string; skills: Skill[] }
export interface SkillCatalog { categories: SkillCategory[]; total: number; limits: { max_skills_per_agent: number; max_custom_instructions_chars: number } }
export interface AgentPreset { key: string; name: string; description: string; knowledge_mode: KnowledgeMode; skills: { id: number; slug: string; name: string }[] }
export interface Agent {
  id: number; name: string; description?: string | null; visibility: 'private' | 'team'; knowledge_mode: KnowledgeMode; model_tier: 'default' | 'fast'
  source_policy?: SourcePolicy | null; use_memory?: boolean; memory_scope?: 'user' | 'agent'
  is_active: boolean; is_mine: boolean; owner: { id: number; name: string }; skills: { id: number; slug: string; name: string; category: SkillCategoryKey }[]
  skills_unavailable: number; custom_instructions?: string | null; created_at: string; updated_at: string
}
export interface AgentToolUse { tool: string; args?: Record<string, unknown>; ok: boolean }
export interface AgentConversation { id: number; title: string; created_at: string; updated_at: string; messages: number }
export interface AgentMessageRow {
  id: number; role: 'user' | 'assistant'; content: string; created_at: string
  meta: { tools?: AgentToolUse[]; sources?: number[]; consulted?: number[]; mode?: KnowledgeMode; cost_usd?: number; model?: string } | null
}

// ---------- Tri thức: đọc, ghi nhớ, nguồn đáng tin ----------
export type SourceTier = 'official' | 'reviewed' | 'unreviewed' | 'stale'
export type SourcePolicy = 'official' | 'reviewed' | 'all'
export type IngestStatus = 'pending' | 'processing' | 'done' | 'failed' | 'skipped'
export type TextReview = 'not_needed' | 'unreviewed' | 'verified' | 'rejected'
export interface PassageSource { kind: string; attachment_id?: number; filename?: string; filetype?: string; text_source?: string; text_review?: string; page_start?: number | null; page_end?: number | null; heading_path?: string | null }
export interface KPassage {
  chunk_id: number; item_id: number; item_title: string; item_type: string; tier: SourceTier; tier_label: string; trust_label?: string; freshness?: string; flags?: string[]
  source: PassageSource; text: string; score: number; vector_score?: number | null; lexical_score?: number | null; rerank?: number | null
}
export interface KSearchResult {
  query: string; source_policy: SourcePolicy; passages: KPassage[]
  documents: { item_id: number; title: string; type: string; tier: SourceTier; tier_label: string; trust_label?: string; passages: number; best_score: number }[]
  stats: { mode: string; embed_model?: string; candidates: number; reranked: boolean; expanded: boolean; excluded_by_policy: number; excluded_item_ids?: number[] }
  expanded_queries?: string[]
}
export interface KSource {
  attachment_id: number; filename: string; filetype: string; filesize: number
  item: { id: number; title: string; type: string; status: string; risk_level: string; is_official: boolean }
  tier: SourceTier; tier_label: string; tier_flags: string[]; ingest_status: IngestStatus; ingest_method?: string | null; ingest_error?: string | null; ingested_at?: string | null
  pages?: number | null; language?: string | null; doc_type?: string | null; text_source?: string | null; text_review: TextReview; chunks: number
}
export interface KStats {
  embed_model: string; chunks: { total: number; embedded: number; blocked_by_secrets: number; other_embedding_model: number; missing_embedding: number }
  items_indexed: number; official_items: number; attachments_by_ingest_status: Record<string, number>; attachments_by_text_review: Record<string, number>
  vector_index_size: number; worker: { enabled: boolean; running: number; waiting: number }
}
export interface IngestInfo {
  id: number; filename: string; filetype: string; ingest_status: IngestStatus; page_count?: number | null; language?: string | null; doc_type?: string | null
  text_review: TextReview; text_source?: string | null; ingest_method?: string | null; ingest_error?: string | null; ingested_at?: string | null
  chunks: number; embedded_chunks: number; blocked_chunks: number; summary?: string | null; tier: SourceTier; tier_label: string; tier_flags: string[]
  review: { text_review: string; reviewed_by: number | null; reviewed_at: string | null; note: string | null; edited_by: number | null }
  insights?: {
    entities?: { type: string; value: string }[]; key_facts?: string[]; questions?: string[]; suggested_tags?: { id: number; name: string }[]
    effective_date?: string | null; expiry_date?: string | null; quality_notes?: string[]; uncertain?: { page?: number; text: string }[]
    conflicts?: unknown[]; conflicts_checked?: number; conflicts_checked_at?: string | null; read_notes?: string[]
  } | null
}
export interface CompareResult {
  documents: { id: number; title: string; tier: SourceTier; tier_label: string; trust_label?: string; effective_date?: string | null; next_review_date?: string | null }[]
  skipped: { id?: number; item_id?: number; reason?: string; message?: string }[]
  summary: string; common_points: { point: string; item_ids: number[] }[]
  differences: { topic: string; positions: { item_id: number; statement: string }[] }[]
  conflicts: { topic: string; detail: string; item_ids: number[]; resolution?: string }[]
  gaps: string[]; recommendation?: string; note?: string; model?: string; cost_usd?: number
}

// ---------- Hỏi bằng tệp (POST /ai/ask-file): tệp chỉ là tình huống cần giải, câu trả lời lấy từ kho ----------
export interface AskFileUploaded {
  filename: string; kind: string; filetype: string; size: number; method?: string; pages?: number | null; chars?: number
  uncertain?: number; summary?: string; doc_type?: string | null; language?: string | null; preview?: string
}
export interface Discrepancy { topic: string; uploaded_says: string; source_says: string; item_id?: number | null }
export interface RelatedRef { id: number; title: string; type?: string; tier?: SourceTier; tier_label?: string; trust_label?: string; freshness?: string }
export interface AskFileInfo {
  uploaded: AskFileUploaded[]; skipped: { filename?: string; reason?: string; message?: string }[]
  need?: string; key_facts?: string[]; search_queries?: string[]; discrepancies: Discrepancy[]; related: RelatedRef[]; searched?: number[]; note?: string
}

// ---------- Trí nhớ của trợ lý (Agent memory) ----------
export type MemoryKind = 'fact' | 'preference' | 'decision' | 'task' | 'entity' | 'conversation'
export interface AiMemory {
  id: number; kind: MemoryKind; kind_label: string; text: string; importance: number; pinned: boolean; topics: string[]
  conversation_id: number | null; conversation_title?: string | null; agent_id: number | null; hits: number; last_used_at: string | null
  has_embedding: boolean; created_at: string; updated_at: string
}
export interface MemoryList { memories: AiMemory[]; by_kind: Record<string, number>; total: number; page: number; pages: number; note?: string }
export interface ConvHit {
  id: number; agent_id: number; title: string; topics: string[]; summary: string | null; updated_at: string; score: number
  matched_messages: { message_id: number; role: string; date: string; excerpt: string }[]
}
export interface AgentMemoryUse {
  enabled: boolean; history_messages: number; summary_used: boolean
  recalled: { id: number; kind: MemoryKind; text: string; conversation_id: number | null; score: number }[]
  earlier_conversations: { conversation_id: number; title: string; score: number }[]
}

// ---------- Thẻ thông minh ----------
export type TagKind = 'category' | 'topic'
export interface TagFull { id: number; name: string; description?: string | null; kind?: TagKind; origin?: 'manual' | 'ai'; uses?: number; source?: 'manual' | 'ai'; confidence?: number | null }
export interface RelatedItem {
  id: number; title: string; type: ItemType; tier: SourceTier; tier_label: string; trust_label?: string; score: number
  shared_tags: { id: number; name: string; kind: TagKind }[]; semantic_score: number | null; reasons: string[]
}
export interface TagGraph { nodes: { id: number; name: string; kind: TagKind; origin: string; items: number }[]; edges: { from: number; to: number; shared_items: number }[]; categories: number; topics: number }
