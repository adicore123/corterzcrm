import { notFound } from "next/navigation";
import { z } from "zod";
import { authorizedUser } from "@/lib/auth/page";
import { AppError } from "@/lib/errors";
import { usesBlobStorage } from "@/lib/json-db/blob-store";
import { readCollection } from "@/lib/json-db/store";
import { getRecord } from "@/lib/json-db/records";
import { knownModels } from "@/lib/json-db/queries";
import { labels } from "@/lib/presentation";
import { modules, uuid } from "@/lib/validation/models";
import { CustomerForm } from "@/components/records/customer-form";
import { RecordDetail } from "@/components/records/detail";
import { RecordList } from "@/components/records/list";
import { RepairForm } from "@/components/records/repair-form";
import { StandardsForm } from "@/components/records/standards-form";

type PageProps = {
  params: Promise<{ module: string; record?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const moduleSchema = z.enum(modules);

export async function generateMetadata({ params }: Pick<PageProps, "params">) {
  const result = moduleSchema.safeParse((await params).module);
  return { title: result.success ? labels[result.data] : "דף לא נמצא" };
}

export default async function ModulePage({ params, searchParams }: PageProps) {
  const user = await authorizedUser();
  const [route, query] = await Promise.all([params, searchParams]);
  const result = moduleSchema.safeParse(route.module);
  if (!result.success) notFound();
  const kind = result.data;
  const segments = route.record ?? [];
  const [id, action] = segments;
  const value = (key: string) => typeof query[key] === "string" ? query[key] : undefined;
  if (segments.length > 2 || (action && action !== "edit")) notFound();
  if (!id) {
    return <RecordList key={JSON.stringify(query)} module={kind} filters={{ q: value("q"), status: value("status"), delay: value("delay"), sort: value("sort") }}
      deleted={value("deleted") === "1"} />;
  }
  const creating = id === "new";
  if ((creating && action) || (!creating && !uuid.safeParse(id).success)) notFound();

  const record = creating ? undefined : await getRecord(kind, id).catch((error: unknown) => {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  });
  if (record && !action) return <RecordDetail module={kind} record={record} admin={user.role === "admin"} saved={value("saved") === "1"} />;
  if (kind === "customers") return <CustomerForm record={record && "name" in record ? record : undefined} />;
  const cloud = usesBlobStorage();
  if (kind === "standards") return <StandardsForm record={record && "tasks" in record ? record : undefined} models={await knownModels()} cloud={cloud} />;
  const [models, customers] = await Promise.all([knownModels(), readCollection("customers")]);
  customers.sort((a, b) => a.name.localeCompare(b.name, "he"));
  return <RepairForm record={record && "serial" in record ? record : undefined} models={models} customers={customers} cloud={cloud}
    customerId={customers.find((customer) => customer.id === value("customer"))?.id} />;
}
