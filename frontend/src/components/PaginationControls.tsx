type Props = {
  page: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  t: (key: string) => string;
};

export function PaginationControls({ page, totalItems, pageSize, onPageChange, t }: Props) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  if (totalItems <= pageSize) return null;

  return (
    <div className="paginationBar">
      <button className="navItem" type="button" onClick={() => onPageChange(safePage - 1)} disabled={safePage <= 1}>
        {t("previous")}
      </button>
      <div className="paginationInfo">
        {t("page")} {safePage} {t("of")} {totalPages}
      </div>
      <button
        className="navItem"
        type="button"
        onClick={() => onPageChange(safePage + 1)}
        disabled={safePage >= totalPages}
      >
        {t("next")}
      </button>
    </div>
  );
}

