import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-full text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'border border-[#60A5FA]/40 bg-[#60A5FA]/[0.06] text-foreground hover:border-[#60A5FA]/60 hover:shadow-md hover:shadow-[#60A5FA]/20',
        secondary:
          'border border-[#C084FC]/40 bg-[#C084FC]/[0.06] text-foreground hover:border-[#C084FC]/60 hover:shadow-md hover:shadow-[#C084FC]/20',
        accent:
          'border border-[#4ADE80]/40 bg-[#4ADE80]/[0.06] text-foreground hover:border-[#4ADE80]/60 hover:shadow-md hover:shadow-[#4ADE80]/20',
        destructive:
          'border border-red-500/40 bg-red-500/[0.06] text-red-400 hover:border-red-500/60 hover:shadow-md hover:shadow-red-500/20',
        outline:
          'border border-border/50 bg-transparent text-muted-foreground hover:border-border hover:text-foreground',
        ghost: 'hover:bg-muted/50 text-foreground',
        link: 'text-foreground underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-9 px-4',
        lg: 'h-12 px-8 text-[15px]',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  ref,
  ...props
}: ButtonProps & { ref?: React.Ref<HTMLButtonElement> }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
}

export { Button, buttonVariants };
