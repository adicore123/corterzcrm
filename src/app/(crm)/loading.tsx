export default function Loading() {
  return (
    <div className="page-stack skeleton-page" role="status" aria-label="טוען נתונים">
      <div className="skeleton-header">
        <div className="skeleton-lines">
          <span className="skeleton-bar skeleton-h1" />
          <span className="skeleton-bar skeleton-sub" />
        </div>
        <span className="skeleton-bar skeleton-cta" />
      </div>
      <div className="card skeleton-card">
        <div className="skeleton-toolbar">
          <span className="skeleton-bar skeleton-search" />
          <span className="skeleton-bar skeleton-select" />
          <span className="skeleton-bar skeleton-select" />
        </div>
        <div className="skeleton-rows">
          <span className="skeleton-bar skeleton-row" />
          <span className="skeleton-bar skeleton-row" />
          <span className="skeleton-bar skeleton-row" />
          <span className="skeleton-bar skeleton-row" />
          <span className="skeleton-bar skeleton-row" />
        </div>
      </div>
    </div>
  );
}
