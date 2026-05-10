import type { Dispatch, FormEvent, SetStateAction } from "react";

type Props = {
  t: (key: string) => string;
  authForm: { username: string; password: string };
  setAuthForm: Dispatch<SetStateAction<{ username: string; password: string }>>;
  authSaving: boolean;
  authError: string;
  onLogin: (e: FormEvent) => Promise<void>;
};

export function LoginPage(props: Props) {
  const { t, authForm, setAuthForm, authSaving, authError, onLogin } = props;
  return (
    <div className="appShell">
      <main className="content authContent">
        <section className="authCenter">
          <div className="card formCard authCard">
            <div className="heroTitle">{t("login")}</div>
            <form className="customerForm" onSubmit={onLogin}>
              <label>
                {t("username")}
                <input
                  value={authForm.username}
                  onChange={(e) => setAuthForm((p) => ({ ...p, username: e.target.value }))}
                  required
                />
              </label>
              <label>
                {t("password")}
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(e) => setAuthForm((p) => ({ ...p, password: e.target.value }))}
                  required
                />
              </label>
              <button className="primaryBtn" type="submit" disabled={authSaving}>
                {authSaving ? `${t("login")}...` : t("login")}
              </button>
              {authError ? <div className="emptyText">{authError}</div> : null}
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}

