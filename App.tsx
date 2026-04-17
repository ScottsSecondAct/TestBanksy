import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { apiFetch, apiBlob } from './api';
import {
  useTheme, Badge, Btn, Inp, Sel, Chk, Field, MdPreview, TextArea,
  DIFFS, SNIPPET_CATS, BLOOMS,
} from './ui';
import QuestionRow from './QuestionRow';
import QuestionComposer from './QuestionComposer';
import SnippetEditor from './SnippetEditor';
import type {
  Question, DraftQuestion, Snippet, Stats, PdfConfig,
  Filters, ToastState, View, QuestionType, DuplicatePair, ExamRecord, BankInfo,
  ExamTemplate, SmartCollection, UndoEntry,
} from './types';

type BooleanPdfKey = 'show_points' | 'shuffle_choices' | 'generate_key' | 'front_matter_own_page';

const PDF_TOGGLES: [BooleanPdfKey, string, string][] = [
  ['show_points',           'Show point values',      ''],
  ['shuffle_choices',       'Shuffle MC choices',     'Randomizes A/B/C/D order'],
  ['generate_key',          'Generate answer key',    'Appended as last page'],
  ['front_matter_own_page', 'Front matter on own page', ''],
];

const EMPTY_FILTERS: Filters = {
  search: '', topic: '', difficulty: '', source: '', lecture: '',
  type: '', answered: '', flagged: '', bloom: '',
};

