import { useState } from 'react';
import { useTheme, Btn, Inp, Sel, Field, TextArea } from './ui';
import type { Snippet } from './types';

interface SnippetEditorProps {
  snippet: Snippet;
  categories: readonly string[];
  onSave: (data: Pick<Snippet, 'title' | 'category' | 'markdown'>) => void;
  onCancel: () => void;
}

export default function SnippetEditor({ snippet, categories, onSave, onCancel }: SnippetEditorProps) {
  const { C } = useTheme();
  const [L, setL] = useState({ ...snippet });

  return (
    <div style={{
      marginTop: 8, padding: 10, borderRadius: 7,
      background: C.bg, border: `1px solid ${C.border}`,
    }}>
      <Field label="Title" style={{ marginBottom: 6 }}>
        <Inp value={L.title} onChange={e => setL(l => ({ ...l, title: e.target.value }))} />
      </Field>
      <Field label="Category" style={{ marginBottom: 6 }}>
        <Sel value={L.category} style={{ width: '100%' }}
          onChange={e => setL(l => ({ ...l, category: e.target.value }))}>
          {categories.map(c => <option key={c}>{c}</option>)}
        </Sel>
      </Field>
      <Field label="Markdown" style={{ marginBottom: 8 }}>
        <TextArea value={L.markdown}
          onChange={e => setL(l => ({ ...l, markdown: e.target.value }))}
          style={{ minHeight: 100 }} />
      </Field>
      <div style={{ display: 'flex', gap: 5 }}>
        <Btn sm v="primary"
          onClick={() => onSave({ title: L.title, category: L.category, markdown: L.markdown })}>
          Save
        </Btn>
        <Btn sm v="ghost" onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}
