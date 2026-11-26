import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { messages } from "../../shared/messages";
import { useScreenFocus } from "../../shared/useScreenFocus";
import { OfflineBanner } from "./OfflineBanner";
import { useSignIn } from "./session";
import { useSignOutNotice } from "./signOutNotice";

export function SignIn() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const busy = useRef(false); // same-tick guard: isPending only updates after a render
  const notice = useSignOutNotice();
  const { mutate, isPending, error } = useSignIn();

  const heading = useScreenFocus();
  const alertId = useId();
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const missing = error?.messageId === "validationRequired";
  const blank = {
    username: username.trim() === "",
    password: password === "",
  };
  // Per field: wrong credentials concern both; "required" only the empty ones.
  const invalidFor = (empty: boolean) =>
    error?.messageId === "wrongCredentials" || (missing && empty) || undefined;
  const describedBy = (empty: boolean) => (error && (!missing || empty) ? alertId : undefined);

  // After a failed attempt focus what the message is about: the password, the first empty field,
  // or else the message itself.
  useEffect(() => {
    if (!error) return;
    const empty = [usernameRef.current, passwordRef.current].find(
      (input) => input && (input.name === "username" ? input.value.trim() : input.value) === "",
    );
    const target =
      error.messageId === "wrongCredentials"
        ? passwordRef.current
        : error.messageId === "validationRequired"
          ? empty
          : null;
    (target ?? alertRef.current)?.focus();
  }, [error]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy.current || isPending) return;
    busy.current = true;
    mutate(
      { username, password },
      {
        onError: (err) => {
          if (err.messageId === "wrongCredentials" || err.messageId === "locked") setPassword("");
        },
        onSettled: () => {
          busy.current = false;
        },
      },
    );
  };

  return (
    <main className="screen">
      <h1 ref={heading} tabIndex={-1}>
        {messages.signInTitle}
      </h1>
      <OfflineBanner />
      <form onSubmit={onSubmit} className="form">
        <label>
          {messages.usernameLabel}
          <input
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            ref={usernameRef}
            aria-invalid={invalidFor(blank.username)}
            aria-describedby={describedBy(blank.username)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <label>
          {messages.passwordLabel}
          <input
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            ref={passwordRef}
            aria-invalid={invalidFor(blank.password)}
            aria-describedby={describedBy(blank.password)}
            autoComplete="current-password"
          />
        </label>
        {notice && !error && <p role="alert">{messages.signOutNotConfirmed}</p>}
        {error && (
          <p role="alert" id={alertId} ref={alertRef} tabIndex={-1}>
            {messages[error.messageId]}
          </p>
        )}
        <button type="submit" aria-disabled={isPending} aria-busy={isPending}>
          {isPending ? messages.signingIn : messages.signInButton}
        </button>
      </form>
    </main>
  );
}
