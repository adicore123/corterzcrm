import Link from "next/link";
import { Bike, ClipboardList, Plus, ShieldAlert, Users, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { customerRow, faultGuideRow, modelRow, repairRow, standardRow } from "@/components/record-cells";
import { RecordTable } from "@/components/record-table";
import { FaultsModuleHub } from "./faults-hub";
import { RecordFiltersBar, type QuickStatusPill } from "./record-filters-bar";
import { usesMongoStorage } from "@/lib/json-db/mongo-client";
import {
  readMongoCustomersByIds,
  readMongoRecordCountsByModel,
  readMongoRepairCountsByCustomer,
} from "@/lib/json-db/mongo-store";
import { catalogModels, searchRecords, type RecordFilters } from "@/lib/json-db/queries";
import { peekHotCollection, readCollection } from "@/lib/json-db/store";
import { labels, moduleCopy } from "@/lib/presentation";
import {
  canEditModule,
  DEFAULT_PICKUP_ADDRESS,
  type Customer,
  type FaultGuide,
  type Module,
  type Repair,
  type Role,
  type Standard,
} from "@/lib/validation/models";

const icons = {
  standards: ClipboardList,
  repairs: Wrench,
  customers: Users,
  models: Bike,
  faults: ShieldAlert,
};

export async function RecordList({
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

  if (module === "faults") {
    const [records, models] = await Promise.all([
      searchRecords("faults", filters),
      catalogModels(),
    ]);
    return (
      <div className="page-stack">
        <div className="page-title title-with-action">
          <div>
            <h1>{labels[module]}</h1>
            <p>{copy.description}</p>
          </div>
          {canEdit && (
            <Button asChild>
              <Link href={href + "/new"} prefetch={true}>
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
        <FaultsModuleHub
          records={records as FaultGuide[]}
          catalogModels={models}
          canEdit={canEdit}
          initialQuery={filters.q}
        />
      </div>
    );
  }

  const isMongo = usesMongoStorage();
  const hotRepairs = isMongo ? peekHotCollection("repairs") : null;
  const hotStandards = isMongo ? peekHotCollection("standards") : null;
  const hotCustomers = isMongo ? peekHotCollection("customers") : null;

  const [records, models, settings, mongoCustomerCounts, mongoModelCounts, fallbackRepairs, fallbackStandards, allCollectionForPills] =
    await Promise.all([
      searchRecords(module, filters),
      module === "standards" || module === "repairs" ? catalogModels() : Promise.resolve([]),
      module === "repairs"
        ? readCollection("settings")
        : Promise.resolve({ pickupAddress: DEFAULT_PICKUP_ADDRESS }),
      isMongo && module === "customers" && !hotRepairs
        ? readMongoRepairCountsByCustomer()
        : Promise.resolve(null),
      isMongo && module === "models" && !(hotRepairs && hotStandards)
        ? readMongoRecordCountsByModel(true)
        : Promise.resolve(null),
      module === "customers" || module === "models"
        ? hotRepairs
          ? Promise.resolve(hotRepairs)
          : !isMongo
            ? readCollection("repairs")
            : Promise.resolve([] as Repair[])
        : Promise.resolve([] as Repair[]),
      module === "models"
        ? hotStandards
          ? Promise.resolve(hotStandards)
          : !isMongo
            ? readCollection("standards")
            : Promise.resolve([] as Standard[])
        : Promise.resolve([] as Standard[]),
      module === "standards" || module === "repairs"
        ? readCollection(module)
        : module === "models"
          ? catalogModels()
          : Promise.resolve([]),
    ]);

  let statusPills: QuickStatusPill[] = [];
  if (module === "repairs") {
    const allRepairs = allCollectionForPills as Repair[];
    statusPills = [
      { id: "all", label: "כל התיקונים", count: allRepairs.length, tone: "neutral", status: "" },
      {
        id: "new",
        label: "התקבל",
        count: allRepairs.filter((r) => r.status === "התקבל").length,
        tone: "red",
        status: "התקבל",
      },
      {
        id: "in-progress",
        label: "בטיפול",
        count: allRepairs.filter((r) => r.status === "בטיפול").length,
        tone: "blue",
        status: "בטיפול",
      },
      {
        id: "done",
        label: "מוכן לאיסוף",
        count: allRepairs.filter((r) => r.status === "הסתיים").length,
        tone: "green",
        status: "הסתיים",
      },
    ];
  } else if (module === "standards") {
    const allStds = allCollectionForPills as Standard[];
    statusPills = [
      { id: "all", label: "כל התיקים", count: allStds.length, tone: "neutral", status: "", delay: "" },
      {
        id: "active",
        label: "בטיפול / פעילים",
        count: allStds.filter((s) => s.status !== "הסתיים").length,
        tone: "blue",
        status: "active",
        delay: "",
      },
      {
        id: "delayed",
        label: "בעיכוב",
        count: allStds.filter((s) => s.delay === "מתעכב").length,
        tone: "amber",
        status: "",
        delay: "מתעכב",
      },
      {
        id: "done",
        label: "הסתיימו",
        count: allStds.filter((s) => s.status === "הסתיים").length,
        tone: "green",
        status: "הסתיים",
        delay: "",
      },
    ];
  } else if (module === "models") {
    const allModels = allCollectionForPills as Array<{ device: string }>;
    const byDev = new Map<string, number>();
    for (const m of allModels) byDev.set(m.device, (byDev.get(m.device) ?? 0) + 1);
    statusPills = [
      { id: "all", label: "כל הכלים", count: allModels.length, tone: "neutral", status: "" },
      ...Array.from(byDev.entries()).map(([dev, count]) => ({
        id: dev,
        label: dev,
        count,
        tone: "blue" as const,
        status: dev,
      })),
    ];
  }

  let contacts: Customer[] = [];
  if (module === "repairs") {
    if (hotCustomers) {
      contacts = hotCustomers;
    } else if (isMongo) {
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
    <div className="page-stack">
      <div className="page-title title-with-action">
        <div>
          <h1>{labels[module]}</h1>
          <p>{copy.description}</p>
        </div>
        {canEdit && (
          <Button asChild>
            <Link href={href + "/new"} prefetch={true}>
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
      <section className="card list-card" aria-label={labels[module]}>
        <RecordFiltersBar
          module={module}
          href={href}
          searchLabel={copy.search}
          filters={filters}
          statusPills={statusPills}
        />
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
      </section>
    </div>
  );
}
