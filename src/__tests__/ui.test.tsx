import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Provide a ThemeProvider wrapper so all components can call useTheme()
import { ThemeProvider } from '../../ui';
const Wrap = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

import { Badge, Btn, Inp, Sel, Chk, Field, MdPreview, TextArea } from '../../ui';

// ── Badge ─────────────────────────────────────────────────────────────────────

describe('Badge', () => {
  it('renders children', () => {
    render(<Wrap><Badge>MC</Badge></Wrap>);
    expect(screen.getByText('MC')).toBeInTheDocument();
  });

  it('applies custom color via style', () => {
    render(<Wrap><Badge color="#ff0000">X</Badge></Wrap>);
    const span = screen.getByText('X');
    expect(span.style.color).toBe('rgb(255, 0, 0)');
  });
});

// ── Btn ───────────────────────────────────────────────────────────────────────

describe('Btn', () => {
  it('renders children', () => {
    render(<Wrap><Btn>Click me</Btn></Wrap>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('calls onClick handler', async () => {
    const handler = vi.fn();
    render(<Wrap><Btn onClick={handler}>Go</Btn></Wrap>);
    await userEvent.click(screen.getByRole('button'));
    expect(handler).toHaveBeenCalledOnce();
  });

  it('is disabled when disabled prop set', () => {
    render(<Wrap><Btn disabled>Nope</Btn></Wrap>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('does not fire onClick when disabled', async () => {
    const handler = vi.fn();
    render(<Wrap><Btn disabled onClick={handler}>Nope</Btn></Wrap>);
    await userEvent.click(screen.getByRole('button'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('renders small variant with smaller padding', () => {
    render(<Wrap><Btn sm>Small</Btn></Wrap>);
    const btn = screen.getByRole('button');
    expect(btn.style.padding).toBe('4px 10px');
  });
});

// ── Inp ───────────────────────────────────────────────────────────────────────

describe('Inp', () => {
  it('renders as an input element', () => {
    render(<Wrap><Inp placeholder="Type here" /></Wrap>);
    expect(screen.getByPlaceholderText('Type here')).toBeInTheDocument();
  });

  it('calls onChange', async () => {
    const onChange = vi.fn();
    render(<Wrap><Inp onChange={onChange} /></Wrap>);
    await userEvent.type(screen.getByRole('textbox'), 'hello');
    expect(onChange).toHaveBeenCalled();
  });

  it('reflects value prop', () => {
    render(<Wrap><Inp value="preset" onChange={() => {}} /></Wrap>);
    expect(screen.getByRole('textbox')).toHaveValue('preset');
  });
});

// ── Chk ───────────────────────────────────────────────────────────────────────

describe('Chk', () => {
  it('shows checkmark when checked', () => {
    render(<Wrap><Chk checked={true} onChange={() => {}} /></Wrap>);
    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('hides checkmark when unchecked', () => {
    render(<Wrap><Chk checked={false} onChange={() => {}} /></Wrap>);
    expect(document.querySelector('svg')).not.toBeInTheDocument();
  });

  it('calls onChange when clicked', async () => {
    const handler = vi.fn();
    render(<Wrap><Chk checked={false} onChange={handler} /></Wrap>);
    await userEvent.click(document.querySelector('div[style]')!);
    expect(handler).toHaveBeenCalledOnce();
  });
});

// ── Field ─────────────────────────────────────────────────────────────────────

describe('Field', () => {
  it('renders label text', () => {
    render(<Wrap><Field label="Topic"><input /></Field></Wrap>);
    expect(screen.getByText('Topic')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(<Wrap><Field label="X"><input placeholder="child" /></Field></Wrap>);
    expect(screen.getByPlaceholderText('child')).toBeInTheDocument();
  });
});

// ── MdPreview ─────────────────────────────────────────────────────────────────

describe('MdPreview', () => {
  it('renders nothing for empty text', () => {
    const { container } = render(<Wrap><MdPreview text="" /></Wrap>);
    expect(container.firstChild).toBeNull();
  });

  it('renders plain text', () => {
    render(<Wrap><MdPreview text="Hello world" /></Wrap>);
    expect(screen.getByText(/Hello world/)).toBeInTheDocument();
  });

  it('renders bold markdown', () => {
    render(<Wrap><MdPreview text="**bold text**" /></Wrap>);
    expect(document.querySelector('b')).toBeInTheDocument();
  });

  it('renders italic markdown', () => {
    render(<Wrap><MdPreview text="*italic text*" /></Wrap>);
    expect(document.querySelector('em')).toBeInTheDocument();
  });

  it('renders fenced code block as pre', () => {
    render(<Wrap><MdPreview text={"```\nmov rax, 1\n```"} /></Wrap>);
    expect(document.querySelector('pre')).toBeInTheDocument();
  });

  it('renders inline code', () => {
    render(<Wrap><MdPreview text="Use `mov` instruction" /></Wrap>);
    expect(document.querySelector('code')).toBeInTheDocument();
  });

  it('renders fill-blank underscores as underline span', () => {
    render(<Wrap><MdPreview text="The register ___ holds the SP." /></Wrap>);
    const spans = document.querySelectorAll('span[style]');
    const hasUnderline = Array.from(spans).some(s =>
      s.getAttribute('style')?.includes('border-bottom'),
    );
    expect(hasUnderline).toBe(true);
  });
});

// ── TextArea ──────────────────────────────────────────────────────────────────

describe('TextArea', () => {
  it('renders a textarea', () => {
    render(<Wrap><TextArea /></Wrap>);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('accepts value', () => {
    render(<Wrap><TextArea value="some notes" onChange={() => {}} /></Wrap>);
    expect(screen.getByRole('textbox')).toHaveValue('some notes');
  });
});
