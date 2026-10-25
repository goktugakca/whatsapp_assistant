import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseInboundMessages, verifySignature } from "@/lib/whatsapp";

describe("verifySignature", () => {
  const secret = "test-secret";
  const body = JSON.stringify({ hello: "dünya" });
  const valid = "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");

  it("doğru imzayı kabul eder", () => {
    expect(verifySignature(body, valid, secret)).toBe(true);
  });

  it("yanlış, eksik veya bozuk imzayı reddeder", () => {
    expect(verifySignature(body + " ", valid, secret)).toBe(false);
    expect(verifySignature(body, null, secret)).toBe(false);
    expect(verifySignature(body, "sha256=abcd", secret)).toBe(false);
    expect(verifySignature(body, valid, "baska-secret")).toBe(false);
  });
});

describe("parseInboundMessages", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "123" },
              contacts: [{ wa_id: "905551112233", profile: { name: "Ayşe" } }],
              messages: [
                { id: "wamid.1", from: "905551112233", timestamp: "1761400000", type: "text", text: { body: "Merhaba" } },
                { id: "wamid.2", from: "905551112233", timestamp: "1761400001", type: "audio" },
              ],
            },
          },
          {
            field: "messages",
            value: { metadata: { phone_number_id: "123" }, statuses: [{ id: "wamid.0", status: "read" }] },
          },
        ],
      },
    ],
  };

  it("metin mesajlarını kişi adıyla çıkarır, durum bildirimlerini atlar", () => {
    const messages = parseInboundMessages(payload);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      id: "wamid.1",
      phoneNumberId: "123",
      from: "905551112233",
      contactName: "Ayşe",
      text: "Merhaba",
    });
  });

  it("metin dışı mesajı açıklama metnine çevirir", () => {
    expect(parseInboundMessages(payload)[1].text).toContain("audio");
  });

  it("başka nesne tiplerini yok sayar", () => {
    expect(parseInboundMessages({ object: "page" })).toEqual([]);
    expect(parseInboundMessages(null)).toEqual([]);
  });
});
