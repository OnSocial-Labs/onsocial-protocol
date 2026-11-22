import type {
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

function projectName(test: TestCase): string {
  let suite: Suite | undefined = test.parent;
  while (suite) {
    const name = suite.project()?.name;
    if (name) return name;
    suite = suite.parent;
  }
  return 'unknown';
}

function skipReason(test: TestCase, result: TestResult): string {
  const notes = [...test.annotations, ...result.annotations]
    .filter(
      (annotation) => annotation.type === 'skip' || annotation.type === 'fixme'
    )
    .map((annotation) => annotation.description?.trim())
    .filter((description): description is string => Boolean(description));
  if (notes.length > 0) return [...new Set(notes)].join('; ');
  const message = result.errors
    .map((error) => error.message?.split('\n')[0]?.trim())
    .find(Boolean);
  return message || 'no reason recorded';
}

/**
 * The github reporter prints a skip count and no names. The job log
 * (success or failure) needs each skipped test and why.
 */
export default class SkipReasonsReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== 'skipped') return;
    const project = projectName(test);
    const title = test.titlePath().filter(Boolean).join(' › ');
    const where = `${test.location.file}:${test.location.line}`;
    process.stdout.write(
      `skipped: [${project}] ${where} › ${title} — ${skipReason(test, result)}\n`
    );
  }
}
