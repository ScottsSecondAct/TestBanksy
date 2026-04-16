export type QuestionType =
  | 'mc'
  | 'multi_select'
  | 'true_false'
  | 'fill_blank'
  | 'short_answer'
  | 'essay'
  | 'code_listing';

export type Difficulty = 'easy' | 'medium' | 'hard';

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
}

export type ToastState = { msg: string; type: 'success' | 'error' } | null;

export type View = 'bank' | 'upload' | 'frontmatter' | 'generate';
