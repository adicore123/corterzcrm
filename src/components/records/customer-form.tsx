"use client";

import { useRef, useState, type FormEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Save, UserRoundPlus, Users } from "lucide-react";
import { newRequestId, requestJson } from "@/lib/client-api";
import { customerInput, type Customer, type CustomerInput } from "@/lib/validation/models";
import { Button } from "@/components/ui/button";
import { Modal, UnsavedDialog } from "@/components/ui/dialog";
import { CustomerFields, Editor, Section } from "./form-parts";
import { useEditor } from "./use-editor";

const defaults = { name: "", store: "", phone: "" };

export function CustomerForm({ record }: { record?: Customer }) {
  const { register, handleSubmit, formState: { errors, isDirty, isSubmitting } } = useForm<CustomerInput>({
    resolver: zodResolver(customerInput), defaultValues: record ?? defaults,
  });
  const editor = useEditor("customers", record, isDirty);
  return <Editor module="customers" title={record ? "עריכת לקוח" : "לקוח חדש"} cancel={record ? "/customers/" + record.id : "/customers"}
    loading={isSubmitting || editor.leaving} error={editor.error} progress={editor.progress} unsaved={editor.unsaved}
    onSubmit={handleSubmit(editor.save)}>
    <Section title="פרטי לקוח" icon={Users}>
      <div className="fields-grid"><CustomerFields name={register("name")} store={register("store")} phone={register("phone")} errors={errors} /></div>
    </Section>
  </Editor>;
}

export function InlineCustomer({ onSave }: { onSave: (customer: Customer) => void }) {
  const [open, setOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef("");
  const { register, handleSubmit, reset, formState: { errors, isDirty, isSubmitting } } = useForm<CustomerInput>({
    resolver: zodResolver(customerInput), defaultValues: defaults,
  });

  function closeNow() {
    reset();
    setError("");
    requestId.current = "";
    setConfirmDiscard(false);
    setOpen(false);
  }

  function change(next: boolean) {
    if (!next) {
      if (isSubmitting) return;
      if (isDirty) {
        setConfirmDiscard(true);
        return;
      }
      closeNow();
      return;
    }
    setOpen(true);
  }

  async function save(values: CustomerInput) {
    setError("");
    if (!requestId.current) requestId.current = newRequestId();
    try {
      const customer = await requestJson<Customer>("/api/records/customers", "POST", { ...values, requestId: requestId.current });
      onSave(customer);
      closeNow();
    } catch (error) {
      setError((error as Error).message);
    }
  }

  return <>
    <Modal open={open} onOpenChange={change} title="לקוח חדש" description="הלקוח יישמר וישויך לתיקון."
      trigger={<Button variant="outline" className="inline-customer-button"><UserRoundPlus size={17} /> לקוח חדש</Button>}>
      <form noValidate className="dialog-form" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.stopPropagation(); void handleSubmit(save)(event); }}>
        <CustomerFields name={register("name")} store={register("store")} phone={register("phone")} errors={errors} />
        {error && <p role="alert" className="error-message">{error}</p>}
        <div className="dialog-actions"><Button type="submit" disabled={isSubmitting}><Save size={17} /> {isSubmitting ? "שומר…" : "שמירת לקוח"}</Button>
          <Button variant="outline" disabled={isSubmitting} onClick={() => change(false)}>ביטול</Button></div>
      </form>
    </Modal>
    <UnsavedDialog open={confirmDiscard} onConfirm={closeNow} onCancel={() => setConfirmDiscard(false)}
      description="לסגור את הטופס בלי לשמור את פרטי הלקוח?" />
  </>;
}
