import { describe, expect, it } from "vitest";
import { executeTool } from "@/lib/agent/tools";
import { barber } from "@/lib/businesses/barber";
import { normalizePhone } from "@/lib/phone";
import { InMemoryStore } from "@/lib/store";

const now = new Date("2026-10-25T09:00:00+03:00");

async function setup() {
  const store = new InMemoryStore();
  const mine = await store.findOrCreateConversation({ businessId: barber.id, channel: "whatsapp", contact: "905551112233" });
  const other = await store.findOrCreateConversation({ businessId: barber.id, channel: "whatsapp", contact: "905559998877" });
  const ctx = (c: typeof mine) => ({ business: barber, conversation: c, store, now });
  const book = (c: typeof mine, start: string, staff = "any") =>
    executeTool("book_appointment", { customer_name: "X", service_id: "sac", staff_id: staff, start }, ctx(c));
  return { store, mine, other, ctx, book };
}

describe("müşterinin kendi randevuları", () => {
  it("sadece kendi yaklaşan randevularını listeler", async () => {
    const { mine, other, ctx, book } = await setup();
    await book(mine, "2026-10-26T10:00:00+03:00");
    await book(other, "2026-10-26T11:00:00+03:00");

    const list = JSON.parse((await executeTool("list_my_appointments", {}, ctx(mine))).content);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ start: "2026-10-26T10:00:00+03:00", service: "Saç kesimi" });
  });

  it("başkasının randevusunu iptal edemez, kendisininkini edebilir ve saat boşalır", async () => {
    const { store, mine, other, ctx, book } = await setup();
    await book(mine, "2026-10-26T10:00:00+03:00", "mehmet");
    const [appointment] = await store.listAppointments(barber.id);

    const denied = await executeTool("cancel_appointment", { appointment_id: appointment.id }, ctx(other));
    expect(denied.isError).toBe(true);
    expect(await store.listAppointments(barber.id)).toHaveLength(1);

    const ok = await executeTool("cancel_appointment", { appointment_id: appointment.id }, ctx(mine));
    expect(ok.isError).toBeFalsy();
    expect(await store.listAppointments(barber.id)).toHaveLength(0);
    expect((await book(other, "2026-10-26T10:00:00+03:00", "mehmet")).isError).toBeFalsy();
  });

  it("erteleme: yeni saat alınır, eski iptal edilir", async () => {
    const { store, mine, ctx, book } = await setup();
    await book(mine, "2026-10-26T10:00:00+03:00");
    const [old] = await store.listAppointments(barber.id);
    expect((await book(mine, "2026-10-29T15:00:00+03:00")).isError).toBeFalsy();
    await executeTool("cancel_appointment", { appointment_id: old.id }, ctx(mine));
    const list = JSON.parse((await executeTool("list_my_appointments", {}, ctx(mine))).content);
    expect(list.map((a: { start: string }) => a.start)).toEqual(["2026-10-29T15:00:00+03:00"]);
  });

  it("randevusu yoksa bunu söyler", async () => {
    const { mine, ctx } = await setup();
    expect((await executeTool("list_my_appointments", {}, ctx(mine))).content).toContain("yok");
  });
});

describe("telefon numarası", () => {
  it.each([
    ["0555 111 22 33", "905551112233"],
    ["555 111 22 33", "905551112233"],
    ["+90 (555) 111-22-33", "905551112233"],
    ["00905551112233", "905551112233"],
    ["+44 7700 900123", "447700900123"],
    ["123", undefined],
    ["", undefined],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});
