import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import {
  PulsingDots,
  type PulsingDotsSize,
} from '@/components/ui/pulsing-dots';

const buttonVariants = cva(
  'group inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'border portal-blue-surface',
        secondary: 'border portal-purple-surface',
        accent: 'border portal-green-surface',
        destructive: 'border portal-red-surface',
        outline:
          'border border-border/50 bg-transparent text-muted-foreground hover:border-border hover:text-foreground',
        ghost: 'hover:bg-muted/50 text-foreground',
        link: 'text-foreground underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-1.5 md:h-10 md:px-5 md:py-2',
        xs: 'h-7 px-2 text-xs md:px-2.5',
        sm: 'h-8 px-3 md:h-9 md:px-4',
        lg: 'h-10 px-6 md:h-12 md:px-8 text-[15px]',
        cta: 'h-auto w-full py-3 text-sm font-semibold md:py-4 md:text-base',
        icon: 'h-9 w-9 md:h-10 md:w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const buttonArrowBaseClass =
  'shrink-0 transition-transform duration-200 motion-reduce:transform-none';

export const buttonArrowRightClass = `${buttonArrowBaseClass} group-hover:translate-x-0.5`;

export const buttonArrowLeftClass = `${buttonArrowBaseClass} group-hover:-translate-x-0.5`;

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  loadingIndicatorSize?: PulsingDotsSize;
}

interface ButtonLoadingContentProps {
  loading?: boolean;
  loadingIndicatorSize?: PulsingDotsSize;
  children: React.ReactNode;
  contentClassName?: string;
}

export function ButtonLoadingContent({
  loading = false,
  loadingIndicatorSize = 'sm',
  children,
  contentClassName,
}: ButtonLoadingContentProps) {
  return (
    <span className="relative inline-grid place-items-center">
      <span
        aria-hidden={loading || undefined}
        className={cn(contentClassName, loading && 'invisible')}
      >
        {children}
      </span>
      {loading ? (
        <span
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          aria-hidden="true"
        >
          <PulsingDots size={loadingIndicatorSize} />
        </span>
      ) : null}
    </span>
  );
}

function Button({
  children,
  className,
  variant,
  size,
  asChild = false,
  disabled,
  loading = false,
  loadingIndicatorSize = 'sm',
  ref,
  ...props
}: ButtonProps & { ref?: React.Ref<HTMLButtonElement> }) {
  const Comp = asChild ? Slot : 'button';

  if (asChild && React.isValidElement(children)) {
    const childElement = children as React.ReactElement<{
      children?: React.ReactNode;
    }>;

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        aria-busy={loading || undefined}
        ref={ref}
        {...props}
      >
        {React.cloneElement(
          childElement,
          undefined,
          <ButtonLoadingContent
            loading={loading}
            loadingIndicatorSize={loadingIndicatorSize}
            contentClassName="inline-flex items-center justify-center gap-2"
          >
            {childElement.props.children}
          </ButtonLoadingContent>
        )}
      </Comp>
    );
  }

  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      ref={ref}
      {...props}
    >
      <ButtonLoadingContent
        loading={loading}
        loadingIndicatorSize={loadingIndicatorSize}
        contentClassName="inline-flex items-center justify-center gap-2"
      >
        {children}
      </ButtonLoadingContent>
    </Comp>
  );
}

export { Button, buttonVariants };
