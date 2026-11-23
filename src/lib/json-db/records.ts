import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "../errors";
import { requireAdmin, requireDeletePassword } from "../auth/session";
import { prepareBlobPhotos, uploadList } from "../uploads/blob-images";
import { prepareMongoPhotos } from "../uploads/mongo-images";
import { maxAttachments, removeAttachments, stagedAttachmentList, verifyStagedAttachments } from "../uploads/attachments";
import { maxPhotos, removePhotos, savePhotos } from "../uploads/images";
import {
  canDeleteItems, canEditModule, customerInput, faultGuideInput, modelInput, repairInput, standardsInput, uuid,
  type Attachment, type CatalogModel, type Customer, type FaultGuide, type Module, type Photo, type PublicUser, type Repair, type Standard,
} from "../validation/models";
import { audit, readCollection, reserveNumber, serialized, writeCollection } from "./store";
import { mergeWithDefaultCatalog } from "./queries";
import { usesBlobStorage } from "./blob-store";
import { usesMongoStorage } from "./mongo-client";
import { stripUndefined } from "./mongo-store";

const saveOptions = z.object({
  version: z.iso.datetime().optional(),
  requestId: uuid.optional(),
  deletePassword: z.string().trim().max(64).optional(),
  keptPhotos: z.array(uuid).max(maxPhotos).optional(),
  stagedPhotos: uploadList.optional(),
  keptAttachments: z.array(uuid).max(maxAttachments).optional(),
  stagedAttachments: stagedAttachmentList.optional(),
});

function existing<T extends { id: string }>(records: T[], id: string) {
  const record = records.find((item) => item.id === id);
  if (!record) throw new AppError(404, "הרשומה לא נמצאה.");
  return record;
}

export function getRecord(module: "standards", id: string): Promise<Standard>;
export function getRecord(module: "repairs", id: string): Promise<Repair>;
export function getRecord(module: "customers", id: string): Promise<Customer>;
export function getRecord(module: "models", id: string): Promise<CatalogModel>;
export function getRecord(module: "faults", id: string): Promise<FaultGuide>;
export function getRecord(module: "standards" | "repairs" | "models" | "faults", id: string): Promise<Standard | Repair | CatalogModel | FaultGuide>;
export function getRecord(module: Module, id: string): Promise<Standard | Repair | Customer | CatalogModel | FaultGuide>;
export async function getRecord(module: Module, id: string) {
  const list = await readCollection(module);
  if (module === "models") {
    return existing<CatalogModel>(mergeWithDefaultCatalog(list as CatalogModel[]), id);
  }
  return existing<Standard | Repair | Customer | CatalogModel | FaultGuide>(list, id);
}

function recordFields(old: { id: string; createdAt: string; updatedAt: string } | undefined, version?: string, requestId?: string) {
  if (old && version !== old.updatedAt) throw new AppError(409, "הרשומה עודכנה מאז שנפתחה. יש לפתוח אותה מחדש לפני שמירה.");
  const now = new Date(Math.max(Date.now(), old ? Date.parse(old.updatedAt) + 1 : 0)).toISOString();
  return { id: old?.id ?? requestId ?? randomUUID(), createdAt: old?.createdAt ?? now, updatedAt: now };
}

function retain(photos: Photo[], kept: string[] | undefined, additions: number) {
  const retained = kept ? photos.filter((photo) => kept.includes(photo.id)) : photos;
  if (kept && retained.length !== new Set(kept).size) throw new AppError(400, "אחת התמונות אינה משויכת לרשומה.");
  if (retained.length + additions > maxPhotos) throw new AppError(400, "ניתן לצרף עד 10 תמונות לרשומה.");
  return { retained, removed: photos.filter((photo) => !retained.includes(photo)) };
}

function retainAttachments(attachments: Attachment[], kept: string[] | undefined, additions: number) {
  const retained = kept ? attachments.filter((item) => kept.includes(item.id)) : attachments;
  if (kept && retained.length !== new Set(kept).size) throw new AppError(400, "אחד הקבצים אינו משויך לרשומה.");
  if (retained.length + additions > maxAttachments) throw new AppError(400, "ניתן לצרף עד 15 קבצים וסרטונים לרשומה.");
  return { retained, removed: attachments.filter((item) => !retained.includes(item)) };
}

function upsert<T extends { id: string }>(all: T[], record: T, editing: boolean) {
  return editing ? all.map((item) => item.id === record.id ? record : item) : [...all, record];
}

