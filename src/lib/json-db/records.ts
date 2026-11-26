import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAdmin, requireDeletePassword } from "../auth/session";
import { AppError } from "../errors";
import {
  prepareBlobPhotos,
  removeBlobPhotos,
  uploadList,
} from "../uploads/blob-images";
import {
  maxAttachments,
  removeAttachments,
  stagedAttachmentList,
  verifyStagedAttachments,
} from "../uploads/attachments";
import { maxPhotos, removePhotos, savePhotos } from "../uploads/images";
import {
  prepareMongoPhotos,
  removeMongoPhotos,
  saveDirectMongoPhotos,
} from "../uploads/mongo-images";
import {
  canDeleteItems,
  canEditModule,
  customerInput,
  faultGuideInput,
  modelInput,
  repairInput,
  standardsInput,
  uuid,
  type Attachment,
  type CatalogModel,
  type Customer,
  type FaultGuide,
  type Module,
  type Photo,
  type PhotoModule,
  type PublicUser,
  type Repair,
  type Standard,
} from "../validation/models";
import { listBlobBackups, readBlobBackup, usesBlobStorage } from "./blob-store";
import { mongoDatabase, usesMongoStorage } from "./mongo-client";
import { stripUndefined } from "./mongo-store";
import { mergeWithDefaultCatalog } from "./queries";
import { audit, readCollection, reserveNumber, serialized, writeCollection } from "./store";

const saveOptions = z.object({
  version: z.iso.datetime().optional(),
  requestId: uuid.optional(),
  deletePassword: z.string().trim().max(64).optional(),
  keptPhotos: z.array(uuid).max(maxPhotos).optional(),
  stagedPhotos: uploadList.optional(),
  keptAttachments: z.array(uuid).max(maxAttachments).optional(),
  stagedAttachments: stagedAttachmentList.optional(),
});

function normModelName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("he");
}

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
export function getRecord(
  module: "standards" | "repairs" | "models" | "faults",
  id: string,
): Promise<Standard | Repair | CatalogModel | FaultGuide>;
export function getRecord(
  module: Module,
  id: string,
): Promise<Standard | Repair | Customer | CatalogModel | FaultGuide>;
export async function getRecord(module: Module, id: string) {
  const list = await readCollection(module);
  if (module === "models") {
    return existing<CatalogModel>(mergeWithDefaultCatalog(list as CatalogModel[]), id);
  }
  return existing<Standard | Repair | Customer | CatalogModel | FaultGuide>(list, id);
}

function recordFields(
  old: { id: string; createdAt: string; updatedAt: string } | undefined,
  version?: string,
  requestId?: string,
) {
  if (old && version !== old.updatedAt) {
    throw new AppError(409, "הרשומה עודכנה מאז שנפתחה. יש לפתוח אותה מחדש לפני שמירה.");
  }
  const now = new Date(Math.max(Date.now(), old ? Date.parse(old.updatedAt) + 1 : 0)).toISOString();
  return {
    id: old?.id ?? requestId ?? randomUUID(),
    createdAt: old?.createdAt ?? now,
    updatedAt: now,
  };
}

function retain(photos: Photo[], kept: string[] | undefined, additions: number) {
  const retained = kept ? photos.filter((photo) => kept.includes(photo.id)) : photos;
  if (kept && retained.length !== new Set(kept).size) {
    throw new AppError(400, "אחת התמונות אינה משויכת לרשומה.");
  }
  if (retained.length + additions > maxPhotos) {
    throw new AppError(400, "ניתן לצרף עד 10 תמונות לרשומה.");
  }
  return { retained, removed: photos.filter((photo) => !retained.includes(photo)) };
}

function retainAttachments(attachments: Attachment[], kept: string[] | undefined, additions: number) {
  const retained = kept ? attachments.filter((item) => kept.includes(item.id)) : attachments;
  if (kept && retained.length !== new Set(kept).size) {
    throw new AppError(400, "אחד הקבצים אינו משויך לרשומה.");
  }
  if (retained.length + additions > maxAttachments) {
    throw new AppError(400, "ניתן לצרף עד 15 קבצים וסרטונים לרשומה.");
  }
  return { retained, removed: attachments.filter((item) => !retained.includes(item)) };
}

