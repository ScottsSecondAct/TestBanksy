import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { apiFetch, apiBlob } from './api';
import {
  useTheme, Badge, Btn, Inp, Sel, Chk, Field, MdPreview, TextArea,
  DIFFS, SNIPPET_CATS,
} from './ui';
import QuestionRow from './QuestionRow';
import QuestionComposer from './QuestionComposer';
import SnippetEditor from './SnippetEditor';
import type {
  Question, DraftQuestion, Snippet, Stats, PdfConfig,
  Filters, ToastState, View, QuestionType, DuplicatePair, ExamRecord, BankInfo,
} from './types';

type BooleanPdfKey = 'show_points' | 'shuffle_choices' | 'generate_key' | 'front_matter_own_page';

const PDF_TOGGLES: [BooleanPdfKey, string, string][] = [
  ['show_points',           'Show point values',      ''],
  ['shuffle_choices',       'Shuffle MC choices',     'Randomizes A/B/C/D order'],
  ['generate_key',          'Generate answer key',    'Appended as last page'],
  ['front_matter_own_page', 'Front matter on own page', ''],
];

export default function App() {
  const { C, TYPES, TYPE_MAP, isDark, toggleTheme } = useTheme();
  const [view, setView] = useState<View>('bank');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>({
    search: '', topic: '', difficulty: '', source: '', lecture: '', type: '', answered: '',
  });
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
    await Promise.all(ids.map(id => apiFetch(`/questions/${id}`, { method: 'DELETE' })));
    setQuestions(qs => qs.filter(q => !dupDeleteSet.has(q.id)));
    setSelected(s => { const n = new Set(s); ids.forEach(id => n.delete(id)); return n; });
    const remaining = dupScan?.filter(p => !dupDeleteSet.has(p.a.id) && !dupDeleteSet.has(p.b.id)) ?? [];
    setDupScan(remaining);
    setDupDeleteSet(new Set());
    showToast(`Deleted ${ids.length} question${ids.length > 1 ? 's' : ''}`);
    void refresh();
  };

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
      const [qs, st, h, sn, exs, bks] = await Promise.all([
        apiFetch<Question[]>('/questions'),
        apiFetch<Stats>('/stats'),
        apiFetch<{ status: string }>('/health'),
        apiFetch<Snippet[]>('/snippets'),
        apiFetch<ExamRecord[]>('/exams'),
        apiFetch<{ banks: BankInfo[]; active: string }>('/banks'),
      ]);
      setQuestions(qs);
      setStats(st);
      setSnippets(sn);
      setExams(exs);
      setBanks(bks.banks);
      setActiveBankId(bks.active);
      setBackendUp(!!h);
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
    setFilters({ search: '', topic: '', difficulty: '', source: '', lecture: '', type: '', answered: '' });
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

  useEffect(() => {
    if (!bankPickerOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-bank-picker]')) setBankPickerOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [bankPickerOpen]);

  // ── Upload ─────────────────────────────────────────────────────────────────
  const [importTab, setImportTab] = useState<'docx' | 'markdown' | 'answerkey'>('docx');
  const [uploadSource, setUploadSource] = useState('');
  const [mdText, setMdText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const keyFileRef = useRef<HTMLInputElement>(null);

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
    try {
      const d = await apiFetch<{ questions_updated: number; key_entries: number }>(
        '/upload-answer-key', { method: 'POST', body: fd },
      );
      showToast(`Updated ${d.questions_updated} question${d.questions_updated !== 1 ? 's' : ''} from ${d.key_entries}-entry key`);
      void refresh();
      if (keyFileRef.current) keyFileRef.current.value = '';
      setUploadSource('');
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
    setLoading(false);
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
    await apiFetch(`/questions/${id}`, { method: 'DELETE' });
    setQuestions(qs => qs.filter(q => q.id !== id));
    setSelected(s => { const ns = new Set(s); ns.delete(id); return ns; });
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

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => questions.filter(q => {
    const f = filters;
    if (f.search) {
      const s = f.search.toLowerCase();
      if (!q.stem.toLowerCase().includes(s)
        && !q.topic.toLowerCase().includes(s)
        && !q.code_block.toLowerCase().includes(s)) return false;
    }
    if (f.type && q.type !== f.type) return false;
    if (f.topic && q.topic !== f.topic) return false;
    if (f.difficulty && q.difficulty !== f.difficulty) return false;
    if (f.source && q.source !== f.source) return false;
    if (f.lecture && q.lecture !== f.lecture) return false;
    if (f.answered === 'yes' && !q.correct_answer) return false;
    if (f.answered === 'no' && !!q.correct_answer) return false;
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

  const toggleAll = () => {
    const all = filtered.every(q => selected.has(q.id));
    setSelected(s => {
      const ns = new Set(s);
      filtered.forEach(q => (all ? ns.delete(q.id) : ns.add(q.id)));
      return ns;
    });
  };

  const selQs = questions.filter(q => selected.has(q.id));
  const selTypes: Record<string, number> = {};
  selQs.forEach(q => { selTypes[q.type] = (selTypes[q.type] || 0) + 1; });

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
        {/* Backend indicator */}
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

        {/* Message */}
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

        {/* Stats */}
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
              Test Bank Manager
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
              ] as const).map(([tab, label]) => (
                <button key={tab} onClick={() => setImportTab(tab)} style={{
                  flex: 1, padding: '7px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', transition: 'all .12s',
                  background: importTab === tab ? C.accent : 'transparent',
                  color: importTab === tab ? '#fff' : C.textMuted,
                }}>
                  {label}
                </button>
              ))}
            </div>

            {importTab === 'docx' ? (
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
            ) : (
              <>
                <p style={{ color: C.textMuted, fontSize: 12.5, marginBottom: 14 }}>
                  Upload a <code>.md</code> file or paste markdown directly. Number each question
                  (<code>1.</code>, <code>2.</code> …), use <code>A)</code> for MC choices,
                  and <code>Answer: B</code> for correct answers.
                </p>

                {/* .md file picker */}
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
                    <Btn sm v="ghost" onClick={() => setMdText('')} style={{ marginLeft: 'auto' }}>
                      Clear
                    </Btn>
                  )}
                </div>

                <Field label="Markdown" style={{ marginBottom: 14 }}>
                  <textarea
                    value={mdText}
                    onChange={e => setMdText(e.target.value)}
                    placeholder={`1. What does MOV do?\nA) Copies a value\nB) Adds two values\nC) Jumps to a label\nD) Pushes to the stack\nAnswer: A\n\n2. The stack grows toward ___.\n\n3. True / False: RAX is a 64-bit register.\nAnswer: True`}
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
                  <Inp placeholder="e.g. Fall 2024 Midterm 1 — must match the source used when importing"
                    value={uploadSource} onChange={e => setUploadSource(e.target.value)} />
                </Field>
                <p style={{ fontSize: 11, color: C.textDim, marginBottom: 18 }}>
                  Leave blank to apply the key to all questions with matching numbers regardless of source.
                </p>
                <Btn v="primary" onClick={() => void handleAnswerKeyUpload()} disabled={loading}>
                  {loading ? 'Applying...' : 'Apply Answer Key'}
                </Btn>
              </>
            )}

            <div style={{
              marginTop: 28, padding: 18, borderRadius: 11,
              background: C.surface, border: `1px solid ${C.border}`,
            }}>
              <p style={{ fontSize: 11.5, fontWeight: 650, color: C.textMuted, marginBottom: 10, marginTop: 0 }}>
                SUPPORTED QUESTION TYPES
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {TYPES.map(t => (
                  <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ color: t.color, fontSize: 14 }}>{t.icon}</span>
                    <span>{t.label}</span>
                  </div>
                ))}
              </div>
            </div>

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
                  placeholder={`## Reference Material\n\n| Register | Purpose |\n|----------|---------|...\n\n---pagebreak---\n\n\`\`\`asm\nmov dst, src\n\`\`\``}
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
                <span style={{ fontSize: 10.5, color: C.textDim }}>
                  Questions start on a new page after front matter
                </span>
              </div>

              {frontMatter && (
                <p style={{ fontSize: 11, color: C.textMuted, marginTop: 10 }}>
                  {frontMatter.split('\n').length} lines ·{' '}
                  {(frontMatter.match(/---pagebreak---/gi) || []).length} page break(s) ·{' '}
                  {(frontMatter.match(/\|.*\|/g) || []).length} table row(s) ·{' '}
                  {Math.floor((frontMatter.match(/```/g) || []).length / 2)} code block(s)
                </p>
              )}
            </div>
          </div>
        )}

        {/* ═══════════ BANK VIEW ═══════════ */}
        {view === 'bank' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
              <Inp placeholder="Search stem, topic, code..."
                value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                style={{ maxWidth: 220 }} />
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
              <div style={{ flex: 1 }} />
              <Btn sm v="ghost" onClick={() => { setDupScan(null); void scanDuplicates(); }}>
                {dupScanLoading ? 'Scanning…' : 'Scan for Duplicates'}
              </Btn>
              <Btn sm v="primary" onClick={() => setComposing(true)}>+ New Question</Btn>
              <span style={{ fontSize: 11.5, color: C.textMuted }}>
                {filtered.length} of {questions.length}
              </span>
            </div>

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
                  <Btn sm v="ghost" onClick={() => setSelected(new Set())}>Clear</Btn>
                </>}
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
          </>
        )}

        {/* ═══════════ GENERATE VIEW ═══════════ */}
        {view === 'generate' && (
          <div style={{ maxWidth: 620 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Generate Exam PDF</h2>
            <p style={{ color: C.textMuted, fontSize: 12.5, marginBottom: 20 }}>
              {selected.size} question{selected.size !== 1 ? 's' : ''} ·{' '}
              {Object.entries(selTypes).map(([k, v]) => `${v} ${TYPE_MAP[k as QuestionType]?.label || k}`).join(', ')} ·{' '}
              {selQs.reduce((s, q) => s + (q.points || 0), 0)} pts
            </p>

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
                    <Btn sm v="ghost" onClick={() => setView('frontmatter')}
                      style={{ color: C.success }}>Edit</Btn>
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
                <input
                  value={archiveName}
                  onChange={e => setArchiveName(e.target.value)}
                  placeholder={pdfConfig.title || 'Archive name (defaults to exam title)'}
                  style={{
                    padding: '7px 10px', borderRadius: 7, fontSize: 12.5,
                    background: C.bg, border: `1px solid ${C.border}`,
                    color: C.text, outline: 'none', width: '100%',
                  }}
                />
              )}
            </div>

            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <Btn v="ghost" onClick={() => void previewPdf()} disabled={loading || selected.size === 0}>
                {loading ? 'Generating...' : `Preview PDF (${selected.size})`}
              </Btn>
              <Btn v="primary" onClick={() => void generatePdf()} disabled={loading || selected.size === 0}>
                {loading ? 'Generating...' : `Download PDF (${selected.size})`}
              </Btn>
              <Btn onClick={() => setView('bank')}>← Back</Btn>
            </div>

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
      </main>
    </div>
  );
}
