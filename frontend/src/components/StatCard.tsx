type StatCardProps = {
  title: string;
  value: string;
  hint?: string;
  tone?: "primary" | "mint" | "plum";
  badge?: string;
  onClick?: () => void;
};

export function StatCard({ title, value, hint, tone = "primary", badge, onClick }: StatCardProps) {
  const body = (
    <>
      <div className="statTop">
        <div className="card-title">{title}</div>
        {badge ? <div className="statBadge">{badge}</div> : null}
      </div>
      <div className="card-value">{value}</div>
      {hint ? <div className="card-hint">{hint}</div> : null}
      <div className="statGlow" aria-hidden="true" />
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={`card stat tone-${tone} statInteractive`} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className={`card stat tone-${tone}`}>{body}</div>;
}

