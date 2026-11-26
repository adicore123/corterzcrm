"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ExternalLink,
  FileText,
  Plus,
  Save,
  Search,
  Unlock,
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
  initialQuery = "",
}: {
  records: FaultGuide[];
  catalogModels: CatalogModel[];
  canEdit: boolean;
  initialQuery?: string;
}) {
  const router = useRouter();
  // Two prominent general tabs: "faults" (חוצץ כללי: תקלות נפוצות) and "unlocks" (חוצץ כללי: פתיחות הגבלה)
  const [activeTab, setActiveTab] = useState<"faults" | "unlocks">("faults");
  const [selectedModelFilter, setSelectedModelFilter] = useState<string>("");
  const [selectedDeviceFilter, setSelectedDeviceFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>(initialQuery);
  const [onlyWithUnlock, setOnlyWithUnlock] = useState<boolean>(false);

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

  // Combined model options (all catalog models + existing fault guides)
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

  // Apply model filter, device filter, and text search
  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase("he");
    return records.filter((g) => {
      if (selectedModelFilter && g.model.toLocaleLowerCase("he") !== selectedModelFilter.toLocaleLowerCase("he")) {
        return false;
      }
      if (selectedDeviceFilter && g.device !== selectedDeviceFilter) {
        return false;
      }
      if (!q) return true;
      return [
        g.model,
        g.device,
        g.summary,
        g.unlockInstructions,
        g.notes,
        ...g.commonFaults.flatMap((f) => [f.code, f.title, f.symptoms, f.solution, f.severity]),
        ...g.videoLinks.map((v) => v.title),
      ].some((val) => val.toLocaleLowerCase("he").includes(q));
    });
  }, [records, selectedModelFilter, selectedDeviceFilter, searchQuery]);

  const faultTabModels = useMemo(() => {
    const withFaults = filteredRecords.filter((g) => g.commonFaults.length > 0);
    return withFaults.length > 0 ? withFaults : filteredRecords;
  }, [filteredRecords]);

  // For the general "פתיחות הגבלה" tab: show models with unlocks first, or all filtered models
  const unlockTabModels = useMemo(() => {
    const withUnlocks = filteredRecords.filter((g) => hasModelUnlock(g));
    if (onlyWithUnlock) return withUnlocks;
    if (withUnlocks.length > 0 && !selectedModelFilter && !searchQuery) {
      const withoutUnlocks = filteredRecords.filter((g) => !hasModelUnlock(g));
      return [...withUnlocks, ...withoutUnlocks];
    }
    return filteredRecords;
  }, [filteredRecords, onlyWithUnlock, selectedModelFilter, searchQuery]);

  const totalCommonFaultsCount = useMemo(
    () => records.reduce((acc, g) => acc + g.commonFaults.length, 0),
    [records],
  );
  const totalUnlocksCount = useMemo(
    () => records.filter((g) => hasModelUnlock(g)).length,
    [records],
  );

  // All model names available for instant filtering in both general tabs
  const allFilterableModelNames = useMemo(() => {
    const names = new Set<string>();
    for (const g of records) names.add(g.model);
    for (const m of catalogModels) names.add(m.name);
    return Array.from(names).sort((a, b) => a.localeCompare(b, "he"));
  }, [records, catalogModels]);

  // Models that already have guides (for quick pills)
  const guideModelNames = useMemo(
    () => Array.from(new Set(records.map((g) => g.model))).sort((a, b) => a.localeCompare(b, "he")),
    [records],
  );

  function openFaultModalForModel(presetModel?: string) {
    const target = presetModel || selectedModelFilter || modelOptions[0]?.name || "";
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
    const target = presetModel || selectedModelFilter || modelOptions[0]?.name || "";
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
      setUnlockInstructions(opt.existingGuide?.unlockInstructions ?? "");
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
      setActiveTab("faults");
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
      setActiveTab("unlocks");
      router.refresh();
    } catch (err) {
      setUnlockError((err as Error).message);
    } finally {
      setUnlockSaving(false);
    }
  }

  return (
    <div className="faults-hub-wrapper">
      {/* Two Large Equal-Width General Module Tabs: 1) חוצץ תקלות נפוצות  2) חוצץ פתיחות הגבלה */}
      <div className="faults-general-tabs-grid" role="tablist" aria-label="חוצצים ראשיים — תקלות נפוצות ופתיחות הגבלה">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "faults"}
          className={"faults-giant-tab is-faults" + (activeTab === "faults" ? " is-active" : "")}
          onClick={() => setActiveTab("faults")}
        >
          <span className="faults-giant-tab-icon">
            <AlertTriangle size={22} aria-hidden />
          </span>
          <div className="faults-giant-tab-copy">
            <strong>חוצץ תקלות נפוצות</strong>
            <span>קודי שגיאה, תסמינים ופתרונות לכל הדגמים</span>
          </div>
          <span className="faults-tab-count">{totalCommonFaultsCount}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "unlocks"}
          className={"faults-giant-tab is-unlocks" + (activeTab === "unlocks" ? " is-active" : "")}
          onClick={() => setActiveTab("unlocks")}
        >
          <span className="faults-giant-tab-icon">
            <Unlock size={22} aria-hidden />
          </span>
          <div className="faults-giant-tab-copy">
            <strong>חוצץ פתיחות הגבלה</strong>
            <span>הוראות פתיחת הגבלה וסרטוני הדרכה לפי דגם</span>
          </div>
          <span className="faults-tab-count">{totalUnlocksCount}</span>
        </button>
      </div>

      {/* Main Content Card for Active General Tab */}
      <section className="card detail-card">
        {/* Section Header + Dedicated Add Button for Active Tab */}
        <div className="section-heading faults-active-tab-header">
          <div>
            <h2>
              <span className="section-icon">
                {activeTab === "unlocks" ? <Unlock size={18} /> : <AlertTriangle size={18} />}
              </span>
              {activeTab === "unlocks"
                ? `מאגר פתיחות הגבלה לפי דגם (${totalUnlocksCount})`
                : `מאגר תקלות נפוצות לפי דגם (${totalCommonFaultsCount})`}
            </h2>
            <p className="muted">
              {activeTab === "unlocks"
                ? "בחרו או סננו דגם כדי לצפות בהוראות ובסרטוני פתיחת ההגבלה שלו, או הוסיפו פתיחת הגבלה חדשה."
                : "בחרו או סננו דגם כדי לצפות בתקלות הנפוצות ובפתרונות שלו, או הוסיפו תקלה נפוצה חדשה."}
            </p>
          </div>

          {canEdit && (
            <div className="faults-quick-actions-buttons">
              {activeTab === "unlocks" ? (
                <Button type="button" onClick={() => openUnlockModalForModel()}>
                  <Plus size={16} /> הוסף פתיחת הגבלה חדשה
                </Button>
              ) : (
                <Button type="button" onClick={() => openFaultModalForModel()}>
                  <Plus size={16} /> הוסף תקלה נפוצה חדשה
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  activeTab === "unlocks" ? openFaultModalForModel() : openUnlockModalForModel()
                }
              >
                {activeTab === "unlocks" ? (
                  <>
                    <AlertTriangle size={15} /> הוסף תקלה נפוצה
                  </>
                ) : (
                  <>
                    <Unlock size={15} /> הוסף פתיחת הגבלה
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Unified Filter Bar by Model, Device Type, and Search */}
        <div className="filters faults-filter-row" aria-label="סינון לפי דגם וחיפוש">
          <div className="search-field">
            <Search size={18} aria-hidden />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="חיפוש לפי דגם, קוד תקלה או הוראות"
              placeholder={
                activeTab === "unlocks"
                  ? "חיפוש שם דגם או הוראות פתיחת הגבלה…"
                  : "חיפוש שם דגם, קוד תקלה (למשל E07) או פתרון…"
              }
            />
          </div>

          <select
            aria-label="סינון לפי דגם"
            value={selectedModelFilter}
            onChange={(e) => setSelectedModelFilter(e.target.value)}
          >
            <option value="">סינון לפי דגם — כל הדגמים</option>
            {allFilterableModelNames.map((modelName) => (
              <option key={modelName} value={modelName}>
                {modelName}
              </option>
            ))}
          </select>

          <select
            aria-label="סינון לפי סוג כלי"
            value={selectedDeviceFilter}
            onChange={(e) => setSelectedDeviceFilter(e.target.value)}
          >
            <option value="">כל סוגי הכלים</option>
            {devices.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {activeTab === "unlocks" && (
            <Button
              type="button"
              variant={onlyWithUnlock ? "default" : "outline"}
              onClick={() => setOnlyWithUnlock((prev) => !prev)}
            >
              <Unlock size={15} /> {onlyWithUnlock ? "מציג רק עם פתיחת הגבלה" : "סנן לכלים עם פתיחת הגבלה"}
            </Button>
          )}

          {(selectedModelFilter || selectedDeviceFilter || searchQuery || onlyWithUnlock) && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSelectedModelFilter("");
                setSelectedDeviceFilter("");
                setSearchQuery("");
                setOnlyWithUnlock(false);
              }}
            >
              ניקוי סינון
            </Button>
          )}
        </div>

        {/* Quick Model Filter Pills */}
        {guideModelNames.length > 0 && (
          <div className="faults-model-pills-bar" role="group" aria-label="סינון מהיר לפי דגם">
            <button
              type="button"
              className={"fault-model-pill" + (selectedModelFilter === "" ? " is-active" : "")}
              onClick={() => setSelectedModelFilter("")}
            >
              כל הדגמים ({records.length})
            </button>
            {guideModelNames.map((modelName) => {
              const guide = guidesByModel.get(modelName.toLocaleLowerCase("he"));
              const hasUnlock = guide ? hasModelUnlock(guide) : false;
              return (
                <button
                  key={modelName}
                  type="button"
                  className={
                    "fault-model-pill"
                    + (selectedModelFilter === modelName ? " is-active" : "")
                    + (hasUnlock ? " has-unlock-dot" : "")
                  }
                  onClick={() =>
                    setSelectedModelFilter((prev) => (prev === modelName ? "" : modelName))
                  }
                >
                  <span>{modelName}</span>
                  {hasUnlock && <Unlock size={12} aria-hidden />}
                </button>
              );
            })}
          </div>
        )}

        {/* TAB 1 CONTENT: Common Faults ("חוצץ תקלות נפוצות") */}
        {activeTab === "faults" && (
          <div className="faults-tab-content">
            {faultTabModels.length === 0 ? (
              <div className="fault-empty-state">
                <p className="muted">
                  {selectedModelFilter
                    ? `טרם הוזנו תקלות נפוצות עבור ${selectedModelFilter}.`
                    : "לא נמצאו תקלות נפוצות התואמות לסינון."}
                </p>
                {canEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => openFaultModalForModel(selectedModelFilter)}
                  >
                    <Plus size={16} /> הוספת תקלה נפוצה חדשה ושיוך לדגם
                  </Button>
                )}
              </div>
            ) : (
              <div className="faults-by-model-stack">
                {faultTabModels.map((guide) => {
                  const uploadedFiles = guide.attachments.filter((a) => a.kind === "file");
                  const hasUnlock = hasModelUnlock(guide);
                  return (
                    <div key={guide.id} className="faults-model-group">
                      <div className="faults-model-group-head">
                        <div>
                          <span className="status status-neutral">{guide.device}</span>
                          <h3>
                            <Link href={"/faults/" + guide.id}>{guide.model}</Link>
                          </h3>
                          {hasUnlock && (
                            <button
                              type="button"
                              className="status status-green fault-jump-unlock-badge"
                              onClick={() => {
                                setSelectedModelFilter(guide.model);
                                setActiveTab("unlocks");
                              }}
                            >
                              <Unlock size={13} aria-hidden /> מעבר לפתיחת הגבלה של הדגם
                            </button>
                          )}
                          {uploadedFiles.length > 0 && (
                            <span className="status status-neutral">
                              <FileText size={13} aria-hidden /> {uploadedFiles.length} קבצים
                            </span>
                          )}
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
                            <Link href={"/faults/" + guide.id}>
                              לכרטיס הדגם ({formatDate(guide.updatedAt)}) ←
                            </Link>
                          </Button>
                        </div>
                      </div>

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
                              <Plus size={14} /> הוספת תקלה לדגם
                            </Button>
                          )}
                        </div>
                      ) : (
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
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2 CONTENT: Unlock Instructions ("חוצץ פתיחות הגבלה") */}
        {activeTab === "unlocks" && (
          <div className="faults-tab-content">
            {unlockTabModels.length === 0 ? (
              <div className="fault-empty-state">
                <p className="muted">
                  {selectedModelFilter
                    ? `טרם הוזנה פתיחת הגבלה עבור ${selectedModelFilter}.`
                    : "טרם הוזנו פתיחות הגבלה התואמות לסינון."}
                </p>
                {canEdit && (
                  <Button
                    type="button"
                    onClick={() => openUnlockModalForModel(selectedModelFilter)}
                  >
                    <Plus size={16} /> הוסף פתיחת הגבלה חדשה עבור{" "}
                    {selectedModelFilter || "דגם"}
                  </Button>
                )}
              </div>
            ) : (
              <div className="unlocks-by-model-stack">
                {unlockTabModels.map((guide) => {
                  const uploadedVideos = guide.attachments.filter((a) => a.kind === "video");
                  const hasUnlock = hasModelUnlock(guide);
                  return (
                    <article key={guide.id} className="unlock-model-showcase-card">
                      <div className="faults-model-group-head">
                        <div>
                          {hasUnlock ? (
                            <span className="status status-green">
                              <Unlock size={13} aria-hidden /> יש פתיחת הגבלה
                            </span>
                          ) : (
                            <span className="status status-neutral">ללא פתיחת הגבלה מתועדת</span>
                          )}
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
                              variant={hasUnlock ? "outline" : "default"}
                              onClick={() => openUnlockModalForModel(guide.model)}
                            >
                              <Unlock size={14} />{" "}
                              {hasUnlock
                                ? `עדכון / הוספת סרטון ל־${guide.model}`
                                : `הוספת פתיחת הגבלה ל־${guide.model}`}
                            </Button>
                          )}
                          <Button asChild size="sm" variant="ghost">
                            <Link href={"/faults/" + guide.id}>לכרטיס המלא ←</Link>
                          </Button>
                        </div>
                      </div>

                      {guide.unlockInstructions ? (
                        <div className="detail-notes unlock-instructions-box">
                          <h4>הוראות ביצוע שלב אחר שלב</h4>
                          <p>{guide.unlockInstructions}</p>
                        </div>
                      ) : !hasUnlock ? (
                        <div className="fault-empty-inline">
                          <p className="muted">טרם הוזנו הוראות פתיחת הגבלה לדגם זה.</p>
                        </div>
                      ) : null}

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
          </div>
        )}
      </section>

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
