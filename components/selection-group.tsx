"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { cn } from "@/components/cn";

type SelectionGroupContextValue = {
  multiple: boolean;
  selectedValues: string[];
  onSelect: (value: string) => void;
};

const SelectionGroupContext =
  createContext<SelectionGroupContextValue | null>(null);

type SingleSelectionGroupProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  multiple?: false;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
};

type MultipleSelectionGroupProps<T extends string> = {
  value: T[];
  onChange: (value: T[]) => void;
  multiple: true;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
};

type SelectionTargetProps<T extends string> = {
  value: T;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string | ((selected: boolean) => string);
  children: ReactNode | ((selected: boolean) => ReactNode);
};

function useSelectionGroupContext() {
  const context = useContext(SelectionGroupContext);

  if (!context) {
    throw new Error(
      "SelectionTarget must be used within a SelectionGroup.",
    );
  }

  return context;
}

export function SelectionGroup<T extends string>(
  props: SingleSelectionGroupProps<T> | MultipleSelectionGroupProps<T>,
) {
  const selectedValues = props.multiple ? props.value : [props.value];

  const onSelect = (value: string) => {
    if (props.multiple) {
      const nextValue = selectedValues.includes(value as T)
        ? props.value.filter(currentValue => currentValue !== value)
        : props.value.concat(value as T);

      props.onChange(nextValue);
      return;
    }

    if (props.value !== value) {
      props.onChange(value as T);
    }
  };

  return (
    <SelectionGroupContext.Provider
      value={{
        multiple: Boolean(props.multiple),
        selectedValues,
        onSelect,
      }}
    >
      <div
        className={props.className}
        role={props.multiple ? "group" : "radiogroup"}
        aria-label={props.ariaLabel}
      >
        {props.children}
      </div>
    </SelectionGroupContext.Provider>
  );
}

export function SelectionTarget<T extends string>({
  value,
  disabled,
  ariaLabel,
  className,
  children,
}: SelectionTargetProps<T>) {
  const context = useSelectionGroupContext();
  const selected = context.selectedValues.includes(value);
  const resolvedClassName =
    typeof className === "function" ? className(selected) : className;

  return (
    <button
      type="button"
      role={context.multiple ? undefined : "radio"}
      aria-checked={context.multiple ? undefined : selected}
      aria-pressed={context.multiple ? selected : undefined}
      aria-label={ariaLabel}
      data-selected={selected ? "true" : "false"}
      disabled={disabled}
      onClick={() => context.onSelect(value)}
      className={cn(
        "transition-colors disabled:cursor-not-allowed",
        resolvedClassName,
      )}
    >
      {typeof children === "function" ? children(selected) : children}
    </button>
  );
}
