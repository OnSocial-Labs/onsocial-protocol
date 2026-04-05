import * as React from 'react';
import { Search, X } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const searchInputVariants = cva(
  'flex items-center gap-2 rounded-full border border-border/40 bg-background/45 text-muted-foreground transition-colors focus-within:border-border focus-within:bg-background/60',
  {
    variants: {
      size: {
        default: 'h-9 px-3 text-sm md:h-10',
        xs: 'h-7 px-2 text-xs md:px-2.5',
        sm: 'h-8 px-2.5 text-sm md:h-9 md:px-3',
        lg: 'h-10 px-3 text-sm md:h-11 md:px-4',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
);

export interface SearchInputProps
  extends Omit<
      React.InputHTMLAttributes<HTMLInputElement>,
      'size' | 'onChange'
    >,
    VariantProps<typeof searchInputVariants> {
  value: string;
  onValueChange: (value: string) => void;
  containerClassName?: string;
}

function SearchInput({
  value,
  onValueChange,
  size,
  className,
  containerClassName,
  placeholder = 'Search',
  'aria-label': ariaLabel,
  ...props
}: SearchInputProps) {
  return (
    <label className={cn(searchInputVariants({ size }), containerClassName)}>
      <Search className="h-4 w-4 shrink-0" />
      <input
        type="text"
        inputMode="search"
        enterKeyHint="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-label={ariaLabel ?? placeholder}
        placeholder={placeholder}
        className={cn(
          'h-full min-w-0 flex-1 bg-transparent pr-1 text-sm text-foreground outline-none placeholder:text-muted-foreground',
          className
        )}
        {...props}
      />
      <span className="flex h-6 w-6 shrink-0 items-center justify-center">
        {value ? (
          <button
            type="button"
            onClick={() => onValueChange('')}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-colors hover:border-border/40 hover:bg-background/60 hover:text-foreground"
            aria-label="Clear search"
            title="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </span>
    </label>
  );
}

export { SearchInput, searchInputVariants };
