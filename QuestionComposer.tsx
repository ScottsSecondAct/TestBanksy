import { useState } from 'react';
import {
  useTheme, Badge, Btn, Inp, Sel, Chk, Field, MdPreview,
  TextArea, CodeTextArea, DIFFS,
} from './ui';
import { apiFetch } from './api';
import type { DraftQuestion, QuestionType, DuplicateMatch } from './types';

const BLANK_Q: DraftQuestion = {
  type: 'mc',
  stem: '',
  choices: [
    { letter: 'A', text: '' },
    { letter: 'B', text: '' },
    { letter: 'C', text: '' },
    { letter: 'D', text: '' },
  ],
  correct_answer: '',
  blanks: [],
  code_block: '',
  code_language: 'asm',
  essay_lines: 10,
  points: 0,
  topic: '',
  difficulty: 'medium',
  lecture: '',
  source: '',
  semester: '',
  tags: [],
};

interface QuestionComposerProps {
  onCreate: (q: DraftQuestion, force?: boolean) => void;
  onCancel: () => void;
  existingTopics: string[];
  existingSources: string[];
}

export default function QuestionComposer({
  onCreate, onCancel, existingTopics, existingSources,
}: QuestionComposerProps) {
  const { C, TYPES, TYPE_MAP, DIFF_C } = useTheme();
  const [q, setQ] = useState<DraftQuestion>({ ...BLANK_Q });
  const [preview, setPreview] = useState(false);
  const [checking, setChecking] = useState(false);
  const [dupMatches, setDupMatches] = useState<DuplicateMatch[] | null>(null);

  const setField = <K extends keyof DraftQuestion>(field: K, value: DraftQuestion[K]) =>
    setQ(prev => ({ ...prev, [field]: value }));

  const handleTypeChange = (newType: QuestionType) => {
    const upd: Partial<DraftQuestion> = { type: newType };
    if ((newType === 'mc' || newType === 'multi_select') && (!q.choices || q.choices.length === 0)) {
      upd.choices = 'ABCD'.split('').map(l => ({ letter: l, text: '' }));
    }
    if (newType === 'true_false') {
      upd.choices = [];
      upd.correct_answer = q.correct_answer || '';
    }
    if (newType === 'fill_blank') {
      const count = (q.stem.match(/_{3,}/g) || []).length;
      upd.blanks = Array(Math.max(count, 1)).fill('') as string[];
    }
    if (newType === 'essay') upd.essay_lines = q.essay_lines || 10;
    if (newType === 'code_listing') upd.code_language = 'asm';
    setQ(prev => ({ ...prev, ...upd }));
  };

  const addChoice = () => {
    const used = (q.choices || []).map(c => c.letter);
    const next = 'ABCDEFGH'.split('').find(l => !used.includes(l)) ?? 'X';
    setQ(prev => ({ ...prev, choices: [...(prev.choices || []), { letter: next, text: '' }] }));
  };

  const updateChoice = (idx: number, text: string) => {
    const nc = [...(q.choices || [])];
    nc[idx] = { ...nc[idx], text };
    setField('choices', nc);
  };

  const removeChoice = (idx: number) => {
    setField('choices', (q.choices || []).filter((_, i) => i !== idx));
  };

  const toggleMultiCorrect = (letter: string) => {
    const current = (q.correct_answer || '').split(',').filter(Boolean);
    const next = current.includes(letter)
      ? current.filter(l => l !== letter)
      : [...current, letter].sort();
    setField('correct_answer', next.join(','));
  };

  const handleCreate = async (force = false) => {
    if (!q.stem.trim() && !q.code_block.trim()) return;
    if (force) { onCreate(q, true); return; }
    if (q.stem.trim().length >= 10) {
      setChecking(true);
      try {
        const res = await apiFetch<{ matches: DuplicateMatch[] }>('/check-duplicate', {
          method: 'POST',
          body: JSON.stringify({ stem: q.stem }),
        });
        if (res.matches.length > 0) {
          setDupMatches(res.matches);
          setChecking(false);
          return;
        }
      } catch { /* proceed if check fails */ }
      setChecking(false);
    }
    onCreate(q);
  };

  const T = TYPE_MAP[q.type] || TYPES[3];

  return (
    <div style={{
      marginBottom: 18, padding: 18, borderRadius: 11,
      background: C.surface, border: `2px solid ${C.accent}44`,
      boxShadow: `0 0 20px ${C.accent}08`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, color: C.accent }}>✦</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>New Question</span>
          <Badge color={T.color}>{T.icon} {T.label}</Badge>
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          <Btn sm v={preview ? 'ghost' : 'default'} onClick={() => setPreview(false)}>Edit</Btn>
          <Btn sm v={preview ? 'default' : 'ghost'} onClick={() => setPreview(true)}>Preview</Btn>
        </div>
      </div>

      {preview ? (
        <div style={{
          padding: 16, borderRadius: 8, background: C.bg,
          border: `1px solid ${C.border}`, marginBottom: 12,
        }}>
          <MdPreview text={q.stem} />
          {q.code_block && (
            <pre style={{
              marginTop: 8, padding: 10, background: C.codeBg, borderRadius: 7,
              border: `1px solid ${C.borderSubtle}`, color: C.codeText,
              fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
              lineHeight: 1.55, whiteSpace: 'pre-wrap',
            }}>{q.code_block}</pre>
          )}
          {(q.type === 'mc' || q.type === 'multi_select') && q.choices?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {q.choices.map(ch => {
                const isCorrect = q.type === 'multi_select'
                  ? (q.correct_answer || '').split(',').includes(ch.letter)
                  : ch.letter === q.correct_answer;
                return (
                  <div key={ch.letter} style={{
                    fontSize: 12, padding: '2px 0',
                    color: isCorrect ? C.success : C.textMuted,
                    fontWeight: isCorrect ? 650 : 400,
                  }}>
                    <strong>{ch.letter}.</strong> {ch.text}
                    {isCorrect && ' ✓'}
                  </div>
                );
              })}
            </div>
          )}
          {q.type === 'true_false' && q.correct_answer && (
            <p style={{ fontSize: 12, color: C.success, marginTop: 6 }}>Answer: {q.correct_answer}</p>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
            <Field label="Type">
              <Sel value={q.type} style={{ width: '100%' }}
                onChange={e => handleTypeChange(e.target.value as QuestionType)}>
                {TYPES.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
              </Sel>
            </Field>
            <Field label="Difficulty">
              <Sel value={q.difficulty} style={{ width: '100%' }}
                onChange={e => setField('difficulty', e.target.value as DraftQuestion['difficulty'])}>
                {DIFFS.map(d => <option key={d}>{d}</option>)}
              </Sel>
            </Field>
            <Field label="Points">
              <Inp type="number" value={q.points}
                onChange={e => setField('points', parseInt(e.target.value) || 0)} />
            </Field>
            <Field label="Topic">
              <Inp value={q.topic} placeholder="e.g. x86 Addressing"
                onChange={e => setField('topic', e.target.value)}
                list="topics-list" />
              <datalist id="topics-list">
                {existingTopics.map(t => <option key={t} value={t} />)}
              </datalist>
            </Field>
            <Field label="Lecture #">
              <Inp value={q.lecture} placeholder="e.g. 7"
                onChange={e => setField('lecture', e.target.value)} />
            </Field>
            <Field label="Source">
              <Inp value={q.source} placeholder="e.g. Spring 2026 Final"
                onChange={e => setField('source', e.target.value)}
                list="sources-list" />
              <datalist id="sources-list">
                {existingSources.map(s => <option key={s} value={s} />)}
              </datalist>
            </Field>
          </div>

          <Field label="Question Stem (Markdown)" style={{ marginBottom: 12 }}>
            <TextArea value={q.stem}
              onChange={e => setField('stem', e.target.value)}
              placeholder="Write your question here. Supports **bold**, *italic*, `inline code`, and ```code blocks```."
              style={{ minHeight: 100 }} />
          </Field>

          {(q.type === 'mc' || q.type === 'multi_select') && (
            <div style={{
              padding: 12, borderRadius: 8, background: C.bg,
              border: `1px solid ${C.border}`, marginBottom: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 650, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  {q.type === 'multi_select' ? 'Answer Choices (click all correct)' : 'Answer Choices'}
                </span>
                <Btn sm v="ghost" onClick={addChoice}>+ Add Choice</Btn>
              </div>
              {(q.choices || []).map((ch, idx) => {
                const isCorrect = q.type === 'multi_select'
                  ? (q.correct_answer || '').split(',').includes(ch.letter)
                  : q.correct_answer === ch.letter;
                return (
                  <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
                    <div
                      onClick={() => q.type === 'multi_select'
                        ? toggleMultiCorrect(ch.letter)
                        : setField('correct_answer', ch.letter)}
                      style={{
                        width: 26, height: 26,
                        borderRadius: q.type === 'multi_select' ? 4 : 5,
                        flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                        background: isCorrect ? C.success : C.bg,
                        color: isCorrect ? '#fff' : C.textMuted,
                        border: `2px solid ${isCorrect ? C.success : C.border}`,
                        transition: 'all .12s',
                      }}
                      title={q.type === 'multi_select' ? 'Toggle correct' : 'Click to mark correct'}
                    >{ch.letter}</div>
                    <Inp value={ch.text} placeholder={`Choice ${ch.letter}`}
                      onChange={e => updateChoice(idx, e.target.value)}
                      style={{ flex: 1 }} />
                    <span onClick={() => removeChoice(idx)}
                      style={{ color: C.textDim, cursor: 'pointer', fontSize: 15 }}>×</span>
                  </div>
                );
              })}
              {q.correct_answer && (
                <p style={{ fontSize: 11, color: C.success, marginTop: 6, marginBottom: 0 }}>
                  ✓ Correct: {q.correct_answer}
                </p>
              )}
            </div>
          )}

          {q.type === 'true_false' && (
            <Field label="Correct Answer" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['True', 'False'] as const).map(v => (
                  <Btn key={v} sm v={q.correct_answer === v ? 'primary' : 'default'}
                    onClick={() => setField('correct_answer', v)}>
                    {v}
                  </Btn>
                ))}
              </div>
            </Field>
          )}

          {q.type === 'fill_blank' && (
            <div style={{
              padding: 12, borderRadius: 8, background: C.bg,
              border: `1px solid ${C.border}`, marginBottom: 12,
            }}>
              <span style={{ fontSize: 11, fontWeight: 650, color: C.textMuted, textTransform: 'uppercase' }}>
                Accepted Answers ({(q.blanks || []).length} blanks)
              </span>
              <p style={{ fontSize: 11, color: C.textDim, margin: '4px 0 8px' }}>
                Use ___ in the stem for each blank.
              </p>
              {(q.blanks || []).map((b, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: C.textMuted, width: 55, flexShrink: 0 }}>Blank {idx + 1}:</span>
                  <Inp value={b} placeholder="Accepted answer"
                    onChange={e => {
                      const nb = [...(q.blanks || [])];
                      nb[idx] = e.target.value;
                      setField('blanks', nb);
                    }} style={{ flex: 1 }} />
                </div>
              ))}
              <Btn sm v="ghost" onClick={() => setField('blanks', [...(q.blanks || []), ''])}>
                + Add Blank
              </Btn>
            </div>
          )}

          {(q.type === 'essay' || q.type === 'short_answer') && (
            <Field label="Answer lines on PDF" style={{ marginBottom: 12 }}>
              <Inp type="number" value={q.essay_lines} style={{ maxWidth: 100 }}
                onChange={e => setField('essay_lines', parseInt(e.target.value) || 1)} />
            </Field>
          )}

          {(q.type === 'code_listing' || q.code_block) && (
            <Field label="Code Block (rendered in monospace on PDF)" style={{ marginBottom: 12 }}>
              <CodeTextArea value={q.code_block}
                onChange={e => setField('code_block', e.target.value)}
                placeholder=".section .text\n.globl main\nmain:\n    push rbp\n    mov rbp, rsp" />
            </Field>
          )}

          {q.type !== 'code_listing' && !q.code_block && (
            <Btn sm v="ghost" onClick={() => setField('code_block', '')} style={{ marginBottom: 12 }}>
              + Add Code Block
            </Btn>
          )}
        </>
      )}

      {dupMatches && dupMatches.length > 0 && (
        <div style={{
          margin: '12px 0', padding: 14, borderRadius: 8,
          background: `${C.warn}18`,
          border: `1px solid ${C.warn}66`,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: C.text }}>
            Similar question{dupMatches.length > 1 ? 's' : ''} already in the bank:
          </div>
          {dupMatches.map(({ score, question: m }) => (
            <div key={m.id} style={{
              padding: '8px 10px', marginBottom: 6, borderRadius: 6,
              background: C.surface, border: `1px solid ${C.border}`, fontSize: 12,
            }}>
              <span style={{
                display: 'inline-block', marginRight: 8, padding: '1px 6px',
                borderRadius: 4, background: `${C.warn}33`,
                fontWeight: 700, fontSize: 11, color: C.text,
              }}>{Math.round(score * 100)}% match</span>
              <span style={{ color: C.textMuted }}>{m.stem.slice(0, 120)}{m.stem.length > 120 ? '…' : ''}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Btn v="primary" onClick={() => void handleCreate(true)}>Save Anyway</Btn>
            <Btn v="ghost" onClick={() => setDupMatches(null)}>Back to Edit</Btn>
          </div>
        </div>
      )}

      {!dupMatches && (
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <Btn v="primary" onClick={() => void handleCreate()}
            disabled={(!q.stem.trim() && !q.code_block.trim()) || checking}>
            {checking ? 'Checking…' : 'Create Question'}
          </Btn>
          <Btn v="ghost" onClick={onCancel}>Cancel</Btn>
          <div style={{ flex: 1 }} />
          <Btn sm v="ghost" onClick={() => setQ({ ...BLANK_Q })}>Reset</Btn>
        </div>
      )}
    </div>
  );
}

