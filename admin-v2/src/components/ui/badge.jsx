import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-[0.625rem] font-medium whitespace-nowrap transition-[background-color,border-color,color,opacity] duration-150 ease-out focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-2.5!",
  {
    variants: {
      variant: {
        default: "border border-zinc-700 bg-zinc-800 text-zinc-200",
        secondary:
          "border border-zinc-800 bg-zinc-900 text-zinc-300",
        destructive:
          "border border-red-900/60 bg-red-950/40 text-red-300",
        outline:
          "border border-zinc-700 bg-transparent text-zinc-300",
        ghost:
          "text-zinc-300 hover:bg-zinc-800",
        link: "text-zinc-200 underline-offset-4 hover:underline",
        blue: "border border-zinc-700 bg-zinc-800 text-zinc-200",
        green: "border border-emerald-900/60 bg-emerald-950/40 text-emerald-300",
        yellow: "border border-amber-900/60 bg-amber-950/40 text-amber-300",
        red: "border border-red-900/60 bg-red-950/40 text-red-300",
        purple: "border border-violet-900/60 bg-violet-950/40 text-violet-300",
        muted: "border border-zinc-800 bg-zinc-900/80 text-zinc-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps({
      className: cn(badgeVariants({ variant }), className),
    }, props),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export { Badge, badgeVariants }
