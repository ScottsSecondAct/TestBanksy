import { useState, useEffect } from 'react';
import {
  useTheme, Badge, Btn, Inp, Sel, Chk, Field, Mono, MdPreview,
  TextArea, CodeTextArea, DIFFS,
} from './ui';
import type { Question, QuestionType, Difficulty } from './types';

interface QuestionRowProps {
  q: Question;
  isSel: boolean;
  isEdit: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onUpdate: (id: string, data: Partial<Question>) => void;
  onDelete: () => void;
  even: boolean;
  usedOn?: string[];
}

export default function QuestionRow({
  q, isSel, isEdit, onToggle, onEdit, onUpdate, onDelete, even, usedOn = [],
}: QuestionRowProps) {
  const { C, TYPES, TYPE_MAP, DIFF_C } = useTheme();
  const [L, setL] = useState<Question>({ ...q });
  const [newTag, setNewTag] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  useEffect(() => setL({ ...q }), [q]);

  const handleUpdate = () => {
    onUpdate(q.id, {
      type: L.type, difficulty: L.difficulty, points: L.points,
      topic: L.topic, lecture: L.lecture, source: L.source,
      stem: L.stem, choices: L.choices, correct_answer: L.correct_answer,
      blanks: L.blanks, essay_lines: L.essay_lines,
      code_block: L.code_block, code_language: L.code_language,
      tags: L.tags,
    });
  };

  const addTag = () => {
    const t = newTag.trim();
    if (t && !(L.tags || []).includes(t)) {
      setL(l => ({ ...l, tags: [...(l.tags || []), t] }));
    }
    setNewTag('');
  };

  const T = TYPE_MAP[q.type] || TYPES[3];

  return (
    <div style={{
      padding: '11px 14px',
      background: isSel ? C.accentBg : even ? C.surface : 'transparent',
      borderBottom: `1px solid ${C.border}`, transition: 'background .08s',
    }}>
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <Chk checked={isSel} onChange={onToggle} style={{ marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <MdPreview text={q.stem.length > 300 ? q.stem.substring(0, 300) + '...' : q.stem} />

          {q.code_block && !isEdit && (
            <Mono style={{ marginTop: 6, fontSize: 11, maxHeight: 120, overflow: 'hidden' }}>
              {q.code_block}
            </Mono>
          )}

          {(q.type === 'mc' || q.type === 'multi_select') && q.choices?.length > 0 && !isEdit && (
            <div style={{
              marginTop: 6, padding: '6px 10px', borderRadius: 6,
              background: `${C.bg}88`, border: `1px solid ${C.borderSubtle}`,
            }}>
              {q.choices.map(ch => {
                const isCorrect = q.type === 'multi_select'
                  ? (q.correct_answer || '').split(',').includes(ch.letter)
                  : ch.letter === q.correct_answer;
                return (
                  <div key={ch.letter} style={{
                    fontSize: 11.5, padding: '1px 0',
                    color: isCorrect ? C.success : C.textMuted,
                    fontWeight: isCorrect ? 650 : 400,
                  }}>
                    <strong>{ch.letter}.</strong> {ch.text}
                    {isCorrect && <span style={{ marginLeft: 5, fontSize: 10 }}>✓</span>}
                  </div>
                );
              })}
            </div>
          )}

          {q.type === 'true_false' && q.correct_answer && !isEdit && (
            <div style={{ marginTop: 6, fontSize: 11.5, color: C.success }}>
              Answer: {q.correct_answer}
            </div>
          )}

          <div style={{ display: 'flex', gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
            <Badge color={T.color}>{T.icon} {T.label}</Badge>
            {q.source && <Badge color={C.textMuted}>{q.source}</Badge>}
            {q.topic && <Badge color={C.accent}>{q.topic}</Badge>}
            <Badge color={DIFF_C[q.difficulty]}>{q.difficulty}</Badge>
            {q.points > 0 && <Badge color={C.warn}>{q.points} pts</Badge>}
            {q.lecture && <Badge color={C.textMuted}>Lec {q.lecture}</Badge>}
            {(q.tags || []).map(tag => (
              <Badge key={tag} color={C.textDim}># {tag}</Badge>
            ))}
            {usedOn.length > 0 && (
              <span title={usedOn.join(', ')}>
                <Badge color={C.success}>Used {usedOn.length}×</Badge>
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          <Btn sm v="ghost" onClick={onEdit}>{isEdit ? 'Close' : 'Edit'}</Btn>
          <Btn sm v="danger" onClick={onDelete}>Del</Btn>
        </div>
      </div>

      {/* Edit panel */}
      {isEdit && (
        <div style={{
          marginTop: 11, padding: 14, borderRadius: 9,
          background: C.bg, border: `1px solid ${C.border}`,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
            <Field label="Type">
              <Sel value={L.type} style={{ width: '100%' }}
                onChange={e => {
                  const t = e.target.value as QuestionType;
                  const upd: Partial<Question> = { type: t };
                  if ((t === 'mc' || t === 'multi_select') && (!L.choices || L.choices.length === 0))
                    upd.choices = ['A', 'B', 'C', 'D'].map(l => ({ letter: l, text: '' }));
                  if (t === 'true_false') upd.choices = [];
                  if (t === 'essay') upd.essay_lines = L.essay_lines || 10;
                  if (t === 'code_listing') upd.code_language = L.code_language || 'asm';
                  setL(l => ({ ...l, ...upd }));
                }}>
                {TYPES.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
              </Sel>
            </Field>
            <Field label="Difficulty">
              <Sel value={L.difficulty} style={{ width: '100%' }}
                onChange={e => setL(l => ({ ...l, difficulty: e.target.value as Difficulty }))}>
                {DIFFS.map(d => <option key={d}>{d}</option>)}
              </Sel>
            </Field>
            <Field label="Points">
              <Inp type="number" value={L.points || 0}
                onChange={e => setL(l => ({ ...l, points: parseInt(e.target.value) || 0 }))} />
            </Field>
            <Field label="Topic">
              <Inp value={L.topic || ''}
                onChange={e => setL(l => ({ ...l, topic: e.target.value }))}
                placeholder="e.g. x86 Addressing" />
            </Field>
            <Field label="Lecture #">
              <Inp value={L.lecture || ''}
                onChange={e => setL(l => ({ ...l, lecture: e.target.value }))}
                placeholder="e.g. 7" />
            </Field>
            <Field label="Source">
              <Inp value={L.source || ''}
                onChange={e => setL(l => ({ ...l, source: e.target.value }))} />
            </Field>
          </div>

          <Field label="Question Stem (Markdown)" style={{ marginBottom: 12 }}>
            <TextArea value={L.stem || ''}
              onChange={e => setL(l => ({ ...l, stem: e.target.value }))} />
          </Field>

          {/* MC / multi_select choices */}
          {(L.type === 'mc' || L.type === 'multi_select') && (
            <div style={{ padding: 12, borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 650, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  {L.type === 'multi_select' ? 'Choices (click all correct)' : 'Choices (click to mark correct)'}
                </span>
                <Btn sm v="ghost" onClick={() => {
                  const used = (L.choices || []).map(c => c.letter);
                  const next = 'ABCDEFGH'.split('').find(l => !used.includes(l)) ?? 'X';
                  setL(l => ({ ...l, choices: [...(l.choices || []), { letter: next, text: '' }] }));
                }}>+ Add</Btn>
              </div>
              {(L.choices || []).map((ch, idx) => {
                const isCorrect = L.type === 'multi_select'
                  ? (L.correct_answer || '').split(',').includes(ch.letter)
                  : L.correct_answer === ch.letter;
                return (
                  <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
                    <div
                      onClick={() => {
                        if (L.type === 'multi_select') {
                          const cur = (L.correct_answer || '').split(',').filter(Boolean);
                          const next = cur.includes(ch.letter)
                            ? cur.filter(l => l !== ch.letter)
                            : [...cur, ch.letter].sort();
                          setL(l => ({ ...l, correct_answer: next.join(',') }));
                        } else {
                          setL(l => ({ ...l, correct_answer: ch.letter }));
                        }
                      }}
                      style={{
                        width: 26, height: 26, borderRadius: L.type === 'multi_select' ? 4 : 5,
                        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                        background: isCorrect ? C.success : C.bg,
                        color: isCorrect ? '#fff' : C.textMuted,
                        border: `2px solid ${isCorrect ? C.success : C.border}`,
                      }}
                      title={L.type === 'multi_select' ? 'Toggle correct' : 'Click = correct'}
                    >{ch.letter}</div>
                    <Inp value={ch.text} onChange={e => {
                      const nc = [...L.choices];
                      nc[idx] = { ...nc[idx], text: e.target.value };
                      setL(l => ({ ...l, choices: nc }));
                    }} style={{ flex: 1 }} />
                    <span onClick={() => setL(l => ({ ...l, choices: l.choices.filter((_, j) => j !== idx) }))}
                      style={{ color: C.textDim, cursor: 'pointer', fontSize: 15 }}>×</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* True/False */}
          {L.type === 'true_false' && (
            <Field label="Correct Answer" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['True', 'False'] as const).map(v => (
                  <Btn key={v} sm v={L.correct_answer === v ? 'primary' : 'default'}
                    onClick={() => setL(l => ({ ...l, correct_answer: v }))}>
                    {v}
                  </Btn>
                ))}
              </div>
            </Field>
          )}

          {/* Fill in blank */}
          {L.type === 'fill_blank' && (
            <div style={{ padding: 12, borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 650, color: C.textMuted, textTransform: 'uppercase' }}>
                Blank Answers ({(L.blanks || []).length} blanks)
              </span>
              <p style={{ fontSize: 11, color: C.textDim, margin: '4px 0 8px' }}>
                Use ___ in the stem for each blank.
              </p>
              {(L.blanks || []).map((b, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: C.textMuted, width: 50, flexShrink: 0 }}>Blank {idx + 1}:</span>
                  <Inp value={b} placeholder="Accepted answer" onChange={e => {
                    const nb = [...(L.blanks || [])];
                    nb[idx] = e.target.value;
                    setL(l => ({ ...l, blanks: nb }));
                  }} style={{ flex: 1 }} />
                </div>
              ))}
              <Btn sm v="ghost" onClick={() => setL(l => ({ ...l, blanks: [...(l.blanks || []), ''] }))}>+ Add Blank</Btn>
            </div>
          )}

          {/* Essay / short answer lines + model answer */}
          {(L.type === 'essay' || L.type === 'short_answer') && (
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, marginBottom: 12 }}>
              <Field label="Answer lines on PDF">
                <Inp type="number" value={L.essay_lines || (L.type === 'essay' ? 10 : 3)} style={{ maxWidth: 100 }}
                  onChange={e => setL(l => ({ ...l, essay_lines: parseInt(e.target.value) || 1 }))} />
              </Field>
              <Field label="Model Answer (not printed)">
                <Inp value={L.correct_answer || ''}
                  onChange={e => setL(l => ({ ...l, correct_answer: e.target.value }))}
                  placeholder="Key points or expected answer" />
              </Field>
            </div>
          )}

          {/* Code listing */}
          {(L.type === 'code_listing' || L.code_block) && (
            <Field label="Code Block" style={{ marginBottom: 12 }}>
              <CodeTextArea value={L.code_block || ''}
                onChange={e => setL(l => ({ ...l, code_block: e.target.value }))} />
            </Field>
          )}

          {/* Tags */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 650, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>Tags</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
              {(L.tags || []).map(tag => (
                <span key={tag} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 10, fontSize: 11.5,
                  background: C.surface, border: `1px solid ${C.border}`, color: C.textMuted,
                }}>
                  # {tag}
                  <span onClick={() => setL(l => ({ ...l, tags: (l.tags || []).filter(t => t !== tag) }))}
                    style={{ cursor: 'pointer', color: C.textDim, fontSize: 13, lineHeight: 1 }}>×</span>
                </span>
              ))}
              {(L.tags || []).length === 0 && (
                <span style={{ fontSize: 11, color: C.textDim }}>No tags</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Inp value={newTag} placeholder="Add a tag…"
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                style={{ flex: 1 }} />
              <Btn sm v="ghost" onClick={addTag}>Add</Btn>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <Btn sm v="ghost" onClick={() => setL({ ...q })}>Reset</Btn>
            <Btn sm v="ghost" onClick={() => setShowPreview(true)}>Preview</Btn>
            <Btn sm v="primary" onClick={handleUpdate}>Update Question</Btn>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {showPreview && (
        <div
          onClick={() => setShowPreview(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.55)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', color: '#111', borderRadius: 8,
              padding: '32px 40px', maxWidth: 680, width: '100%',
              maxHeight: '85vh', overflowY: 'auto',
              fontFamily: 'Georgia, "Times New Roman", serif',
              boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <span style={{ fontSize: 11, color: '#666', fontFamily: 'sans-serif', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Question Preview
              </span>
              <button onClick={() => setShowPreview(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#999', lineHeight: 1 }}>
                ×
              </button>
            </div>

            {/* Question number + stem inline; wrapped lines indent under text */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flex: 1 }}>
                <span style={{ fontWeight: 700, fontSize: 14, flexShrink: 0, lineHeight: 1.7, whiteSpace: 'nowrap' }}>
                  {L.number ? `${L.number}.` : 'Q.'}
                </span>
                <div style={{ flex: 1 }}>
                  <MdPreview text={L.stem} style={{ fontSize: 14, color: '#111' }} />
                </div>
              </div>
              {L.points > 0 && (
                <span style={{ fontSize: 11.5, color: '#555', fontFamily: 'sans-serif', flexShrink: 0 }}>({L.points} pts)</span>
              )}
            </div>

            {/* Code block */}
            {L.code_block && (
              <div style={{
                marginBottom: 14, marginLeft: 26,
                background: '#f4f4f4', border: '1px solid #ddd',
                borderRadius: 4, padding: '10px 14px',
                fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
              }}>
                {L.code_block}
              </div>
            )}

            {/* MC / multi_select choices */}
            {(L.type === 'mc' || L.type === 'multi_select') && L.choices?.length > 0 && (
              <div style={{ marginLeft: 26, marginBottom: 14 }}>
                {L.choices.map(ch => (
                  <div key={ch.letter} style={{ fontSize: 13.5, lineHeight: 1.7 }}>
                    <strong>{ch.letter})</strong> {ch.text}
                  </div>
                ))}
              </div>
            )}

            {/* True / False */}
            {L.type === 'true_false' && (
              <div style={{ marginLeft: 26, marginBottom: 14, fontSize: 13.5 }}>
                <span style={{ marginRight: 24 }}><strong>True</strong></span>
                <span><strong>False</strong></span>
              </div>
            )}

            {/* Fill in blank — blanks already rendered in stem via MdPreview */}

            {/* Essay / short answer lines */}
            {(L.type === 'essay' || L.type === 'short_answer') && (
              <div style={{ marginLeft: 20, marginTop: 8 }}>
                {Array.from({ length: L.essay_lines || (L.type === 'essay' ? 10 : 3) }).map((_, i) => (
                  <div key={i} style={{
                    borderBottom: '1px solid #bbb', height: 28, marginBottom: 2,
                  }} />
                ))}
              </div>
            )}

            <div style={{
              marginTop: 20, paddingTop: 12, borderTop: '1px solid #e5e5e5',
              fontFamily: 'sans-serif', fontSize: 11, color: '#888',
              display: 'flex', gap: 12, flexWrap: 'wrap',
            }}>
              <span>Type: {L.type}</span>
              {L.topic && <span>Topic: {L.topic}</span>}
              {L.difficulty && <span>Difficulty: {L.difficulty}</span>}
              {L.lecture && <span>Lecture: {L.lecture}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
