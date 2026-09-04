import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const base =
  'w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-3 transition-colors duration-[var(--t-fast)] ease-out focus:border-accent focus:outline-none';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(base, className)} {...props} />,
);
Input.displayName = 'Input';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(base, 'min-h-20 resize-y', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label-micro mb-2.5 flex items-baseline gap-1.5">
        {label}
        {required ? <span className="text-neg">*</span> : null}
        {hint ? <span className="ml-auto normal-case tracking-normal">{hint}</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1.5 block text-xs text-neg">{error}</span> : null}
    </label>
  );
}
