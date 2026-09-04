import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold transition-[background-color,border-color,color,transform] duration-[var(--t-fast)] ease-out active:scale-[0.985] disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        // One accent action per screen. If a screen has two of these, one of them is wrong.
        primary: 'bg-accent text-accent-on hover:opacity-90',
        secondary: 'border border-line bg-surface text-ink hover:border-line-strong',
        ghost: 'text-ink-2 hover:bg-surface-2',
        danger: 'bg-neg text-surface hover:opacity-90',
      },
      size: {
        // 44px minimum tap target throughout (PRD 11).
        md: 'h-11 px-4',
        lg: 'h-13 px-5 text-base',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Component = asChild ? Slot : 'button';
    return (
      <Component ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  },
);
Button.displayName = 'Button';

/**
 * The ‹ › stepper used by every period picker (week, month, budget history).
 *
 * Square and quiet: it moves you between periods, it is never the action of the screen.
 */
export const StepButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        'grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-line bg-surface text-ink-2',
        'transition-[border-color,transform] duration-[var(--t-fast)] ease-out hover:border-line-strong active:scale-95',
        'disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
      {...props}
    />
  ),
);
StepButton.displayName = 'StepButton';
