import type { Dispatch, FormEvent, SetStateAction } from "react";

type ProfileForm = {
  username: string;
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
};

type Props = {
  t: (key: string) => string;
  profileForm: ProfileForm;
  setProfileForm: Dispatch<SetStateAction<ProfileForm>>;
  profileSaving: boolean;
  profileMessage: string;
  profileError: string;
  onSubmit: (e: FormEvent) => Promise<void>;
};

export function ProfilePage(props: Props) {
  const { t, profileForm, setProfileForm, profileSaving, profileMessage, profileError, onSubmit } = props;

  return (
    <section className="card formCard" style={{ maxWidth: 560 }}>
      <div className="heroTitle">{t("adminProfile")}</div>
      <form className="customerForm" onSubmit={onSubmit}>
        <label>
          {t("username")}
          <input
            value={profileForm.username}
            onChange={(e) => setProfileForm((p) => ({ ...p, username: e.target.value }))}
            minLength={3}
            maxLength={50}
            required
          />
        </label>
        <label>
          {t("currentPassword")}
          <input
            type="password"
            value={profileForm.currentPassword}
            onChange={(e) => setProfileForm((p) => ({ ...p, currentPassword: e.target.value }))}
          />
        </label>
        <label>
          {t("newPassword")}
          <input
            type="password"
            value={profileForm.newPassword}
            onChange={(e) => setProfileForm((p) => ({ ...p, newPassword: e.target.value }))}
            minLength={6}
          />
        </label>
        <label>
          {t("confirmNewPassword")}
          <input
            type="password"
            value={profileForm.confirmNewPassword}
            onChange={(e) => setProfileForm((p) => ({ ...p, confirmNewPassword: e.target.value }))}
            minLength={6}
          />
        </label>
        <button className="primaryBtn" type="submit" disabled={profileSaving}>
          {profileSaving ? `${t("save")}...` : t("save")}
        </button>
      </form>
      {profileError ? <p className="emptyText">{profileError}</p> : null}
      {profileMessage ? <p className="emptyText">{profileMessage}</p> : null}
    </section>
  );
}