export default function App() {
  const { C, TYPES, TYPE_MAP, isDark, toggleTheme } = useTheme();
  const [view, setView] = useState<View>('bank');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [backendUp, setBackendUp] = useState<boolean | null>(null);

  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [editSnippetId, setEditSnippetId] = useState<string | null>(null);
  const [newSnippet, setNewSnippet] = useState<Pick<Snippet, 'title' | 'category' | 'markdown'>>({
    title: '', category: 'reference', markdown: '',
  });
  const [frontMatter, setFrontMatter] = useState('');
  const [fmPreview, setFmPreview] = useState(false);

  const [dupScan, setDupScan] = useState<DuplicatePair[] | null>(null);
  const [dupScanLoading, setDupScanLoading] = useState(false);

  const [exams, setExams] = useState<ExamRecord[]>([]);
  const [saveToArchive, setSaveToArchive] = useState(true);
  const [archiveName, setArchiveName] = useState('');

  const [banks, setBanks] = useState<BankInfo[]>([]);
  const [activeBankId, setActiveBankId] = useState('');
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [newBankName, setNewBankName] = useState('');

  type StagedImport = { questions: Question[]; source: string };
  const [stagedImport, setStagedImport] = useState<StagedImport | null>(null);
  const [stagedSel, setStagedSel] = useState<Set<number>>(new Set());
  const [dupDeleteSet, setDupDeleteSet] = useState<Set<string>>(new Set());

  // ── New feature state ──────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<ExamTemplate[]>([]);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [collections, setCollections] = useState<SmartCollection[]>([]);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkFields, setBulkFields] = useState<Partial<Question>>({});
  const [variants, setVariants] = useState(2);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [showBalance, setShowBalance] = useState(false);
  const [calibrateLoading, setCalibrateLoading] = useState(false);
  const calibrateRef = useRef<HTMLInputElement>(null);

  const [pdfConfig, setPdfConfig] = useState<PdfConfig>({
    title: 'CSc 35 - Computer Architecture', course: 'Exam', date: '',
    instructions: 'Show all work. Write clearly.',
    show_points: true, shuffle_choices: false, generate_key: false,
    front_matter_own_page: true,
    filename: 'exam.pdf',
  });

  // ── Toast ──────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const [qs, st, h, sn, exs, bks, tmpls] = await Promise.all([
        apiFetch<Question[]>('/questions'),
        apiFetch<Stats>('/stats'),
        apiFetch<{ status: string }>('/health'),
        apiFetch<Snippet[]>('/snippets'),
        apiFetch<ExamRecord[]>('/exams'),
        apiFetch<{ banks: BankInfo[]; active: string }>('/banks'),
        apiFetch<ExamTemplate[]>('/templates'),
      ]);
      setQuestions(qs);
      setStats(st);
      setSnippets(sn);
      setExams(exs);
      setBanks(bks.banks);
      setActiveBankId(bks.active);
      setBackendUp(!!h);
      setTemplates(tmpls);
    } catch {
      setBackendUp(false);
    }
  }, []);

  const switchBank = async (id: string) => {
    await apiFetch('/banks/active', { method: 'PUT', body: JSON.stringify({ id }) });
    setBankPickerOpen(false);
    setSelected(new Set());
    setEditingId(null);
    setComposing(false);
    setStagedImport(null);
    setStagedSel(new Set());
    setFilters({ ...EMPTY_FILTERS });
    setUndoStack([]);
    void refresh();
  };

  const createBank = async () => {
    const name = newBankName.trim();
    if (!name) return;
    const b = await apiFetch<BankInfo>('/banks', { method: 'POST', body: JSON.stringify({ name }) });
    setNewBankName('');
    await switchBank(b.id);
  };

  useEffect(() => { void refresh(); }, [refresh]);

  // Load saved collections from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('testbank-collections');
      if (saved) setCollections(JSON.parse(saved) as SmartCollection[]);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!bankPickerOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-bank-picker]')) setBankPickerOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [bankPickerOpen]);

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => questions.filter(q => {
    const f = filters;
    if (f.search) {
      // Support /regex/ syntax
      const m = f.search.match(/^\/(.+)\/([gimsuy]*)$/);
      if (m) {
        try {
          const re = new RegExp(m[1], m[2] || 'i');
          if (!re.test(q.stem) && !re.test(q.topic) && !re.test(q.code_block) && !re.test(q.notes || ''))
            return false;
        } catch {
          /* fall through to literal */
        }
      } else {
        const s = f.search.toLowerCase();
        if (!q.stem.toLowerCase().includes(s)
          && !q.topic.toLowerCase().includes(s)
          && !q.code_block.toLowerCase().includes(s)
          && !(q.notes || '').toLowerCase().includes(s)) return false;
      }
    }
    if (f.type && q.type !== f.type) return false;
    if (f.topic && q.topic !== f.topic) return false;
    if (f.difficulty && q.difficulty !== f.difficulty) return false;
    if (f.source && q.source !== f.source) return false;
    if (f.lecture && q.lecture !== f.lecture) return false;
    if (f.answered === 'yes' && !q.correct_answer) return false;
    if (f.answered === 'no' && !!q.correct_answer) return false;
    if (f.flagged === 'yes' && !q.flagged) return false;
    if (f.flagged === 'no' && !!q.flagged) return false;
    if (f.bloom && q.bloom !== f.bloom) return false;
    return true;
  }), [questions, filters]);

  const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))].sort();
  const allTopics   = uniq(questions.map(q => q.topic));
  const allSources  = uniq(questions.map(q => q.source));
  const allLectures = uniq(questions.map(q => q.lecture));

  const usageMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    exams.forEach(e => e.question_ids.forEach(id => { (map[id] ??= []).push(e.title); }));
    return map;
  }, [exams]);

  const toggleAll = useCallback(() => {
    const all = filtered.every(q => selected.has(q.id));
    setSelected(s => {
      const ns = new Set(s);
      filtered.forEach(q => (all ? ns.delete(q.id) : ns.add(q.id)));
      return ns;
    });
  }, [filtered, selected]);

  const selQs = questions.filter(q => selected.has(q.id));
  const selTypes: Record<string, number> = {};
  selQs.forEach(q => { selTypes[q.type] = (selTypes[q.type] || 0) + 1; });

  // ── Exam Balance Report ────────────────────────────────────────────────────
  const balanceReport = useMemo(() => {
    if (selQs.length === 0) return null;
    const byTopic: Record<string, number> = {};
    const byDiff: Record<string, number> = {};
    const byBloom: Record<string, number> = {};
    const totalPts = selQs.reduce((s, q) => s + (q.points || 0), 0);
    selQs.forEach(q => {
      const t = q.topic || 'No Topic';
      byTopic[t] = (byTopic[t] || 0) + 1;
      byDiff[q.difficulty || 'unset'] = (byDiff[q.difficulty || 'unset'] || 0) + 1;
      if (q.bloom) byBloom[q.bloom] = (byBloom[q.bloom] || 0) + 1;
    });
    const noAnswer = selQs.filter(q => !q.correct_answer).length;
    const flaggedCount = selQs.filter(q => q.flagged).length;
    return { byTopic, byDiff, byBloom, totalPts, noAnswer, flaggedCount, total: selQs.length };
  }, [selQs]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && view === 'bank') {
        setComposing(true);
      }
      if (e.key === 'Escape') {
        setComposing(false);
        setEditingId(null);
        setBulkEditOpen(false);
        setDupScan(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        void undoLast();
      }
      if (e.key === 'a' && !e.ctrlKey && !e.metaKey && view === 'bank') {
        e.preventDefault();
        toggleAll();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [view, undoStack, toggleAll]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Undo ───────────────────────────────────────────────────────────────────
  const undoLast = useCallback(async () => {
    const top = undoStack[undoStack.length - 1];
    if (!top) return;
    try {
      await Promise.all(top.questions.map(q =>
        apiFetch('/questions', { method: 'POST', body: JSON.stringify({ ...q, force: true }) }),
      ));
      setUndoStack(s => s.slice(0, -1));
      void refresh();
      showToast(`Restored ${top.questions.length} question${top.questions.length > 1 ? 's' : ''}`);
    } catch {
      showToast('Restore failed', 'error');
    }
  }, [undoStack, refresh, showToast]);

  // ── Upload ─────────────────────────────────────────────────────────────────
  const [importTab, setImportTab] = useState<'docx' | 'markdown' | 'answerkey' | 'calibrate'>('docx');
  const [uploadSource, setUploadSource] = useState('');
  const [mdText, setMdText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const keyFileRef = useRef<HTMLInputElement>(null);
  const [fuzzyKey, setFuzzyKey] = useState(false);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return showToast('Select a .docx file', 'error');
    setLoading(true);
    const source = uploadSource || file.name;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('source', source);
    fd.append('dry_run', 'true');
    try {
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      const d = await r.json() as { error?: string; questions: Question[]; questions_parsed: number };
      if (d.error) throw new Error(d.error);
      if (fileRef.current) fileRef.current.value = '';
      setStagedImport({ questions: d.questions, source });
      setStagedSel(new Set(d.questions.map((_, i) => i)));
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
    setLoading(false);
  };

  const handleMarkdownImport = async () => {
    if (!mdText.trim()) return showToast('Paste some markdown first', 'error');
    setLoading(true);
    const source = uploadSource || 'Markdown Import';
    try {
      const d = await apiFetch<{ questions: Question[]; questions_parsed: number }>(
        '/upload-markdown',
        { method: 'POST', body: JSON.stringify({ markdown: mdText, source, dry_run: true }) },
      );
      setStagedImport({ questions: d.questions, source });
      setStagedSel(new Set(d.questions.map((_, i) => i)));
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
    setLoading(false);
  };

  const commitImport = async () => {
    if (!stagedImport) return;
    const toImport = stagedImport.questions.filter((_, i) => stagedSel.has(i));
    if (toImport.length === 0) return showToast('No questions selected', 'error');
    setLoading(true);
    try {
      await apiFetch('/commit-import', { method: 'POST', body: JSON.stringify({ questions: toImport }) });
      showToast(`Imported ${toImport.length} question${toImport.length !== 1 ? 's' : ''}`);
      setStagedImport(null);
      setStagedSel(new Set());
      setMdText('');
      setUploadSource('');
      void refresh();
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
    setLoading(false);
  };

  const handleAnswerKeyUpload = async () => {
    const file = keyFileRef.current?.files?.[0];
    if (!file) return showToast('Select an answer key file', 'error');
    setLoading(true);
    const fd = new FormData();
    fd.append('file', file);
    if (uploadSource) fd.append('source', uploadSource);
    if (fuzzyKey) fd.append('fuzzy', 'true');
    try {
      const d = await apiFetch<{ questions_updated: number; key_entries: number; unmatched_count?: number; mode?: string }>(
        '/upload-answer-key', { method: 'POST', body: fd },
      );
      const unmatchedNote = d.unmatched_count ? `, ${d.unmatched_count} unmatched` : '';
      showToast(`Updated ${d.questions_updated} question${d.questions_updated !== 1 ? 's' : ''} from ${d.key_entries}-entry key${unmatchedNote}`);
      void refresh();
      if (keyFileRef.current) keyFileRef.current.value = '';
      setUploadSource('');
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
    setLoading(false);
  };

  const handleCalibrate = async () => {
    const file = calibrateRef.current?.files?.[0];
    if (!file) return showToast('Select a CSV file', 'error');
    setCalibrateLoading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch('/api/calibrate', { method: 'POST', body: fd });
      const d = await r.json() as { updated: number; entries: number; error?: string };
      if (d.error) throw new Error(d.error);
      showToast(`Updated ${d.updated} questions from ${d.entries} entries`);
      void refresh();
      if (calibrateRef.current) calibrateRef.current.value = '';
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
    setCalibrateLoading(false);
  };

  // ── Question CRUD ──────────────────────────────────────────────────────────
  const updateQ = async (id: string, data: Partial<Question>) => {
    try {
      await apiFetch<Question>(`/questions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      setQuestions(qs => qs.map(q => q.id === id ? { ...q, ...data } : q));
    } catch {
      showToast('Update failed', 'error');
    }
  };

  const deleteQ = async (id: string) => {
    const q = questions.find(x => x.id === id);
    await apiFetch(`/questions/${id}`, { method: 'DELETE' });
    setQuestions(qs => qs.filter(q => q.id !== id));
    setSelected(s => { const ns = new Set(s); ns.delete(id); return ns; });
    if (q) setUndoStack(s => [...s.slice(-9), { action: 'delete', questions: [q], label: q.stem.slice(0, 60) }]);
    void refresh();
  };

  const createQ = async (data: DraftQuestion, force = false) => {
    try {
      const body = force ? { ...data, force: true } : data;
      const res = await apiFetch<Question>('/questions', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setQuestions(qs => [res, ...qs]);
      setComposing(false);
      setEditingId(res.id);
      showToast('Question created');
      void refresh();
    } catch {
      showToast('Create failed', 'error');
    }
  };

  // ── Bulk Edit ──────────────────────────────────────────────────────────────
  const bulkUpdate = async () => {
    if (selected.size === 0 || Object.keys(bulkFields).length === 0) return;
    try {
      await apiFetch('/questions/bulk-update', {
        method: 'POST',
        body: JSON.stringify({ ids: [...selected], fields: bulkFields }),
      });
      setQuestions(qs => qs.map(q => selected.has(q.id) ? { ...q, ...bulkFields } : q));
      showToast(`Updated ${selected.size} questions`);
      setBulkEditOpen(false);
      setBulkFields({});
    } catch {
      showToast('Bulk update failed', 'error');
    }
  };

  // ── Duplicate scan ─────────────────────────────────────────────────────────
  const scanDuplicates = async () => {
    setDupScanLoading(true);
    setDupDeleteSet(new Set());
    try {
      const res = await apiFetch<{ pairs: DuplicatePair[] }>('/duplicates');
      setDupScan(res.pairs);
    } catch {
      showToast('Scan failed', 'error');
    }
    setDupScanLoading(false);
  };

  const toggleDupDelete = (id: string) =>
    setDupDeleteSet(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const selectDupsByAge = (keep: 'newer' | 'older') => {
    if (!dupScan) return;
    const toDelete = new Set<string>();
    dupScan.forEach(({ a, b }) => {
      const aTime = new Date(a.added ?? 0).getTime();
      const bTime = new Date(b.added ?? 0).getTime();
      if (keep === 'newer') toDelete.add(aTime <= bTime ? a.id : b.id);
      else                  toDelete.add(aTime >= bTime ? a.id : b.id);
    });
    setDupDeleteSet(toDelete);
  };

  const bulkDeleteDups = async () => {
    const ids = [...dupDeleteSet];
    if (ids.length === 0) return;
    const removed = questions.filter(q => dupDeleteSet.has(q.id));
    try {
      await apiFetch('/questions/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
    } catch (e) {
      showToast((e as Error).message, 'error');
      return;
    }
    setQuestions(qs => qs.filter(q => !dupDeleteSet.has(q.id)));
    setSelected(s => { const n = new Set(s); ids.forEach(id => n.delete(id)); return n; });
    const remaining = dupScan?.filter(p => !dupDeleteSet.has(p.a.id) && !dupDeleteSet.has(p.b.id)) ?? [];
    setDupScan(remaining.length > 0 ? remaining : null);
    setDupDeleteSet(new Set());
    if (removed.length > 0)
      setUndoStack(s => [...s.slice(-9), { action: 'bulk_delete', questions: removed, label: `${removed.length} duplicates` }]);
    showToast(`Deleted ${ids.length} question${ids.length > 1 ? 's' : ''}`);
    void refresh();
  };

  // ── Snippet CRUD ───────────────────────────────────────────────────────────
  const saveSnippet = async (data: Pick<Snippet, 'title' | 'category' | 'markdown'>) => {
    try {
      const res = await apiFetch<Snippet>('/snippets', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setSnippets(s => [...s, res]);
      showToast('Snippet saved');
    } catch {
      showToast('Save failed', 'error');
    }
  };

  const updateSnippet = async (id: string, data: Partial<Snippet>) => {
    try {
      const res = await apiFetch<Snippet>(`/snippets/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      setSnippets(ss => ss.map(s => s.id === id ? { ...s, ...res } : s));
    } catch {
      showToast('Update failed', 'error');
    }
  };

  const deleteSnippet = async (id: string) => {
    await apiFetch(`/snippets/${id}`, { method: 'DELETE' });
    setSnippets(ss => ss.filter(s => s.id !== id));
    showToast('Snippet deleted');
  };

  const insertSnippet = (snippet: Snippet) => {
    const sep = frontMatter ? '\n\n' : '';
    setFrontMatter(fm => fm + sep + snippet.markdown);
    showToast(`Inserted "${snippet.title}"`);
  };

  // ── PDF generation ─────────────────────────────────────────────────────────
  const _buildPdfBlob = () => apiBlob('/generate-pdf', {
    method: 'POST',
    body: JSON.stringify({ question_ids: [...selected], config: { ...pdfConfig, front_matter: frontMatter } }),
  });

  const previewPdf = async () => {
    if (selected.size === 0) return showToast('Select questions first', 'error');
    setLoading(true);
    try {
      const blob = await _buildPdfBlob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
    setLoading(false);
  };

  const generatePdf = async () => {
    if (selected.size === 0) return showToast('Select questions first', 'error');
    setLoading(true);
    try {
      const blob = await _buildPdfBlob();
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: pdfConfig.filename }).click();
      URL.revokeObjectURL(url);
      if (saveToArchive) {
        const title = (archiveName.trim() || pdfConfig.title || 'Untitled Exam');
        const saved = await apiFetch<ExamRecord>('/exams', {
          method: 'POST',
          body: JSON.stringify({ title, question_ids: [...selected], config: pdfConfig }),
        });
        setExams(es => [saved, ...es]);
        showToast(`PDF downloaded & archived as "${title}"`);
      } else {
        showToast('PDF downloaded!');
      }
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
    setLoading(false);
  };

  const generateVariants = async () => {
    if (selected.size === 0) return showToast('Select questions first', 'error');
    setLoading(true);
    try {
      const blob = await apiBlob('/generate-pdf-variants', {
        method: 'POST',
        body: JSON.stringify({
          question_ids: [...selected],
          config: { ...pdfConfig, front_matter: frontMatter },
          variants,
          shuffle_questions: shuffleQuestions,
        }),
      });
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: 'exam_variants.zip' }).click();
      URL.revokeObjectURL(url);
      showToast(`${variants} variants + answer key downloaded as zip`);
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
    setLoading(false);
  };

  const exportCsv = () => { window.location.href = '/api/export-csv'; };

  const exportQti = async () => {
    if (selected.size === 0) return showToast('Select questions first', 'error');
    setLoading(true);
    try {
      const blob = await apiBlob('/export-qti', {
        method: 'POST',
        body: JSON.stringify({ question_ids: [...selected] }),
      });
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: 'questions_qti.zip' }).click();
      URL.revokeObjectURL(url);
      showToast('QTI package downloaded');
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
    setLoading(false);
  };

  // ── Exam Templates ─────────────────────────────────────────────────────────
  const saveTemplate = async () => {
    const name = saveTemplateName.trim();
    if (!name) return showToast('Enter a template name', 'error');
    try {
      const tmpl = await apiFetch<ExamTemplate>('/templates', {
        method: 'POST',
        body: JSON.stringify({ name, config: pdfConfig, front_matter: frontMatter }),
      });
      setTemplates(ts => [...ts, tmpl]);
      setSaveTemplateName('');
      showToast(`Template "${name}" saved`);
    } catch {
      showToast('Save failed', 'error');
    }
  };

  const applyTemplate = (tmpl: ExamTemplate) => {
    if (tmpl.config) setPdfConfig(c => ({ ...c, ...tmpl.config }));
    if (tmpl.front_matter) setFrontMatter(tmpl.front_matter);
    showToast(`Applied "${tmpl.name}"`);
  };

  const deleteTemplate = async (id: string) => {
    await apiFetch(`/templates/${id}`, { method: 'DELETE' });
    setTemplates(ts => ts.filter(t => t.id !== id));
  };

  // ── Smart Collections ──────────────────────────────────────────────────────
  const saveCollection = () => {
    const name = newCollectionName.trim();
    if (!name) return;
    const c: SmartCollection = {
      id: crypto.randomUUID(),
      name,
      filters: { ...filters },
    };
    const next = [...collections, c];
    setCollections(next);
    localStorage.setItem('testbank-collections', JSON.stringify(next));
    setNewCollectionName('');
    showToast(`Collection "${name}" saved`);
  };

  const applyCollection = (c: SmartCollection) => {
    setFilters(c.filters);
    showToast(`Applied "${c.name}"`);
  };

  const deleteCollection = (id: string) => {
    const next = collections.filter(c => c.id !== id);
    setCollections(next);
    localStorage.setItem('testbank-collections', JSON.stringify(next));
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: '100vh', paddingBottom: 36 }}>
      {/* Status bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999,
        height: 30, display: 'flex', alignItems: 'center', gap: 14,
        padding: '0 16px',
        background: C.surface, borderTop: `1px solid ${C.border}`,
        fontSize: 11.5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: backendUp === false ? C.danger : backendUp === true ? C.success : C.textDim,
          }} />
          <span style={{ color: C.textMuted }}>
            {backendUp === false ? 'Backend offline' : backendUp === true ? 'Backend connected' : 'Connecting…'}
          </span>
        </div>

        <span style={{ color: C.borderSubtle }}>│</span>

        <span style={{
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: toast
            ? toast.type === 'error' ? C.danger : C.success
            : C.textDim,
          fontWeight: toast ? 600 : 400,
          transition: 'color .2s',
        }}>
          {toast ? (toast.type === 'error' ? '✕ ' : '✓ ') + toast.msg : 'Ready'}
        </span>

        <span style={{ color: C.borderSubtle }}>│</span>

        {undoStack.length > 0 && (
          <>
            <Btn sm v="ghost" onClick={() => void undoLast()}
              title="Ctrl+Z"
              style={{ padding: '2px 8px', fontSize: 11 }}>
              ↩ Undo
            </Btn>
            <span style={{ color: C.borderSubtle }}>│</span>
          </>
        )}

        <span style={{ color: C.textMuted, flexShrink: 0 }}>
          {questions.length} questions
          {selected.size > 0 && <> · <span style={{ color: C.accent, fontWeight: 600 }}>{selected.size} selected</span></>}
          {loading && <> · <span style={{ color: C.warn }}>working…</span></>}
        </span>
      </div>

      {/* Header */}
      <header style={{
        padding: '14px 28px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: C.surface,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9, background: C.accentBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
          }}>📝</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: -0.4 }}>
              Test Banksy
            </h1>
            <p style={{ margin: 0, fontSize: 10.5, color: C.textMuted }}>
              {questions.length} questions · {selected.size} selected
            </p>
          </div>

          {/* Bank switcher */}
          <div data-bank-picker style={{ position: 'relative', marginLeft: 8 }}>
            <button onClick={() => setBankPickerOpen(o => !o)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 7, cursor: 'pointer',
              background: C.accentBg, border: `1px solid ${C.accent}40`,
              color: C.accent, fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
            }}>
              {banks.find(b => b.id === activeBankId)?.name || activeBankId}
              <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
            </button>

            {bankPickerOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200,
                minWidth: 240, background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.18)', padding: 8,
              }}>
                <p style={{ fontSize: 10, fontWeight: 650, color: C.textMuted, margin: '0 0 6px 4px', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Test Banks
                </p>
                {banks.map(b => (
                  <div key={b.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 8px', borderRadius: 7, marginBottom: 2,
                    background: b.id === activeBankId ? C.accentBg : 'transparent',
                    border: `1px solid ${b.id === activeBankId ? C.accent + '40' : 'transparent'}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: b.id === activeBankId ? C.accent : C.text }}>
                        {b.name}
                      </div>
                      <div style={{ fontSize: 10.5, color: C.textMuted }}>{b.question_count} questions</div>
                    </div>
                    {b.id !== activeBankId && (
                      <Btn sm v="ghost" onClick={() => void switchBank(b.id)}>Switch</Btn>
                    )}
                    {b.id === activeBankId && (
                      <span style={{ fontSize: 10, color: C.accent, fontWeight: 700 }}>Active</span>
                    )}
                    {b.id !== activeBankId && (
                      <Btn sm v="danger" onClick={async () => {
                        await apiFetch(`/banks/${b.id}`, { method: 'DELETE' });
                        void refresh();
                      }}>Del</Btn>
                    )}
                  </div>
                ))}
                <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 8 }}>
                  <p style={{ fontSize: 10, fontWeight: 650, color: C.textMuted, margin: '0 0 6px 4px', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    New Bank
                  </p>
                  <div style={{ display: 'flex', gap: 5 }}>
                    <input
                      value={newBankName}
                      onChange={e => setNewBankName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && void createBank()}
                      placeholder="Bank name…"
                      style={{
                        flex: 1, padding: '6px 8px', borderRadius: 6, fontSize: 12,
                        background: C.bg, border: `1px solid ${C.border}`,
                        color: C.text, outline: 'none',
                      }}
                    />
                    <Btn sm v="primary" onClick={() => void createBank()} disabled={!newBankName.trim()}>
                      Create
                    </Btn>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <nav style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {([
            ['bank', 'Question Bank'],
            ['upload', 'Import'],
            ['frontmatter', 'Front Matter'],
            ['generate', 'Generate Exam'],
            ['stats', 'Stats'],
          ] as [View, string][]).map(([k, l]) => (
            <Btn key={k} v={view === k ? 'primary' : 'ghost'} onClick={() => setView(k)}>{l}</Btn>
          ))}
          <button onClick={toggleTheme} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'} style={{
            marginLeft: 6, padding: '5px 9px', borderRadius: 7, border: `1px solid ${C.border}`,
            background: C.surface2, color: C.textMuted, cursor: 'pointer', fontSize: 14,
            fontFamily: 'inherit', transition: 'all .12s',
          }}>{isDark ? '☀️' : '🌙'}</button>
        </nav>
      </header>

      {/* Backend offline banner */}
      {backendUp === false && (
        <div style={{
          padding: '8px 28px', background: C.dangerBg, color: C.danger, fontSize: 12,
          display: 'flex', alignItems: 'center', gap: 8,
          borderBottom: `1px solid ${C.danger}30`,
        }}>
          Backend offline — start with:{' '}
          <code style={{
            background: C.surface2, padding: '1px 7px', borderRadius: 4,
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
          }}>.venv/bin/python app.py</code>
        </div>
      )}

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 28px' }}>

        {/* ═══════════ IMPORT VIEW ═══════════ */}
        {view === 'upload' && (
          <div style={{ maxWidth: 580 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Import Exam</h2>

            {/* ── Staging panel ── */}
            {stagedImport && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>
                    {stagedImport.questions.length} questions parsed from "{stagedImport.source}"
                  </span>
                  <Btn sm v="ghost" onClick={() => {
                    const all = stagedSel.size === stagedImport.questions.length;
                    setStagedSel(all ? new Set() : new Set(stagedImport.questions.map((_, i) => i)));
                  }}>
                    {stagedSel.size === stagedImport.questions.length ? 'Deselect All' : 'Select All'}
                  </Btn>
                  <Btn v="primary" onClick={() => void commitImport()} disabled={loading || stagedSel.size === 0}>
                    {loading ? 'Importing…' : `Import ${stagedSel.size} Selected`}
                  </Btn>
                  <Btn v="ghost" onClick={() => { setStagedImport(null); setStagedSel(new Set()); }}>Cancel</Btn>
                </div>

                <div style={{ border: `1px solid ${C.border}`, borderRadius: 9, overflow: 'hidden' }}>
                  {stagedImport.questions.map((q, i) => {
                    const T = TYPE_MAP[q.type] || TYPES[3];
                    const checked = stagedSel.has(i);
                    return (
                      <div key={i} onClick={() => setStagedSel(s => {
                        const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n;
                      })} style={{
                        padding: '10px 14px', cursor: 'pointer',
                        background: checked ? C.accentBg : i % 2 === 0 ? C.surface : 'transparent',
                        borderBottom: `1px solid ${C.border}`,
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                      }}>
                        <Chk checked={checked} onChange={() => {}} style={{ marginTop: 2, pointerEvents: 'none' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, color: C.text, marginBottom: 4 }}>
                            {q.stem.slice(0, 160)}{q.stem.length > 160 ? '…' : ''}
                          </div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            <Badge color={T.color}>{T.icon} {T.label}</Badge>
                            {q.correct_answer && <Badge color={C.success}>✓ {q.correct_answer}</Badge>}
                            {q.points > 0 && <Badge color={C.warn}>{q.points} pts</Badge>}
                            {q.topic && <Badge color={C.accent}>{q.topic}</Badge>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Normal import form ── */}
            {!stagedImport && <>

            {/* Tab toggle */}
            <div style={{
              display: 'flex', marginBottom: 20, borderRadius: 9,
              background: C.surface, border: `1px solid ${C.border}`, padding: 4, gap: 4,
            }}>
              {([
                ['docx',      '📄 Upload .docx'],
                ['markdown',  '📝 Paste Markdown'],
                ['answerkey', '🗝 Answer Key'],
                ['calibrate', '📊 Calibrate'],
              ] as const).map(([tab, label]) => (
                <button key={tab} onClick={() => setImportTab(tab)} style={{
                  flex: 1, padding: '7px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, fontFamily: 'inherit', transition: 'all .12s',
                  background: importTab === tab ? C.accent : 'transparent',
                  color: importTab === tab ? '#fff' : C.textMuted,
                }}>
                  {label}
                </button>
              ))}
            </div>

            {importTab === 'docx' && (
              <>
                <p style={{ color: C.textMuted, fontSize: 12.5, marginBottom: 18 }}>
                  Upload a .docx exam. Pandoc converts it to markdown, then the parser
                  auto-detects question types.
                </p>
                <div style={{
                  padding: 28, borderRadius: 11, border: `2px dashed ${C.border}`,
                  background: C.surface, marginBottom: 18, textAlign: 'center',
                }}>
                  <input ref={fileRef} type="file" accept=".docx"
                    style={{ color: C.textMuted, fontSize: 12.5 }} />
                </div>
                <Field label="Source / Semester Label" style={{ marginBottom: 18 }}>
                  <Inp placeholder="e.g. Fall 2024 Midterm 1"
                    value={uploadSource} onChange={e => setUploadSource(e.target.value)} />
                </Field>
                <Btn v="primary" onClick={() => void handleUpload()} disabled={loading}>
                  {loading ? 'Importing...' : 'Import Questions'}
                </Btn>
              </>
            )}

            {importTab === 'markdown' && (
              <>
                <p style={{ color: C.textMuted, fontSize: 12.5, marginBottom: 14 }}>
                  Upload a <code>.md</code> file or paste markdown directly.
                </p>
                <div style={{
                  padding: '10px 14px', borderRadius: 8, marginBottom: 14,
                  background: C.surface, border: `1px solid ${C.border}`,
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <label style={{
                    padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                    background: C.accentBg, color: C.accent,
                    border: `1px solid ${C.accent}40`, fontSize: 12.5, fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}>
                    📂 Load .md file
                    <input type="file" accept=".md,.markdown,.txt" style={{ display: 'none' }}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (!uploadSource) setUploadSource(file.name.replace(/\.[^.]+$/, ''));
                        const reader = new FileReader();
                        reader.onload = ev => setMdText((ev.target?.result as string) ?? '');
                        reader.readAsText(file);
                        e.target.value = '';
                      }} />
                  </label>
                  <span style={{ fontSize: 11.5, color: C.textDim }}>
                    {mdText ? `${mdText.split('\n').length} lines loaded` : 'or paste below'}
                  </span>
                  {mdText && (
                    <Btn sm v="ghost" onClick={() => setMdText('')} style={{ marginLeft: 'auto' }}>Clear</Btn>
                  )}
                </div>
                <Field label="Markdown" style={{ marginBottom: 14 }}>
                  <textarea
                    value={mdText}
                    onChange={e => setMdText(e.target.value)}
                    placeholder={`1. What does MOV do?\nA) Copies a value\nB) Adds two values\nAnswer: A`}
                    style={{
                      width: '100%', minHeight: 280, padding: 14, background: C.bg,
                      border: `1px solid ${C.border}`, borderRadius: 9, color: C.text,
                      fontSize: 12.5, fontFamily: "'IBM Plex Mono', monospace",
                      resize: 'vertical', outline: 'none', lineHeight: 1.6,
                    }}
                  />
                </Field>
                <Field label="Source / Semester Label" style={{ marginBottom: 18 }}>
                  <Inp placeholder="e.g. Fall 2024 Midterm 1"
                    value={uploadSource} onChange={e => setUploadSource(e.target.value)} />
                </Field>
                <Btn v="primary" onClick={() => void handleMarkdownImport()} disabled={loading || !mdText.trim()}>
                  {loading ? 'Importing...' : 'Import Questions'}
                </Btn>
              </>
            )}

            {importTab === 'answerkey' && (
              <>
                <p style={{ color: C.textMuted, fontSize: 12.5, marginBottom: 18 }}>
                  Upload a standalone answer key file (<code>.docx</code> or <code>.md</code>).
                  Answers are matched to existing questions by source name and question number.
                </p>
                <div style={{
                  padding: 28, borderRadius: 11, border: `2px dashed ${C.border}`,
                  background: C.surface, marginBottom: 18, textAlign: 'center',
                }}>
                  <input ref={keyFileRef} type="file" accept=".docx,.md,.markdown,.txt"
                    style={{ color: C.textMuted, fontSize: 12.5 }} />
                </div>
                <Field label="Source / Semester Label" style={{ marginBottom: 6 }}>
                  <Inp placeholder="e.g. Fall 2024 Midterm 1 — must match source used when importing"
                    value={uploadSource} onChange={e => setUploadSource(e.target.value)} />
                </Field>
                <p style={{ fontSize: 11, color: C.textDim, marginBottom: 14 }}>
                  Leave blank to apply the key to all questions with matching numbers regardless of source.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
                  padding: '10px 14px', borderRadius: 8, background: fuzzyKey ? C.accentBg : C.surface,
                  border: `1px solid ${fuzzyKey ? C.accent : C.border}` }}>
                  <Chk checked={fuzzyKey} onChange={() => setFuzzyKey(v => !v)} />
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>Fuzzy stem matching</div>
                    <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 2 }}>
                      Upload the full exam document instead of a bare key.
                      Answers are applied to whichever bank question has the most similar stem,
                      regardless of question number. Use when question numbers shifted between versions.
                    </div>
                  </div>
                </div>
                <Btn v="primary" onClick={() => void handleAnswerKeyUpload()} disabled={loading}>
                  {loading ? 'Applying...' : 'Apply Answer Key'}
                </Btn>
              </>
            )}

            {importTab === 'calibrate' && (
              <>
                <p style={{ color: C.textMuted, fontSize: 12.5, marginBottom: 14 }}>
                  Upload a CSV of per-question grading results to store empirical difficulty.
                  Each row updates the "% correct" field on the matching question.
                </p>
                <div style={{
                  padding: 14, borderRadius: 9, background: C.surface, border: `1px solid ${C.border}`,
                  marginBottom: 18, fontSize: 12,
                }}>
                  <p style={{ fontWeight: 650, color: C.textMuted, marginTop: 0, marginBottom: 6 }}>Expected CSV columns:</p>
                  <code style={{ display: 'block', background: C.codeBg, padding: '8px 12px', borderRadius: 6, fontSize: 11.5 }}>
                    question_number, pct_correct, source (optional)
                  </code>
                  <p style={{ color: C.textDim, marginBottom: 0, marginTop: 8, fontSize: 11 }}>
                    pct_correct can be 0–1 (e.g. 0.72) or 0–100% (e.g. 72%).<br />
                    Source must exactly match the source label used at import time.
                  </p>
                </div>
                <div style={{
                  padding: 28, borderRadius: 11, border: `2px dashed ${C.border}`,
                  background: C.surface, marginBottom: 18, textAlign: 'center',
                }}>
                  <input ref={calibrateRef} type="file" accept=".csv,.tsv,.txt"
                    style={{ color: C.textMuted, fontSize: 12.5 }} />
                </div>
                <Btn v="primary" onClick={() => void handleCalibrate()} disabled={calibrateLoading}>
                  {calibrateLoading ? 'Importing...' : 'Import Calibration Data'}
                </Btn>
              </>
            )}

            {stats && stats.total > 0 && (
              <div style={{
                marginTop: 16, padding: 18, borderRadius: 11,
                background: C.surface, border: `1px solid ${C.border}`,
              }}>
                <p style={{ fontSize: 11.5, fontWeight: 650, color: C.textMuted, marginBottom: 10, marginTop: 0 }}>
                  BANK SUMMARY
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: 12.5 }}>
                  <div><span style={{ color: C.textMuted }}>Total:</span> {stats.total}</div>
                  {Object.entries(stats.types).map(([k, v]) => (
                    <div key={k}>
                      <Badge color={TYPE_MAP[k as QuestionType]?.color}>{TYPE_MAP[k as QuestionType]?.label || k}</Badge> {v}
                    </div>
                  ))}
                </div>
              </div>
            )}
            </>}
          </div>
        )}

        {/* ═══════════ FRONT MATTER VIEW ═══════════ */}
        {view === 'frontmatter' && (
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, maxWidth: 1050 }}>
            {/* Snippet Library */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 650, color: C.textMuted, marginTop: 0, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                Snippet Library ({snippets.length})
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {snippets.length === 0 && (
                  <p style={{ fontSize: 12, color: C.textDim, padding: 12 }}>No snippets yet.</p>
                )}
                {snippets.map(s => (
                  <div key={s.id} style={{
                    padding: '9px 12px', borderRadius: 8, background: C.surface,
                    border: `1px solid ${editSnippetId === s.id ? C.borderFocus : C.border}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{s.title}</span>
                      <Badge color={C.textMuted}>{s.category}</Badge>
                    </div>
                    <p style={{ fontSize: 11, color: C.textDim, margin: '0 0 6px', lineHeight: 1.4 }}>
                      {s.markdown.substring(0, 80)}{s.markdown.length > 80 ? '...' : ''}
                    </p>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Btn sm v="primary" onClick={() => insertSnippet(s)}>Insert</Btn>
                      <Btn sm v="ghost" onClick={() => setEditSnippetId(editSnippetId === s.id ? null : s.id)}>
                        {editSnippetId === s.id ? 'Close' : 'Edit'}
                      </Btn>
                      <Btn sm v="danger" onClick={() => void deleteSnippet(s.id)}>Del</Btn>
                    </div>
                    {editSnippetId === s.id && (
                      <SnippetEditor snippet={s} categories={SNIPPET_CATS}
                        onSave={data => { void updateSnippet(s.id, data); setEditSnippetId(null); }}
                        onCancel={() => setEditSnippetId(null)} />
                    )}
                  </div>
                ))}
              </div>

              {/* New snippet */}
              <div style={{ padding: 12, borderRadius: 8, background: C.surface, border: `1px solid ${C.border}` }}>
                <p style={{ fontSize: 11, fontWeight: 650, color: C.textMuted, marginTop: 0, marginBottom: 8, textTransform: 'uppercase' }}>
                  New Snippet
                </p>
                <Field label="Title" style={{ marginBottom: 8 }}>
                  <Inp value={newSnippet.title} placeholder="e.g. x86-64 Register Table"
                    onChange={e => setNewSnippet(s => ({ ...s, title: e.target.value }))} />
                </Field>
                <Field label="Category" style={{ marginBottom: 8 }}>
                  <Sel value={newSnippet.category} style={{ width: '100%' }}
                    onChange={e => setNewSnippet(s => ({ ...s, category: e.target.value }))}>
                    {SNIPPET_CATS.map(c => <option key={c}>{c}</option>)}
                  </Sel>
                </Field>
                <Field label="Markdown" style={{ marginBottom: 8 }}>
                  <TextArea value={newSnippet.markdown}
                    onChange={e => setNewSnippet(s => ({ ...s, markdown: e.target.value }))}
                    placeholder={'## Register Table\n\n| Reg | Purpose |\n|-----|---------|'}
                    style={{ minHeight: 100 }} />
                </Field>
                <Btn sm v="primary" onClick={() => {
                  if (!newSnippet.title.trim()) return showToast('Title required', 'error');
                  void saveSnippet(newSnippet);
                  setNewSnippet({ title: '', category: 'reference', markdown: '' });
                }}>Save Snippet</Btn>
              </div>

              {/* Image upload */}
              <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: C.surface, border: `1px solid ${C.border}` }}>
                <p style={{ fontSize: 11, fontWeight: 650, color: C.textMuted, marginTop: 0, marginBottom: 8, textTransform: 'uppercase' }}>
                  Upload Image
                </p>
                <input type="file" accept=".png,.jpg,.jpeg,.gif,.svg"
                  style={{ fontSize: 11.5, color: C.textMuted, marginBottom: 8, display: 'block' }}
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const fd = new FormData();
                    fd.append('file', file);
                    try {
                      const r = await fetch('/api/upload-image', { method: 'POST', body: fd });
                      const d = await r.json() as { error?: string; markdown_ref: string };
                      if (d.error) throw new Error(d.error);
                      showToast(`Uploaded! Use: ${d.markdown_ref}`);
                      setFrontMatter(fm => fm + (fm ? '\n\n' : '') + d.markdown_ref);
                    } catch (err) {
                      showToast((err as Error).message, 'error');
                    }
                    e.target.value = '';
                  }} />
                <p style={{ fontSize: 10.5, color: C.textDim, margin: 0 }}>
                  Reference as: ![alt](filename.png)
                </p>
              </div>
            </div>

            {/* Composer */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 650, color: C.textMuted, margin: 0, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  Exam Front Matter Composer
                </p>
                <div style={{ display: 'flex', gap: 5 }}>
                  <Btn sm v={fmPreview ? 'ghost' : 'primary'} onClick={() => setFmPreview(false)}>Edit</Btn>
                  <Btn sm v={fmPreview ? 'primary' : 'ghost'} onClick={() => setFmPreview(true)}>Preview</Btn>
                  <Btn sm v="ghost" onClick={() => setFrontMatter('')}>Clear</Btn>
                </div>
              </div>

              <p style={{ fontSize: 11.5, color: C.textDim, marginTop: 0, marginBottom: 10 }}>
                This markdown appears between the exam header and questions. Use{' '}
                <code>---pagebreak---</code> to force page breaks.
              </p>

              {!fmPreview ? (
                <textarea value={frontMatter}
                  onChange={e => setFrontMatter(e.target.value)}
                  placeholder={`## Reference Material\n\n| Register | Purpose |\n|----------|---------|...\n\n---pagebreak---`}
                  style={{
                    width: '100%', minHeight: 400, padding: 14, background: C.bg,
                    border: `1px solid ${C.border}`, borderRadius: 9, color: C.text,
                    fontSize: 12.5, fontFamily: "'IBM Plex Mono', monospace",
                    resize: 'vertical', outline: 'none', lineHeight: 1.6,
                  }} />
              ) : (
                <div style={{
                  minHeight: 400, padding: 18, background: C.surface,
                  border: `1px solid ${C.border}`, borderRadius: 9, overflow: 'auto',
                }}>
                  {frontMatter
                    ? <MdPreview text={frontMatter} style={{ fontSize: 13 }} />
                    : <p style={{ color: C.textDim, fontSize: 13 }}>No front matter yet.</p>}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12 }}>
                <Chk checked={pdfConfig.front_matter_own_page}
                  onChange={() => setPdfConfig(c => ({ ...c, front_matter_own_page: !c.front_matter_own_page }))} />
                <span style={{ fontSize: 12.5 }}>Front matter on its own page</span>
              </div>

              {frontMatter && (
                <p style={{ fontSize: 11, color: C.textMuted, marginTop: 10 }}>
                  {frontMatter.split('\n').length} lines ·{' '}
                  {(frontMatter.match(/---pagebreak---/gi) || []).length} page break(s)
                </p>
              )}
            </div>
          </div>
        )}

        {/* ═══════════ BANK VIEW ═══════════ */}
        {view === 'bank' && (
          <>
            {/* Filter bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <Inp placeholder="Search stem, topic, code… or /regex/"
                value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                style={{ maxWidth: 240 }} />
              <Sel value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}>
                <option value="">All Types</option>
                {TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </Sel>
              <Sel value={filters.topic} onChange={e => setFilters(f => ({ ...f, topic: e.target.value }))}>
                <option value="">All Topics</option>
                {allTopics.map(t => <option key={t}>{t}</option>)}
              </Sel>
              <Sel value={filters.difficulty} onChange={e => setFilters(f => ({ ...f, difficulty: e.target.value }))}>
                <option value="">All Diff</option>
                {DIFFS.map(d => <option key={d}>{d}</option>)}
              </Sel>
              <Sel value={filters.source} onChange={e => setFilters(f => ({ ...f, source: e.target.value }))}>
                <option value="">All Sources</option>
                {allSources.map(s => <option key={s}>{s}</option>)}
              </Sel>
              <Sel value={filters.lecture} onChange={e => setFilters(f => ({ ...f, lecture: e.target.value }))}>
                <option value="">All Lec</option>
                {allLectures.map(l => <option key={l}>{l}</option>)}
              </Sel>
              <Sel value={filters.answered} onChange={e => setFilters(f => ({ ...f, answered: e.target.value as Filters['answered'] }))}>
                <option value="">All Answers</option>
                <option value="yes">Has Answer</option>
                <option value="no">No Answer</option>
              </Sel>
              <Sel value={filters.flagged} onChange={e => setFilters(f => ({ ...f, flagged: e.target.value as Filters['flagged'] }))}>
                <option value="">All Flags</option>
                <option value="yes">⚑ Flagged</option>
                <option value="no">Not Flagged</option>
              </Sel>
              <Sel value={filters.bloom} onChange={e => setFilters(f => ({ ...f, bloom: e.target.value }))}>
                <option value="">All Bloom's</option>
                {BLOOMS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
              </Sel>
              <div style={{ flex: 1 }} />
              <Btn sm v="ghost" onClick={() => setFilters({ ...EMPTY_FILTERS })}>Clear Filters</Btn>
              <Btn sm v="ghost" onClick={() => { setDupScan(null); void scanDuplicates(); }}>
                {dupScanLoading ? 'Scanning…' : 'Scan Duplicates'}
              </Btn>
              <Btn sm v="primary" onClick={() => setComposing(true)}>+ New Question</Btn>
              <span style={{ fontSize: 11.5, color: C.textMuted }}>
                {filtered.length} of {questions.length}
              </span>
            </div>

            {/* Collections row */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>Collections:</span>
              {collections.map(c => (
                <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Btn sm v="ghost" onClick={() => applyCollection(c)}
                    style={{ fontSize: 11, padding: '3px 9px' }}>
                    {c.name}
                  </Btn>
                  <span onClick={() => deleteCollection(c.id)}
                    style={{ color: C.textDim, cursor: 'pointer', fontSize: 13 }}>×</span>
                </span>
              ))}
              <div style={{ display: 'flex', gap: 5 }}>
                <input
                  value={newCollectionName}
                  onChange={e => setNewCollectionName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveCollection()}
                  placeholder="Save current filters…"
                  style={{
                    padding: '4px 8px', borderRadius: 6, fontSize: 11.5,
                    background: C.bg, border: `1px solid ${C.border}`,
                    color: C.text, outline: 'none', width: 180,
                  }}
                />
                <Btn sm v="ghost" onClick={saveCollection} disabled={!newCollectionName.trim()}
                  style={{ fontSize: 11 }}>Save</Btn>
              </div>
            </div>

            {/* Duplicate scan panel */}
            {dupScan !== null && (
              <div style={{
                marginBottom: 14, padding: 14, borderRadius: 9,
                background: C.surface, border: `1px solid ${C.border}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>
                    Duplicate Scan — {dupScan.length === 0 ? 'No duplicates found' : `${dupScan.length} pair${dupScan.length > 1 ? 's' : ''} found`}
                  </span>
                  {dupScan.length > 0 && <>
                    <Btn sm v="ghost" onClick={() => selectDupsByAge('newer')}>Check older from each pair</Btn>
                    <Btn sm v="ghost" onClick={() => selectDupsByAge('older')}>Check newer from each pair</Btn>
                    <Btn sm v="danger" onClick={() => void bulkDeleteDups()}
                      disabled={dupDeleteSet.size === 0}>
                      Delete Selected ({dupDeleteSet.size})
                    </Btn>
                  </>}
                  <Btn sm v="ghost" onClick={() => { setDupScan(null); setDupDeleteSet(new Set()); }}>Dismiss</Btn>
                </div>
                {dupScan.map((pair, i) => (
                  <div key={i} style={{
                    padding: '10px 12px', marginBottom: 8, borderRadius: 7,
                    background: C.bg, border: `1px solid ${C.border}`, fontSize: 12,
                  }}>
                    <span style={{
                      display: 'inline-block', marginBottom: 6, padding: '1px 7px',
                      borderRadius: 4, background: `${C.warn}33`,
                      fontWeight: 700, fontSize: 11, color: C.text,
                    }}>{Math.round(pair.score * 100)}% match</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {([pair.a, pair.b] as Question[]).map(q => {
                        const marked = dupDeleteSet.has(q.id);
                        return (
                          <div key={q.id}
                            onClick={() => toggleDupDelete(q.id)}
                            style={{
                              padding: '8px 10px', borderRadius: 5, cursor: 'pointer',
                              background: marked ? `${C.danger}14` : C.surface,
                              border: `2px solid ${marked ? C.danger : C.borderSubtle}`,
                              color: C.textMuted, transition: 'all .1s',
                            }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <div style={{
                                width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                                background: marked ? C.danger : 'transparent',
                                border: `2px solid ${marked ? C.danger : C.border}`,
                              }} />
                              <span style={{ fontWeight: 600, color: marked ? C.danger : C.text, fontSize: 11 }}>
                                {q.source || 'Unknown source'} · {q.topic || 'No topic'}
                              </span>
                            </div>
                            {q.stem.slice(0, 140)}{q.stem.length > 140 ? '…' : ''}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {composing && (
              <QuestionComposer
                onCreate={(q, force) => void createQ(q, force)}
                onCancel={() => setComposing(false)}
                existingTopics={allTopics}
                existingSources={allSources}
              />
            )}

            {/* Bulk edit panel */}
            {selected.size >= 2 && bulkEditOpen && (
              <div style={{
                marginBottom: 14, padding: 16, borderRadius: 9,
                background: C.surface, border: `2px solid ${C.accent}44`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>Bulk Edit — {selected.size} questions</span>
                  <Btn sm v="ghost" onClick={() => { setBulkEditOpen(false); setBulkFields({}); }}>Cancel</Btn>
                </div>
                <p style={{ fontSize: 11.5, color: C.textDim, marginTop: 0, marginBottom: 12 }}>
                  Only checked fields will be updated. Leave unchecked fields unchanged.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
                  {([
                    ['difficulty', 'Difficulty'],
                    ['topic', 'Topic'],
                    ['lecture', 'Lecture #'],
                    ['source', 'Source'],
                    ['bloom', "Bloom's Level"],
                    ['points', 'Points'],
                  ] as [keyof Question, string][]).map(([key, label]) => (
                    <Field key={key} label={label}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <Chk
                          checked={key in bulkFields}
                          onChange={() => setBulkFields(f => {
                            const next = { ...f };
                            if (key in next) delete next[key]; else (next[key] as unknown) = '';
                            return next;
                          })}
                        />
                        {key === 'difficulty' ? (
                          <Sel value={(bulkFields.difficulty as string) || ''} style={{ flex: 1 }}
                            onChange={e => setBulkFields(f => ({ ...f, difficulty: e.target.value as Question['difficulty'] }))}>
                            {DIFFS.map(d => <option key={d}>{d}</option>)}
                          </Sel>
                        ) : key === 'bloom' ? (
                          <Sel value={(bulkFields.bloom as string) || ''} style={{ flex: 1 }}
                            onChange={e => setBulkFields(f => ({ ...f, bloom: e.target.value as Question['bloom'] }))}>
                            <option value="">— None —</option>
                            {BLOOMS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                          </Sel>
                        ) : key === 'points' ? (
                          <Inp type="number" value={(bulkFields.points as number) ?? 0} style={{ flex: 1 }}
                            onChange={e => setBulkFields(f => ({ ...f, points: parseInt(e.target.value) || 0 }))} />
                        ) : (
                          <Inp value={(bulkFields[key] as string) || ''} style={{ flex: 1 }}
                            placeholder={`Set ${label.toLowerCase()}…`}
                            onChange={e => setBulkFields(f => ({ ...f, [key]: e.target.value }))} />
                        )}
                      </div>
                    </Field>
                  ))}
                </div>
                <Btn v="primary" onClick={() => void bulkUpdate()}
                  disabled={Object.keys(bulkFields).length === 0}>
                  Apply to {selected.size} Questions
                </Btn>
              </div>
            )}

            {filtered.length > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
                background: C.surface, borderRadius: '9px 9px 0 0',
                border: `1px solid ${C.border}`, borderBottom: 'none',
              }}>
                <Chk checked={filtered.length > 0 && filtered.every(q => selected.has(q.id))}
                  onChange={toggleAll} />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: C.textMuted }}>
                  {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
                </span>
                {selected.size > 0 && <>
                  <Btn sm v="primary" onClick={() => setView('generate')}>Generate Exam →</Btn>
                  {selected.size >= 2 && (
                    <Btn sm v="ghost" onClick={() => setBulkEditOpen(o => !o)}>
                      {bulkEditOpen ? 'Close Bulk Edit' : 'Bulk Edit'}
                    </Btn>
                  )}
                  <Btn sm v="ghost" onClick={() => exportQti()} disabled={loading}>Export QTI</Btn>
                  <Btn sm v="ghost" onClick={() => setSelected(new Set())}>Clear</Btn>
                </>}
                <div style={{ flex: 1 }} />
                <Btn sm v="ghost" onClick={exportCsv}>Export CSV</Btn>
              </div>
            )}

            <div style={{
              border: `1px solid ${C.border}`,
              borderRadius: filtered.length > 0 ? '0 0 9px 9px' : 9,
              overflow: 'hidden',
            }}>
              {filtered.length === 0 ? (
                <div style={{ padding: 44, textAlign: 'center', color: C.textMuted, fontSize: 14 }}>
                  {questions.length === 0
                    ? 'No questions yet. Import a .docx to get started.'
                    : 'No matches.'}
                </div>
              ) : filtered.map((q, i) => (
                <QuestionRow key={q.id} q={q}
                  isSel={selected.has(q.id)}
                  isEdit={editingId === q.id}
                  onToggle={() => setSelected(s => {
                    const n = new Set(s);
                    n.has(q.id) ? n.delete(q.id) : n.add(q.id);
                    return n;
                  })}
                  onEdit={() => setEditingId(editingId === q.id ? null : q.id)}
                  onUpdate={updateQ}
                  onDelete={() => void deleteQ(q.id)}
                  usedOn={usageMap[q.id]}
                  even={i % 2 === 0} />
              ))}
            </div>

            {/* Keyboard shortcut hint */}
            <p style={{ fontSize: 11, color: C.textDim, marginTop: 10 }}>
              Shortcuts: <kbd style={{ background: C.surface2, padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>N</kbd> new question ·{' '}
              <kbd style={{ background: C.surface2, padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>A</kbd> select all ·{' '}
              <kbd style={{ background: C.surface2, padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>Esc</kbd> cancel ·{' '}
              <kbd style={{ background: C.surface2, padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>Ctrl+Z</kbd> undo
            </p>
          </>
        )}

        {/* ═══════════ GENERATE VIEW ═══════════ */}
        {view === 'generate' && (
          <div style={{ maxWidth: 680 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Generate Exam PDF</h2>
            <p style={{ color: C.textMuted, fontSize: 12.5, marginBottom: 20 }}>
              {selected.size} question{selected.size !== 1 ? 's' : ''} ·{' '}
              {Object.entries(selTypes).map(([k, v]) => `${v} ${TYPE_MAP[k as QuestionType]?.label || k}`).join(', ')} ·{' '}
              {selQs.reduce((s, q) => s + (q.points || 0), 0)} pts
            </p>

            {/* Templates */}
            {templates.length > 0 && (
              <div style={{
                marginBottom: 20, padding: 14, borderRadius: 9,
                background: C.surface, border: `1px solid ${C.border}`,
              }}>
                <p style={{ fontSize: 11, fontWeight: 650, color: C.textMuted, marginTop: 0, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  Exam Templates
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {templates.map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Btn sm v="ghost" onClick={() => applyTemplate(t)} style={{ fontSize: 11.5 }}>
                        {t.name}
                      </Btn>
                      <span onClick={() => void deleteTemplate(t.id)}
                        style={{ color: C.textDim, cursor: 'pointer', fontSize: 13 }}>×</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Exam Title">
                <Inp value={pdfConfig.title}
                  onChange={e => setPdfConfig(c => ({ ...c, title: e.target.value }))} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Course / Subtitle">
                  <Inp value={pdfConfig.course}
                    onChange={e => setPdfConfig(c => ({ ...c, course: e.target.value }))} />
                </Field>
                <Field label="Date">
                  <Inp value={pdfConfig.date} placeholder="e.g. Spring 2026"
                    onChange={e => setPdfConfig(c => ({ ...c, date: e.target.value }))} />
                </Field>
              </div>
              <Field label="Instructions">
                <Inp value={pdfConfig.instructions}
                  onChange={e => setPdfConfig(c => ({ ...c, instructions: e.target.value }))} />
              </Field>
              <Field label="Filename">
                <Inp value={pdfConfig.filename}
                  onChange={e => setPdfConfig(c => ({ ...c, filename: e.target.value }))} />
              </Field>

              <div style={{
                display: 'flex', flexDirection: 'column', gap: 9, padding: 14,
                background: C.surface, borderRadius: 9, border: `1px solid ${C.border}`,
              }}>
                {PDF_TOGGLES.map(([key, label, desc]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Chk checked={pdfConfig[key]}
                      onChange={() => setPdfConfig(c => ({ ...c, [key]: !c[key] }))} />
                    <span style={{ fontSize: 12.5 }}>{label}</span>
                    {desc && <span style={{ fontSize: 10.5, color: C.textDim }}>{desc}</span>}
                  </div>
                ))}

                {frontMatter ? (
                  <div style={{
                    padding: '8px 11px', borderRadius: 7, background: C.successBg,
                    border: `1px solid ${C.success}30`, fontSize: 12, color: C.success,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span>✓ Front matter attached ({frontMatter.split('\n').length} lines)</span>
                    <Btn sm v="ghost" onClick={() => setView('frontmatter')} style={{ color: C.success }}>Edit</Btn>
                  </div>
                ) : (
                  <div style={{
                    padding: '8px 11px', borderRadius: 7, background: C.surface2,
                    border: `1px solid ${C.border}`, fontSize: 12, color: C.textDim,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span>No front matter</span>
                    <Btn sm v="ghost" onClick={() => setView('frontmatter')}>Add</Btn>
                  </div>
                )}
              </div>
            </div>

            {/* Save template */}
            <div style={{
              marginTop: 14, padding: 14, borderRadius: 9,
              background: C.surface, border: `1px solid ${C.border}`,
              display: 'flex', gap: 8, alignItems: 'center',
            }}>
              <span style={{ fontSize: 12, color: C.textMuted, flexShrink: 0 }}>Save as template:</span>
              <Inp value={saveTemplateName} placeholder="Template name…"
                onChange={e => setSaveTemplateName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void saveTemplate()}
                style={{ flex: 1 }} />
              <Btn sm v="ghost" onClick={() => void saveTemplate()} disabled={!saveTemplateName.trim()}>Save</Btn>
            </div>

            {/* Archive */}
            <div style={{
              marginTop: 14, padding: 14, borderRadius: 9,
              background: C.surface, border: `1px solid ${C.border}`,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Chk checked={saveToArchive} onChange={() => setSaveToArchive(v => !v)} />
                <span style={{ fontSize: 12.5 }}>Save to archive after downloading</span>
              </div>
              {saveToArchive && (
                <Inp
                  value={archiveName}
                  onChange={e => setArchiveName(e.target.value)}
                  placeholder={pdfConfig.title || 'Archive name (defaults to exam title)'}
                />
              )}
            </div>

            {/* Exam Balance Report */}
            <div style={{
              marginTop: 14, padding: 14, borderRadius: 9,
              background: C.surface, border: `1px solid ${C.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showBalance ? 12 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Chk checked={showBalance} onChange={() => setShowBalance(v => !v)} />
                  <span style={{ fontSize: 12.5 }}>Show exam balance report</span>
                </div>
                {balanceReport && balanceReport.flaggedCount > 0 && (
                  <Badge color={C.danger}>⚑ {balanceReport.flaggedCount} flagged</Badge>
                )}
              </div>
              {showBalance && balanceReport && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 650, color: C.textMuted, marginTop: 0, marginBottom: 6, textTransform: 'uppercase' }}>By Topic</p>
                    {Object.entries(balanceReport.byTopic).sort(([,a],[,b]) => b-a).map(([t, n]) => (
                      <div key={t} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                        <span style={{ color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{t}</span>
                        <span style={{ color: C.text, fontWeight: 600, marginLeft: 8, flexShrink: 0 }}>{n}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 650, color: C.textMuted, marginTop: 0, marginBottom: 6, textTransform: 'uppercase' }}>By Difficulty</p>
                    {Object.entries(balanceReport.byDiff).map(([d, n]) => (
                      <div key={d} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                        <span style={{ color: C.textMuted }}>{d}</span>
                        <span style={{ fontWeight: 600 }}>{n} ({Math.round(n / balanceReport.total * 100)}%)</span>
                      </div>
                    ))}
                    {balanceReport.noAnswer > 0 && (
                      <p style={{ fontSize: 11, color: C.warn, marginTop: 6 }}>
                        ⚠ {balanceReport.noAnswer} question{balanceReport.noAnswer > 1 ? 's' : ''} without answer
                      </p>
                    )}
                  </div>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 650, color: C.textMuted, marginTop: 0, marginBottom: 6, textTransform: 'uppercase' }}>By Bloom's Level</p>
                    {Object.keys(balanceReport.byBloom).length > 0
                      ? Object.entries(balanceReport.byBloom).map(([b, n]) => (
                          <div key={b} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                            <span style={{ color: C.textMuted }}>{b}</span>
                            <span style={{ fontWeight: 600 }}>{n}</span>
                          </div>
                        ))
                      : <p style={{ fontSize: 11, color: C.textDim }}>No Bloom's tags set</p>
                    }
                    <p style={{ fontSize: 12, color: C.textMuted, marginTop: 8 }}>
                      Total: {balanceReport.totalPts} pts
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Download buttons */}
            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <Btn v="ghost" onClick={() => void previewPdf()} disabled={loading || selected.size === 0}>
                {loading ? 'Generating...' : `Preview PDF (${selected.size})`}
              </Btn>
              <Btn v="primary" onClick={() => void generatePdf()} disabled={loading || selected.size === 0}>
                {loading ? 'Generating...' : `Download PDF (${selected.size})`}
              </Btn>
              <Btn onClick={() => setView('bank')}>← Back</Btn>
            </div>

            {/* Multiple Variants */}
            <div style={{
              marginTop: 20, padding: 16, borderRadius: 9,
              background: C.surface, border: `1px solid ${C.border}`,
            }}>
              <p style={{ fontSize: 12, fontWeight: 650, color: C.textMuted, marginTop: 0, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                Multiple Exam Variants
              </p>
              <p style={{ fontSize: 12, color: C.textDim, marginTop: 0, marginBottom: 12 }}>
                Generates N independently shuffled variants (A, B, C…) plus a combined answer key, all in a single zip file.
              </p>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }}>
                <Field label="Number of Variants (2–8)">
                  <Inp type="number" value={variants}
                    onChange={e => setVariants(Math.min(8, Math.max(2, parseInt(e.target.value) || 2)))}
                    style={{ width: 80 }} />
                </Field>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
                  <Chk checked={shuffleQuestions} onChange={() => setShuffleQuestions(v => !v)} />
                  <span style={{ fontSize: 12.5 }}>Shuffle question order</span>
                </div>
              </div>
              <Btn v="ghost" onClick={() => void generateVariants()} disabled={loading || selected.size === 0}>
                {loading ? 'Generating...' : `Download ${variants} Variants (.zip)`}
              </Btn>
            </div>

            {/* Exam Archive */}
            {exams.length > 0 && (
              <div style={{ marginTop: 32 }}>
                <p style={{
                  fontSize: 11, fontWeight: 650, color: C.textMuted, marginBottom: 10,
                  textTransform: 'uppercase', letterSpacing: 0.4,
                }}>Exam Archive ({exams.length})</p>
                {exams.map(e => (
                  <div key={e.id} style={{
                    padding: '10px 14px', marginBottom: 6, borderRadius: 8,
                    background: C.surface, border: `1px solid ${C.border}`,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{e.title}</div>
                      <div style={{ fontSize: 11, color: C.textMuted }}>
                        {e.question_ids.length} questions ·{' '}
                        {new Date(e.created).toLocaleDateString()}
                      </div>
                    </div>
                    <Btn sm v="ghost" onClick={() => {
                      const ids = new Set(e.question_ids);
                      setSelected(ids);
                      const cfg = e.config as Partial<typeof pdfConfig>;
                      if (cfg.title) setPdfConfig(c => ({ ...c, ...cfg }));
                      setArchiveName(e.title);
                      showToast(`Loaded "${e.title}" — ${e.question_ids.length} questions selected`);
                    }}>Load</Btn>
                    <Btn sm v="danger" onClick={async () => {
                      await apiFetch(`/exams/${e.id}`, { method: 'DELETE' });
                      setExams(es => es.filter(x => x.id !== e.id));
                    }}>Del</Btn>
                  </div>
                ))}
              </div>
            )}

            {/* Preview list */}
            {selQs.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <p style={{
                  fontSize: 11, fontWeight: 650, color: C.textMuted, marginBottom: 10,
                  textTransform: 'uppercase', letterSpacing: 0.4,
                }}>Preview</p>
                {selQs.map((q, i) => {
                  const T = TYPE_MAP[q.type] || TYPES[3];
                  return (
                    <div key={q.id} style={{
                      padding: '9px 12px', marginBottom: 5, borderRadius: 7,
                      background: C.surface, border: `1px solid ${C.border}`, fontSize: 12,
                    }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{
                          color: C.accent, fontWeight: 700,
                          fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5,
                        }}>{i + 1}.</span>
                        <span style={{ flex: 1, color: C.textMuted }}>
                          {q.stem.substring(0, 100)}{q.stem.length > 100 ? '...' : ''}
                        </span>
                        <Badge color={T.color}>{T.icon} {T.label}</Badge>
                        {q.flagged && <Badge color={C.danger}>⚑</Badge>}
                        {q.points > 0 && <Badge color={C.warn}>{q.points} pts</Badge>}
                        <span onClick={() => setSelected(s => {
                          const n = new Set(s); n.delete(q.id); return n;
                        })} style={{ color: C.textDim, cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>×</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══════════ STATS VIEW ═══════════ */}
        {view === 'stats' && (
          <div style={{ maxWidth: 900 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Bank Health Dashboard</h2>

            {!stats || stats.total === 0 ? (
              <p style={{ color: C.textMuted }}>No questions in the bank yet.</p>
            ) : (
              <>
                {/* Summary cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
                  {[
                    { label: 'Total Questions', value: questions.length, color: C.accent },
                    { label: 'Flagged', value: questions.filter(q => q.flagged).length, color: C.danger },
                    { label: 'No Answer', value: questions.filter(q => !q.correct_answer).length, color: C.warn },
                    { label: 'Calibrated', value: questions.filter(q => q.empirical_difficulty != null).length, color: C.success },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{
                      padding: 16, borderRadius: 10, background: C.surface,
                      border: `1px solid ${C.border}`, textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
                      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                  {/* Question types */}
                  <div style={{ padding: 16, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
                    <p style={{ fontSize: 11, fontWeight: 650, color: C.textMuted, marginTop: 0, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.3 }}>By Type</p>
                    {Object.entries(stats.types).sort(([,a],[,b]) => b-a).map(([type, count]) => {
                      const T = TYPE_MAP[type as QuestionType];
                      const pct = Math.round(count / stats.total * 100);
                      return (
                        <div key={type} style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                            <span style={{ color: C.text }}>{T?.icon} {T?.label || type}</span>
                            <span style={{ color: C.textMuted }}>{count} ({pct}%)</span>
                          </div>
                          <div style={{ height: 4, borderRadius: 2, background: C.borderSubtle }}>
                            <div style={{ height: 4, borderRadius: 2, width: `${pct}%`, background: T?.color || C.accent }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Difficulty */}
                  <div style={{ padding: 16, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
                    <p style={{ fontSize: 11, fontWeight: 650, color: C.textMuted, marginTop: 0, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.3 }}>By Difficulty</p>
                    {(['easy', 'medium', 'hard'] as const).map(d => {
                      const count = stats.difficulties[d] || 0;
                      const pct = Math.round(count / stats.total * 100);
                      const color = { easy: C.success, medium: C.warn, hard: C.danger }[d];
                      return (
                        <div key={d} style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                            <span style={{ color: C.text, textTransform: 'capitalize' }}>{d}</span>
                            <span style={{ color: C.textMuted }}>{count} ({pct}%)</span>
                          </div>
                          <div style={{ height: 4, borderRadius: 2, background: C.borderSubtle }}>
                            <div style={{ height: 4, borderRadius: 2, width: `${pct}%`, background: color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                  {/* Bloom's distribution */}
                  <div style={{ padding: 16, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
                    <p style={{ fontSize: 11, fontWeight: 650, color: C.textMuted, marginTop: 0, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.3 }}>Bloom's Taxonomy</p>
                    {(() => {
                      const bloomCounts: Record<string, number> = {};
                      const untagged = questions.filter(q => !q.bloom).length;
                      questions.forEach(q => { if (q.bloom) bloomCounts[q.bloom] = (bloomCounts[q.bloom] || 0) + 1; });
                      const entries = BLOOMS.map(b => ({ ...b, count: bloomCounts[b.key] || 0 }));
                      return (
                        <>
                          {entries.map(({ key, label, count }) => {
                            const pct = Math.round(count / stats.total * 100);
                            return (
                              <div key={key} style={{ marginBottom: 8 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                                  <span style={{ color: C.text }}>{label}</span>
                                  <span style={{ color: C.textMuted }}>{count} ({pct}%)</span>
                                </div>
                                <div style={{ height: 4, borderRadius: 2, background: C.borderSubtle }}>
                                  <div style={{ height: 4, borderRadius: 2, width: `${pct}%`, background: C.cyan }} />
                                </div>
                              </div>
                            );
                          })}
                          {untagged > 0 && (
                            <p style={{ fontSize: 11, color: C.textDim, marginBottom: 0 }}>
                              {untagged} question{untagged > 1 ? 's' : ''} without Bloom's tag
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Sources */}
                  <div style={{ padding: 16, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
                    <p style={{ fontSize: 11, fontWeight: 650, color: C.textMuted, marginTop: 0, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.3 }}>By Source</p>
                    {(() => {
                      const srcCounts: Record<string, number> = {};
                      questions.forEach(q => {
                        const s = q.source || 'No Source';
                        srcCounts[s] = (srcCounts[s] || 0) + 1;
                      });
                      return Object.entries(srcCounts).sort(([,a],[,b]) => b-a).map(([src, count]) => (
                        <div key={src} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                          <span style={{ color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{src}</span>
                          <span style={{ color: C.textMuted, flexShrink: 0, marginLeft: 8 }}>{count}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Topics table */}
                <div style={{ padding: 16, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
                  <p style={{ fontSize: 11, fontWeight: 650, color: C.textMuted, marginTop: 0, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    Topics ({allTopics.length})
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {(() => {
                      const topicCounts: Record<string, number> = {};
                      questions.forEach(q => {
                        if (q.topic) topicCounts[q.topic] = (topicCounts[q.topic] || 0) + 1;
                      });
                      return Object.entries(topicCounts).sort(([,a],[,b]) => b-a).map(([topic, count]) => (
                        <div key={topic} style={{
                          display: 'flex', justifyContent: 'space-between',
                          fontSize: 12, padding: '5px 10px', borderRadius: 6,
                          background: C.bg, border: `1px solid ${C.borderSubtle}`,
                        }}>
                          <span style={{ color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{topic}</span>
                          <span style={{ color: C.accent, fontWeight: 600, marginLeft: 8, flexShrink: 0 }}>{count}</span>
                        </div>
                      ));
                    })()}
                  </div>
                  {allTopics.length === 0 && (
                    <p style={{ color: C.textDim, fontSize: 12 }}>No topics set on any questions yet.</p>
                  )}
                </div>

                {/* Empirically calibrated questions */}
                {questions.some(q => q.empirical_difficulty != null) && (
                  <div style={{ marginTop: 20, padding: 16, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
                    <p style={{ fontSize: 11, fontWeight: 650, color: C.textMuted, marginTop: 0, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                      Empirical Difficulty (Calibrated Questions)
                    </p>
                    <p style={{ fontSize: 12, color: C.textDim, marginTop: 0, marginBottom: 10 }}>
                      Questions where grading data was imported. Flag = empirical difficulty disagrees with manual tag.
                    </p>
                    {questions
                      .filter(q => q.empirical_difficulty != null)
                      .sort((a, b) => (a.empirical_difficulty ?? 0) - (b.empirical_difficulty ?? 0))
                      .slice(0, 20)
                      .map(q => {
                        const pct = Math.round((q.empirical_difficulty ?? 0) * 100);
                        const disagrees = (
                          (q.difficulty === 'easy' && pct < 60) ||
                          (q.difficulty === 'hard' && pct > 70) ||
                          (q.difficulty === 'medium' && (pct < 30 || pct > 85))
                        );
                        return (
                          <div key={q.id} style={{
                            display: 'flex', gap: 10, alignItems: 'center',
                            padding: '6px 10px', marginBottom: 4, borderRadius: 6,
                            background: disagrees ? `${C.warn}18` : C.bg,
                            border: `1px solid ${disagrees ? C.warn + '44' : C.borderSubtle}`,
                            fontSize: 12,
                          }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.text }}>
                              {q.stem.slice(0, 80)}{q.stem.length > 80 ? '…' : ''}
                            </span>
                            <Badge color={pct >= 70 ? C.success : pct >= 40 ? C.warn : C.danger}>{pct}% correct</Badge>
                            <Badge color={{ easy: C.success, medium: C.warn, hard: C.danger }[q.difficulty]}>{q.difficulty}</Badge>
                            {disagrees && <Badge color={C.warn}>⚠ mismatch</Badge>}
                          </div>
                        );
                      })
                    }
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
