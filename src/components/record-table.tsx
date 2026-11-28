import Link from "next/link";
import { Bike, ChevronLeft, ClipboardList, Pencil, Phone, ShieldAlert, UserRound, type LucideIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { CardPhotoGallery, CardWhatsappButton, type CardPhoto } from "./card-actions";
import { ClickableTableBody } from "./clickable-tbody";
import { ProgressiveTableSlices } from "./progressive-load-more";
import { QuickPeekTrigger } from "./quick-peek-drawer";

const PAGE_SIZE = 50;

export type CardMetaItem = {
  label: string;
  value: ReactNode;
  wide?: boolean;
};

export type RecordCardMeta = {
  title: string;
  number?: string;
  subtitle?: string;
  modelImageUrl?: string;
  avatarText?: string;
  fallbackIcon?: "bike" | "customer" | "fault";
  badges?: ReactNode[];
  statusControl?: ReactNode;
  accent?: "red" | "amber" | "green" | "blue" | "neutral";
  highlightNote?: { label: string; text: string; tone?: "amber" | "neutral" };
  meta: CardMetaItem[];
  photos?: CardPhoto[];
  whatsappMessage: string;
  whatsappPhone?: string;
  whatsappTargetLabel?: string;
  phoneHref?: string;
  extraLink?: { href: string; label: string };
};

export type TableRow = {
  id: string;
  label: string;
  href: string;
  editHref?: string;
  cells: ReactNode[];
  card?: RecordCardMeta;
};

function CardThumbnail({ card }: { card: RecordCardMeta }) {
  if (card.modelImageUrl) {
    return (
      <span className="mobile-card-thumb">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={card.modelImageUrl} alt="" aria-hidden loading="lazy" decoding="async" />
      </span>
    );
  }
  if (card.avatarText) {
    return (
      <span className="mobile-card-thumb is-avatar" aria-hidden>
        {card.avatarText}
      </span>
    );
  }
  const Icon =
    card.fallbackIcon === "customer"
      ? UserRound
      : card.fallbackIcon === "fault"
        ? ShieldAlert
        : Bike;
  return (
    <span className="mobile-card-thumb is-empty" aria-hidden>
      <Icon size={26} strokeWidth={1.7} />
    </span>
  );
}

function renderTableRow(row: TableRow, columns: string[], hasActions: boolean) {
  return (
    <tr key={row.id} data-row-href={row.href} className="clickable-row">
      {row.cells.map((cell, index) => (
        <td key={columns[index]}>
          {index === 0 ? (
            <Link className="record-link" href={row.href} prefetch={false}>
              {cell}
            </Link>
          ) : (
            cell
          )}
        </td>
      ))}
      <td className={hasActions ? "table-actions-cell" : "table-open"}>
        <div className="table-actions">
          {row.card && (
            <QuickPeekTrigger
              label={row.label}
              title={row.card.title}
              number={row.card.number}
              subtitle={row.card.subtitle}
              accent={row.card.accent}
              thumbNode={<CardThumbnail card={row.card} />}
              badgesNode={
                row.card.badges && row.card.badges.length > 0 ? (
                  <div className="mobile-card-badges">{row.card.badges}</div>
                ) : null
              }
              highlightNote={row.card.highlightNote}
              metaNode={
                row.card.meta.length > 0 ? (
                  <dl className="quick-peek-meta-grid">
                    {row.card.meta.map((item) => (
                      <div key={item.label} className={item.wide ? "is-wide" : undefined}>
                        <dt>{item.label}</dt>
                        <dd>{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null
              }
              photos={row.card.photos}
              whatsappMessage={row.card.whatsappMessage}
              whatsappPhone={row.card.whatsappPhone}
              whatsappTargetLabel={row.card.whatsappTargetLabel}
              phoneHref={row.card.phoneHref}
              href={row.href}
              editHref={row.editHref}
            />
          )}
          {row.card?.photos && row.card.photos.length > 0 && (
            <CardPhotoGallery
              photos={row.card.photos}
              title={row.card.title}
              recordHref={row.href}
              mode="table"
            />
          )}
          {row.card && (
            <CardWhatsappButton
              message={row.card.whatsappMessage}
              recordHref={row.href}
              label={row.label}
              variant="table"
              targetPhone={row.card.whatsappPhone}
              targetDisplay={row.card.whatsappTargetLabel}
            />
          )}
          {row.editHref && (
            <Link
              href={row.editHref}
              prefetch={false}
              className="row-action-btn"
              aria-label={"עריכת " + row.label}
              title="עריכה"
            >
              <Pencil size={15} />
            </Link>
          )}
          <Link
            href={row.href}
            prefetch={false}
            className="row-arrow"
            aria-label={"פתיחת " + row.label}
            title="פתיחת כרטיס"
          >
            <ChevronLeft size={17} />
          </Link>
        </div>
      </td>
    </tr>
  );
}

function renderMobileItem(row: TableRow, columns: string[]) {
  const card = row.card;
  if (!card) {
    return (
      <li className="mobile-record" key={row.id}>
        <Link className="mobile-record-title" href={row.href} prefetch={false}>
          <span>{row.cells[0]}</span>
          <ChevronLeft size={18} aria-hidden />
        </Link>
        <dl>
          {row.cells.slice(1).map((cell, index) => (
            <div key={columns[index + 1]}>
              <dt>{columns[index + 1]}</dt>
              <dd>{cell}</dd>
            </div>
          ))}
        </dl>
      </li>
    );
  }
  const photos = card.photos ?? [];
  return (
    <li className={"mobile-record-card accent-" + (card.accent ?? "neutral")} key={row.id}>
      <div className="mobile-card-head">
        <Link
          href={row.href}
          prefetch={false}
          className="mobile-card-thumb-link"
          tabIndex={-1}
          aria-hidden
        >
          <CardThumbnail card={card} />
        </Link>
        <div className="mobile-card-heading">
          <div className="mobile-card-topline">
            {card.number ? (
              <Link href={row.href} prefetch={false} className="mobile-card-number">
                <bdi dir="ltr">{card.number}</bdi>
              </Link>
            ) : null}
            {card.subtitle && !card.number ? (
              <span className="mobile-card-subtitle">{card.subtitle}</span>
            ) : null}
          </div>
          <Link href={row.href} prefetch={false} className="mobile-card-title">
            {card.title}
          </Link>
          {card.subtitle && card.number ? (
            <span className="mobile-card-subtitle">{card.subtitle}</span>
          ) : null}
          {card.badges && card.badges.length > 0 && (
            <div className="mobile-card-badges">{card.badges}</div>
          )}
        </div>
      </div>

      {card.statusControl}

      {card.highlightNote && (
        <div
          className={
            "mobile-card-highlight" + (card.highlightNote.tone === "amber" ? " is-amber" : "")
          }
        >
          <small>{card.highlightNote.label}</small>
          <p>{card.highlightNote.text}</p>
        </div>
      )}

      {card.meta.length > 0 && (
        <dl className="mobile-meta-grid">
          {card.meta.map((item) => (
            <div key={item.label} className={item.wide ? "is-wide" : undefined}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {photos.length > 0 && (
        <CardPhotoGallery
          photos={photos}
          title={card.title}
          recordHref={row.href}
          mode="mobile-strip"
        />
      )}

      <div className="mobile-card-actions">
        <CardWhatsappButton
          message={card.whatsappMessage}
          recordHref={row.href}
          label={row.label}
          variant="mobile"
          targetPhone={card.whatsappPhone}
          targetDisplay={card.whatsappTargetLabel}
        />
        {photos.length > 0 && (
          <CardPhotoGallery
            photos={photos}
            title={card.title}
            recordHref={row.href}
            mode="mobile-button"
          />
        )}
        {card.phoneHref && (
          <a
            href={card.phoneHref}
            className="mobile-action-btn"
            aria-label={"חיוג עבור " + card.title}
          >
            <Phone size={15} aria-hidden />
            <span>חיוג</span>
          </a>
        )}
        {card.extraLink && (
          <Link href={card.extraLink.href} prefetch={false} className="mobile-action-btn">
            <span>{card.extraLink.label}</span>
          </Link>
        )}
        {row.editHref && (
          <Link
            href={row.editHref}
            prefetch={false}
            className="mobile-action-btn"
            aria-label={"עריכת " + row.label}
          >
            <Pencil size={15} aria-hidden />
            <span>עריכה</span>
          </Link>
        )}
        <Link href={row.href} prefetch={false} className="mobile-action-btn is-open">
          <span>פרטים</span>
          <ChevronLeft size={15} aria-hidden />
        </Link>
      </div>
    </li>
  );
}

export function RecordTable({
  columns,
  rows,
  empty,
  icon: Icon = ClipboardList,
  showEmptyHeader = false,
}: {
  columns: string[];
  rows: TableRow[];
  empty: string;
  icon?: LucideIcon;
  showEmptyHeader?: boolean;
}) {
  const hasActions = rows.some((row) => Boolean(row.card || row.editHref));

  const thead = (
    <thead>
      <tr>
        {columns.map((column) => (
          <th scope="col" key={column}>
            {column}
          </th>
        ))}
        <th scope="col" className={hasActions ? "table-actions-head" : "table-open"}>
          {hasActions ? "פעולות" : <span className="sr-only">פתיחה</span>}
        </th>
      </tr>
    </thead>
  );

  if (rows.length > PAGE_SIZE) {
    const initialSlice = rows.slice(0, PAGE_SIZE);
    const extraTablePages: ReactNode[] = [];
    const extraMobilePages: ReactNode[] = [];
    for (let offset = PAGE_SIZE; offset < rows.length; offset += PAGE_SIZE) {
      const slice = rows.slice(offset, offset + PAGE_SIZE);
      extraTablePages.push(
        <Fragment key={`tbl-${offset}`}>
          {slice.map((row) => renderTableRow(row, columns, hasActions))}
        </Fragment>,
      );
      extraMobilePages.push(
        <Fragment key={`mob-${offset}`}>
          {slice.map((row) => renderMobileItem(row, columns))}
        </Fragment>,
      );
    }

    return (
      <ProgressiveTableSlices
        thead={thead}
        initialTableRows={initialSlice.map((row) => renderTableRow(row, columns, hasActions))}
        extraTablePages={extraTablePages}
        initialMobileItems={initialSlice.map((row) => renderMobileItem(row, columns))}
        extraMobilePages={extraMobilePages}
        total={rows.length}
        pageSize={PAGE_SIZE}
      />
    );
  }

  return (
    <>
      {(rows.length > 0 || showEmptyHeader) && (
        <div className="table-scroll">
          <table className="data-table">
            {thead}
            <ClickableTableBody>{rows.map((row) => renderTableRow(row, columns, hasActions))}</ClickableTableBody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="mobile-records">{rows.map((row) => renderMobileItem(row, columns))}</ul>
      )}

      {rows.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon">
            <Icon size={23} strokeWidth={1.65} aria-hidden />
          </span>
          <strong>{empty}</strong>
        </div>
      )}
    </>
  );
}
