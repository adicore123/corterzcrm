import { Suspense } from "react";
import Link from "next/link";
import { Bike, ClipboardList, Plus, ShieldAlert, Users, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { customerRow, faultGuideRow, modelRow, repairRow, standardRow } from "@/components/record-cells";
import { RecordTable } from "@/components/record-table";
import { FaultsModuleHub } from "./faults-hub";
import { RecordFiltersBar } from "./record-filters-bar";
import { usesMongoStorage } from "@/lib/json-db/mongo-client";
import {
  readMongoCustomersByIds,
  readMongoRecordCountsByModel,
  readMongoRepairCountsByCustomer,
} from "@/lib/json-db/mongo-store";
import { catalogModels, searchRecords, type RecordFilters } from "@/lib/json-db/queries";
import { readCollection } from "@/lib/json-db/store";
import { labels, moduleCopy } from "@/lib/presentation";
import {
  canEditModule,
  DEFAULT_PICKUP_ADDRESS,
  type Customer,
  type FaultGuide,
  type Module,
  type Repair,
  type Role,
} from "@/lib/validation/models";

const icons = {
  standards: ClipboardList,
  repairs: Wrench,
  customers: Users,
  models: Bike,
  faults: ShieldAlert,
};

function TableStreamSkeleton() {
  return (
    <div className="skeleton-rows" role="status" aria-label="טוען רשומות">
      <span className="skeleton-bar skeleton-row" />
      <span className="skeleton-bar skeleton-row" />
      <span className="skeleton-bar skeleton-row" />
      <span className="skeleton-bar skeleton-row" />
    </div>
  );
}

async function FaultsStreamContent({
  filters,
  canEdit,
}: {
  filters: RecordFilters;
  canEdit: boolean;
}) {
  const [records, models] = await Promise.all([
    searchRecords("faults", filters),
    catalogModels(),
  ]);
  return (
    <FaultsModuleHub
      records={records as FaultGuide[]}
      catalogModels={models}
      canEdit={canEdit}
      initialQuery={filters.q}
    />
  );
}

async function StandardModuleTableContent({
  module,
  filters,
  readOnly,
}: {
  module: Exclude<Module, "faults">;
  filters: RecordFilters;
  readOnly: boolean;
}) {
  const isMongo = usesMongoStorage();

  const [records, models, settings, mongoCustomerCounts, mongoModelCounts, fallbackRepairs, fallbackStandards] =
    await Promise.all([
      searchRecords(module, filters),
      module === "standards" || module === "repairs" ? catalogModels() : Promise.resolve([]),
      module === "repairs"
        ? readCollection("settings")
        : Promise.resolve({ pickupAddress: DEFAULT_PICKUP_ADDRESS }),
      isMongo && module === "customers"
        ? readMongoRepairCountsByCustomer()
        : Promise.resolve(null),
      isMongo && module === "models"
        ? readMongoRecordCountsByModel(true)
        : Promise.resolve(null),
      !isMongo && (module === "customers" || module === "models")
        ? readCollection("repairs")
        : Promise.resolve([]),
      !isMongo && module === "models"
        ? readCollection("standards")
        : Promise.resolve([]),
    ]);

  let contacts: Customer[] = [];
  if (module === "repairs") {
    if (isMongo) {
      const neededIds = Array.from(new Set((records as Repair[]).map((r) => r.customerId)));
      contacts = await readMongoCustomersByIds(neededIds);
    } else {
      contacts = await readCollection("customers");
    }
  }

  const pickupAddress = settings.pickupAddress ?? DEFAULT_PICKUP_ADDRESS;
  const customersMap = new Map(contacts.map((item) => [item.id, item]));
  const modelsMap = new Map(models.map((item) => [item.name.toLocaleLowerCase("he"), item]));

  let counts: Map<string, number>;
  let modelRepairs: Map<string, number>;
  let modelStandards: Map<string, number>;

  if (mongoCustomerCounts) {
    counts = mongoCustomerCounts;
    modelRepairs = new Map();
    modelStandards = new Map();
  } else if (mongoModelCounts) {
    counts = new Map();
    modelRepairs = mongoModelCounts.repairCounts;
    modelStandards = mongoModelCounts.standardCounts;
  } else {
    counts = new Map<string, number>();
    modelRepairs = new Map<string, number>();
    modelStandards = new Map<string, number>();
    for (const repair of fallbackRepairs) {
      counts.set(repair.customerId, (counts.get(repair.customerId) ?? 0) + 1);
      const key = repair.model.toLocaleLowerCase("he");
      modelRepairs.set(key, (modelRepairs.get(key) ?? 0) + 1);
    }
    for (const standard of fallbackStandards) {
      const key = standard.model.toLocaleLowerCase("he");
      modelStandards.set(key, (modelStandards.get(key) ?? 0) + 1);
    }
  }

  const rows = records.map((item) => {
    if ("tasks" in item) return standardRow(item, "list", modelsMap, readOnly);
    if ("serial" in item) return repairRow(item, customersMap, false, modelsMap, { readOnly, pickupAddress });
    if ("phone" in item) return customerRow(item, counts.get(item.id) ?? 0, readOnly);
    if ("commonFaults" in item) return faultGuideRow(item, modelRepairs.get(item.model.toLocaleLowerCase("he")) ?? 0, modelsMap);
    const key = item.name.toLocaleLowerCase("he");
    return modelRow(item, modelStandards.get(key) ?? 0, modelRepairs.get(key) ?? 0, readOnly);
  });

  const copy = moduleCopy[module];
  const columns =
    module === "standards"
      ? ["מספר תיק", "דגם", "סוג מכשיר", "סטטוס", "עיכוב", "משימות", "עדכון אחרון"]
      : module === "repairs"
        ? ["מספר תיקון", "דגם", "מספר סידורי", "לקוח", "סטטוס", "עדכון אחרון"]
        : module === "models"
          ? ["שם דגם", "סוג מכשיר", "תיקי תקינה", "תיקונים"]
          : ["שם לקוח", "חנות", "טלפון", "תיקונים"];
  const filtered = Boolean(filters.q || filters.status || filters.delay || filters.sort);

  return (
    <>
      <div className="list-toolbar">
        <span>{rows.length === 1 ? "רשומה אחת" : rows.length + " רשומות"}</span>
      </div>
      <RecordTable
        rows={rows}
        columns={columns}
        icon={icons[module]}
        empty={filtered ? "לא נמצאו תוצאות" : copy.empty}
        showEmptyHeader
      />
    </>
  );
}

export function RecordList({
  module,
  filters,
  deleted,
  userRole = "admin",
}: {
  module: Module;
  filters: RecordFilters;
  deleted: boolean;
  userRole?: Role;
}) {
  const canEdit = canEditModule(userRole, module);
  const readOnly = !canEdit;
  const copy = moduleCopy[module];
  const href = "/" + module;
  const streamKey = `${module}|${filters.q ?? ""}|${filters.status ?? ""}|${filters.delay ?? ""}|${filters.sort ?? ""}`;

  return (
    <div className="page-stack">
      <div className="page-title title-with-action">
        <div>
          <h1>{labels[module]}</h1>
          <p>{copy.description}</p>
        </div>
        {canEdit && (
          <Button asChild>
            <Link href={href + "/new"}>
              <Plus size={18} /> {copy.create}
            </Link>
          </Button>
        )}
      </div>
      {deleted && (
        <p className="success-message" role="status">
          הרשומה נמחקה.
        </p>
      )}
      {module === "faults" ? (
        <Suspense key={streamKey} fallback={<div className="card skeleton-card"><TableStreamSkeleton /></div>}>
          <FaultsStreamContent filters={filters} canEdit={canEdit} />
        </Suspense>
      ) : (
        <section className="card list-card" aria-label={labels[module]}>
          <RecordFiltersBar module={module} href={href} searchLabel={copy.search} filters={filters} />
          <Suspense key={streamKey} fallback={<TableStreamSkeleton />}>
            <StandardModuleTableContent module={module} filters={filters} readOnly={readOnly} />
          </Suspense>
        </section>
      )}
    </div>
  );
}
