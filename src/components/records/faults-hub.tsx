"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ExternalLink,
  FileText,
  Layers,
  Plus,
  Save,
  Unlock,
  Video,
} from "lucide-react";
import { newRequestId, requestJson } from "@/lib/client-api";
import { embedVideoUrl, formatBytes, formatDate } from "@/lib/presentation";
import {
  devices,
  faultSeverities,
  type CatalogModel,
  type CommonFault,
  type Device,
  type FaultGuide,
  type FaultSeverity,
} from "@/lib/validation/models";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";

export function hasModelUnlock(guide: FaultGuide): boolean {
  return Boolean(
    guide.unlockInstructions.trim().length > 0
      || guide.videoLinks.length > 0
      || guide.attachments.some((att) => att.kind === "video"),
  );
}

export function FaultsModuleHub({
  records,
  catalogModels,
  canEdit,
  children,
}: {
  records: FaultGuide[];
  catalogModels: CatalogModel[];
  canEdit: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"all" | "faults" | "unlocks">("all");

  // Quick Modal 1: Add Common Fault & Assign to Model
  const [faultModalOpen, setFaultModalOpen] = useState(false);
  const [faultModelName, setFaultModelName] = useState("");
  const [faultDevice, setFaultDevice] = useState<Device>("קורקינט חשמלי");
  const [faultCode, setFaultCode] = useState("");
  const [faultSeverity, setFaultSeverity] = useState<FaultSeverity>("נפוצה");
  const [faultTitle, setFaultTitle] = useState("");
  const [faultSymptoms, setFaultSymptoms] = useState("");
  const [faultSolution, setFaultSolution] = useState("");
  const [faultSaving, setFaultSaving] = useState(false);
  const [faultError, setFaultError] = useState("");

  // Quick Modal 2: Add Unlock Instruction & Assign to Model
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [unlockModelName, setUnlockModelName] = useState("");
  const [unlockDevice, setUnlockDevice] = useState<Device>("קורקינט חשמלי");
  const [unlockInstructions, setUnlockInstructions] = useState("");
  const [unlockVideoTitle, setUnlockVideoTitle] = useState("");
  const [unlockVideoUrl, setUnlockVideoUrl] = useState("");
  const [unlockSaving, setUnlockSaving] = useState(false);
  const [unlockError, setUnlockError] = useState("");

  // Per-card inline sub-tab state ("faults" | "unlock")
  const [cardSubTabs, setCardSubTabs] = useState<Record<string, "faults" | "unlock">>({});

  // Combined model options (catalog models + existing fault guides)
  const modelOptions = useMemo(() => {
    const map = new Map<string, { name: string; device: Device; existingGuide?: FaultGuide }>();
    for (const c of catalogModels) {
      map.set(c.name.toLocaleLowerCase("he"), { name: c.name, device: c.device });
    }
    for (const g of records) {
      const key = g.model.toLocaleLowerCase("he");
      const prev = map.get(key);
      map.set(key, {
        name: prev?.name ?? g.model,
        device: prev?.device ?? g.device,
        existingGuide: g,
      });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "he"));
  }, [catalogModels, records]);

  const guidesByModel = useMemo(() => {
    const map = new Map<string, FaultGuide>();
    for (const g of records) {
      map.set(g.model.toLocaleLowerCase("he"), g);
    }
    return map;
  }, [records]);

  const modelsWithFaults = useMemo(
    () => records.filter((g) => g.commonFaults.length > 0),
    [records],
  );
  const modelsWithUnlocks = useMemo(
    () => records.filter((g) => hasModelUnlock(g)),
    [records],
  );
  const totalCommonFaultsCount = useMemo(
    () => records.reduce((acc, g) => acc + g.commonFaults.length, 0),
    [records],
  );

  function openFaultModalForModel(presetModel?: string) {
    const target = presetModel || modelOptions[0]?.name || "";
    const opt = modelOptions.find((o) => o.name.toLocaleLowerCase("he") === target.toLocaleLowerCase("he"));
    setFaultModelName(opt?.name ?? target);
    setFaultDevice(opt?.device ?? "קורקינט חשמלי");
    setFaultCode("");
    setFaultSeverity("נפוצה");
    setFaultTitle("");
    setFaultSymptoms("");
    setFaultSolution("");
    setFaultError("");
    setFaultModalOpen(true);
  }

  function openUnlockModalForModel(presetModel?: string) {
    const target = presetModel || modelOptions[0]?.name || "";
    const opt = modelOptions.find((o) => o.name.toLocaleLowerCase("he") === target.toLocaleLowerCase("he"));
    const existing = opt?.existingGuide;
    setUnlockModelName(opt?.name ?? target);
    setUnlockDevice(opt?.device ?? "קורקינט חשמלי");
    setUnlockInstructions(existing?.unlockInstructions ?? "");
    setUnlockVideoTitle("");
    setUnlockVideoUrl("");
    setUnlockError("");
    setUnlockModalOpen(true);
  }

  function handleFaultModelChange(nextModelName: string) {
    setFaultModelName(nextModelName);
    const opt = modelOptions.find((o) => o.name.toLocaleLowerCase("he") === nextModelName.toLocaleLowerCase("he"));
    if (opt) setFaultDevice(opt.device);
  }

  function handleUnlockModelChange(nextModelName: string) {
    setUnlockModelName(nextModelName);
    const opt = modelOptions.find((o) => o.name.toLocaleLowerCase("he") === nextModelName.toLocaleLowerCase("he"));
    if (opt) {
      setUnlockDevice(opt.device);
      if (opt.existingGuide?.unlockInstructions && !unlockInstructions.trim()) {
        setUnlockInstructions(opt.existingGuide.unlockInstructions);
      }
    }
  }

  async function handleSaveFault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanModel = faultModelName.trim();
    const cleanTitle = faultTitle.trim();
    if (!cleanModel) {
      setFaultError("יש לבחור דגם לשיוך התקלה.");
      return;
    }
    if (!cleanTitle) {
      setFaultError("יש להזין כותרת תקלה.");
      return;
    }

    setFaultSaving(true);
    setFaultError("");

    const newFault: CommonFault = {
      id: newRequestId(),
      code: faultCode.trim(),
      title: cleanTitle,
      severity: faultSeverity,
      symptoms: faultSymptoms.trim(),
      solution: faultSolution.trim(),
    };

    try {
      const existing = guidesByModel.get(cleanModel.toLocaleLowerCase("he"));
      if (existing) {
        await requestJson<FaultGuide>("/api/records/faults/" + existing.id, "PUT", {
          device: existing.device,
          model: existing.model,
          summary: existing.summary,
          unlockInstructions: existing.unlockInstructions,
          commonFaults: [...existing.commonFaults, newFault],
          videoLinks: existing.videoLinks,
          notes: existing.notes,
          version: existing.updatedAt,
          keptPhotos: existing.photos.map((p) => p.id),
          keptAttachments: existing.attachments.map((a) => a.id),
        });
      } else {
        await requestJson<FaultGuide>("/api/records/faults", "POST", {
          device: faultDevice,
          model: cleanModel,
          summary: "",
          unlockInstructions: "",
          commonFaults: [newFault],
          videoLinks: [],
          notes: "",
        });
      }
      setFaultModalOpen(false);
      router.refresh();
    } catch (err) {
      setFaultError((err as Error).message);
    } finally {
      setFaultSaving(false);
    }
  }

  async function handleSaveUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanModel = unlockModelName.trim();
    const cleanInstructions = unlockInstructions.trim();
    const cleanVideoUrl = unlockVideoUrl.trim();
    const cleanVideoTitle = unlockVideoTitle.trim() || `פתיחת הגבלה — ${cleanModel}`;

    if (!cleanModel) {
      setUnlockError("יש לבחור דגם לשיוך פתיחת ההגבלה.");
      return;
    }
    if (!cleanInstructions && !cleanVideoUrl) {
      setUnlockError("יש להזין הוראות פתיחת הגבלה או קישור לסרטון הדרכה.");
      return;
    }

    setUnlockSaving(true);
    setUnlockError("");

    try {
      const existing = guidesByModel.get(cleanModel.toLocaleLowerCase("he"));
      const nextVideoLinks = cleanVideoUrl
        ? [...(existing?.videoLinks ?? []), { id: newRequestId(), title: cleanVideoTitle, url: cleanVideoUrl }]
        : (existing?.videoLinks ?? []);

      if (existing) {
        await requestJson<FaultGuide>("/api/records/faults/" + existing.id, "PUT", {
          device: existing.device,
          model: existing.model,
          summary: existing.summary,
          unlockInstructions: cleanInstructions || existing.unlockInstructions,
          commonFaults: existing.commonFaults,
          videoLinks: nextVideoLinks,
          notes: existing.notes,
          version: existing.updatedAt,
          keptPhotos: existing.photos.map((p) => p.id),
          keptAttachments: existing.attachments.map((a) => a.id),
        });
      } else {
        await requestJson<FaultGuide>("/api/records/faults", "POST", {
          device: unlockDevice,
          model: cleanModel,
          summary: "",
          unlockInstructions: cleanInstructions,
          commonFaults: [],
          videoLinks: nextVideoLinks,
          notes: "",
        });
      }
      setUnlockModalOpen(false);
      router.refresh();
    } catch (err) {
      setUnlockError((err as Error).message);
    } finally {
      setUnlockSaving(false);
    }
  }

  return (
    <div className="faults-hub-wrapper">
      {/* Quick-Action Buttons Bar: Add Common Fault / Add Unlock Instruction & Assign to Model */}
      {canEdit && (
        <div className="faults-quick-actions-bar card">
          <div className="faults-quick-actions-copy">
            <strong>הוספה מהירה ושיוך ישיר לדגם</strong>
            <span>בחרו דגם מהרשימה והוסיפו לו פתיחת הגבלה או תקלה נפוצה בלחיצה אחת</span>
          </div>
          <div className="faults-quick-actions-buttons">
            <Button type="button" variant="outline" onClick={() => openFaultModalForModel()}>
              <AlertTriangle size={17} /> הוסף תקלה נפוצה חדשה
            </Button>
            <Button type="button" onClick={() => openUnlockModalForModel()}>
              <Unlock size={17} /> הוסף פתיחת הגבלה חדשה
            </Button>
          </div>
        </div>
      )}

      {/* Main Module Navigation Tabs (חוצצים) */}
      <div className="faults-module-tabs" role="tablist" aria-label="חוצצי תקלות ופתיחות הגבלה">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "all"}
          className={"faults-tab-btn" + (activeTab === "all" ? " is-active" : "")}
          onClick={() => setActiveTab("all")}
        >
          <Layers size={17} aria-hidden />
          <span>כל הדגמים והמדריכים</span>
          <span className="faults-tab-count">{records.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "faults"}
          className={"faults-tab-btn" + (activeTab === "faults" ? " is-active" : "")}
          onClick={() => setActiveTab("faults")}
        >
          <AlertTriangle size={17} aria-hidden />
          <span>תקלות נפוצות</span>
          <span className="faults-tab-count">{totalCommonFaultsCount}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "unlocks"}
          className={"faults-tab-btn is-unlock-tab" + (activeTab === "unlocks" ? " is-active" : "")}
          onClick={() => setActiveTab("unlocks")}
        >
          <Unlock size={17} aria-hidden />
          <span>פתיחות הגבלה</span>
          <span className="faults-tab-count">{modelsWithUnlocks.length}</span>
        </button>
      </div>

      {/* TAB 1: All Guides (Standard Search/Filter Table + Per-Model Tabbed Summary Cards) */}
      {activeTab === "all" && (
        <>
          {records.length > 0 && (
            <div className="faults-model-cards-grid">
              {records.map((guide) => {
                const hasUnlock = hasModelUnlock(guide);
                const defaultSubTab = guide.commonFaults.length > 0 ? "faults" : hasUnlock ? "unlock" : "faults";
                const subTab = cardSubTabs[guide.id] ?? defaultSubTab;
                const uploadedVideos = guide.attachments.filter((a) => a.kind === "video");
                const uploadedFiles = guide.attachments.filter((a) => a.kind === "file");

                return (
                  <article key={guide.id} className="card fault-model-tabbed-card">
                    <div className="fault-model-card-header">
                      <div>
                        <span className="status status-neutral">{guide.device}</span>
                        <h3>
                          <Link href={"/faults/" + guide.id}>{guide.model}</Link>
                        </h3>
                      </div>
                      <div className="fault-model-card-actions">
                        {canEdit && (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => openFaultModalForModel(guide.model)}
                              title={`הוספת תקלה נפוצה עבור ${guide.model}`}
                            >
                              <Plus size={14} /> תקלה
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => openUnlockModalForModel(guide.model)}
                              title={`הוספת / עדכון פתיחת הגבלה עבור ${guide.model}`}
                            >
                              <Unlock size={14} /> פתיחת הגבלה
                            </Button>
                          </>
                        )}
                        <Button asChild size="sm" variant="outline">
                          <Link href={"/faults/" + guide.id}>לכרטיס המלא</Link>
                        </Button>
                      </div>
                    </div>

                    {/* Per-Model Sub-Tabs: "תקלות נפוצות" and (if hasUnlock) "פתיחת הגבלה" */}
                    <div className="fault-card-subtabs" role="tablist" aria-label={`חוצצים עבור ${guide.model}`}>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={subTab === "faults"}
                        className={"fault-subtab-btn" + (subTab === "faults" ? " is-active" : "")}
                        onClick={() => setCardSubTabs((prev) => ({ ...prev, [guide.id]: "faults" }))}
                      >
                        <AlertTriangle size={14} aria-hidden />
                        <span>תקלות נפוצות ({guide.commonFaults.length})</span>
                      </button>

                      {hasUnlock && (
                        <button
                          type="button"
                          role="tab"
                          aria-selected={subTab === "unlock"}
                          className={"fault-subtab-btn is-unlock" + (subTab === "unlock" ? " is-active" : "")}
                          onClick={() => setCardSubTabs((prev) => ({ ...prev, [guide.id]: "unlock" }))}
                        >
                          <Unlock size={14} aria-hidden />
                          <span>פתיחת הגבלה</span>
                        </button>
                      )}
                    </div>

                    {subTab === "faults" || !hasUnlock ? (
                      <div className="fault-subtab-panel">
                        {guide.commonFaults.length === 0 ? (
                          <div className="fault-empty-inline">
                            <p className="muted">טרם נרשמו תקלות נפוצות לדגם זה.</p>
                            {canEdit && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => openFaultModalForModel(guide.model)}
                              >
                                <Plus size={14} /> הוספת תקלה ראשונה לדגם
                              </Button>
                            )}
                          </div>
                        ) : (
                          <ul className="fault-mini-list">
                            {guide.commonFaults.slice(0, 4).map((f) => (
                              <li key={f.id}>
                                <div className="fault-mini-top">
                                  {f.code && <bdi className="fault-code-pill" dir="ltr">{f.code}</bdi>}
                                  <strong>{f.title}</strong>
                                  <span
                                    className={
                                      "status "
                                      + (f.severity === "קריטית"
                                        ? "status-red"
                                        : f.severity === "תחזוקה"
                                          ? "status-neutral"
                                          : "status-amber")
                                    }
                                  >
                                    {f.severity}
                                  </span>
                                </div>
                                {f.solution && <p className="fault-mini-solution">{f.solution}</p>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <div className="fault-subtab-panel is-unlock-panel">
                        {guide.unlockInstructions ? (
                          <div className="unlock-instructions-box">
                            <strong>הוראות פתיחת הגבלה:</strong>
                            <p>{guide.unlockInstructions}</p>
                          </div>
                        ) : null}
                        {(uploadedVideos.length > 0 || guide.videoLinks.length > 0) && (
                          <div className="fault-mini-videos">
                            <span className="status status-green">
                              <Video size={13} aria-hidden />{" "}
                              {uploadedVideos.length + guide.videoLinks.length} סרטוני הדרכה לפתיחת הגבלה
                            </span>
                            <Link className="text-link" href={"/faults/" + guide.id}>
                              צפייה בסרטונים ←
                            </Link>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="fault-model-card-footer">
                      <span>
                        <FileText size={13} aria-hidden /> {uploadedFiles.length} קבצים
                      </span>
                      <span>עודכן: {formatDate(guide.updatedAt)}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {children}
        </>
      )}

      {/* TAB 2: Dedicated Common Faults View ("תקלות נפוצות") */}
      {activeTab === "faults" && (
        <section className="card detail-card" aria-label="חוצץ תקלות נפוצות">
          <div className="section-heading">
            <div>
              <h2>
                <span className="section-icon">
                  <AlertTriangle size={18} />
                </span>
                מאגר תקלות נפוצות לפי דגם ({totalCommonFaultsCount})
              </h2>
              <p className="muted">ריכוז כל קודי השגיאה, התסמינים והפתרונות המשויכים לדגמי קורטז.</p>
            </div>
            {canEdit && (
              <Button type="button" onClick={() => openFaultModalForModel()}>
                <Plus size={16} /> הוסף תקלה נפוצה חדשה
              </Button>
            )}
          </div>

          {modelsWithFaults.length === 0 ? (
            <div className="fault-empty-state">
              <p className="muted">טרם הוזנו תקלות נפוצות במערכת.</p>
              {canEdit && (
                <Button type="button" variant="outline" onClick={() => openFaultModalForModel()}>
                  <Plus size={16} /> הוספת תקלה נפוצה ראשונה ושיוך לדגם
                </Button>
              )}
            </div>
          ) : (
            <div className="faults-by-model-stack">
              {modelsWithFaults.map((guide) => (
                <div key={guide.id} className="faults-model-group">
                  <div className="faults-model-group-head">
                    <div>
                      <span className="status status-neutral">{guide.device}</span>
                      <h3>
                        <Link href={"/faults/" + guide.id}>{guide.model}</Link>
                      </h3>
                    </div>
                    <div className="faults-model-group-actions">
                      {canEdit && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openFaultModalForModel(guide.model)}
                        >
                          <Plus size={14} /> הוספת תקלה ל־{guide.model}
                        </Button>
                      )}
                      <Button asChild size="sm" variant="ghost">
                        <Link href={"/faults/" + guide.id}>לכרטיס הדגם ←</Link>
                      </Button>
                    </div>
                  </div>
                  <div className="fault-cards-grid">
                    {guide.commonFaults.map((item) => (
                      <article className="fault-card" key={item.id}>
                        <div className="fault-card-top">
                          <div className="fault-card-badges">
                            {item.code && <bdi className="fault-code-pill" dir="ltr">{item.code}</bdi>}
                            <span
                              className={
                                "status "
                                + (item.severity === "קריטית"
                                  ? "status-red"
                                  : item.severity === "תחזוקה"
                                    ? "status-neutral"
                                    : "status-amber")
                              }
                            >
                              {item.severity}
                            </span>
                          </div>
                          <h3>{item.title}</h3>
                        </div>
                        {item.symptoms && (
                          <div className="fault-card-block">
                            <small>תסמינים / גורם</small>
                            <p>{item.symptoms}</p>
                          </div>
                        )}
                        {item.solution && (
                          <div className="fault-card-block is-solution">
                            <small>פתרון מומלץ</small>
                            <p>{item.solution}</p>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 3: Dedicated Unlock Instructions View ("פתיחות הגבלה") */}
      {activeTab === "unlocks" && (
        <section className="card detail-card" aria-label="חוצץ פתיחות הגבלה">
          <div className="section-heading">
            <div>
              <h2>
                <span className="section-icon">
                  <Unlock size={18} />
                </span>
                פתיחות הגבלה לפי דגם ({modelsWithUnlocks.length})
              </h2>
              <p className="muted">מוצגים כל הכלים שקיימת עבורם הדרכת פתיחת הגבלה כתובה או סרטון הדרכה.</p>
            </div>
            {canEdit && (
              <Button type="button" onClick={() => openUnlockModalForModel()}>
                <Plus size={16} /> הוסף פתיחת הגבלה חדשה
              </Button>
            )}
          </div>

          {modelsWithUnlocks.length === 0 ? (
            <div className="fault-empty-state">
              <p className="muted">טרם הוזנו פתיחות הגבלה לדגמים במערכת.</p>
              {canEdit && (
                <Button type="button" variant="outline" onClick={() => openUnlockModalForModel()}>
                  <Plus size={16} /> הוספת פתיחת הגבלה ראשונה ושיוך לדגם
                </Button>
              )}
            </div>
          ) : (
            <div className="unlocks-by-model-stack">
              {modelsWithUnlocks.map((guide) => {
                const uploadedVideos = guide.attachments.filter((a) => a.kind === "video");
                return (
                  <article key={guide.id} className="unlock-model-showcase-card">
                    <div className="faults-model-group-head">
                      <div>
                        <span className="status status-green">
                          <Unlock size={13} aria-hidden /> פתיחת הגבלה קיימת
                        </span>
                        <span className="status status-neutral">{guide.device}</span>
                        <h3>
                          <Link href={"/faults/" + guide.id}>{guide.model}</Link>
                        </h3>
                      </div>
                      <div className="faults-model-group-actions">
                        {canEdit && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openUnlockModalForModel(guide.model)}
                          >
                            <Unlock size={14} /> עדכון / הוספת סרטון ל־{guide.model}
                          </Button>
                        )}
                        <Button asChild size="sm" variant="ghost">
                          <Link href={"/faults/" + guide.id}>לכרטיס המלא ←</Link>
                        </Button>
                      </div>
                    </div>

                    {guide.unlockInstructions && (
                      <div className="detail-notes unlock-instructions-box">
                        <h4>הוראות ביצוע שלב אחר שלב</h4>
                        <p>{guide.unlockInstructions}</p>
                      </div>
                    )}

                    {(uploadedVideos.length > 0 || guide.videoLinks.length > 0) && (
                      <div className="unlock-videos-grid">
                        {uploadedVideos.map((video) => {
                          const streamUrl = "/api/files/faults/" + guide.id + "/" + video.id;
                          return (
                            <div className="unlock-video-card" key={video.id}>
                              <div className="unlock-video-head">
                                <strong>{video.name}</strong>
                                <small>{formatBytes(video.bytes)}</small>
                              </div>
                              <video
                                controls
                                playsInline
                                preload="metadata"
                                src={streamUrl}
                                className="unlock-video-player"
                              />
                            </div>
                          );
                        })}
                        {guide.videoLinks.map((link) => {
                          const embed = embedVideoUrl(link.url);
                          return (
                            <div className="unlock-video-card" key={link.id}>
                              <div className="unlock-video-head">
                                <strong>{link.title}</strong>
                              </div>
                              {embed ? (
                                <div className="unlock-video-embed">
                                  <iframe
                                    src={embed}
                                    title={link.title}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                  />
                                </div>
                              ) : null}
                              <div className="unlock-video-actions">
                                <Button asChild size="sm" variant="outline">
                                  <a href={link.url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink size={15} /> פתיחת סרטון בקישור חיצוני
                                  </a>
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* MODAL 1: Add Common Fault & Assign to Model */}
      <Modal
        open={faultModalOpen}
        onOpenChange={setFaultModalOpen}
        title="הוספת תקלה נפוצה חדשה ושיוך לדגם"
        description="בחרו את הדגם הרצוי והזינו את פרטי התקלה והפתרון. אם לדגם טרם קיים כרטיס מדריך, המערכת תיצור אותו אוטומטית."
      >
        <form className="dialog-form" onSubmit={handleSaveFault} noValidate>
          <div className="fields-grid">
            <label className="field">
              <span>בחירת דגם לשיוך</span>
              <select
                value={faultModelName}
                onChange={(e) => handleFaultModelChange(e.target.value)}
                required
              >
                <option value="">-- בחרו דגם --</option>
                {modelOptions.map((opt) => (
                  <option key={opt.name} value={opt.name}>
                    {opt.name} ({opt.device})
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>סוג כלי</span>
              <select
                value={faultDevice}
                onChange={(e) => setFaultDevice(e.target.value as Device)}
              >
                {devices.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>קוד תקלה (אופציונלי)</span>
              <input
                value={faultCode}
                onChange={(e) => setFaultCode(e.target.value)}
                dir="ltr"
                maxLength={32}
                placeholder="למשל E07 / E10"
              />
            </label>

            <label className="field">
              <span>רמת שכיחות / סיווג</span>
              <select
                value={faultSeverity}
                onChange={(e) => setFaultSeverity(e.target.value as FaultSeverity)}
              >
                {faultSeverities.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="field field-wide">
              <span>כותרת התקלה</span>
              <input
                value={faultTitle}
                onChange={(e) => setFaultTitle(e.target.value)}
                maxLength={160}
                required
                placeholder="למשל תקלת חיישן בלם / חוסר תקשורת צג־בקר"
              />
            </label>

            <label className="field field-wide">
              <span>תסמינים וגורם אפשרי</span>
              <textarea
                value={faultSymptoms}
                onChange={(e) => setFaultSymptoms(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="מה מופיע על הצג או מורגש בכלי?"
              />
            </label>

            <label className="field field-wide">
              <span>פתרון מומלץ ודרכי טיפול</span>
              <textarea
                value={faultSolution}
                onChange={(e) => setFaultSolution(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="שלבי בדיקה, חיווט או חלקים להחלפה"
              />
            </label>
          </div>

          {faultError && (
            <p role="alert" className="error-message">
              {faultError}
            </p>
          )}

          <div className="dialog-actions">
            <Button type="submit" disabled={faultSaving}>
              <Save size={16} /> {faultSaving ? "שומר ומשייך…" : "שמירה ושיוך לדגם"}
            </Button>
            <Button variant="outline" disabled={faultSaving} onClick={() => setFaultModalOpen(false)}>
              ביטול
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: Add Unlock Instruction & Assign to Model */}
      <Modal
        open={unlockModalOpen}
        onOpenChange={setUnlockModalOpen}
        title="הוספת פתיחת הגבלה חדשה ושיוך לדגם"
        description="בחרו את הדגם והזינו הוראות פתיחת הגבלה ו/או קישור לסרטון. הכלי יופיע אוטומטית בחוצץ פתיחות ההגבלה."
      >
        <form className="dialog-form" onSubmit={handleSaveUnlock} noValidate>
          <div className="fields-grid">
            <label className="field">
              <span>בחירת דגם לשיוך</span>
              <select
                value={unlockModelName}
                onChange={(e) => handleUnlockModelChange(e.target.value)}
                required
              >
                <option value="">-- בחרו דגם --</option>
                {modelOptions.map((opt) => (
                  <option key={opt.name} value={opt.name}>
                    {opt.name} ({opt.device})
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>סוג כלי</span>
              <select
                value={unlockDevice}
                onChange={(e) => setUnlockDevice(e.target.value as Device)}
              >
                {devices.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            <label className="field field-wide">
              <span>הוראות פתיחת הגבלה שלב אחר שלב</span>
              <textarea
                value={unlockInstructions}
                onChange={(e) => setUnlockInstructions(e.target.value)}
                rows={4}
                maxLength={4000}
                placeholder="לדוגמה: הדלקת הצג → לחיצה ממושכת על + ו־- → כניסה להגדרת P08 → שינוי ערך ל־100…"
              />
            </label>

            <label className="field">
              <span>כותרת סרטון הדרכה (אופציונלי)</span>
              <input
                value={unlockVideoTitle}
                onChange={(e) => setUnlockVideoTitle(e.target.value)}
                maxLength={120}
                placeholder="למשל סרטון פתיחת הגבלה בצג"
              />
            </label>

            <label className="field">
              <span>קישור לסרטון (YouTube / Drive / Vimeo)</span>
              <input
                value={unlockVideoUrl}
                onChange={(e) => setUnlockVideoUrl(e.target.value)}
                dir="ltr"
                maxLength={1000}
                placeholder="https://youtu.be/..."
              />
            </label>
          </div>

          {unlockError && (
            <p role="alert" className="error-message">
              {unlockError}
            </p>
          )}

          <div className="dialog-actions">
            <Button type="submit" disabled={unlockSaving}>
              <Save size={16} /> {unlockSaving ? "שומר ומשייך…" : "שמירה ושיוך לדגם"}
            </Button>
            <Button variant="outline" disabled={unlockSaving} onClick={() => setUnlockModalOpen(false)}>
              ביטול
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