export async function saveRecord(module: Module, id: string | undefined, payload: unknown, files: File[], actor: PublicUser) {
  if (!canEditModule(actor.role, module)) {
    throw new AppError(403, "לחשבון סוכן יש הרשאת צפייה בלבד במודול זה.");
  }
  const { version, requestId, deletePassword, keptPhotos, stagedPhotos = [], keptAttachments, stagedAttachments = [] } = saveOptions.parse(payload);
  const cloud = usesBlobStorage();
  if (cloud && files.length || !cloud && stagedPhotos.length || module === "customers" && stagedPhotos.length
    || module !== "faults" && stagedAttachments.length) {
    throw new AppError(400, "שיטת העלאת הקבצים אינה תואמת לאחסון.");
  }
  const input = module === "standards" ? standardsInput.parse(payload)
    : module === "repairs" ? repairInput.parse(payload)
    : module === "models" ? modelInput.parse(payload)
    : module === "faults" ? faultGuideInput.parse(payload)
    : customerInput.parse(payload);
  let prepared: Photo[] = [];
  if (module !== "customers" && stagedPhotos.length > 0) {
    const stored = await readCollection(module);
    const all = module === "models" ? mergeWithDefaultCatalog(stored as CatalogModel[]) : stored;
    const duplicate = !id && requestId ? all.find((item) => item.id === requestId) : undefined;
    if (duplicate) return duplicate;
    const existingRecord = id ? existing<Standard | Repair | CatalogModel | FaultGuide>(all, id) : undefined;
    if (existingRecord) recordFields(existingRecord, version);
    retain(existingRecord?.photos ?? [], keptPhotos, stagedPhotos.length);
    prepared = usesMongoStorage()
      ? await prepareMongoPhotos(module, actor.id, stagedPhotos)
      : await prepareBlobPhotos(module, actor.id, stagedPhotos);
  }
  let verifiedAttachments: Attachment[] = [];
  if (module === "faults" && stagedAttachments.length > 0) {
    const all = await readCollection("faults");
    const duplicate = !id && requestId ? all.find((item) => item.id === requestId) : undefined;
    if (duplicate) return duplicate;
    const existingRecord = id ? existing<FaultGuide>(all, id) : undefined;
    if (existingRecord) recordFields(existingRecord, version);
    retainAttachments(existingRecord?.attachments ?? [], keptAttachments, stagedAttachments.length);
    verifiedAttachments = await verifyStagedAttachments(stagedAttachments);
  }
  return serialized(async () => {
    const activeUser = (await readCollection("users")).find((item) => item.id === actor.id && !item.disabled);
    if (!activeUser) throw new AppError(401, "יש להיכנס למערכת.");
    if (!canEditModule(activeUser.role, module)) {
      throw new AppError(403, "לחשבון סוכן יש הרשאת צפייה בלבד במודול זה.");
    }
    if (module === "customers") {
      const all = await readCollection(module);
      const duplicate = !id && requestId ? all.find((item) => item.id === requestId) : undefined;
      if (duplicate) return duplicate;
      const old = id ? existing(all, id) : undefined;
      const customerData = customerInput.parse(input);
      const record = { ...customerData, customerType: customerData.customerType ?? old?.customerType, ...recordFields(old, version, requestId) };
      await writeCollection(module, upsert(all, record, Boolean(old)));
      await audit(actor.id, old ? "update" : "create", module, record.id);
      return record;
    }

    if (module === "models") {
      const stored = await readCollection("models");
      const all = mergeWithDefaultCatalog(stored);
      const duplicate = !id && requestId ? all.find((item) => item.id === requestId) : undefined;
      if (duplicate) return duplicate;
      const old = id ? existing(all, id) : undefined;
      const base = recordFields(old, version, requestId);
      const { retained, removed } = retain(old?.photos ?? [], keptPhotos, files.length + prepared.length);
      const modelData = modelInput.parse(input);
      if (all.some((item) => item.id !== id && item.name.toLocaleLowerCase("he") === modelData.name.toLocaleLowerCase("he"))) {
        throw new AppError(409, "שם הדגם כבר קיים במאגר.");
      }
      if (old && removed.length > 0) {
        await requireDeletePassword(deletePassword);
      }
      const added = cloud ? prepared : await savePhotos("models", files);
      try {
        const record: CatalogModel = stripUndefined({
          ...modelData,
          imageUrl: modelData.imageUrl ?? old?.imageUrl,
          summary: modelData.summary ?? old?.summary,
          msrp: modelData.msrp !== undefined ? modelData.msrp : old?.msrp,
          productUrl: modelData.productUrl ?? old?.productUrl,
          published: modelData.published ?? old?.published ?? (old ? undefined : false),
          model3dUrl: modelData.model3dUrl ?? old?.model3dUrl,
          videoUrl: modelData.videoUrl ?? old?.videoUrl,
          publicDescription: modelData.publicDescription ?? old?.publicDescription,
          metrics: modelData.metrics ?? old?.metrics,
          features: modelData.features ?? old?.features,
          dimensions: modelData.dimensions ?? old?.dimensions,
          foldedDimensions: modelData.foldedDimensions ?? old?.foldedDimensions,
          studio: modelData.studio ?? old?.studio,
          galleryUrls: modelData.galleryUrls ?? old?.galleryUrls,
          specs: modelData.specs ?? old?.specs,
          ...base,
          photos: [...retained, ...added],
        });
        await writeCollection("models", upsert(all, record, Boolean(old)));
        if (old && (old.name !== record.name || old.device !== record.device)) {
          const oldNameLower = old.name.toLocaleLowerCase("he");
          const [standards, repairs, faults] = await Promise.all([
            readCollection("standards"), readCollection("repairs"), readCollection("faults"),
          ]);
          if (standards.some((item) => item.model.toLocaleLowerCase("he") === oldNameLower)) {
            await writeCollection("standards", standards.map((item) =>
              item.model.toLocaleLowerCase("he") === oldNameLower ? { ...item, model: record.name, device: record.device } : item));
          }
          if (repairs.some((item) => item.model.toLocaleLowerCase("he") === oldNameLower)) {
            await writeCollection("repairs", repairs.map((item) =>
              item.model.toLocaleLowerCase("he") === oldNameLower ? { ...item, model: record.name, device: record.device } : item));
          }
          if (faults.some((item) => item.model.toLocaleLowerCase("he") === oldNameLower)) {
            await writeCollection("faults", faults.map((item) =>
              item.model.toLocaleLowerCase("he") === oldNameLower ? { ...item, model: record.name, device: record.device } : item));
          }
        }
        await audit(actor.id, old ? "update" : "create", "models", base.id);
        if (!cloud) await removePhotos("models", removed);
        return record;
      } catch (error) {
        if (!cloud) await removePhotos("models", added);
        throw error;
      }
    }

    if (module === "faults") {
      const all = await readCollection("faults");
      const duplicate = !id && requestId ? all.find((item) => item.id === requestId) : undefined;
      if (duplicate) return duplicate;
      const old = id ? existing(all, id) : undefined;
      const base = recordFields(old, version, requestId);
      const { retained, removed } = retain(old?.photos ?? [], keptPhotos, files.length + prepared.length);
      const { retained: retainedFiles, removed: removedFiles } = retainAttachments(old?.attachments ?? [], keptAttachments, verifiedAttachments.length);
      const faultData = faultGuideInput.parse(input);
      if (all.some((item) => item.id !== id && item.model.toLocaleLowerCase("he") === faultData.model.toLocaleLowerCase("he"))) {
        throw new AppError(409, "כבר קיים מדריך תקלות ופתיחת הגבלה עבור דגם זה. ניתן לערוך את המדריך הקיים.");
      }
      const removedCommonFaults = Boolean(old && old.commonFaults.some((fault) => !faultData.commonFaults.some((next) => next.id === fault.id)));
      const removedVideos = Boolean(old && old.videoLinks.some((link) => !faultData.videoLinks.some((next) => next.id === link.id)));
      if (old && (removed.length > 0 || removedFiles.length > 0 || removedCommonFaults || removedVideos)) {
        if (!canDeleteItems(activeUser.role)) {
          throw new AppError(403, "לחשבון סוכן אין הרשאת מחיקה במערכת.");
        }
        await requireDeletePassword(deletePassword);
      }
      const added = cloud ? prepared : await savePhotos("faults", files);
      try {
        const record: FaultGuide = stripUndefined({
          ...faultData,
          ...base,
          photos: [...retained, ...added],
          attachments: [...retainedFiles, ...verifiedAttachments],
        });
        await writeCollection("faults", upsert(all, record, Boolean(old)));
        const storedModels = await readCollection("models");
        const existingModels = mergeWithDefaultCatalog(storedModels);
        if (!existingModels.some((item) => item.name.toLocaleLowerCase("he") === faultData.model.toLocaleLowerCase("he"))) {
          const now = new Date().toISOString();
          await writeCollection("models", [...existingModels, {
            id: randomUUID(), device: faultData.device, name: faultData.model, published: false, notes: "", photos: [], createdAt: now, updatedAt: now,
          }]);
        }
        await audit(actor.id, old ? "update" : "create", "faults", base.id);
        if (!cloud) await removePhotos("faults", removed);
        await removeAttachments(removedFiles);
        return record;
      } catch (error) {
        if (!cloud) await removePhotos("faults", added);
        throw error;
      }
    }

    const all = await readCollection(module);
    const duplicate = !id && requestId ? all.find((item) => item.id === requestId) : undefined;
    if (duplicate) return duplicate;
    const old = id ? existing<Standard | Repair>(all, id) : undefined;
    const base = recordFields(old, version, requestId);
    const { retained, removed } = retain(old?.photos ?? [], keptPhotos, files.length + prepared.length);
    const standards = "tasks" in input ? input : null;
    const repair = "serial" in input ? input : null;
    if (standards && all.some((item) => item.id !== id && item.number.toLocaleLowerCase("he") === standards.number.toLocaleLowerCase("he"))) {
      throw new AppError(409, "מספר התיק כבר קיים.");
    }
    if (repair && !(await readCollection("customers")).some((customer) => customer.id === repair.customerId)) {
      throw new AppError(400, "יש לבחור לקוח קיים.");
    }
    const removedTasks = Boolean(standards && old && "tasks" in old && old.tasks.some((task) => !standards.tasks.some((next) => next.id === task.id)));
    if (old && (removed.length > 0 || removedTasks)) {
      await requireDeletePassword(deletePassword);
    }
    const added = cloud ? prepared : await savePhotos(module, files);
    try {
      const common = { ...base, number: standards ? standards.number : old?.number ?? await reserveNumber("repairs"), photos: [...retained, ...added] };
      if (standards) await writeCollection("standards", upsert(await readCollection("standards"), { ...standards, ...common }, Boolean(old)));
      if (repair) await writeCollection("repairs", upsert(await readCollection("repairs"), { ...repair, ...common }, Boolean(old)));
      const device = standards ? standards.device : repair!.device;
      const modelName = standards ? standards.model : repair!.model;
      const storedModels = await readCollection("models");
      const existingModels = mergeWithDefaultCatalog(storedModels);
      if (!existingModels.some((item) => item.name.toLocaleLowerCase("he") === modelName.toLocaleLowerCase("he"))) {
        const now = new Date().toISOString();
        await writeCollection("models", [...existingModels, {
          id: randomUUID(), device, name: modelName, published: false, notes: "", photos: [], createdAt: now, updatedAt: now,
        }]);
      }
      await audit(actor.id, old ? "update" : "create", module, base.id);
      if (!cloud) await removePhotos(module, removed);
      return common;
    } catch (error) {
      if (!cloud) await removePhotos(module, added);
      throw error;
    }
  });
}