function upsert<T extends { id: string }>(all: T[], record: T, editing: boolean) {
  return editing ? all.map((item) => (item.id === record.id ? record : item)) : [...all, record];
}

async function saveIncomingPhotos(
  kind: PhotoModule,
  cloud: boolean,
  prepared: Photo[],
  files: File[],
): Promise<Photo[]> {
  if (cloud) return prepared;
  if (usesMongoStorage()) return saveDirectMongoPhotos(kind, files);
  return savePhotos(kind, files);
}

async function rollbackAddedPhotos(kind: PhotoModule, added: Photo[]) {
  if (!added.length) return;
  if (usesMongoStorage()) {
    await removeMongoPhotos(kind, added);
    return;
  }
  if (usesBlobStorage()) {
    await removeBlobPhotos(kind, added);
    return;
  }
  await removePhotos(kind, added);
}

async function filterPhotosNotInBackups(kind: PhotoModule, photos: Photo[]): Promise<Photo[]> {
  if (!photos.length) return [];
  const candidateIds = new Set(photos.map((p) => p.id));

  if (usesMongoStorage()) {
    try {
      const db = await mongoDatabase();
      const [v2Chunks, v1Backups] = await Promise.all([
        db
          .collection<{ items: Array<{ photos?: Photo[] }> }>("crm_backup_chunks")
          .find({ collection: kind, "items.photos.id": { $in: [...candidateIds] } })
          .toArray(),
        db
          .collection<{ state?: Record<string, Array<{ photos?: Photo[] }>> }>("backups")
          .find({ [`state.${kind}.photos.id`]: { $in: [...candidateIds] } })
          .toArray(),
      ]);
      const referenced = new Set<string>();
      for (const chunk of v2Chunks) {
        for (const item of chunk.items ?? []) {
          for (const p of item.photos ?? []) referenced.add(p.id);
        }
      }
      for (const b of v1Backups) {
        for (const item of b.state?.[kind] ?? []) {
          for (const p of item.photos ?? []) referenced.add(p.id);
        }
      }
      return photos.filter((p) => !referenced.has(p.id));
    } catch {
      return [];
    }
  }

  if (usesBlobStorage()) {
    try {
      const backupIds = await listBlobBackups();
      if (backupIds.length === 0) return photos;
      const referenced = new Set<string>();
      for (const id of backupIds) {
        const snap = (await readBlobBackup(id)) as {
          state?: Record<string, Array<{ photos?: Photo[] }>>;
        };
        for (const item of snap.state?.[kind] ?? []) {
          for (const p of item.photos ?? []) referenced.add(p.id);
        }
      }
      return photos.filter((p) => !referenced.has(p.id));
    } catch {
      // Preserve conservatively if backup inspection fails (e.g. offline/partial test mocks)
      return [];
    }
  }

  return photos;
}

async function cleanupRemovedPhotos(kind: PhotoModule, removed: Photo[]) {
  if (!removed.length) return;
  if (!usesMongoStorage() && !usesBlobStorage()) {
    await removePhotos(kind, removed);
    return;
  }
  const unreferenced = await filterPhotosNotInBackups(kind, removed);
  if (!unreferenced.length) return;
  if (usesMongoStorage()) {
    await removeMongoPhotos(kind, unreferenced);
  } else if (usesBlobStorage()) {
    await removeBlobPhotos(kind, unreferenced);
  }
}

async function resolveOrCreateLinkedModel(
  modelName: string,
  explicitModelId: string | undefined,
  device: CatalogModel["device"],
): Promise<{ modelId: string; canonicalName: string }> {
  const storedModels = await readCollection("models");
  const existingModels = mergeWithDefaultCatalog(storedModels);
  const targetKey = normModelName(modelName);
  const matched =
    (explicitModelId ? existingModels.find((m) => m.id === explicitModelId) : undefined)
    ?? existingModels.find((m) => normModelName(m.name) === targetKey);

  if (matched) {
    return { modelId: matched.id, canonicalName: matched.name };
  }

  const now = new Date().toISOString();
  const cleanName = modelName.trim().replace(/\s+/g, " ");
  const draftModel: CatalogModel = {
    id: randomUUID(),
    device,
    name: cleanName,
    published: false,
    notes: "",
    photos: [],
    createdAt: now,
    updatedAt: now,
  };
  await writeCollection("models", [...existingModels, draftModel]);
  return { modelId: draftModel.id, canonicalName: draftModel.name };
}

