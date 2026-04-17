import { test, expect, Page } from '@playwright/test';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function openComposer(page: Page) {
  await page.click('button:has-text("New Question")');
  await page.waitForSelector('textarea[placeholder*="stem"], textarea[placeholder*="Stem"]', { timeout: 5000 });
}

async function fillAndSaveQuestion(page: Page, stem: string, opts: {
  type?: string; topic?: string; difficulty?: string;
} = {}) {
  await openComposer(page);
  await page.fill('textarea[placeholder*="stem"], textarea[placeholder*="Stem"]', stem);
  if (opts.topic) {
    await page.fill('input[placeholder*="Topic"]', opts.topic);
  }
  if (opts.difficulty) {
    await page.selectOption('select[title*="Difficulty"], select >> nth=1', opts.difficulty);
  }
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(500);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('App shell', () => {
  test('loads and shows bank view', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/TestBanksy/i);
    await expect(page.locator('text=Bank')).toBeVisible();
  });

  test('nav links are visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Bank')).toBeVisible();
    await expect(page.locator('text=Generate')).toBeVisible();
    await expect(page.locator('text=Import')).toBeVisible();
    await expect(page.locator('text=Stats')).toBeVisible();
  });

  test('dark/light theme toggle works', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('body');
    const before = await html.evaluate(el => el.style.background);
    await page.click('button[title*="theme"], button[aria-label*="theme"], button:has-text("☾"), button:has-text("☀")');
    await page.waitForTimeout(200);
    const after = await html.evaluate(el => el.style.background);
    expect(before).not.toBe(after);
  });
});

test.describe('Question bank', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows empty state when bank is empty', async ({ page }) => {
    await expect(page.locator('text=/no questions|empty|0 questions/i')).toBeVisible({ timeout: 5000 });
  });

  test('can add a question via composer', async ({ page }) => {
    const stem = `E2E test question ${Date.now()}`;
    await fillAndSaveQuestion(page, stem, { topic: 'E2E Testing' });
    await expect(page.locator(`text=${stem}`)).toBeVisible({ timeout: 5000 });
  });

  test('question appears in bank after save', async ({ page }) => {
    const stem = `Added question ${Date.now()}`;
    await fillAndSaveQuestion(page, stem);
    await expect(page.locator(`text=${stem}`).first()).toBeVisible({ timeout: 5000 });
  });

  test('search filters questions', async ({ page }) => {
    const stem = `Searchable stem ${Date.now()}`;
    await fillAndSaveQuestion(page, stem);
    const searchBox = page.locator('input[placeholder*="Search"]');
    await searchBox.fill('zzz_nonexistent_xyz');
    await expect(page.locator(`text=${stem}`)).not.toBeVisible();
    await searchBox.fill('');
    await expect(page.locator(`text=${stem}`)).toBeVisible();
  });

  test('keyboard shortcut N opens composer', async ({ page }) => {
    await page.keyboard.press('n');
    await expect(page.locator('button:has-text("Save")')).toBeVisible({ timeout: 3000 });
  });

  test('Escape closes composer', async ({ page }) => {
    await openComposer(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('button:has-text("Save")')).not.toBeVisible({ timeout: 2000 });
  });
});

test.describe('Question selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Add two questions
    await fillAndSaveQuestion(page, `SelectionQ1 ${Date.now()}`, { topic: 'Selection' });
    await fillAndSaveQuestion(page, `SelectionQ2 ${Date.now()}`, { topic: 'Selection' });
  });

  test('can select a question with its checkbox', async ({ page }) => {
    const checkboxes = page.locator('[data-testid="question-checkbox"], input[type="checkbox"]');
    if (await checkboxes.count() === 0) {
      // Click the selection area directly (Chk component)
      await page.locator('.question-row, [data-row]').first().locator('div[style*="border"]').first().click();
    } else {
      await checkboxes.first().click();
    }
    await expect(page.locator('text=/selected|Selected/')).toBeVisible({ timeout: 3000 });
  });

  test('select-all shortcut selects all visible questions', async ({ page }) => {
    await page.keyboard.press('a');
    await expect(page.locator('text=/2 selected|selected/i')).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Generate view', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('switching to Generate tab shows the view', async ({ page }) => {
    await page.click('button:has-text("Generate")');
    await expect(page.locator('text=/Generate|generate/').first()).toBeVisible();
  });

  test('generate button disabled with no questions selected', async ({ page }) => {
    await page.click('button:has-text("Generate")');
    const generateBtn = page.locator('button:has-text("Generate PDF"), button:has-text("Download PDF")');
    if (await generateBtn.count() > 0) {
      await expect(generateBtn.first()).toBeDisabled();
    }
  });
});

test.describe('Import view', () => {
  test('shows import tabs', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Import")');
    await expect(page.locator('text=/Upload .docx|\.docx/i')).toBeVisible({ timeout: 3000 });
  });

  test('answer key tab is visible', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Import")');
    await page.click('button:has-text("Answer Key"), [role="tab"]:has-text("Answer Key")');
    await expect(page.locator('text=/answer key/i').first()).toBeVisible();
  });
});

test.describe('Stats view', () => {
  test('shows stats panel', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Stats")');
    await expect(page.locator('text=/Total Questions|total/i').first()).toBeVisible({ timeout: 3000 });
  });
});
