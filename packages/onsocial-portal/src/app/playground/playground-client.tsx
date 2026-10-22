'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { CodeBlock } from '@/components/sdk/code-block';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { Button } from '@/components/ui/button';
import { compactModalBodyClass } from '@/components/ui/floating-panel';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import { ModalHeader } from '@/components/ui/modal-header';
import { Sheet } from '@/components/ui/sheet';
import { SurfacePanel } from '@/components/ui/surface-panel';
import {
  categories,
  playgroundExamples,
  type ExampleSnippet,
} from '@/data/playground-examples';

const titleId = 'playground-example-title';

export function PlaygroundClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [displayedExample, setDisplayedExample] =
    useState<ExampleSnippet | null>(null);

  const exampleId = searchParams.get('example');
  const selectedExample = useMemo(
    () =>
      playgroundExamples.find((example) => example.id === exampleId) ?? null,
    [exampleId]
  );

  if (selectedExample && displayedExample?.id !== selectedExample.id) {
    setDisplayedExample(selectedExample);
  }

  const visibleExamples =
    selectedCategory === 'all'
      ? playgroundExamples
      : playgroundExamples.filter(
          (example) => example.category === selectedCategory
        );

  const openExample = (example: ExampleSnippet) => {
    router.replace(`/playground?example=${example.id}`, { scroll: false });
  };

  const closeExample = () => {
    router.replace('/playground', { scroll: false });
  };

  return (
    <PageShell size="wide">
      <SecondaryPageHeader
        badge="Examples"
        badgeAccent="purple"
        glowAccents={['purple', 'blue']}
        align="left"
        contentClassName="max-w-5xl"
        descriptionClassName="max-w-3xl"
        title="SDK calls you can copy"
        description="Each example is the call. Copy it into your app and run it on an account you choose."
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="mb-6 flex flex-wrap gap-2">
          <Button
            onClick={() => setSelectedCategory('all')}
            variant={selectedCategory === 'all' ? 'default' : 'outline'}
            size="xs"
          >
            All
          </Button>
          {categories.map((category) => {
            const Icon = category.icon;
            return (
              <Button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                variant={
                  selectedCategory === category.id ? 'default' : 'outline'
                }
                size="xs"
                className="gap-1.5"
              >
                <Icon className="h-3.5 w-3.5" />
                {category.name}
              </Button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleExamples.map((example) => {
            const category = categories.find(
              (item) => item.id === example.category
            );
            return (
              <button
                key={example.id}
                type="button"
                onClick={() => openExample(example)}
                className="text-left"
              >
                <SurfacePanel
                  radius="xl"
                  tone="muted"
                  padding="roomy"
                  interactive
                  className="h-full"
                >
                  <div className="mb-2 text-xs text-muted-foreground">
                    {category?.name}
                  </div>
                  <h2 className="mb-1 text-base font-semibold tracking-[-0.02em] text-foreground">
                    {example.title}
                  </h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {example.description}
                  </p>
                </SurfacePanel>
              </button>
            );
          })}
        </div>
      </motion.div>

      <Sheet
        open={selectedExample != null}
        onOpenChange={(open) => {
          if (!open) closeExample();
        }}
        ariaLabelledby={titleId}
        dismissLabel="Close example"
        panelClassName="md:max-h-[min(820px,calc(100vh-2rem))] md:max-w-3xl"
      >
        {displayedExample ? (
          <>
            <ModalHeader
              titleId={titleId}
              title={displayedExample.title}
              description={displayedExample.description}
              actions={
                <ModalCloseButton
                  ariaLabel="Close example"
                  onClick={closeExample}
                />
              }
            />
            <div className={compactModalBodyClass}>
              <CodeBlock code={displayedExample.code} />
            </div>
          </>
        ) : null}
      </Sheet>
    </PageShell>
  );
}
