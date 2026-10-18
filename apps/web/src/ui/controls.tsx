import { useId, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";

import type { Avatar as AvatarData } from "../chat/types.js";
import { Avatar } from "./avatar.js";
import { Icon, type IconName } from "./icons.js";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  readonly variant?: "default" | "solid" | "danger" | "solidDanger";
  readonly size?: "sm" | "md" | "big";
  readonly wide?: boolean;
  readonly icon?: IconName;
}

const VARIANT_CLASS = {
  default: "",
  solid: " solid",
  danger: " danger",
  solidDanger: " solid danger",
} as const;

/** Fully round pill button, 36px. */
export function Button({
  variant = "default",
  size = "md",
  wide = false,
  icon,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const cls = `btn${VARIANT_CLASS[variant]}${size === "md" ? "" : ` ${size}`}${wide ? " wide" : ""}`;
  return (
    <button type={type} className={cls} {...rest}>
      {icon === undefined ? null : <Icon name={icon} />}
      {children}
    </button>
  );
}

interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "children"
> {
  readonly icon: IconName;
  /** Accessible name. */
  readonly label: string;
  /** Tooltip text, when the control is not obvious from its icon. */
  readonly tip?: string;
}

/** Round 36px icon button. */
export function IconButton({ icon, label, tip, type = "button", ...rest }: IconButtonProps) {
  return (
    <button type={type} className="ib" aria-label={label} data-tip={tip} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

/** A labelled field row: label above, the control below. */
export function Field({
  label,
  htmlFor,
  children,
}: {
  readonly label: string;
  readonly htmlFor?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="fld">
      {htmlFor === undefined ? (
        <span className="lbl">{label}</span>
      ) : (
        <label className="lbl" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
    </div>
  );
}

interface TextInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly id?: string;
  readonly label?: string;
  readonly placeholder?: string;
  readonly icon?: IconName;
  readonly inputMode?: "email" | "numeric" | "text";
  /** Focus the field when its dialog opens. */
  readonly autoFocus?: boolean;
  readonly onEnter?: () => void;
}

/** Filled 44px input. No focus ring: on focus the border turns the text color. */
export function TextInput({
  value,
  onChange,
  id,
  label,
  placeholder,
  icon,
  inputMode,
  autoFocus,
  onEnter,
}: TextInputProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && onEnter !== undefined) {
      event.preventDefault();
      onEnter();
    }
  };
  return (
    <div className="inp">
      {icon === undefined ? null : <Icon name={icon} />}
      <input
        id={id}
        value={value}
        aria-label={label}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete="off"
        spellCheck={false}
        data-autofocus={autoFocus === true ? "" : undefined}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

/** A read-only row styled like an input, such as "Signed in with". */
export function FlatField({ children }: { readonly children: ReactNode }) {
  return <div className="inp flat">{children}</div>;
}

/** Switch row for a setting; the whole row is the control. */
export function SwitchRow({
  icon,
  label,
  checked,
  onChange,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="irow"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <Icon name={icon} />
      <span className="it">{label}</span>
      <span className="switch" />
    </button>
  );
}

export interface RadioOption<Value extends string> {
  readonly value: Value;
  readonly label: string;
  readonly description?: string;
  /** Muted text after the label, such as "· Default". */
  readonly suffix?: string;
}

interface RadioListProps<Value extends string> {
  readonly label: string;
  readonly options: readonly RadioOption<Value>[];
  readonly value: Value | null;
  readonly onChange: (value: Value) => void;
}

/** Radio list on native radio inputs, so arrows, Tab and the accessible name come from the browser. */
export function RadioList<Value extends string>({
  label,
  options,
  value,
  onChange,
}: RadioListProps<Value>) {
  const name = useId();
  return (
    <fieldset className="radios" aria-label={label}>
      {options.map((option) => (
        <label key={option.value} className="radio">
          <input
            type="radio"
            name={name}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          <span className="rd" />
          <span>
            <b>
              {option.label}
              {option.suffix === undefined ? null : <span className="dflt"> {option.suffix}</span>}
            </b>
            {option.description === undefined ? null : <small>{option.description}</small>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** A selected person in the add-people field, with a remove control. */
export function PeopleChip({
  name,
  avatar,
  onRemove,
}: {
  readonly name: string;
  readonly avatar: AvatarData;
  readonly onRemove: () => void;
}) {
  return (
    <span className="pchip">
      <Avatar avatar={avatar} size="xs" />
      {name}
      <button type="button" aria-label={`Remove ${name}`} onClick={onRemove}>
        <Icon name="x" />
      </button>
    </span>
  );
}

/** An invite link with its copy button. `copied` shows the check for a moment. */
export function LinkBox({
  url,
  copied,
  onCopy,
}: {
  readonly url: string;
  readonly copied: boolean;
  readonly onCopy: () => void;
}) {
  return (
    <div className="linkbox">
      <code>{url}</code>
      <button
        type="button"
        className={`cpy${copied ? " done" : ""}`}
        aria-label={copied ? "Copied" : "Copy invite link"}
        data-tip={copied ? "Copied" : "Copy link"}
        onClick={onCopy}
      >
        <Icon name={copied ? "check" : "copy"} />
      </button>
    </div>
  );
}
