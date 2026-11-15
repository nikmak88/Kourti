import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { dateLocale } from "@/i18n/dates";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Date picker grid (react-day-picker v9).
 *
 * The class names below are the v9 ones (month_caption, weekdays, week,
 * day/day_button, selected, ...). Upstream still used the v8 names (head_row,
 * cell, nav_button, ...), which v9 ignores, so the weekday header and the
 * navigation buttons lost their layout.
 *
 * Month/day names and the first day of the week follow the UI language
 * (date-fns el / enGB: Monday first) unless the caller passes `locale`.
 */
function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  // Subscribe to language changes so the names re-render after a switch.
  useTranslation();
  const navButton = cn(
    buttonVariants({ variant: "outline" }),
    "pointer-events-auto h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
  );
  return (
    <DayPicker
      locale={dateLocale()}
      showOutsideDays={showOutsideDays}
      className={cn("relative p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "space-y-4",
        month_caption: "flex h-7 items-center justify-center",
        caption_label: "text-sm font-medium",
        // The nav sits over the caption; it lets clicks through except on its buttons.
        nav: "pointer-events-none absolute inset-x-3 top-3 flex h-7 items-center justify-between",
        button_previous: navButton,
        button_next: navButton,
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 rounded-md text-[0.8rem] font-normal text-muted-foreground",
        week: "mt-2 flex w-full",
        day: "relative h-9 w-9 p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
        ),
        range_start: "day-range-start",
        range_end: "day-range-end rounded-r-md",
        selected:
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button:hover]:bg-primary [&>button:hover]:text-primary-foreground [&>button:focus]:bg-primary [&>button:focus]:text-primary-foreground",
        today: "[&>button]:bg-accent [&>button]:text-accent-foreground",
        outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        disabled: "text-muted-foreground opacity-50",
        range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground [&>button]:bg-transparent [&>button]:text-accent-foreground",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
