import React, { createContext, useContext, useState, useEffect } from 'react';
import type { QuestionType, Difficulty } from './types';

// ── Color token shape ─────────────────────────────────────────────────────────
export interface Colors {
  bg: string; surface: string; surface2: string; surfaceHover: string;
  border: string; borderFocus: string; borderSubtle: string;
  text: string; textMuted: string; textDim: string;
  accent: string; accentBg: string;
  danger: string; dangerBg: string;
  success: string; successBg: string;
  warn: string; warnBg: string;
  cyan: string; cyanBg: string;
  pink: string; pinkBg: string;
  orange: string; orangeBg: string;
  codeBg: string; codeText: string;
}

// ── Light theme (default) ─────────────────────────────────────────────────────
export const LIGHT: Colors = {
  bg:           '#ffffff',
  surface:      '#f5f6fa',
  surface2:     '#ebedf5',
  surfaceHover: '#dfe2f0',
  border:       '#d0d3e8',
  borderFocus:  '#5b5fc7',
  borderSubtle: '#e8eaf5',
  text:         '#1a1b2e',
  textMuted:    '#5a5f8a',
  textDim:      '#9096b8',
  accent:       '#5b5fc7',
  accentBg:     'rgba(91,95,199,0.10)',
  danger:       '#c0293f',
  dangerBg:     'rgba(192,41,63,0.10)',
  success:      '#1a8a52',
  successBg:    'rgba(26,138,82,0.10)',
  warn:         '#9a6200',
  warnBg:       'rgba(154,98,0,0.10)',
  cyan:         '#0878a0',
  cyanBg:       'rgba(8,120,160,0.10)',
  pink:         '#a82e68',
  pinkBg:       'rgba(168,46,104,0.10)',
  orange:       '#9a4a08',
  orangeBg:     'rgba(154,74,8,0.10)',
  codeBg:       '#f0f2f8',
  codeText:     '#1a1b2e',
};

// ── Dark theme ────────────────────────────────────────────────────────────────
export const DARK: Colors = {
  bg:           '#0c0d12',
  surface:      '#161821',
  surface2:     '#1e2030',
  surfaceHover: '#252840',
  border:       '#2a2e45',
  borderFocus:  '#7c7ff2',
  borderSubtle: '#1e2238',
  text:         '#e0e2f0',
  textMuted:    '#7e82a8',
  textDim:      '#4e5278',
  accent:       '#7c7ff2',
  accentBg:     'rgba(124,127,242,0.10)',
  danger:       '#f05e6a',
  dangerBg:     'rgba(240,94,106,0.10)',
  success:      '#3dd68c',
  successBg:    'rgba(61,214,140,0.10)',
  warn:         '#f0b740',
  warnBg:       'rgba(240,183,64,0.10)',
  cyan:         '#36c5e0',
  cyanBg:       'rgba(54,197,224,0.10)',
  pink:         '#e87eaa',
  pinkBg:       'rgba(232,126,170,0.10)',
  orange:       '#e89047',
  orangeBg:     'rgba(232,144,71,0.10)',
  codeBg:       '#0a0b10',
  codeText:     '#b4d0e8',
};

// ── Theme context ─────────────────────────────────────────────────────────────
export interface TypeMeta {
  key: QuestionType;
  label: string;
  color: string;
  icon: string;
}

interface ThemeCtxValue {
  C: Colors;
  isDark: boolean;
  toggleTheme: () => void;
  TYPES: TypeMeta[];
  TYPE_MAP: Record<QuestionType, TypeMeta>;
  DIFF_C: Record<Difficulty, string>;
}

const STORAGE_KEY = 'testbank-theme';

