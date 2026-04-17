export type QuestionType =
  | 'mc'
  | 'multi_select'
  | 'true_false'
  | 'fill_blank'
  | 'short_answer'
  | 'essay'
  | 'code_listing';

export type Difficulty = 'easy' | 'medium' | 'hard';

export type BloomLevel =
  | 'remember'
  | 'understand'
  | 'apply'
  | 'analyze'
  | 'evaluate'
  | 'create';

export interface Choice {
  letter: string;
  text: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  stem: string;
  choices: Choice[];
  correct_answer: string;
  blanks: string[];
  code_block: string;
  code_language: string;
  essay_lines: number;
  points: number;
  topic: string;
  difficulty: Difficulty;
  lecture: string;
  source: string;
  semester: string;
  number: number;
  tags: string[];
  added: string;
  notes: string;
  flagged: boolean;
  bloom: BloomLevel | '';
  objectives: string[];
  empirical_difficulty: number | null;
}

/** A question being composed — no server-assigned fields yet. */
export type DraftQuestion = Omit<Question, 'id' | 'added' | 'number'>;

export interface Snippet {
  id: string;
  title: string;
  category: string;
  markdown: string;
  created: string;
}

export interface Stats {
  total: number;
  types: Record<string, number>;
  difficulties: Record<string, number>;
  topics: string[];
  sources: string[];
  lectures: string[];
}

export interface PdfConfig {
  title: string;
  course: string;
  date: string;
  instructions: string;
  show_points: boolean;
  shuffle_choices: boolean;
  generate_key: boolean;
  front_matter_own_page: boolean;
  filename: string;
}

export interface Filters {
  search: string;
  topic: string;
  difficulty: string;
  source: string;
  lecture: string;
  type: string;
  answered: '' | 'yes' | 'no';
  flagged: '' | 'yes' | 'no';
  bloom: string;
}

export type ToastState = { msg: string; type: 'success' | 'error' } | null;

export type View = 'bank' | 'upload' | 'frontmatter' | 'generate' | 'stats';

export interface BankInfo {
  id: string;
  name: string;
  created: string;
  question_count: number;
}

export interface ExamRecord {
  id: string;
  title: string;
  question_ids: string[];
  config: Partial<PdfConfig>;
  created: string;
}

export interface DuplicateMatch {
  score: number;
  question: Question;
}

export interface DuplicatePair {
  score: number;
  a: Question;
  b: Question;
}

export interface ExamTemplate {
  id: string;
  name: string;
  config: Partial<PdfConfig>;
  front_matter: string;
  created: string;
}

export interface SmartCollection {
  id: string;
  name: string;
  filters: Filters;
}

export interface UndoEntry {
  action: 'delete' | 'bulk_delete';
  questions: Question[];
  label: string;
}
