import type { TFunction } from "i18next";
import type { NavigateFunction } from "react-router-dom";
import { StatCard } from "../components/StatCard";

function IconIn() {
  return (
    <svg className="dashboardPillIcon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 5v14m0 0l-4-4m4 4l4-4"
      />
    </svg>
  );
}

function IconOut() {
  return (
    <svg className="dashboardPillIcon dashboardPillIcon--out" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 19V5m0 0l4 4m-4-4l-4 4"
      />
    </svg>
  );
}

function IconBalance() {
  return (
    <svg className="dashboardPillIcon dashboardPillIcon--balance" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M8 14h8M9 10h6" />
    </svg>
  );
}

type Props = {
  t: TFunction;
  navigate: NavigateFunction;
  currentUser: { id: string; username: string; role: string } | null;
  dashboard: {
    currencyCode: string;
    incoming: number;
    outgoing: number;
    balance: number;
    todayNet: number;
    pendingSettlements: number;
  };
  currencies: Array<{ code: string; name: string }>;
  onDashboardCurrencyChange: (code: string) => void;
};

export function DashboardPage({
  t,
  navigate,
  currentUser,
  dashboard,
  currencies,
  onDashboardCurrencyChange,
}: Props) {
  const fmt = (n: number) => n.toLocaleString("fa-AF");

  const currencyOptions =
    currencies.length > 0 ? currencies : [{ code: dashboard.currencyCode, name: dashboard.currencyCode }];

  return (
    <div className="dashboardPage">
      <header className="card dashboardWelcome">
        <div className="dashboardWelcomeTop">
          <div className="dashboardWelcomeText">
            <p className="dashboardEyebrow">{t("dashboardEyebrow")}</p>
            <h1 className="dashboardWelcomeTitle">
              {currentUser ? t("dashboardGreeting", { name: currentUser.username }) : t("dashboardGreetingShort")}
            </h1>
          </div>
          <div className="dashboardWelcomeControls">
            <label className="dashboardCurrencyLabel">
              <span className="dashboardCurrencyLabelText">{t("dashboardChooseCurrency")}</span>
              <select
                className="dashboardCurrencySelect"
                value={dashboard.currencyCode}
                onChange={(e) => onDashboardCurrencyChange(e.target.value)}
                aria-label={t("dashboardChooseCurrency")}
              >
                {currencyOptions.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </header>

      <section className="grid dashboardGrid">
        <div className="card hero dashboardHero">
          <div className="dashboardHeroHead">
            <div>
              <div className="heroTitle">{t("todaySummary")}</div>
              <p className="dashboardHeroSubtitle">{t("todaySummaryHint")}</p>
            </div>
            <div className="dashboardChip" title={t("dashboardSummaryCurrencyScope")}>
              {dashboard.currencyCode}
            </div>
          </div>
          <div className="heroRow dashboardPills">
            <div className="pill pill--in">
              <IconIn />
              <div className="pillBody">
                <span className="pillLabel">{t("incoming")}</span>
                <span className="pillMicro">{t("pillIncomingDesc")}</span>
                <span className="pillValue">{fmt(dashboard.incoming)}</span>
              </div>
            </div>
            <div className="pill pill--out">
              <IconOut />
              <div className="pillBody">
                <span className="pillLabel">{t("outgoing")}</span>
                <span className="pillMicro">{t("pillOutgoingDesc")}</span>
                <span className="pillValue">{fmt(dashboard.outgoing)}</span>
              </div>
            </div>
            <div className="pill pill--balance">
              <IconBalance />
              <div className="pillBody">
                <span className="pillLabel">{t("todayNet")}</span>
                <span className="pillMicro">{t("pillBalanceDesc")}</span>
                <span className="pillValue">{fmt(dashboard.todayNet)}</span>
              </div>
            </div>
          </div>

        </div>

        <StatCard
          title={t("quickActions")}
          value={t("newSlip")}
          hint={t("dashboardSlipCardHint")}
          tone="mint"
          badge={t("slips")}
          onClick={() => navigate("/slips")}
        />
        <StatCard
          title={t("customers")}
          value={t("addCustomer")}
          hint={t("dashboardCustomersCardHint")}
          tone="plum"
          badge={t("customers")}
          onClick={() => navigate("/customers")}
        />
      </section>

      <section className="dashboardMoreSection">
        <h2 className="dashboardMoreHeading">{t("dashboardMoreModules")}</h2>
        <p className="dashboardMoreSub">{t("dashboardMoreModulesHint")}</p>
        <div className="grid dashboardMoreGrid">
          <StatCard
            title={t("depositModule")}
            value={t("addDeposit")}
            hint={t("dashboardDepositsCardHint")}
            tone="primary"
            badge={t("depositModule")}
            onClick={() => navigate("/deposits")}
          />
          <StatCard
            title={t("partners")}
            value={t("addPartner")}
            hint={t("dashboardPartnersCardHint")}
            tone="mint"
            badge={t("partners")}
            onClick={() => navigate("/partners")}
          />
          <StatCard
            title={t("reports")}
            value={t("dashboardOpenReports")}
            hint={t("dashboardReportsCardHint")}
            tone="plum"
            badge={t("reports")}
            onClick={() => navigate("/reports")}
          />
        </div>
      </section>

    </div>
  );
}