const ThemeCtx = createContext<ThemeCtxValue>({} as ThemeCtxValue);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState<boolean>(
    () => localStorage.getItem(STORAGE_KEY) === 'dark',
  );

  const C = isDark ? DARK : LIGHT;

  const TYPES: TypeMeta[] = [
    { key: 'mc',           label: 'Multiple Choice',  color: C.cyan,     icon: '◉' },
    { key: 'multi_select', label: 'Select All',        color: C.accent,   icon: '☑' },
    { key: 'true_false',   label: 'True / False',     color: C.success,  icon: '⊘' },
    { key: 'fill_blank',   label: 'Fill in Blank',    color: C.warn,     icon: '▬' },
    { key: 'short_answer', label: 'Short Answer',     color: C.textMuted,icon: '✎' },
    { key: 'essay',        label: 'Essay',             color: C.pink,     icon: '¶' },
    { key: 'code_listing', label: 'Code Listing',     color: C.orange,   icon: '⟨⟩' },
  ];

  const TYPE_MAP = Object.fromEntries(
    TYPES.map(t => [t.key, t]),
  ) as Record<QuestionType, TypeMeta>;

  const DIFF_C: Record<Difficulty, string> = {
    easy: C.success, medium: C.warn, hard: C.danger,
  };

  const toggleTheme = () => {
    setIsDark(d => {
      const next = !d;
      localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
      return next;
    });
  };

  // Sync body background so areas outside the app root match
  useEffect(() => {
    document.body.style.background = C.bg;
    document.body.style.color = C.text;
  }, [C.bg, C.text]);

  return (
    <ThemeCtx.Provider value={{ C, isDark, toggleTheme, TYPES, TYPE_MAP, DIFF_C }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}

// ── Static exports (no color dependency) ─────────────────────────────────────
export const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];

import type { BloomLevel } from './types';
export const BLOOMS: { key: BloomLevel; label: string }[] = [
  { key: 'remember',   label: 'Remember' },
  { key: 'understand', label: 'Understand' },
  { key: 'apply',      label: 'Apply' },
  { key: 'analyze',    label: 'Analyze' },
  { key: 'evaluate',   label: 'Evaluate' },
  { key: 'create',     label: 'Create' },
];

export const SNIPPET_CATS = [
  'reference', 'register table', 'instruction table',
  'figure', 'formula', 'code example', 'other',
] as const;

// ── Badge ─────────────────────────────────────────────────────────────────────
interface BadgeProps {
  children: React.ReactNode;
  color?: string;
}

