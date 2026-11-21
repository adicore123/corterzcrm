import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "../errors";
import { requireAdmin } from "../auth/session";
import { prepareBlobPhotos, uploadList } from "../uploads/blob-images";
import { maxPhotos, removePhotos, savePhotos } from "../uploads/images";
import { customerInput, repairInput, standardsInput, uuid, type Customer, type Module, type Photo, type PublicUser, type Repair, type Standard } from "../validation/models";
import { audit, readCollection, reserveNumber, serialized, writeCollection } from "./store";
import { usesBlobStorage } from "./blob-store";

const saveOptions = z.object({
  version: z.iso.datetime().optional(),
  requestId: uuid.optional(),
  keptPhotos: z.array(uuid).max(maxPhotos).optional(),
  stagedPhotos: uploadList.optional(),
});

function existing<T extends { id: string }>(records: T[], id: string) {
  const record = records.find((item) => item.id === id);
  if (!record) throw new AppError(404, "הרשומה לא נמצאה.");
  return record;
}

export function getRecord(module: "standards", id: string): Promise<Standard>;
export function getRecord(module: "repairs", id: string): Promise<Repair>;
export function getRecord(module: "customers", id: string): Promise<Customer>;
export function getRecord(module: "standards" | "repairs", id: string): Promise<Standard | Repair>;
export function getRecord(module: Module, id: string): Promise<Standard | Repair | Customer>;
export async function getRecord(module: Module, id: string) {
  return existing<Standard | Repair | Customer>(await readCollection(module), id);
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

function upsert<T extends { id: string }>(all: T[], record: T, editing: boolean) {
  return editing ? all.map((item) => item.id === record.id ? record : item) : [...all, record];
}

export async function saveRecord(module: Module, id: string | undefined, payload: unknown, files: File[], actor: PublicUser) {
  const { version, requestId, keptPhotos, stagedPhotos = [] } = saveOptions.parse(payload);
  const cloud = usesBlobStorage();
  if (cloud && files.length || !cloud && stagedPhotos.length || module === "customers" && stagedPhotos.length) {
    throw new AppError(400, "שיטת העלאת התמונות אינה תואמת לאחסון.");
  }
  const input = module === "standards" ? standardsInput.parse(payload) : module === "repairs" ? repairInput.parse(payload) : customerInput.parse(payload);
  let prepared: Photo[] = [];
  if (module !== "customers" && stagedPhotos.length > 0) {
    const all = await readCollection(module);
    const duplicate = !id && requestId ? all.find((item) => item.id === requestId) : undefined;
    if (duplicate) return duplicate;
    const existingRecord = id ? existing<Standard | Repair>(all, id) : undefined;
    if (existingRecord) recordFields(existingRecord, version);
    retain(existingRecord?.photos ?? [], keptPhotos, stagedPhotos.length);
    prepared = await prepareBlobPhotos(module, actor.id, stagedPhotos);
  }
  return serialized(async () => {
    const activeUser = (await readCollection("users")).find((item) => item.id === actor.id && !item.disabled);
    if (!activeUser) throw new AppError(401, "יש להיכנס למערכת.");
    if (module === "customers") {
      const all = await readCollection(module);
      const duplicate = !id && requestId ? all.find((item) => item.id === requestId) : undefined;
      if (duplicate) return duplicate;
      const old = id ? existing(all, id) : undefined;
      const record = { ...customerInput.parse(input), ...recordFields(old, version, requestId) };
      await writeCollection(module, upsert(all, record, Boolean(old)));
      await audit(actor.id, old ? "update" : "create", module, record.id);
      return record;
    }

    const all = await readCollection(module);
    const duplicate = !id && requestId ? all.find((item) => item.id === requestId) : undefined;
    if (duplicate) return duplicate;
    const old = id ? existing<Standard | Repair>(all, id) : undefined;
    const base = recordFields(old, version, requestId);
    const { retained, removed } = retain(old?.photos ?? [], keptPhotos, files.length + prepared.length);
    const standards = "tasks" in input ? input : null;
    const repair = "serial" in input ? input : null;
    if (repair && !(await readCollection("customers")).some((customer) => customer.id === repair.customerId)) {
      throw new AppError(400, "יש לבחור לקוח קיים.");
    }
    const added = cloud ? prepared : await savePhotos(module, files);
    try {
      const common = { ...base, number: old?.number ?? await reserveNumber(module), photos: [...retained, ...added] };
      if (standards) await writeCollection("standards", upsert(await readCollection("standards"), { ...standards, ...common }, Boolean(old)));
      if (repair) await writeCollection("repairs", upsert(await readCollection("repairs"), { ...repair, ...common }, Boolean(old)));
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
