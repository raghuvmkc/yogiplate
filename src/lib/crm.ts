import { getDb, uid, updateDb } from "@/lib/store/local-db";
import type { ContactChannel, Customer } from "@/lib/types";

export async function upsertCustomerFromLead(input: {
  name: string;
  email: string;
  phone: string;
  city?: string;
  address?: string;
  channel?: ContactChannel;
  notes?: string;
}): Promise<Customer> {
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const now = new Date().toISOString();
  let result: Customer | null = null;

  await updateDb((d) => {
    const existing =
      d.customers.find((c) => c.email.toLowerCase() === email) ||
      (phone
        ? d.customers.find(
            (c) => c.phone.replace(/\D/g, "") === phone.replace(/\D/g, "")
          )
        : undefined);

    if (existing) {
      existing.name = input.name.trim() || existing.name;
      existing.phone = phone || existing.phone;
      existing.email = email || existing.email;
      if (input.city) existing.city = input.city;
      if (input.address) existing.address_line1 = input.address;
      if (input.channel) {
        existing.last_channel = input.channel;
        if (!existing.source_channel) existing.source_channel = input.channel;
      }
      existing.last_contact_at = now;
      if (input.notes) {
        existing.crm_notes = existing.crm_notes
          ? `${existing.crm_notes}\n${input.notes}`
          : input.notes;
      }
      existing.updated_at = now;
      result = existing;
      return;
    }

    const created: Customer = {
      id: uid("cust"),
      name: input.name.trim() || "Guest",
      email,
      phone,
      city: input.city,
      address_line1: input.address,
      source_channel: input.channel || "web_chat",
      last_channel: input.channel || "web_chat",
      last_contact_at: now,
      tags: [],
      crm_notes: input.notes || null,
      created_at: now,
      updated_at: now,
    };
    d.customers.unshift(created);
    result = created;
  });

  return result!;
}

export async function listCrmCustomers() {
  const db = await getDb();
  return [...db.customers].sort((a, b) =>
    (b.last_contact_at || b.updated_at).localeCompare(
      a.last_contact_at || a.updated_at
    )
  );
}