export function Badge({ children, color }: BadgeProps) {
  const { C } = useTheme();
  const c = color ?? C.accent;
  return (
    <span style={{
      display: 'inline-flex', padding: '2px 9px', borderRadius: 999,
      fontSize: 10.5, fontWeight: 650, letterSpacing: 0.6,
      color: c, background: `${c}18`, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

// ── Button ────────────────────────────────────────────────────────────────────
type BtnVariant = 'default' | 'primary' | 'danger' | 'ghost';

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  v?: BtnVariant;
  sm?: boolean;
}

export function Btn({ children, v = 'default', sm, style, disabled, ...rest }: BtnProps) {
  const { C } = useTheme();

  const BTN_VARIANTS: Record<BtnVariant, React.CSSProperties> = {
    default: { background: C.surface2, color: C.text,   border: `1px solid ${C.border}` },
    primary: { background: C.accent,   color: '#fff',   border: 'none' },
    danger:  { background: C.dangerBg, color: C.danger, border: `1px solid ${C.danger}33` },
    ghost:   { background: 'transparent', color: C.textMuted, border: 'none' },
  };

  return (
    <button disabled={disabled} {...rest} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: sm ? '4px 10px' : '7px 16px', fontSize: sm ? 11.5 : 12.5,
      fontWeight: 600, borderRadius: 7, cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all .12s', opacity: disabled ? 0.45 : 1, fontFamily: 'inherit',
      ...BTN_VARIANTS[v], ...style,
    }}>{children}</button>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────
export function Inp({ style, onBlur, ...p }: React.InputHTMLAttributes<HTMLInputElement>) {
  const { C } = useTheme();
  return (
    <input
      {...p}
      style={{
        padding: '7px 11px', background: C.bg, border: `1px solid ${C.border}`,
        borderRadius: 7, color: C.text, fontSize: 12.5, outline: 'none',
        fontFamily: 'inherit', width: '100%', transition: 'border .12s', ...style,
      }}
      onFocus={e => { (e.target as HTMLInputElement).style.borderColor = C.borderFocus; }}
      onBlur={e => {
        (e.target as HTMLInputElement).style.borderColor = C.border;
        onBlur?.(e);
      }}
    />
  );
}

// ── Select ────────────────────────────────────────────────────────────────────
export function Sel({ style, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { C } = useTheme();
  return (
    <select {...p} style={{
      padding: '7px 11px', background: C.bg, border: `1px solid ${C.border}`,
      borderRadius: 7, color: C.text, fontSize: 12.5, fontFamily: 'inherit',
      cursor: 'pointer', outline: 'none', ...style,
    }}>{children}</select>
  );
}

// ── Checkbox ──────────────────────────────────────────────────────────────────
interface ChkProps {
  checked: boolean;
  onChange: () => void;
  style?: React.CSSProperties;
}

export function Chk({ checked, onChange, style }: ChkProps) {
  const { C } = useTheme();
  return (
    <div onClick={onChange} style={{
      width: 17, height: 17, borderRadius: 4, flexShrink: 0,
      border: `2px solid ${checked ? C.accent : C.border}`,
      background: checked ? C.accent : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', transition: 'all .12s', ...style,
    }}>
      {checked && (
        <svg width="11" height="11" viewBox="0 0 12 12">
          <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2.2" fill="none"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

// ── Field label wrapper ───────────────────────────────────────────────────────
interface FieldProps {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Field({ label, children, style }: FieldProps) {
  const { C } = useTheme();
  return (
    <div style={style}>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 650, color: C.textMuted,
        marginBottom: 5, letterSpacing: 0.3, textTransform: 'uppercase',
      }}>{label}</label>
      {children}
    </div>
  );
}

// ── Monospace block ───────────────────────────────────────────────────────────
interface MonoProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Mono({ children, style }: MonoProps) {
  const { C } = useTheme();
  return (
    <pre style={{
      margin: 0, padding: '10px 14px', background: C.codeBg, borderRadius: 7,
      border: `1px solid ${C.borderSubtle}`, color: C.codeText,
      fontSize: 12, fontFamily: "'IBM Plex Mono', 'Cascadia Code', monospace",
      lineHeight: 1.55, whiteSpace: 'pre-wrap', overflow: 'auto', ...style,
    }}>{children}</pre>
  );
}

// ── Markdown preview (lightweight) ────────────────────────────────────────────
interface MdPreviewProps {
  text: string;
  style?: React.CSSProperties;
}

export function MdPreview({ text, style }: MdPreviewProps) {
  const { C } = useTheme();
  if (!text) return null;
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.6, color: C.text, ...style }}>
      {parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const inner = part.slice(3, -3).replace(/^\w+\n/, '');
          return <Mono key={i}>{inner.trim()}</Mono>;
        }
        let html = part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
        html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
        html = html.replace(/`(.+?)`/g,
          `<code style="background:${C.codeBg};padding:1px 5px;border-radius:3px;font-size:11.5px;font-family:monospace;color:${C.codeText}">$1</code>`);
        html = html.replace(/_{3,}/g,
          `<span style="border-bottom:2px solid ${C.textMuted};padding:0 30px">&nbsp;</span>`);
        html = html.replace(/\n/g, '<br/>');
        return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </div>
  );
}

// ── Textarea ──────────────────────────────────────────────────────────────────
export function TextArea({ style, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { C } = useTheme();
  return (
    <textarea {...p} style={{
      width: '100%', minHeight: 90, padding: 11, background: C.surface,
      border: `1px solid ${C.border}`, borderRadius: 7, color: C.text,
      fontSize: 12.5, fontFamily: "'IBM Plex Mono', monospace",
      resize: 'vertical', outline: 'none', lineHeight: 1.5, ...style,
    }} />
  );
}

// ── Code textarea ─────────────────────────────────────────────────────────────
export function CodeTextArea({ style, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { C } = useTheme();
  return (
    <textarea {...p} style={{
      width: '100%', minHeight: 120, padding: 11, background: C.codeBg,
      border: `1px solid ${C.borderSubtle}`, borderRadius: 7,
      color: C.codeText, fontSize: 12,
      fontFamily: "'IBM Plex Mono', 'Cascadia Code', monospace",
      resize: 'vertical', outline: 'none', lineHeight: 1.55, ...style,
    }} />
  );
}