export async function saveRecord(
  module: Module,
  id: string | undefined,
  payload: unknown,
  files: File[],
  actor: PublicUser,
) {
  if (!canEditModule(actor.role, module)) {
    throw new AppError(403, "לחשבון סוכן יש הרשאת צפייה בלבד במודול זה.");
  }
  const {
    version,
    requestId,
    deletePassword,
    keptPhotos,
    stagedPhotos = [],
    keptAttachments,
    stagedAttachments = [],
  } = saveOptions.parse(payload);
  const cloud = usesBlobStorage();
  if (
    (cloud && files.length)
    || (!cloud && stagedPhotos.length)
    || (module === "customers" && stagedPhotos.length)
    || (module !== "faults" && stagedAttachments.length)
  ) {
    throw new AppError(400, "שיטת העלאת הקבצים אינה תואמת לאחסון.");
  }
  const input =
    module === "standards"
      ? standardsInput.parse(payload)
      : module === "repairs"
        ? repairInput.parse(payload)
        : module === "models"
          ? modelInput.parse(payload)
          : module === "faults"
            ? faultGuideInput.parse(payload)
            : customerInput.parse(payload);

  let prepared: Photo[] = [];
  if (module !== "customers" && stagedPhotos.length > 0) {
    const stored = await readCollection(module);
    const all = module === "models" ? mergeWithDefaultCatalog(stored as CatalogModel[]) : stored;
    const duplicate = !id && requestId ? all.find((item) => item.id === requestId) : undefined;
    if (duplicate) return duplicate;
    const existingRecord = id
      ? existing<Standard | Repair | CatalogModel | FaultGuide>(all, id)
      : undefined;
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
    const activeUser = (await readCollection("users")).find(
      (item) => item.id === actor.id && !item.disabled,
    );
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
      const record = {
        ...customerData,
        customerType: customerData.customerType ?? old?.customerType,
        ...recordFields(old, version, requestId),
      };
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
      const { retained, removed } = retain(
        old?.photos ?? [],
        keptPhotos,
        files.length + prepared.length,
      );
      const modelData = modelInput.parse(input);
      const nextKey = normModelName(modelData.name);
      if (all.some((item) => item.id !== id && normModelName(item.name) === nextKey)) {
        throw new AppError(409, "שם הדגם כבר קיים במאגר.");
      }
      if (old && removed.length > 0) {
        await requireDeletePassword(deletePassword, actor.id);
      }
      const added = await saveIncomingPhotos("models", cloud, prepared, files);
      try {
        const record: CatalogModel = stripUndefined({
          ...modelData,
          name: modelData.name.trim().replace(/\s+/g, " "),
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
          const oldNameKey = normModelName(old.name);
          const matchesRenamed = (item: { model: string; modelId?: string }) =>
            item.modelId === record.id || normModelName(item.model) === oldNameKey;

          const [standards, repairs, faults, quotes] = await Promise.all([
            readCollection("standards"),
            readCollection("repairs"),
            readCollection("faults"),
            readCollection("quotes"),
          ]);
          if (standards.some(matchesRenamed)) {
            await writeCollection(
              "standards",
              standards.map((item) =>
                matchesRenamed(item)
                  ? { ...item, modelId: record.id, model: record.name, device: record.device }
                  : item,
              ),
            );
          }
          if (repairs.some(matchesRenamed)) {
            await writeCollection(
              "repairs",
              repairs.map((item) =>
                matchesRenamed(item)
                  ? { ...item, modelId: record.id, model: record.name, device: record.device }
                  : item,
              ),
            );
          }
          if (faults.some(matchesRenamed)) {
            await writeCollection(
              "faults",
              faults.map((item) =>
                matchesRenamed(item)
                  ? { ...item, modelId: record.id, model: record.name, device: record.device }
                  : item,
              ),
            );
          }
          if (old.name !== record.name && quotes.some((q) => q.modelId === record.id && q.status !== "cancelled")) {
            await writeCollection(
              "quotes",
              quotes.map((q) =>
                q.modelId === record.id && q.status !== "cancelled"
                  ? { ...q, modelName: record.name }
                  : q,
              ),
            );
          }
        }
        await audit(actor.id, old ? "update" : "create", "models", base.id);
        await cleanupRemovedPhotos("models", removed);
        return record;
      } catch (error) {
        await rollbackAddedPhotos("models", added);
        throw error;
      }
    }

    if (module === "faults") {
      const all = await readCollection("faults");
      const duplicate = !id && requestId ? all.find((item) => item.id === requestId) : undefined;
      if (duplicate) return duplicate;
      const old = id ? existing(all, id) : undefined;
      const base = recordFields(old, version, requestId);
      const { retained, removed } = retain(
        old?.photos ?? [],
        keptPhotos,
        files.length + prepared.length,
      );
      const { retained: retainedFiles, removed: removedFiles } = retainAttachments(
        old?.attachments ?? [],
        keptAttachments,
        verifiedAttachments.length,
      );
      const faultData = faultGuideInput.parse(input);
      const targetKey = normModelName(faultData.model);
      if (all.some((item) => item.id !== id && normModelName(item.model) === targetKey)) {
        throw new AppError(
          409,
          "כבר קיים מדריך תקלות ופתיחת הגבלה עבור דגם זה. ניתן לערוך את המדריך הקיים.",
        );
      }
      const removedCommonFaults = Boolean(
        old
          && old.commonFaults.some(
            (fault) => !faultData.commonFaults.some((next) => next.id === fault.id),
          ),
      );
      const removedVideos = Boolean(
        old
          && old.videoLinks.some(
            (link) => !faultData.videoLinks.some((next) => next.id === link.id),
          ),
      );
      if (
        old
        && (removed.length > 0 || removedFiles.length > 0 || removedCommonFaults || removedVideos)
      ) {
        if (!canDeleteItems(activeUser.role)) {
          throw new AppError(403, "לחשבון סוכן אין הרשאת מחיקה במערכת.");
        }
        await requireDeletePassword(deletePassword, actor.id);
      }
      const added = await saveIncomingPhotos("faults", cloud, prepared, files);
      try {
        const linked = await resolveOrCreateLinkedModel(
          faultData.model,
          faultData.modelId ?? old?.modelId,
          faultData.device,
        );
        const record: FaultGuide = stripUndefined({
          ...faultData,
          model: linked.canonicalName,
          modelId: linked.modelId,
          ...base,
          photos: [...retained, ...added],
          attachments: [...retainedFiles, ...verifiedAttachments],
        });
        await writeCollection("faults", upsert(all, record, Boolean(old)));
        await audit(actor.id, old ? "update" : "create", "faults", base.id);
        await cleanupRemovedPhotos("faults", removed);
        await removeAttachments(removedFiles);
        return record;
      } catch (error) {
        await rollbackAddedPhotos("faults", added);
        throw error;
      }
    }

    const all = await readCollection(module);
    const duplicate = !id && requestId ? all.find((item) => item.id === requestId) : undefined;
    if (duplicate) return duplicate;
    const old = id ? existing<Standard | Repair>(all, id) : undefined;
    const base = recordFields(old, version, requestId);
    const { retained, removed } = retain(
      old?.photos ?? [],
      keptPhotos,
      files.length + prepared.length,
    );
    const standards = "tasks" in input ? input : null;
    const repair = "serial" in input ? input : null;
    if (
      standards
      && all.some(
        (item) =>
          item.id !== id
          && item.number.toLocaleLowerCase("he") === standards.number.toLocaleLowerCase("he"),
      )
    ) {
      throw new AppError(409, "מספר התיק כבר קיים.");
    }
    if (
      repair
      && !(await readCollection("customers")).some((customer) => customer.id === repair.customerId)
    ) {
      throw new AppError(400, "יש לבחור לקוח קיים.");
    }
    const removedTasks = Boolean(
      standards
        && old
        && "tasks" in old
        && old.tasks.some((task) => !standards.tasks.some((next) => next.id === task.id)),
    );
    if (old && (removed.length > 0 || removedTasks)) {
      await requireDeletePassword(deletePassword, actor.id);
    }
    const added = await saveIncomingPhotos(module, cloud, prepared, files);
    try {
      const device = standards ? standards.device : repair!.device;
      const rawModelName = standards ? standards.model : repair!.model;
      const explicitModelId = (standards ? standards.modelId : repair!.modelId) ?? old?.modelId;
      const linked = await resolveOrCreateLinkedModel(rawModelName, explicitModelId, device);

      const common = stripUndefined({
        ...base,
        modelId: linked.modelId,
        number: standards ? standards.number : old?.number ?? (await reserveNumber("repairs")),
        photos: [...retained, ...added],
      });
      if (standards) {
        const nextStd: Standard = stripUndefined({
          ...standards,
          model: linked.canonicalName,
          ...common,
        });
        await writeCollection(
          "standards",
          upsert(await readCollection("standards"), nextStd, Boolean(old)),
        );
      }
      if (repair) {
        const nextRep: Repair = stripUndefined({
          ...repair,
          model: linked.canonicalName,
          ...common,
        });
        await writeCollection(
          "repairs",
          upsert(await readCollection("repairs"), nextRep, Boolean(old)),
        );
      }
      await audit(actor.id, old ? "update" : "create", module, base.id);
      await cleanupRemovedPhotos(module, removed);
      return common;
    } catch (error) {
      await rollbackAddedPhotos(module, added);
      throw error;
    }
  });
}