export async function deleteRecord(module: Module, id: string, version: string, actor: PublicUser) {
  requireAdmin(actor);
  return serialized(async () => {
    const activeUser = (await readCollection("users")).find((item) => item.id === actor.id && !item.disabled);
    if (!activeUser) throw new AppError(401, "יש להיכנס למערכת.");
    requireAdmin(activeUser);
    if (module === "customers") {
      const customers = await readCollection(module);
      recordFields(existing(customers, id), version);
      if ((await readCollection("repairs")).some((repair) => repair.customerId === id)) {
        throw new AppError(409, "לא ניתן למחוק לקוח עם תיקונים משויכים.");
      }
      await writeCollection(module, customers.filter((customer) => customer.id !== id));
    } else if (module === "models") {
      const stored = await readCollection("models");
      const all = mergeWithDefaultCatalog(stored);
      const record = existing(all, id);
      recordFields(record, version);
      const targetName = record.name.toLocaleLowerCase("he");
      const [standards, repairs] = await Promise.all([readCollection("standards"), readCollection("repairs")]);
      if ([...standards, ...repairs].some((item) => item.model.toLocaleLowerCase("he") === targetName)) {
        throw new AppError(409, "לא ניתן למחוק דגם עם תיקי תקינה או תיקונים משויכים.");
      }
      await writeCollection("models", all.filter((item) => item.id !== id));
      if (!usesBlobStorage()) await removePhotos("models", record.photos);
    } else if (module === "faults") {
      const all = await readCollection(module);
      const record = existing(all, id);
      recordFields(record, version);
      await writeCollection(module, all.filter((item) => item.id !== id));
      if (!usesBlobStorage()) await removePhotos("faults", record.photos);
      await removeAttachments(record.attachments);
    } else if (module === "standards") {
      const all = await readCollection(module);
      const record = existing(all, id);
      recordFields(record, version);
      await writeCollection(module, all.filter((item) => item.id !== id));
      if (!usesBlobStorage()) await removePhotos(module, record.photos);
    } else {
      const all = await readCollection(module);
      const record = existing(all, id);
      recordFields(record, version);
      await writeCollection(module, all.filter((item) => item.id !== id));
      if (!usesBlobStorage()) await removePhotos(module, record.photos);
    }
    await audit(actor.id, "delete", module, id);
  });
}
