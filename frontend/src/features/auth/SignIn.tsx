import { useRef, useState, type FormEvent } from "react";
import { messages } from "../../shared/messages";
import { useSignIn } from "./session";
import { useSignOutNotice } from "./signOutNotice";

export function SignIn() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const busy = useRef(false); // same-tick guard: isPending only updates after a render
  const notice = useSignOutNotice();
  const { mutate, isPending, error } = useSignIn();

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
      <h1>{messages.signInTitle}</h1>
      <form onSubmit={onSubmit} className="form">
        <label>
          {messages.usernameLabel}
          <input
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
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
            autoComplete="current-password"
          />
        </label>
        {notice && !error && <p role="alert">{messages.signOutNotConfirmed}</p>}
        {error && <p role="alert">{messages[error.messageId]}</p>}
        <button type="submit" disabled={isPending}>
          {messages.signInButton}
        </button>
      </form>
    </main>
  );
}