export async function deleteRecord(module: Module, id: string, version: string, actor: PublicUser) {
  requireAdmin(actor);
  return serialized(async () => {
    const activeUser = (await readCollection("users")).find(
      (item) => item.id === actor.id && !item.disabled,
    );
    if (!activeUser) throw new AppError(401, "יש להיכנס למערכת.");
    requireAdmin(activeUser);
    if (module === "customers") {
      const customers = await readCollection(module);
      recordFields(existing(customers, id), version);
      if ((await readCollection("repairs")).some((repair) => repair.customerId === id)) {
        throw new AppError(409, "לא ניתן למחוק לקוח עם תיקונים משויכים.");
      }
      await writeCollection(
        module,
        customers.filter((customer) => customer.id !== id),
      );
    } else if (module === "models") {
      const stored = await readCollection("models");
      const all = mergeWithDefaultCatalog(stored);
      const record = existing(all, id);
      recordFields(record, version);
      const targetKey = normModelName(record.name);
      const [standards, repairs, faults, quotes] = await Promise.all([
        readCollection("standards"),
        readCollection("repairs"),
        readCollection("faults"),
        readCollection("quotes"),
      ]);
      const matchesModel = (item: { model: string; modelId?: string }) =>
        item.modelId === id || normModelName(item.model) === targetKey;

      if ([...standards, ...repairs].some(matchesModel)) {
        throw new AppError(409, "לא ניתן למחוק דגם עם תיקי תקינה או תיקונים משויכים.");
      }
      if (
        faults.some(matchesModel)
        || quotes.some((q) => q.modelId === id && q.status !== "cancelled")
      ) {
        throw new AppError(
          409,
          "לא ניתן למחוק דגם עם הצעות מחיר פעילות או מדריכי תקלות משויכים.",
        );
      }
      await writeCollection(
        "models",
        all.filter((item) => item.id !== id),
      );
      await cleanupRemovedPhotos("models", record.photos);
    } else if (module === "faults") {
      const all = await readCollection(module);
      const record = existing(all, id);
      recordFields(record, version);
      await writeCollection(
        module,
        all.filter((item) => item.id !== id),
      );
      await cleanupRemovedPhotos("faults", record.photos);
      await removeAttachments(record.attachments);
    } else if (module === "standards") {
      const all = await readCollection(module);
      const record = existing(all, id);
      recordFields(record, version);
      await writeCollection(
        module,
        all.filter((item) => item.id !== id),
      );
      await cleanupRemovedPhotos(module, record.photos);
    } else {
      const all = await readCollection(module);
      const record = existing(all, id);
      recordFields(record, version);
      await writeCollection(
        module,
        all.filter((item) => item.id !== id),
      );
      await cleanupRemovedPhotos(module, record.photos);
    }
    await audit(actor.id, "delete", module, id);
  });
}
